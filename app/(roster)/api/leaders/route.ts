import { NextResponse } from "next/server";
import { kvEntries } from "../../lib/kv";
import { getSessionUser, type RosterUser } from "../../lib/auth";

// A lightweight leader directory — name, email, photo — for resolving "who
// did this" to a face. Used by the hangout log, notes, and activity feed,
// none of which are admin-only surfaces, so this is gated by "signed in" the
// same way the roster itself is, not requireAdmin() like Adminland's Users
// tab (which additionally exposes role/status and lets you change them).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const rows = await kvEntries<RosterUser>("user:");
  const leaders = rows
    .map((r) => r.value)
    .filter((u) => u?.email && (u.role === "leader" || u.role === "admin"))
    .map((u) => ({ name: u.name, email: u.email!, photoUrl: u.photoUrl || null, photoCrop: u.photoCrop || null }));
  return NextResponse.json({ leaders });
}
