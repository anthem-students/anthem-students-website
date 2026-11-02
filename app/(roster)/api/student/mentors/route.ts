import { NextResponse } from "next/server";
import { kvDelete, kvDeleteMany, kvGet, kvGetMap, kvPut, kvPutMany } from "../../../lib/kv";
import { requirePermission } from "../../../lib/auth";
import { logActivity } from "../../../lib/activity";
import { studentKey } from "../../../lib/rosterSchema";
import { normalizeMentor, sameMentor, tidyMentors, type Mentor, type MentorSlot, type StudentMentors } from "../../../lib/mentors";

// Reads and writes a student's primary/secondary mentor. The roster grid gets
// everyone's mentors in one go from /api/bootstrap; this is for the
// single-student read and every write.

const EMPTY: StudentMentors = { primary: null, secondary: null };

function label(m: Mentor | null): string {
  return m ? m.name : "nobody";
}

export async function GET(request: Request) {
  const perm = await requirePermission("roster", "view");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const url = new URL(request.url);
  const key = studentKey("mentors", url.searchParams.get("sk"), url.searchParams.get("id"));
  if (!key) return NextResponse.json({ error: "sk and id are required" }, { status: 400 });

  return NextResponse.json((await kvGet<StudentMentors>(key)) || EMPTY);
}

// Sets both slots for one student at once — the picker always sends the full
// pair, which keeps "swap primary and secondary" a single write.
export async function PUT(request: Request) {
  const perm = await requirePermission("roster", "edit");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = await request.json();
  const key = studentKey("mentors", body.sk, body.id);
  if (!key) return NextResponse.json({ error: "sk and id are required" }, { status: 400 });

  const rawPrimary = normalizeMentor(body.primary);
  const rawSecondary = normalizeMentor(body.secondary);
  if (rawPrimary === undefined || rawSecondary === undefined) {
    return NextResponse.json({ error: "Invalid mentor" }, { status: 400 });
  }
  const { primary, secondary } = tidyMentors(rawPrimary, rawSecondary);

  const before = (await kvGet<StudentMentors>(key)) || EMPTY;
  if (primary || secondary) {
    await kvPut(key, { primary, secondary, updatedAt: new Date().toISOString(), updatedBy: perm.user.email || perm.user.name });
  } else {
    await kvDelete(key);
  }

  const changes: string[] = [];
  if (!sameMentor(before.primary, primary) && (before.primary || primary)) {
    changes.push(`Primary: ${label(before.primary)} → ${label(primary)}`);
  }
  if (!sameMentor(before.secondary, secondary) && (before.secondary || secondary)) {
    changes.push(`Secondary: ${label(before.secondary)} → ${label(secondary)}`);
  }
  if (changes.length) {
    await logActivity(perm.user, {
      type: "mentor_changed",
      summary: changes.join(" · "),
      studentName: typeof body.studentName === "string" ? body.studentName : "",
      sk: body.sk,
      id: body.id,
    });
  }

  return NextResponse.json({ success: true, mentors: { primary, secondary } });
}

// Bulk assign from the roster's multi-select: one mentor into one slot for
// every selected student, leaving the other slot alone.
export async function POST(request: Request) {
  const perm = await requirePermission("roster", "edit");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = await request.json();
  const slot: MentorSlot = body.slot === "secondary" ? "secondary" : "primary";
  const mentor = normalizeMentor(body.mentor);
  if (mentor === undefined) return NextResponse.json({ error: "Invalid mentor" }, { status: 400 });
  const targets = Array.isArray(body.students) ? (body.students as { sk: unknown; id: unknown }[]) : [];
  if (!targets.length || targets.length > 500) {
    return NextResponse.json({ error: "students must be a non-empty list" }, { status: 400 });
  }

  // Read both tabs' current mentors once, then write everything in one go.
  const current: Record<string, StudentMentors> = {};
  for (const sk of ["hs", "ms"]) {
    const map = await kvGetMap<StudentMentors>(`mentors:${sk}:`);
    for (const [id, m] of Object.entries(map)) current[`mentors:${sk}:${id}`] = m;
  }

  const now = new Date().toISOString();
  const updatedBy = perm.user.email || perm.user.name;
  const puts: { key: string; value: StudentMentors }[] = [];
  const deletes: string[] = [];
  const updated: Record<string, StudentMentors> = {};
  for (const t of targets) {
    const key = studentKey("mentors", t.sk, t.id);
    if (!key) continue;
    const cur = current[key] || EMPTY;
    const next = tidyMentors(slot === "primary" ? mentor : cur.primary, slot === "secondary" ? mentor : cur.secondary);
    if (next.primary || next.secondary) puts.push({ key, value: { ...next, updatedAt: now, updatedBy } });
    else deletes.push(key);
    updated[`${t.sk}:${t.id}`] = next;
  }
  await kvPutMany(puts);
  await kvDeleteMany(deletes);

  const count = Object.keys(updated).length;
  if (count) {
    await logActivity(perm.user, {
      type: "mentor_bulk",
      summary: mentor
        ? `Set ${mentor.name} as ${slot} mentor for ${count} student${count === 1 ? "" : "s"}`
        : `Cleared the ${slot} mentor for ${count} student${count === 1 ? "" : "s"}`,
    });
  }

  return NextResponse.json({ success: true, updated });
}
