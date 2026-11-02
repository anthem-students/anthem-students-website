import { NextResponse } from "next/server";
import { hasPermission, requirePermission } from "../../lib/auth";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { rowToStudent, STUDENT_COLUMNS, type StudentRow } from "../../lib/rosterSchema";

// The whole roster in one query, split into the two tabs.
export async function GET() {
  // This returns every student's name, grade, school, birthday and photo — it
  // must never answer an anonymous caller.
  const perm = await requirePermission("roster", "view");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const { data, error } = await supabaseAdmin()
    .from("roster_students")
    .select(STUDENT_COLUMNS)
    .order("row_index", { ascending: true });

  if (error) {
    console.error("[roster/students] read failed:", error.message);
    return NextResponse.json({ error: "Couldn't load the roster from the database." }, { status: 500 });
  }

  // The pinned `notes` field is pastoral text, so it follows the same rule as
  // the notes log: blanked for a session that can't read hangout notes.
  const canSeeNotes = await hasPermission(perm.user, "hangoutNotes", "view");
  const payload: Record<"hs" | "ms", { students: unknown[] }> = { hs: { students: [] }, ms: { students: [] } };
  for (const row of (data || []) as StudentRow[]) {
    const student = rowToStudent(row);
    if (!canSeeNotes) student.notes = "";
    payload[row.sk]?.students.push(student);
  }

  return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
}
