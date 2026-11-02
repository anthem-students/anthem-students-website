import { NextResponse } from "next/server";
import { kvGet, kvPut } from "../../../lib/kv";
import { requirePermission } from "../../../lib/auth";
import { studentKey } from "../../../lib/rosterSchema";

// A student's goals: a checklist plus one free-text "primary goal", stored
// together under `goals:{sk}:{id}`. The grid gets everyone's goals from
// /api/bootstrap; this route reads one student and writes.

export type Goal = { text: string; done: boolean; primary?: boolean; createdAt?: string };
export type StudentGoals = { primaryGoal: string; goals: Goal[] };

const EMPTY: StudentGoals = { primaryGoal: "", goals: [] };

export async function GET(request: Request) {
  const perm = await requirePermission("roster", "view");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const url = new URL(request.url);
  const key = studentKey("goals", url.searchParams.get("sk"), url.searchParams.get("id"));
  if (!key) return NextResponse.json({ error: "sk and id are required" }, { status: 400 });

  return NextResponse.json((await kvGet<StudentGoals>(key)) || EMPTY);
}

function cleanGoal(raw: unknown): Goal {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    text: typeof g.text === "string" ? g.text.slice(0, 500) : "",
    done: g.done === true,
    ...(g.primary === true ? { primary: true } : {}),
    ...(typeof g.createdAt === "string" ? { createdAt: g.createdAt } : {}),
  };
}

export async function PUT(request: Request) {
  const perm = await requirePermission("roster", "edit");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = await request.json();
  const key = studentKey("goals", body.sk, body.id);
  if (!key) return NextResponse.json({ error: "sk and id are required" }, { status: 400 });

  await kvPut(key, {
    primaryGoal: typeof body.primaryGoal === "string" ? body.primaryGoal.slice(0, 500) : "",
    goals: Array.isArray(body.goals) ? body.goals.slice(0, 100).map(cleanGoal) : [],
  } satisfies StudentGoals);

  return NextResponse.json({ success: true });
}
