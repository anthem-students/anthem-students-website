import { cache } from "react";
import { cookies } from "next/headers";
import { kvDelete, kvEntries, kvGet, kvPut } from "./kv";
import { DEFAULT_ROSTER_SETTINGS, SETTINGS_KEY } from "./settings";
import { generateToken, hashToken } from "./crypto";

export const SESSION_COOKIE_NAME = "asm_session";
export const SESSION_TTL = 30 * 24 * 60 * 60; // 30 days

export type RosterUser = {
  name: string;
  email: string | null;
  role: string;
  passwordHash?: string;
  status?: string | null;
  photoUrl?: string | null;
  photoCrop?: { zoom: number; offX: number; offY: number } | null;
  leaderSince?: string | null;
  funFact?: string | null;
  mustChangePassword?: boolean;
  createdAt?: string;
  expiresAt?: number | null;
};

type Session = { type?: string; email?: string; expiresAt: number };

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function setSessionCookie(token: string, maxAge: number) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, token, cookieOptions(maxAge));
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, "", cookieOptions(0));
}

export async function getToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE_NAME)?.value ?? null;
}

// Sessions are stored under the SHA-256 of the cookie token, never the token
// itself, so someone who can read roster_kv (a backup, an export, the
// dashboard) can't lift a working session out of it. Same as reset and
// approval tokens.
export async function sessionKey(token: string): Promise<string> {
  return `session:${await hashToken(token)}`;
}

// Starts a session: a fresh random token in an httpOnly cookie, its hash in
// roster_kv. `session` is { email } for a leader, { type: "passcode" } for a
// view-only visitor.
export async function startSession(session: { email?: string | null; type?: string }, ttlSeconds: number) {
  const token = generateToken();
  const expiresAt = Date.now() + ttlSeconds * 1000;
  await kvPut(await sessionKey(token), { ...session, expiresAt }, ttlSeconds);
  await setSessionCookie(token, ttlSeconds);
  return { expiresAt };
}

// Wrapped in React's cache() so several permission checks inside one request
// (api/bootstrap checks a few modules) share one session + user lookup.
export const getSessionUser = cache(async (): Promise<RosterUser | null> => {
  const token = await getToken();
  if (!token) return null;
  const key = await sessionKey(token);
  const sess = await kvGet<Session>(key);
  if (!sess || Date.now() > sess.expiresAt) {
    if (sess) await kvDelete(key);
    return null;
  }
  // Passcode session — synthetic read-only user (no email, no editing)
  if (sess.type === "passcode") {
    return { name: "Viewer", email: null, role: "viewer", expiresAt: sess.expiresAt };
  }
  return kvGet<RosterUser>(`user:${sess.email}`);
});

export const PERMISSION_LEVELS: Record<string, number> = { none: 0, view: 1, edit: 2, admin: 3 };

// Fallback level for a role the matrix doesn't mention for some module.
export const ROLE_DEFAULTS: Record<string, string> = {
  pending: "view",
  approved: "edit",
  leader: "edit",
  admin: "admin",
};

type OrgSettings = {
  permissions?: { modules?: Record<string, Record<string, string>> };
  access?: { passcodePermissions?: Record<string, boolean> };
};

const loadSettings = cache(async () => (await kvGet<OrgSettings>(SETTINGS_KEY)) || {});

// The role x module matrix: the defaults in lib/settings.ts with any
// overrides saved in settings:org laid on top. There's no UI for editing it;
// change the defaults in lib/settings.ts.
export const getPermissionMatrix = cache(async (): Promise<Record<string, Record<string, string>>> => {
  const saved = (await loadSettings()).permissions?.modules || {};
  const merged: Record<string, Record<string, string>> = {};
  for (const [module, defaults] of Object.entries(DEFAULT_ROSTER_SETTINGS.permissions.modules)) {
    merged[module] = { ...defaults, ...(saved[module] || {}) };
  }
  return merged;
});

// A passcode session is read-only, and what it may read is set by the "View
// only" checkboxes in Settings -> Access, not by the role matrix. Notes and
// hangouts are off unless an admin turns them on — the Activity feed quotes
// them, so it follows the same switch.
async function viewerLevel(module: string): Promise<string> {
  const p = {
    ...DEFAULT_ROSTER_SETTINGS.access.passcodePermissions,
    ...((await loadSettings()).access?.passcodePermissions || {}),
  };
  const allowed: Record<string, boolean> = {
    roster: p.viewRoster,
    dashboard: p.viewRoster,
    hangoutNotes: p.viewNotes,
    activity: p.viewNotes,
  };
  return allowed[module] ? "view" : "none";
}

export async function hasPermission(user: RosterUser | null, module: string, level = "view"): Promise<boolean> {
  if (!user) return false;
  if (user.role === "admin") return true;
  let userLevel: string;
  if (user.role === "viewer") {
    userLevel = await viewerLevel(module);
  } else {
    const role = user.role || "pending";
    const matrix = await getPermissionMatrix();
    userLevel = matrix[module]?.[role] || ROLE_DEFAULTS[role] || "none";
  }
  return (PERMISSION_LEVELS[userLevel] || 0) >= (PERMISSION_LEVELS[level] || 0);
}

export async function requirePermission(
  module: string,
  level = "view"
): Promise<{ ok: true; user: RosterUser } | { ok: false; status: number; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, status: 401, error: "Not authenticated" };
  const ok = await hasPermission(user, module, level);
  if (!ok) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true, user };
}

export async function requireAdmin(): Promise<{ ok: true; user: RosterUser } | { ok: false; status: number; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, status: 403, error: "Unauthorized" };
  const ok = await hasPermission(user, "adminland", "admin");
  if (!ok) return { ok: false, status: 403, error: "Unauthorized" };
  return { ok: true, user };
}

export async function listAdmins(): Promise<{ email: string }[]> {
  const users = await kvEntries<RosterUser>("user:");
  const admins = users.filter(({ value: u }) => u?.role === "admin" && u.email).map(({ value: u }) => ({ email: u.email! }));
  if (!admins.length && process.env.ADMIN_EMAIL) admins.push({ email: process.env.ADMIN_EMAIL });
  return admins;
}

// Who gets the "someone is requesting leader access" email. Settings →
// Access can name specific addresses; left blank it goes to every admin.
export async function accessRequestRecipients(): Promise<{ email: string }[]> {
  const settings = await kvGet<{ access?: { requestEmails?: string } }>(SETTINGS_KEY);
  const configured = parseEmailList(settings?.access?.requestEmails);
  return configured.length ? configured.map((email) => ({ email })) : listAdmins();
}

export function parseEmailList(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const emails = raw
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return [...new Set(emails)];
}

export function safeUser(user: RosterUser) {
  return {
    name: user.name,
    email: user.email,
    role: user.role,
    photoUrl: user.photoUrl || null,
    photoCrop: user.photoCrop || null,
    leaderSince: user.leaderSince || null,
    funFact: user.funFact || null,
    expiresAt: user.expiresAt || null,
    status: user.status || null,
    mustChangePassword: !!user.mustChangePassword,
  };
}
