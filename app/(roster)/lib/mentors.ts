// A student's primary (and optional secondary) mentor. Lives in roster_kv
// under `mentors:{sk}:{id}`.
//
// A mentor is either an app leader (email set — the client resolves name and
// photo from the leader directory, so a renamed leader updates everywhere) or
// a free-text name for a volunteer who has no account (email null).

export type Mentor = { email: string | null; name: string };
export type StudentMentors = {
  primary: Mentor | null;
  secondary: Mentor | null;
  updatedAt?: string;
  updatedBy?: string;
};
export type MentorSlot = "primary" | "secondary";

export const MENTOR_SLOTS: MentorSlot[] = ["primary", "secondary"];

// Returns a cleaned mentor, null for "no mentor", or undefined when the input
// is malformed and the request should be rejected.
export function normalizeMentor(raw: unknown): Mentor | null | undefined {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "object") return undefined;
  const m = raw as Record<string, unknown>;
  const name = typeof m.name === "string" ? m.name.trim().slice(0, 60) : "";
  const email = typeof m.email === "string" && m.email.trim() ? m.email.trim().toLowerCase() : null;
  if (!name && !email) return null;
  return { email, name: name || email! };
}

// What "the same mentor" means for filtering, replacing and counting: the
// account when there is one, otherwise the name, case-insensitively.
export function mentorIdentity(m: Mentor | null | undefined): string {
  if (!m) return "";
  return m.email ? m.email.toLowerCase() : "name:" + m.name.trim().toLowerCase();
}

export function sameMentor(a: Mentor | null | undefined, b: Mentor | null | undefined): boolean {
  return !!a && !!b && mentorIdentity(a) === mentorIdentity(b);
}

// Applies one slot change to a student's pair and keeps the pair tidy: the
// same person can't hold both slots, and a lone secondary becomes primary.
export function tidyMentors(primary: Mentor | null, secondary: Mentor | null): { primary: Mentor | null; secondary: Mentor | null } {
  if (sameMentor(primary, secondary)) secondary = null;
  if (!primary && secondary) [primary, secondary] = [secondary, null];
  return { primary, secondary };
}
