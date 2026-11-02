import { NextResponse } from "next/server";
import { kvGet, kvPut } from "../../../lib/kv";
import { requirePermission } from "../../../lib/auth";
import { logActivity } from "../../../lib/activity";
import { studentKey } from "../../../lib/rosterSchema";

// Hangouts ("interactions" in the API and storage): a dated record that a
// leader met with a student, plus what they talked about. Stored as one array
// per student under `interactions:{sk}:{id}`. The grid's per-student counts
// come from /api/bootstrap; this route reads one student's log and writes.
//
// Gated on the hangoutNotes module, not roster — these are the most sensitive
// text in the app.

export type Interaction = {
  id: string;
  date: string; // YYYY-MM-DD, the day the hangout happened
  summary: string;
  leader: string;
  leaderEmail?: string;
  createdAt: string;
  updatedAt?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SUMMARY = 5000;

// Only date and summary ever come from the client. Returns an error string
// for a bad value, or the cleaned fields.
function readFields(body: Record<string, unknown> | undefined): { date: string; summary: string } | string {
  const date = typeof body?.date === "string" ? body.date.trim() : "";
  const summary = typeof body?.summary === "string" ? body.summary.trim() : "";
  if (!DATE_RE.test(date)) return "A hangout needs a valid date";
  if (!summary) return "Summary cannot be empty";
  if (summary.length > MAX_SUMMARY) return "That summary is too long";
  return { date, summary };
}

export async function GET(request: Request) {
  const perm = await requirePermission("hangoutNotes", "view");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const url = new URL(request.url);
  const key = studentKey("interactions", url.searchParams.get("sk"), url.searchParams.get("id"));
  if (!key) return NextResponse.json({ error: "sk and id are required" }, { status: 400 });

  return NextResponse.json({ interactions: (await kvGet<Interaction[]>(key)) || [] });
}

export async function POST(request: Request) {
  const perm = await requirePermission("hangoutNotes", "edit");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  const user = perm.user;

  const body = await request.json();
  const key = studentKey("interactions", body.sk, body.id);
  if (!key) return NextResponse.json({ error: "sk and id are required" }, { status: 400 });
  const fields = readFields(body.interaction);
  if (typeof fields === "string") return NextResponse.json({ error: fields }, { status: 400 });

  // Authorship comes from the session, never the body — it's what decides who
  // may later edit or delete this entry.
  const interaction: Interaction = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ...fields,
    leader: user.name || "Someone",
    leaderEmail: user.email || undefined,
    createdAt: new Date().toISOString(),
  };

  const existing = (await kvGet<Interaction[]>(key)) || [];
  existing.push(interaction);
  await kvPut(key, existing);

  await logActivity(user, {
    type: "hangout",
    date: interaction.date,
    summary: interaction.summary,
    studentName: typeof body.studentName === "string" ? body.studentName : "",
    sk: body.sk,
    id: body.id,
  });

  return NextResponse.json({ success: true, interaction });
}

export async function PUT(request: Request) {
  const perm = await requirePermission("hangoutNotes", "edit");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  const user = perm.user;

  const body = await request.json();
  const key = studentKey("interactions", body.sk, body.id);
  if (!key) return NextResponse.json({ error: "sk and id are required" }, { status: 400 });
  const fields = readFields(body.changes);
  if (typeof fields === "string") return NextResponse.json({ error: fields }, { status: 400 });

  const existing = (await kvGet<Interaction[]>(key)) || [];
  const index = existing.findIndex((n) => n.id === body.interactionId);
  if (index === -1) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  const note = existing[index];
  if (user.role !== "admin" && note.leaderEmail !== user.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  existing[index] = { ...note, ...fields, updatedAt: new Date().toISOString() };
  await kvPut(key, existing);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const perm = await requirePermission("hangoutNotes", "edit");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
  const user = perm.user;

  const body = await request.json();
  const key = studentKey("interactions", body.sk, body.id);
  if (!key) return NextResponse.json({ error: "sk and id are required" }, { status: 400 });

  const existing = (await kvGet<Interaction[]>(key)) || [];
  const note = existing.find((n) => n.id === body.interactionId);
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  if (user.role !== "admin" && note.leaderEmail !== user.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await kvPut(key, existing.filter((n) => n.id !== body.interactionId));
  return NextResponse.json({ success: true });
}
