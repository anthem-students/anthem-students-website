# Architecture

## One page, many endpoints

`GET /` is answered by `app/(roster)/route.ts`. It returns one HTML document containing:
- all the CSS (`appShell/css.ts`)
- all the markup (`appShell/body.ts`)
- all the browser JavaScript (`appShell/client/*.ts`, concatenated by `client/index.ts`)

From then on the page is a single-page app. It shows and hides "screens" (`showScreen`) and "panels" (`switchMainNav`). It talks to the server only through `fetch` calls to the JSON routes under `app/(roster)/api/`.

**Why it isn't React.** The app began as a Cloudflare Worker serving a hand-written SPA. It was moved into this Next.js project as-is. Rewriting it as React components would be weeks of work that changes nothing a leader can see, so it stays a string-served SPA. The cost is that the client code is plain text to the toolchain:
- TypeScript and `next build` never check it.
- `npm run check:client` is the only thing that parses it.
- The editing rules at the top of `appShell/client/index.ts` matter (no backticks, doubled backslashes, `esc()` on every typed value).

The client files share one global scope. Function declarations hoist, so the order in `index.ts` only matters for top-level `let`/`const` state (in `01-state.ts`) and the boot handler (`21-boot.ts`).

### Loading the roster

`initApp()` (`03-gate-and-init.ts`) runs after sign-in:
1. `GET /api/me` — who is signed in, and so what they can do (`canEdit`).
2. `GET /api/settings/public` — branding, tab labels, tracking toggles. Cached in `localStorage` so the next visit paints immediately.
3. `loadRoster()` (`04-roster-grid.ts`) makes two requests in parallel:
   - `GET /api/students` — every student, both tabs, in one query.
   - `GET /api/bootstrap` — goals, note/hangout counts, latest parent connection, photo crops, mentors and apprentice flags, keyed by student id.
4. The grid renders. Photos load progressively, using the small thumbnail first when there is one.

Opening a student loads that student's notes, connection log and hangouts in parallel.

### Writes

Every write is its own `POST`/`PUT`/`DELETE` to a route under `/api`, and every route checks permissions itself. Student edits go to `POST /api/students/write` with an urlencoded `{action: add|update|delete, payload}`. It is POST-only so a crafted link can't delete anyone (the session cookie is `SameSite=Lax`).

Most UI writes are optimistic: the control shows the new value at once and is put back if the request fails.

## Data

### `roster_students` (Postgres table)

One row per student, primary key `(sk, id)`:
- `sk` is the tab, `"hs"` or `"ms"`.
- `id` is a short random string that never changes, because everything else about a student is keyed on it.

| Column | Notes |
| --- | --- |
| `name`, `grade`, `school` | Free text |
| `birthday` | `YYYY-MM-DD`, or older free text |
| `status` | `core` \| `loose` \| `fringe` — the Connection Status dropdown |
| `connected`, `last_connected` | Parent-connection flag and the most recent date. The full history is in `connections:` below. The card's "Needs Connection" state is *derived*: a connection older than the reset window in Settings. |
| `photo_url`, `thumb_url` | Public Storage URLs. Some older rows have Google Drive links, which the client converts (`driveThumb`). |
| `notes` | The pinned "standing note" (allergies, family situation). Running notes are in `notes:` below. |
| `row_index` | Display order |

The client uses camelCase. The mapping is in `lib/rosterSchema.ts`.

### `roster_kv` (key-value table)

Columns: `key text primary key, value jsonb, expires_at timestamptz`. Helpers live in `lib/kv.ts`. Expired rows read back as missing but aren't deleted until read (see KNOWN_ISSUES). List reads are prefix `LIKE`s, so always read a whole prefix with `kvEntries`/`kvGetMap` (one query), never `kvGet` in a loop.

