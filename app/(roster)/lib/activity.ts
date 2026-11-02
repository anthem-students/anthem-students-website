import { kvPut } from "./kv";
import type { RosterUser } from "./auth";

// The Activity feed is one flat log in roster_kv: `activity:{timestamp}:{rand}`.
// Keys start with a 13-digit millisecond timestamp, so sorting by key is
// sorting by time. Entries expire after 90 days, which is why the dashboard's
// time-based numbers describe a rolling 90-day window.
export const ACTIVITY_PREFIX = "activity:";
export const ACTIVITY_TTL = 90 * 24 * 60 * 60;

export type ActivityType =
  | "hangout"
  | "note"
  | "connection"
  | "student_added"
  | "student_updated"
  | "student_removed"
  | "mentor_changed"
  | "mentor_bulk"
  | "apprentice_changed"
  | "apprentice_bulk";

export type ActivityItem = {
  type?: ActivityType; // missing on the oldest records, which are all hangouts
  summary?: string;
  studentName?: string;
  sk?: string;
  id?: string;
  date?: string; // the day it happened, for hangouts and connections
  leader?: string;
  leaderEmail?: string;
  createdAt: string;
};

// Records one entry. Who did it always comes from the session, never the
// request body.
export async function logActivity(
  user: RosterUser,
  item: { type: ActivityType; summary?: string; studentName?: string; sk?: string; id?: string; date?: string }
) {
  const key = `${ACTIVITY_PREFIX}${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
  const entry: ActivityItem = {
    ...item,
    studentName: item.studentName || "",
    leader: user.name || "Someone",
    leaderEmail: user.email || undefined,
    createdAt: new Date().toISOString(),
  };
  await kvPut(key, entry, ACTIVITY_TTL);
}
