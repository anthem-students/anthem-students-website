import { supabaseAdmin } from "./supabaseAdmin";

// A small key-value store on top of the roster_kv Postgres table. Everything
// that isn't a student row lives here under a prefixed key (user:, session:,
// settings:org, goals:, notes:, interactions:, connections:, mentors:,
// apprentice:, photoCrop:, activity:, pwdreset:, signupAction:, audit:,
// metric:, ratelimit:) — docs/ARCHITECTURE.md lists what each one holds.
//
// Expiry is lazy (checked on read) rather than a background sweep — an
// expired row just reads back as absent.

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const { data, error } = await supabaseAdmin()
    .from("roster_kv")
    .select("value, expires_at")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    await kvDelete(key);
    return null;
  }
  return data.value as T;
}

export async function kvPut(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const expires_at = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
  const { error } = await supabaseAdmin()
    .from("roster_kv")
    .upsert({ key, value, expires_at, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function kvDelete(key: string): Promise<void> {
  await supabaseAdmin().from("roster_kv").delete().eq("key", key);
}

// Every live row under a prefix, keys and values together, in one query.
// Prefer this to looping kvGet over a list of keys — that costs a round trip
// per row, which on the activity log is hundreds.
export async function kvEntries<T = unknown>(
  prefix: string,
  opts: { newestFirst?: boolean; limit?: number } = {}
): Promise<{ key: string; value: T }[]> {
  let query = supabaseAdmin()
    .from("roster_kv")
    .select("key, value")
    .like("key", `${prefix}%`)
    .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
    .order("key", { ascending: !opts.newestFirst });
  if (opts.limit) query = query.limit(opts.limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({ key: row.key as string, value: row.value as T }));
}

// The same rows as a map keyed by whatever follows the prefix — e.g. every
// student's goals for a tab as { [studentId]: goals }.
export async function kvGetMap<T = unknown>(prefix: string): Promise<Record<string, T>> {
  const rows = await kvEntries<T>(prefix);
  return Object.fromEntries(rows.map(({ key, value }) => [key.slice(prefix.length), value]));
}

// Many non-expiring writes in one query. A key listed twice keeps its last
// value (Postgres rejects an upsert that touches the same row twice).
export async function kvPutMany(rows: { key: string; value: unknown }[]): Promise<void> {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  if (!byKey.size) return;
  const updated_at = new Date().toISOString();
  const { error } = await supabaseAdmin()
    .from("roster_kv")
    .upsert([...byKey].map(([key, value]) => ({ key, value, expires_at: null, updated_at })));
  if (error) throw new Error(error.message);
}

export async function kvDeleteMany(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const { error } = await supabaseAdmin().from("roster_kv").delete().in("key", keys);
  if (error) throw new Error(error.message);
}

export async function trackMetric(type: string): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = `metric:${type}:${today}`;
    const val = (await kvGet<{ count: number }>(key)) || { count: 0 };
    val.count++;
    await kvPut(key, val, 90 * 24 * 60 * 60);
  } catch {
    // Best-effort; a missed page-view count must never fail a request.
  }
}