| Key | Value |
| --- | --- |
| `user:{email}` | Account: name, role, status, password hash, photo, crop |
| `session:{sha256(token)}` | `{email, expiresAt}` for leaders (30 days), `{type:"passcode"}` for view-only (8 hours). The cookie holds the token; only its hash is stored (`startSession` in `lib/auth.ts`). |
| `settings:org` | Org settings, laid over the defaults in `lib/settings.ts` |
| `goals:{sk}:{id}` | `{primaryGoal, goals:[{text, done, primary}]}` |
| `notes:{sk}:{id}` | Running notes `[{id, text, leader, leaderEmail, createdAt}]` |
| `interactions:{sk}:{id}` | Hangouts `[{id, date, summary, leader, leaderEmail, createdAt}]` |
| `connections:{sk}:{id}` | Parent-connection log `[{id, date, note, leader, ...}]` |
| `mentors:{sk}:{id}` | `{primary, secondary}`, each `{email, name}` (email null for a volunteer without an account) |
| `apprentice:{sk}:{id}` | Present while the student is a student apprentice |
| `photoCrop:{sk}:{id}` | `{zoom, offX, offY}` — the crop is display metadata; the photo is never cut |
| `activity:{timestamp}:{rand}` | Activity feed entry, 90-day expiry (`lib/activity.ts`) |
| `pwdreset:{sha256(token)}` | Password reset, 30 min |
| `signupAction:{sha256(token)}` | Pending access request's review link, 14 days |
| `audit:user-status:...` | Role changes and approvals, 180 days |
| `metric:{type}:{day}` | Login / page-view counters |
| `ratelimit:{action}:{key}` | Rate-limit windows for login, passcode, signup, forgot-password |

The `{sk}:{id}` keys are built with `studentKey()` in `lib/rosterSchema.ts`, which rejects malformed input.

### Storage

Both buckets are public, so their files load by URL without a login:
- `roster-photos` — student photos under `students/`, leader photos under `photos/`, and the logo.
- `roster-thumbs` — small grid thumbnails.

Files are removed when nothing points at them any more (`deleteStoredPhoto`). Nothing lists the buckets.

All database and storage access goes through the service-role client in `lib/supabaseAdmin.ts`. Row-level security is on, with no policies, so the anon key can read nothing.

## Accounts and permissions

**Roles:**
- `pending` — signed up, waiting for approval, can't sign in
- `leader` (and its older alias `approved`)
- `admin`
- `viewer` — the synthetic user behind a passcode session

**Signing up.** A new leader signs up and becomes `pending`. Every admin (or the addresses in Settings → Access) gets an email with a review link. The link opens a read-only page (`api/admin/request/review`), and its Approve/Decline buttons POST. Mail scanners follow links, so nothing happens on the GET. Admins can also approve from Adminland.

**Passcode sessions.** A shared passcode gives an 8-hour read-only session. The passcode comes from Settings → Access (when mode is "Shared Passcode"), otherwise from the `SITE_PASSWORD` env var. What a passcode session may read is set by the checkboxes in Settings → Access:
- the roster is on by default
- notes, hangouts and the Activity feed are off by default

**Permission checks.** Every route calls `requirePermission(module, level)` or `requireAdmin()` from `lib/auth.ts`:
- **Modules:** `roster`, `hangoutNotes`, `activity`, `dashboard`, `adminland`.
- **Levels:** `none` < `view` < `edit` < `admin`.
- **Lookup:** the role × module matrix is in `lib/settings.ts`. Admins pass everything. Viewers are mapped through the passcode checkboxes.

**Authorship** (who logged a note, hangout or connection) always comes from the session on the server, never from the request body. Only the author or an admin can edit or delete a note or hangout. Anyone with roster edit can correct the connection log.

**Brute-force protection.** Logins, passcode attempts, signups and reset requests are rate-limited per account and per IP (`lib/rateLimit.ts`).

**Changing a leader's email.** The email is the account key, so a change rewrites every record that refers to it (`lib/renameUser.ts`).

## Email

Resend sends the email (`lib/email.ts`), using one shared layout for every message:
- password reset
- leader access request (to admins)
- approval (to the new leader)
- access changed

`NEXT_PUBLIC_SITE_URL` must be set in production, or the links point at Vercel's internal hostname.

## Settings

Admins open Settings from Adminland. It covers:
- **General:** ministry name, campus, logo, tab labels
- **Tracking:** which fields show on cards, and the parent-connection reset window
- **Access:** leaders-only vs. shared passcode, passcode permissions, who gets access requests
- **Appearance:** theme, compact mode, bottom tabs

It is stored at `settings:org`. The branding subset is public (`/api/settings/public`) because the sign-in screen needs it.

## Quick Log

Leaders type notes about several students at once (`client/10-quick-log.ts`). Matching happens in the browser against the loaded roster:
- a full first + last name is a match
- a first name alone is a "possible" match, offering every student with that first name
- "Log as Hangout" opens the normal hangout modal pre-filled, so nothing is saved without the leader confirming
