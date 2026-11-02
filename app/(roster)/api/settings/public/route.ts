import { NextResponse } from "next/server";
import { kvGet } from "../../../lib/kv";
import { DEFAULT_ROSTER_SETTINGS, deepMerge, SETTINGS_KEY } from "../../../lib/settings";

// No auth: the sign-in gate needs the branding before anyone is signed in.
// Only display settings go out — never the passcode or request emails.
export async function GET() {
  const stored = (await kvGet<object>(SETTINGS_KEY)) || {};
  const s = deepMerge(DEFAULT_ROSTER_SETTINGS, stored) as typeof DEFAULT_ROSTER_SETTINGS;
  return NextResponse.json({
    ministryName: s.ministryName,
    campus: s.campus,
    logoUrl: s.logoEnabled && s.logoUrl ? s.logoUrl : "",
    logoTone: s.logoTone || "light",
    logoEnabled: s.logoEnabled,
    gradeTabs: s.gradeTabs,
    tracking: s.tracking,
    // Every session needs this, not just admins: a read-only viewer has to see
    // the same "Needs Connection" badges the leaders do.
    connections: s.connections,
    appearance: s.appearance,
    permissions: s.permissions,
    accessMode: s.access?.mode || "leaders-only",
  });
}
