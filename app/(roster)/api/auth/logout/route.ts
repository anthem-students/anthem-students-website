import { NextResponse } from "next/server";
import { kvDelete } from "../../../lib/kv";
import { clearSessionCookie, getToken, sessionKey } from "../../../lib/auth";

export async function POST() {
  const token = await getToken();
  if (token) await kvDelete(await sessionKey(token));
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
