import { NextResponse } from "next/server";
import { kvEntries } from "../../../lib/kv";
import { requireAdmin, type RosterUser } from "../../../lib/auth";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const rows = await kvEntries<RosterUser>("user:");
  const users = rows.map(({ value: u }) => ({
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status || null,
    createdAt: u.createdAt,
    leaderSince: u.leaderSince,
    photoUrl: u.photoUrl || null,
    photoCrop: u.photoCrop || null,
  }));
  return NextResponse.json({ users });
}
