# Known issues and next steps

These were found during the November 2026 audit and deliberately left alone. Each is either low-impact, or would take more change than it's worth right now. Most important first.

## Security and privacy

- **The shared passcode is stored in plain text** in `settings:org`, and Settings shows it back to admins. It's a shared view-only code rather than a personal password, but it should still be hashed.
- **`SITE_PASSWORD` works even in "Leaders only" mode.** `api/auth/passcode` falls back to it whenever Settings doesn't define a passcode. The sign-in screen hides the passcode option in that mode, but the endpoint still accepts it. If leaders-only should really mean leaders only, check the mode there, or leave `SITE_PASSWORD` unset.
- **View-only sessions can see the leader directory** (`/api/leaders`: names, emails, photos), because it's gated on "signed in", not on a permission.
- **The "Hangout notes" tracking toggle only hides the UI.** The API still accepts hangouts when it's off.

## Data integrity

- **Lists in `roster_kv` are read-modify-write.** Notes, hangouts and the connection log are each one JSON array per student. If two leaders add to the same student's list at the same instant, one entry can be lost. Rare with this team's size. The fix is an RPC that appends atomically, or moving these into real tables.
- **Renaming a leader's email isn't atomic** (`lib/renameUser.ts`). A failure partway through leaves some records on the old address. It's ordered so the account itself is never lost.

## Code health

- **The client is untyped and has no tests.** `npm run check:client` catches syntax errors only. If this tool stays in active development, the highest-value next step is a small Playwright smoke test that signs in against a non-production Supabase project and opens a student.
- **The permission matrix isn't editable in the UI.** Change the defaults in `lib/settings.ts`.
