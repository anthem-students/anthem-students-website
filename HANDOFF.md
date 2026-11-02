# Anthem Students Roster — Handoff

Welcome! This is a quick guide to taking over the roster site. For deeper detail, see `README.md` and `docs/`.

## What it is

The mentoring roster for Anthem Students, live at **https://anthemstudents.org**. Youth leaders use it to track students: who they are, who mentors them, when someone last connected with their family, goals, notes and hangouts.

> ⚠️ **This site holds information about minors** (names, birthdays, schools, photos, pastoral notes). Be careful with access, keys and anything you change.

## The pieces

| Piece | What it does | Where |
| --- | --- | --- |
| **GitHub** | The code | github.com/jakeretich-anthem/anthem-students-website (`main` branch) |
| **Vercel** | Hosts the site (Next.js 15) | Vercel dashboard → the roster project |
| **Supabase** | Database + photo storage | Supabase dashboard → the roster project |
| **Resend** | Sends emails (password resets, access requests) | resend.com |
| **Domain** | anthemstudents.org | Domain registrar / DNS |

There is **no Supabase Auth**. Logins, passwords and sessions are handled by the app itself (`app/(roster)/lib/auth.ts`).

## Accounts to transfer

Jake: fill in the owner and check each one off as it's handed over.

- [ ] GitHub repo access: ______________________
- [ ] Vercel project: ______________________
- [ ] Supabase project: ______________________
- [ ] Resend account: ______________________
- [ ] Domain registrar / DNS: ______________________
- [ ] Make the new person an **admin** inside the roster app (Adminland → Users)

## How the code is laid out (the one surprise)

It's a Next.js project, but **the app is not React**. The whole site is one vanilla-JS single-page app, served as a single HTML page by `app/(roster)/route.ts`.

- `app/(roster)/appShell/body.ts`: all the HTML
- `app/(roster)/appShell/css.ts`: all the CSS
- `app/(roster)/appShell/client/`: the browser JavaScript, one file per feature (`01-state.ts` … `21-boot.ts`)
- `app/(roster)/api/`: the JSON endpoints the page calls
- `app/(roster)/lib/`: server helpers (auth, database, email, settings)
- `supabase/migrations/`: database schema changes (including a daily database job that clears out expired `roster_kv` rows)

**Before editing the browser JS**, read the rules at the top of `appShell/client/index.ts`: no backticks, doubled backslashes, and wrap every user-typed value in `esc()`. TypeScript doesn't check these files, so run `npm run check:client` after any change there.

## Data in one paragraph

Students live in the `roster_students` table. Everything else (accounts, sessions, notes, hangouts, mentors, goals, settings, activity) lives in a key-value table called `roster_kv`. Photos go in two public storage buckets, `roster-photos` and `roster-thumbs`. All database access is server-side, using the service-role key.

## Running it locally

```bash
npm install
cp .env.local.example .env.local   # fill in; each variable is explained in the file
npm run dev                        # http://localhost:3000
```

> ⚠️ Local dev uses whichever Supabase project `.env.local` points to. **If that's production, you're editing real students.** Use a separate Supabase project for testing.

If `RESEND_API_KEY` isn't set, emails print to the terminal instead of sending, so reset and approval links still work locally.

## Making a change

1. Branch off `main`, make your change.
2. `npm run build` checks the server code. `npm run check:client` checks the browser JS.
3. Merge to `main`. Vercel deploys it.
4. Database changes: add a SQL file to `supabase/migrations/`, then run `supabase db push`. Run `supabase link --project-ref <ref>` once first.

## Environment variables

These are set in Vercel (Project Settings → Environment Variables) and in `.env.local` for local dev:

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Full database access. **Server only, never share it.** |
| `NEXT_PUBLIC_SITE_URL` | `https://anthemstudents.org`, used for links in emails |
| `ADMIN_EMAIL` | Gets access-request emails if no admin exists yet |
| `SITE_PASSWORD` | Fallback shared view-only passcode (optional) |
| `RESEND_API_KEY` / `ROSTER_EMAIL_FROM` | Email sending |

## Day-to-day admin (no code needed)

Most running of the site happens inside the app, signed in as an admin:
- **Adminland**: approve new leaders, change roles, manage photos, hand mentees from one mentor to another
- **Settings**: branding/logo, tab labels, the shared view-only passcode, tracking toggles

The default permissions are set in code: `lib/settings.ts`.

## Known issues / good next steps

The full list is in `docs/KNOWN_ISSUES.md`. The main ones:
- The shared passcode is stored in plain text. It should be hashed.
- If two leaders add a note to the same student at the same moment, one note can be lost (rare).
- The browser JS has no tests. A small Playwright smoke test would be the most valuable addition.

## Old URLs

The app used to live at `/roster`. Redirects in `next.config.mjs` keep old bookmarks and email links working. Don't remove them.

## Questions

Contact Jake Retich: ______________________
