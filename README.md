# Anthem Students Roster

The mentoring roster for Anthem Students. It runs at **anthemstudents.org**. Youth leaders use it to keep track of the students in their care:
- who each student is
- who mentors them
- when someone last connected with their family
- goals
- notes and hangouts

> **This app holds information about minors.** That includes names, birthdays, schools, photos and pastoral notes. Treat every change with that in mind:
> - Nothing in `/api` may answer an anonymous caller.
> - Every value a person typed is escaped before it reaches the page.
> - Notes and hangouts stay hidden from view-only sessions unless an admin turns them on.

## Stack

- **Next.js 15** (App Router) on **Vercel**, but the app itself is not React. It is a vanilla-JS single-page app served as one HTML page by a route handler. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains why and how.
- **Supabase** for storage:
  - the `roster_students` table
  - a key-value table, `roster_kv`, that holds everything else (accounts, sessions, notes, hangouts, mentors, settings, activity)
  - two public storage buckets for photos
- **Resend** for email: password resets, leader access requests, approvals.

There is no Supabase Auth. Accounts, passwords and sessions are the app's own (see `app/(roster)/lib/auth.ts`).

## Running it locally

```bash
npm install
cp .env.local.example .env.local   # then fill it in — every variable is explained there
npm run dev                        # http://localhost:3000
```

**Local dev talks to whatever Supabase project `.env.local` points at. If that's production, you're editing real students.** For anything beyond reading, use a separate Supabase project or a branch.

Without `RESEND_API_KEY`, emails aren't sent. Each message is printed to the terminal instead, including its links, so the reset and approval flows still work locally.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build + type check of the TypeScript (server) code |
| `npm run check:client` | Syntax-checks the browser script, which TypeScript can't see. Run it after any change under `appShell/client/` |
| `npm start` | Serve a production build |

## Deploying

The site is hosted on Vercel; deploy the way the Vercel project is set up (a connected Git branch, or `vercel --prod`). The environment variables in `.env.local.example` must be set in the Vercel project. `.env.local` is never deployed.

Database changes are SQL files in `supabase/migrations/`, applied with the Supabase CLI:

```bash
supabase link --project-ref <ref>   # once
supabase db push
```

## Where things are

```
app/
  layout.tsx                 Bare root layout; only used by Next's 404 page
  (roster)/                  The whole app. "(roster)" is a route group, so it's served at "/"
    route.ts                 GET / → the single HTML page (head, CSS, markup, script)
    manifest.json/route.ts   PWA manifest (uses the uploaded logo if there is one)
    appShell/
      body.ts                All the HTML markup: screens, panels, modals
      css.ts                 All the styles
      client/                The browser JavaScript, one file per feature, joined by index.ts
        01-state.ts … 21-boot.ts
    api/                     JSON endpoints the client calls (all under /api/...)
      auth/                  login, logout, signup, passcode, forgot/reset/change password
      students/              read the roster; add/update/delete a student
      student/               per-student extras: notes, hangouts ("interactions"),
                             connections, goals, mentors, apprentice flag, photo crop
      bootstrap/             everything the roster grid needs besides the students, in one call
      activity/              the Activity feed and the dashboard's stats
      admin/                 Adminland: users, roles, emails, photos, mentor hand-off,
                             and the email-link approve/decline pages
      settings/              org settings (admin) and the public branding subset
      leaders/, me/, profile/, upload-photo/
    lib/                     Server-only helpers
      auth.ts                sessions, roles, the permission check every route uses
      kv.ts                  the roster_kv key-value helpers
      rosterSchema.ts        student types, column mapping, studentKey()
      settings.ts            default org settings and permission matrix
      activity.ts            writes Activity feed entries
      mentors.ts, storage.ts, email.ts, crypto.ts, rateLimit.ts, renameUser.ts, …
supabase/migrations/         Database schema history
scripts/check-client.cjs     The check:client script
public/                      App icons
assets/                      Source artwork for the icons (not served)
docs/
  ARCHITECTURE.md            How it fits together: auth, data model, request flow
  KNOWN_ISSUES.md            Things found and deliberately not fixed yet
```

## Old URLs

The app used to live at `/roster`. `next.config.mjs` redirects `/roster` and `/roster/*` to the root, so old bookmarks, installed home-screen apps, and links in emails still work.
