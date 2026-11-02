import { NextResponse } from "next/server";
import { kvGet, kvPut } from "../../../lib/kv";
import { requirePermission } from "../../../lib/auth";
import { logActivity } from "../../../lib/activity";
import { studentKey } from "../../../lib/rosterSchema";

// Quick notes a leader jots about a student — "asked about baptism", "moved
// houses". Distinct from the hangout log next door, which records a specific
// meeting on a specific date; these are the running observations that used to
// have nowhere to go but the student's single `notes` column.
//
// That column (roster_students.notes, edited in the Edit Student modal) is
// still shown, pinned above this list. This log is separate because one shared
// field can't hold a per-author history.

// Gated on the hangoutNotes module like the hangout log: both are pastoral
// notes about minors, and a view-only session can't read either by default.

export type Note = {
  id: string;
  text: string;
  leader?: string;
  leaderEmail?: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function GET(request: Request) {
  const perm = await requirePermission("hangoutNotes", "view");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const url = new URL(request.url);
  const kvKey = studentKey("notes", url.searchParams.get("sk"), url.searchParams.get("id"));
  if (!kvKey) return NextResponse.json({ error: "sk and id are required" }, { status: 400 });

  const data = await kvGet<Note[]>(kvKey);
  return NextResponse.json({ notes: data || [] });
}

export async function POST(request: Request) {
  const perm = await requirePermission("hangoutNotes", "edit");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  const user = perm.user;

  const body = await request.json();
  const kvKey = studentKey("notes", body.sk, body.id);
  if (!kvKey) return NextResponse.json({ error: "sk and id are required" }, { status: 400 });

  const text = typeof body.text === "string" ? body.text.trim().slice(0, 5000) : "";
  if (!text) return NextResponse.json({ error: "A note can't be empty" }, { status: 400 });

  // Authorship is taken from the session, never from the request body — it's
  // what the edit/delete ownership check below reads.
  const note: Note = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    leader: user.name || "Someone",
    leaderEmail: user.email || undefined,
    createdAt: new Date().toISOString(),
  };

  const existing = (await kvGet<Note[]>(kvKey)) || [];
  existing.push(note);
  await kvPut(kvKey, existing);

  await logActivity(user, {
    type: "note",
    summary: note.text,
    studentName: typeof body.studentName === "string" ? body.studentName : "",
    sk: body.sk,
    id: body.id,
  });

  return NextResponse.json({ success: true, note });
}

export async function PUT(request: Request) {
  const perm = await requirePermission("hangoutNotes", "edit");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  const user = perm.user;

  const body = await request.json();
  const { noteId } = body;
  const kvKey = studentKey("notes", body.sk, body.id);
  if (!kvKey || !noteId) return NextResponse.json({ error: "sk, id and noteId are required" }, { status: 400 });

  const text = typeof body.text === "string" ? body.text.trim().slice(0, 5000) : "";
  if (!text) return NextResponse.json({ error: "A note can't be empty" }, { status: 400 });

  const existing = (await kvGet<Note[]>(kvKey)) || [];
  const noteIndex = existing.findIndex((n) => n.id === noteId);
  if (noteIndex === -1) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  const note = existing[noteIndex];
  if (user.role !== "admin" && note.leaderEmail !== user.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  existing[noteIndex] = { ...note, text, updatedAt: new Date().toISOString() };
  await kvPut(kvKey, existing);

  return NextResponse.json({ success: true, note: existing[noteIndex] });
}

export async function DELETE(request: Request) {
  const perm = await requirePermission("hangoutNotes", "edit");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  const user = perm.user;

  const body = await request.json();
  const { noteId } = body;
  const kvKey = studentKey("notes", body.sk, body.id);
  if (!kvKey || !noteId) return NextResponse.json({ error: "sk, id and noteId are required" }, { status: 400 });

  const existing = (await kvGet<Note[]>(kvKey)) || [];
  const note = existing.find((n) => n.id === noteId);
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  if (user.role !== "admin" && note.leaderEmail !== user.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await kvPut(kvKey, existing.filter((n) => n.id !== noteId));

  return NextResponse.json({ success: true });
}
