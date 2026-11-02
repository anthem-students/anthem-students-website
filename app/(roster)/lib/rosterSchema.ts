// ── Roster student contract ─────────────────────────────────────────
//
// Students live in the roster_students table (one row per student, keyed by
// tab + id). The client speaks camelCase; the table is snake_case. Goals,
// notes, mentors, connection logs and photo crops are not columns here — they
// live in roster_kv under `{kind}:{sk}:{id}`, which is why ids never change.

export type TabKey = "hs" | "ms";

export const TAB_KEYS: TabKey[] = ["hs", "ms"];

export type Status = "core" | "loose" | "fringe";

export const STATUSES: Status[] = ["core", "loose", "fringe"];

export const STATUS_LABELS: Record<Status, string> = {
  core: "Core",
  loose: "Loosely Connected",
  fringe: "Fringe",
};

export type Student = {
  id: string;
  rowIndex: number;
  name: string;
  lastConnected: string; // YYYY-MM-DD, or "" when never connected
  connected: boolean;
  status: Status;
  grade: string;
  school: string;
  birthday: string; // YYYY-MM-DD, or free text carried over from the sheet
  photoUrl: string;
  thumbUrl: string | null;
  notes: string;
};

export type StudentRow = {
  sk: TabKey;
  id: string;
  row_index: number;
  name: string;
  grade: string;
  school: string;
  birthday: string;
  status: Status;
  connected: boolean;
  last_connected: string;
  photo_url: string;
  thumb_url: string | null;
  notes: string;
};

export const STUDENT_COLUMNS =
  "sk, id, row_index, name, grade, school, birthday, status, connected, last_connected, photo_url, thumb_url, notes";

export function rowToStudent(row: StudentRow): Student {
  return {
    id: row.id,
    rowIndex: row.row_index,
    name: row.name,
    grade: row.grade,
    school: row.school,
    birthday: row.birthday,
    status: row.status,
    connected: row.connected,
    lastConnected: row.last_connected,
    photoUrl: row.photo_url,
    thumbUrl: row.thumb_url,
    notes: row.notes,
  };
}

// Everything attached to a student that isn't a column — goals, notes,
// hangouts, connection log, mentors, apprentice flag, photo crop — lives in
// roster_kv under `{kind}:{sk}:{id}`. Returns null for a malformed sk/id so a
// route can reject the request instead of writing under a junk key.
export type StudentKvKind = "goals" | "notes" | "interactions" | "connections" | "mentors" | "apprentice" | "photoCrop";

export function studentKey(kind: StudentKvKind, sk: unknown, id: unknown): string | null {
  if (!TAB_KEYS.includes(sk as TabKey) || typeof id !== "string" || !id || id.length > 100) return null;
  return `${kind}:${sk}:${id}`;
}
