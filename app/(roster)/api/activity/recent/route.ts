import { NextResponse } from "next/server";
import { kvEntries } from "../../../lib/kv";
import { requirePermission } from "../../../lib/auth";
import { ACTIVITY_PREFIX, type ActivityItem } from "../../../lib/activity";

// The 30 newest Activity entries. Keys are timestamp-prefixed (see
// lib/activity), so "newest" is just the last keys in sort order.
export async function GET() {
  // Entries name students and quote notes about them — never anonymous.
  const perm = await requirePermission("activity", "view");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const rows = await kvEntries<ActivityItem>(ACTIVITY_PREFIX, { newestFirst: true, limit: 30 });
  return NextResponse.json({ items: rows.map((r) => r.value) });
}
