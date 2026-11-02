import { NextResponse } from "next/server";
import { kvGetMap } from "../../lib/kv";
import { getSessionUser, hasPermission } from "../../lib/auth";
import type { StudentGoals } from "../student/goals/route";
import type { Connection } from "../student/connections/route";
import type { PhotoCrop } from "../../lib/storage";
import type { StudentMentors } from "../../lib/mentors";

// Everything the roster grid needs besides the students themselves, in one
// request: goals, note/hangout counts, latest parent connection, photo crops,
// mentors and apprentice flags, for both tabs. Each is one roster_kv query per
// tab, all run in parallel. Read-only; every write has its own route.
//
// Note and hangout counts are only included for sessions allowed to read
// hangout notes (interactionCountsOk / noteCountsOk tell the client which).

function latestDate(list: Connection[]): string {
  return list.reduce((newest, c) => (c.date && c.date > newest ? c.date : newest), "");
}

const SKS = ["hs", "ms"] as const;

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const canSeeRoster = await hasPermission(user, "roster", "view");
  if (!canSeeRoster) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const canSeeNotes = await hasPermission(user, "hangoutNotes", "view");

  const [goals, noteCounts, connections, photoCrops, mentors, apprentices, interactionCounts] = await Promise.all([
    Promise.all(SKS.map(async (sk) => [sk, await kvGetMap<StudentGoals>(`goals:${sk}:`)] as const)),
    canSeeNotes
      ? Promise.all(SKS.map(async (sk) => [sk, await kvGetMap<unknown[]>(`notes:${sk}:`)] as const))
      : Promise.resolve(null),
    Promise.all(SKS.map(async (sk) => [sk, await kvGetMap<Connection[]>(`connections:${sk}:`)] as const)),
    Promise.all(SKS.map(async (sk) => [sk, await kvGetMap<PhotoCrop>(`photoCrop:${sk}:`)] as const)),
    Promise.all(SKS.map(async (sk) => [sk, await kvGetMap<StudentMentors>(`mentors:${sk}:`)] as const)),
    Promise.all(SKS.map(async (sk) => [sk, await kvGetMap<unknown>(`apprentice:${sk}:`)] as const)),
    canSeeNotes
      ? Promise.all(SKS.map(async (sk) => [sk, await kvGetMap<unknown[]>(`interactions:${sk}:`)] as const))
      : Promise.resolve(null),
  ]);

  const byTab = <T,>(pairs: readonly (readonly [string, Record<string, T>])[]) =>
    Object.fromEntries(pairs) as Record<(typeof SKS)[number], Record<string, T>>;

  const goalsByTab = byTab(goals);
  const noteCountsByTab: Record<string, Record<string, number>> = { hs: {}, ms: {} };
  for (const [sk, map] of noteCounts || []) {
    noteCountsByTab[sk] = Object.fromEntries(Object.entries(map).map(([id, notes]) => [id, (notes || []).length]));
  }

  const connectionsByTab = byTab(connections);
  const connectionDatesByTab: Record<string, Record<string, { latest: string; count: number }>> = {};
  for (const [sk, map] of Object.entries(connectionsByTab)) {
    connectionDatesByTab[sk] = Object.fromEntries(
      Object.entries(map).map(([id, list]) => [id, { latest: latestDate(list || []), count: (list || []).length }])
    );
  }

  const photoCropsByTab = byTab(photoCrops);

  const interactionCountsByTab: Record<string, Record<string, number>> = { hs: {}, ms: {} };
  if (interactionCounts) {
    for (const [sk, map] of interactionCounts) {
      interactionCountsByTab[sk] = Object.fromEntries(
        Object.entries(map).map(([id, list]) => [id, (list || []).length])
      );
    }
  }

  return NextResponse.json({
    goals: goalsByTab,
    noteCounts: noteCountsByTab,
    connectionDates: connectionDatesByTab,
    photoCrops: photoCropsByTab,
    mentors: byTab(mentors),
    // id -> true for each student apprentice; absent means not one.
    apprentices: Object.fromEntries(
      apprentices.map(([sk, map]) => [sk, Object.fromEntries(Object.keys(map).map((id) => [id, true]))])
    ),
    interactionCounts: interactionCountsByTab,
    interactionCountsOk: !!interactionCounts,
    noteCountsOk: !!noteCounts,
  });
}
