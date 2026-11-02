import { NextResponse } from "next/server";
import { kvGet } from "../../../lib/kv";
import { startSession } from "../../../lib/auth";
import { timingSafeEqual } from "../../../lib/crypto";
import { checkRateLimit, clearRateLimit, clientKey, tooManyRequests } from "../../../lib/rateLimit";

type OrgSettings = { access?: { mode?: string; passcode?: string } };

export async function POST(request: Request) {
  const ip = clientKey(request);
  if (ip) {
    // Loose on purpose: the view-only passcode is shared, so a group arriving
    // together shares one public IP and would otherwise lock each other out.
    const limit = await checkRateLimit("passcode", `ip:${ip}`, 30, 15 * 60);
    if (!limit.ok) {
      return tooManyRequests(
        `Too many attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.`,
        limit.retryAfter
      );
    }
  }

  let passcode = "";
  try {
    ({ passcode = "" } = await request.json());
  } catch {
    // no body
  }

  let correct = "";
  const settings = await kvGet<OrgSettings>("settings:org");
  if (settings?.access?.mode === "shared-passcode" && settings.access.passcode) {
    correct = settings.access.passcode;
  } else {
    correct = process.env.SITE_PASSWORD || "";
  }
  if (!correct || !passcode) return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  if (!timingSafeEqual(passcode, correct)) return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });

  // View-only sessions last a working day, not the 30 days a leader gets.
  const { expiresAt } = await startSession({ type: "passcode" }, 8 * 60 * 60);
  if (ip) await clearRateLimit("passcode", `ip:${ip}`);

  return NextResponse.json({ ok: true, expiresAt, message: "View-only mode enabled" });
}
