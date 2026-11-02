# Anthem Students Hub — Internal Tool Audit

Scope: `app/roster/**` (the vanilla-JS SPA). Ranked strictly by what a leader experiences today.
The main site and its `/admin` were removed in Nov 2026; the items that only concerned them are gone,
so the IMP numbers below have gaps.

One thing shapes the ranking. The data in `/roster` is names, grades, schools, birthdays,
photos, and pastoral-care notes about minors — the placeholder in the Log Hangout modal
(`appShell/body.ts:714`) is *"she opened up about some struggles at home… Prayed together at the
end."* That is the sensitivity bar, and items are measured against it.

IMP-01 through IMP-05 were verified live against the running app and the real Google Sheet.

---

## IMP-01 — Logging in through the modal leaves the roster permanently empty
STATUS: PENDING
Impact: A leader signs in and every section reads "No students here yet." The roster is fine — 46 HS and 68 MS students come back from the sheet — but nothing ever fetched them. There are two sign-in paths and only one works. The gate's "Sign In →" calls `initApp()`, which loads the roster. The auth modal's "Log In" (reached from "New leader? Sign up", "Need access? →", the read-only banner, and the nav "Log In" button) calls `closeAuthModal(); updateNav(); renderAll()` — it renders the empty in-memory `DATA` and never fetches. The leader is genuinely logged in, so nothing looks broken; refreshing the page fixes it, which makes it read as flaky rather than as a bug.
Root cause: `app/roster/appShell/clientScript.ts:463` — `doLogin()`'s success branch. `loadRoster()` is called from exactly one place, `initApp()` at `clientScript.ts:266`.
Fix: Make `doLogin()`'s success branch call `initApp()`, the same as `doGateLeaderLogin()` at `clientScript.ts:247`. That covers `showScreen('app')`, `refreshCurrentUser()`, `loadOrgSettings()`, and `loadRoster()` in the right order, and removes the second divergent login path.
Blast radius: one function in `clientScript.ts`. Low risk — `initApp()` is already the proven path. Watch that the "Welcome back" toast still fires after the awaits. Regression risk: LOW
Effort: S

## IMP-02 — Every sheet failure looks identical to an empty roster, with no error anywhere
STATUS: PENDING
Impact: This is why IMP-01 was undiagnosable. `loadRoster()` swallows every failure: `catch(e) {}` with an empty body, then `if (data?.hs) DATA = data` silently keeps the empty default. A missing `GOOGLE_SCRIPT_URL` on the server, an Apps Script permission error, a 502, a network drop, and a genuinely empty sheet all render the same "No students here yet." Nothing appears in the console, no toast, no retry. This bites hardest in production: `.env.local` is gitignored and never deploys, so if `GOOGLE_SCRIPT_URL`/`GAS_SHARED_SECRET` aren't set in the host's dashboard, the deployed roster is permanently and silently empty while local dev works fine.
Root cause: `app/roster/appShell/clientScript.ts:329-335` — `loadRoster()`. Empty state rendered at `clientScript.ts:377`.
Fix: Check `res.ok` and the parsed shape separately, and on failure show a real banner in the roster panel — "Couldn't reach the roster sheet" with the status code and a Retry button — instead of the empty state. Log the response body to the console. Keep the empty state for the case where the fetch genuinely returned zero students.
Blast radius: `loadRoster()` plus a small error element. Regression risk: LOW
Effort: S

## IMP-03 — Hangout notes are keyed by list position, so deleting a student re-attaches every later student's notes to the wrong kid
STATUS: PENDING
Impact: A leader deletes one student from HS Core. Every student after them shifts down one slot. Their confidential notes do not move — the notes stored for slot 5 now render on whoever moved into slot 5. A leader opens a student and reads another student's prayer requests and home-life struggles, with no indication anything is wrong. The same shift happens on a section move (`saveEdit` splices out of one section and pushes to another, `clientScript.ts:660-663`) and any time rows are reordered in the Google Sheet — which is a spreadsheet a human edits.
Root cause: `app/roster/api/student/interactions/route.ts:12` — the key is `interactions:${sk}:${section}:${index}` where `index` is the live JS array index. Same key built at :24, :49, :79. Shift introduced at `clientScript.ts:692`.
Fix: Key notes on something stable. `rowIndex` already travels with every student and is already sent in the POST body — switch the KV key to `interactions:${sk}:${rowIndex}` and write a one-time migration that re-keys existing `interactions:*` entries by walking the current roster. Until that migration runs, do not ship the delete path.
Blast radius: the interactions route, the four fetch call sites in `clientScript.ts`, plus a migration. Getting the migration wrong scrambles notes permanently, so it needs a dry run against a copy first. Regression risk: HIGH
Effort: M

## IMP-04 — Failed student saves are reported as "Saved locally", and the edit is gone on refresh
STATUS: PENDING
Impact: A leader edits a student, the write to the sheet fails, and they get a toast reading "Saved locally" / "Added locally" / "Network error — changes saved locally". Nothing is saved locally. There is no localStorage write, no queue, no retry — the change exists only in the in-memory `DATA` object and dies on the next refresh. The card on screen shows the new value, so the leader believes it worked, closes the tab, and the edit is gone. Worse, the toast is styled as an error but its text says the opposite, so even a careful leader reads it as "fine, it'll sync."
Root cause: `app/roster/appShell/clientScript.ts:668` ("Saved locally"), `:675` ("Added locally"), `:678` ("Network error — changes saved locally").
Fix: Either tell the truth — "Couldn't save. Your change was not written. Retry?" with the modal left open and the field values intact — or make the claim real by queueing the payload in localStorage and replaying it on next load. The honest message is the smaller and safer change; do that first.
Blast radius: `saveEdit()` only. Regression risk: LOW
Effort: S

## IMP-05 — Two of the three roster sections are always empty, and half the student fields hold the wrong column
STATUS: PENDING
Impact: Verified against the live sheet. All 114 students come back in `core`; `hs.loose`, `hs.fringe`, `ms.loose`, and `ms.fringe` are all zero, so "Loosely Connected" and "Fringe" permanently read "No students here yet" even when the fetch succeeds. The sheet's section divider rows are imported as students — "CORE 👇", "LOOSELY CONNECTED 👇", and "FRINGE 👇" render as six student cards. And the column mapping is shifted: across all 114 rows, `birthday` holds a real date 0 times while `interest` holds one 23 times, `school` holds a number 37 times (those are grades), `date` holds "Family Connected With" 43 times, and one MS student has a Google Drive photo URL sitting in `birthday`. `connected === true` for **zero** students, so the "Family Connected With" badge never lights up, the HS Connected stat is always 0, and the connected/not-connected filter is useless. The shift differs between the HS and MS rows, which means the two sheets have different column orders and the script applies one mapping to both.
Root cause: not in this repo — the Google Apps Script behind `GOOGLE_SCRIPT_URL`, in its `action=read` handler. This app just forwards the response (`app/roster/api/sheet/read/route.ts:8`) and trusts its shape (`clientScript.ts:333`).
Fix: In the Apps Script, read the header row and map columns by header name rather than by fixed position, per sheet; split rows into core/loose/fringe on the "👇" divider rows and drop the dividers from the output; and coerce the connected column to a real boolean. Add a shape assertion in `sheet/read/route.ts` so a mapping regression surfaces as an error rather than as wrong data on a student's card.
Blast radius: the Apps Script (outside this repo) plus an optional guard in `sheet/read`. Changing the mapping changes what every card displays, so diff the output before and after against a handful of known students. Regression risk: MED
Effort: M

## IMP-06 — The full roster of minors and every pastoral note are readable with no login
STATUS: PENDING
Impact: Three endpoints have no auth check at all. `GET /roster/api/sheet/read` returns all 114 students — names, grades, schools, birthdays, photo links — to anyone who requests it. `GET /roster/api/student/interactions?sk=hs&section=core&index=0` returns the hangout notes for that slot, and the index space is small enough to enumerate in seconds. `GET /roster/api/activity/recent` returns the 30 most recent notes in full, including summary text. No password, no cookie, no rate limit. Everything else in the app is gated; these three were missed.
Root cause: `app/roster/api/sheet/read/route.ts:3` (no `requirePermission`), `app/roster/api/student/interactions/route.ts:7-15` (GET only — POST/PUT/DELETE are gated), `app/roster/api/activity/recent/route.ts:6`.
Fix: Add `requirePermission("roster", "view")` to `sheet/read`, `requirePermission("hangoutNotes", "view")` to the interactions GET, and `requirePermission("activity", "view")` to `activity/recent` — the same helper the sibling handlers already use. Then confirm the passcode viewer role still resolves to `view` on roster so read-only access keeps working.
Blast radius: three route files. If the permission matrix is wrong for the passcode role, view-only users lose the roster — check `DEFAULT_MODULES` in `lib/auth.ts:72-80` before shipping. Regression risk: MED
Effort: S




## IMP-10 — A leader who forgets their password can never get back in
STATUS: PENDING
Impact: The roster sign-in forms have no way to recover an account. The roster gate has no forgot-password affordance at all. The backend is fully built and working: `forgot-password` mints a token and emails a link, `reset-password` accepts it, `admin/invite/manual` onboards a leader with `mustChangePassword`. None of it is reachable, and the client never reads the `resetToken`, `onboardToken`, or `inviteToken` query params those emails link to. Adminland can change a user's role but cannot reset a password. With 1–3 leaders and 30-day sessions, this surfaces rarely and then absolutely.
Root cause: `app/roster/appShell/body.ts:35-46` (gate leader form, no link); no `resetToken` handling anywhere in `clientScript.ts` (the boot sequence at `:1789-1826` never reads the query string).
Fix: On `/roster`, add a "Forgot password?" link under the gate's password field that POSTs to the existing `forgot-password` route, and handle `?resetToken=` on boot by showing a set-new-password form that POSTs to the existing `reset-password` route.
Blast radius: `LoginForm.tsx`, `body.ts`, and a new boot branch in `clientScript.ts`. Both backends already exist and are already tokenised, so this is wiring, not new auth. Regression risk: LOW
Effort: M

## IMP-11 — The entire roster Settings screen is unreachable from the UI
STATUS: PENDING
Impact: There is a complete, four-tab Settings screen — ministry name and campus, logo upload, grade-to-tab assignment, six tracking toggles, default new-student status, auto-archive, access mode and passcode, permissions table, theme, compact mode, sticky tabs — roughly 300 lines of built UI with a dirty-state Save button and a working GET/POST API behind it. Nothing opens it. `openSettings()` is defined and never called from any button, link, or handler. The knock-on effect is visible on the login screen: the "View Only / Enter Passcode" lane is shown only when access mode is `shared-passcode`, and since access mode can never be changed from its `leaders-only` default, half the gate screen is permanently hidden and the shared passcode can only ever be the `SITE_PASSWORD` env var.
Root cause: `app/roster/appShell/clientScript.ts:1456` — `openSettings()` has no call site. Adminland's nav (`body.ts:294-300`) offers only "← Back" and "Log Out"; the Settings screen's own nav has a "Users" button pointing the other way.
Fix: Add a "Settings" button next to "Adminland" in `updateNav()`'s admin branch (`clientScript.ts:285-287`), gated on `role === 'admin'` exactly as Adminland is. That is the whole fix — the screen, its populate/save/cancel functions, and its API are all already there and wired to each other.
Blast radius: one line in `updateNav()`. The screen has never been exercised by a real user, so expect small bugs in `populateSettingsUI` on first use — worth clicking through each tab before calling it done. Regression risk: MED
Effort: S

## IMP-12 — A student named O'Brien can't have a hangout logged, and a note containing "<" renders as broken markup
STATUS: PENDING
Impact: Student names and note text are concatenated straight into HTML strings. A name with an apostrophe — O'Brien, D'Angelo, Ma'ayan — breaks out of the inline `onclick` attribute on that student's own "+ Log Hangout" button, so the button silently does nothing for exactly the students whose names contain one. The same name also renders wrong on the card. Separately, hangout notes are injected as raw HTML, so a leader writing "he's been getting <5 hours of sleep" loses everything after the `<`, and the activity feed does the same. Beyond the breakage, any of these fields is a stored-XSS vector inside a tool holding minors' records.
Root cause: `app/roster/appShell/clientScript.ts:728` (name into an `onclick`), `:418` and `:741` (name into innerHTML), `:815` (`int.summary` into innerHTML), `:975-985` (activity feed).
Fix: Add an `esc()` helper that escapes `& < > " '` and run every interpolated value through it. For the click handlers, follow the pattern already used a few lines below at `:806-807` — put `sk`/`section`/`index` in `data-` attributes and read them from `this.dataset` — instead of building the argument list into the attribute string.
Blast radius: roughly a dozen template strings in `clientScript.ts`. Mechanical, but missing one leaves the hole open; grep for `innerHTML` and `onclick="` afterwards. Regression risk: LOW
Effort: M

## IMP-13 — Brain Dump matches on substrings and tells you every match is confirmed
STATUS: PENDING
Impact: The screen promises "AI will match students and let you log each one as a hangout." There is no AI — it is substring matching, and it is loose enough to misfile a pastoral note onto the wrong child. Name parts longer than two characters are matched with `includes()` against the lowercased sentence, with no word boundary, and the first roster match wins. A student named Ann matches any sentence containing "planning", "Hannah", or "cannot"; Sam matches "same". Every result is then returned with `matched: true` hardcoded, so the UI's "⚠ not found" warning can never render and every suggestion displays "✓ in roster" regardless of confidence. The leader clicks "Log as Hangout" on what looks like a confirmed match and a private note about one student is permanently attributed to another, under the leader's own name. There is no confirmation step and no chance to edit the text before it is written.
Root cause: `app/roster/api/brain-dump/route.ts:35` (unbounded `includes`), `:58` (`matched: true` hardcoded). Written without confirmation at `clientScript.ts:1028-1038`.
Fix: Match on word boundaries against full first+last name, return a real `matched` flag plus the matched fragment, and render unconfirmed suggestions with the warning state the UI already has. Make "Log as Hangout" open the normal Log Hangout modal pre-filled, so the leader edits and confirms the text before anything is written. Fix the screen's copy to describe what it actually does.
Blast radius: the brain-dump route and its result renderer. If the feature is unused, see the argument against this item below. Regression risk: LOW
Effort: M


## IMP-15 — Saving a student throws away the search or filter you were using
STATUS: PENDING
Impact: With 114 students across two tabs, search is how a leader finds anyone. Search "Lily", tap her card, edit, save — and the grid re-renders unfiltered, dropping all 114 students back on screen. The search box still says "Lily" and the filter-count badge still shows its number, so the controls claim a filter is active while the list ignores it. To fix a typo the leader has to clear the search and retype it. The same thing happens after deleting a student, adding a goal, or toggling a goal — five separate call sites, and each one is in the middle of a task a leader is repeating down a list.
Root cause: `app/roster/appShell/clientScript.ts:680` and `:696` (`saveEdit`, `doConfirmDeleteStudent`), `:833` and `:842` (goal add/toggle). `renderAll()` at `:338` always renders the full `DATA`.
Fix: Have those call sites call `applyFilters()` instead of `renderAll()` when any search or filter is active — `applyFilters()` already re-renders every grid and already preserves original indices correctly, so it is a drop-in. Simplest version: make `renderAll()` delegate to `applyFilters()` whenever the search box or any filter select is non-empty.
Blast radius: `renderAll()` and its call sites. `applyFilters()` reads the filter DOM, so it must not run before those elements exist — keep the initial boot on `renderAll()`. Regression risk: LOW
Effort: S

---

## DO NOT DO

**Rewrite `/roster` as React components.** It is 3,700 lines of vanilla JS, CSS, and HTML served as a
string from a route handler, and it is genuinely ugly. It also works, and every item above is a
targeted fix inside it. A rewrite would take weeks, would re-introduce its own bugs in code paths
that currently behave, and would deliver nothing a leader can see. The isolation from React is deliberate and documented at `route.ts:5-8`.

**Replace the Google Sheet with a Postgres table.** IMP-05 is a mapping bug in the Apps Script, not
evidence the sheet is the wrong store. The sheet is the thing leaders already open, sort, and paste
into; moving the roster into `roster_kv` or a new table would mean building the entire editing
surface the spreadsheet gives away for free, and would break whatever else in the ministry reads
that sheet. Fix the mapping.

**Build offline support and an optimistic-write queue for the roster.** Tempting because IMP-04's
toast already claims local saving exists. Making the claim true means a durable queue, replay,
conflict resolution against a spreadsheet other people edit, and a sync-state UI — a large amount of
machinery whose failure modes are worse and harder to reason about than the current ones. Tell the
truth in the toast instead; that is IMP-04's actual fix.

**Add a test suite and convert `clientScript.ts` to real TypeScript.** It is a template literal, so
the compiler checks nothing inside it, and that is how bugs like IMP-01 survive. But retrofitting a
harness onto a string-served SPA is a project in itself, and it fixes nothing a leader can see this
week. Revisit it if this tool is still being actively developed in six months.

---

## ARGUE AGAINST YOURSELF

**IMP-11 (Settings unreachable) — the case for leaving it closed.** Every default in
`DEFAULT_ROSTER_SETTINGS` is already correct for this ministry: the name is "Anthem Students", the
grade tabs are 9–12 and 6–8, all six tracking toggles are on, and access is leaders-only, which is
the right posture for a roster of minors. Exposing Settings hands an admin a passcode mode that
grants roster access to anyone holding a shared string — a downgrade in safety for a tool this
sensitive, and it makes IMP-06 worse rather than better. The screen has also never been run by a
real user, so shipping the button probably means shipping its first-use bugs too. A one-line change
that widens the blast radius of the security item above it is not obviously worth making, and
setting `SITE_PASSWORD` covers the passcode case already.

**IMP-13 (Brain Dump) — the case for deleting the feature instead of fixing it.** Brain Dump is a
naive regex matcher wearing an AI label, and the misfiling risk is real. But the fix I proposed keeps
a feature whose entire value is saving a leader from opening a student and typing a note — thirty
seconds of work — in exchange for a pipeline that attributes pastoral notes automatically. Given
IMP-03 already shows notes landing on the wrong student through a different mechanism, the honest
move might be to remove the tab entirely rather than make its matching slightly less wrong. I ranked
it as a fix because removing a built feature is the user's call, not mine — but if nobody has used it,
deleting beats fixing.

**IMP-15 (filter reset) — the case for ignoring it.** This is an annoyance, not a failure. Nothing is
lost, nothing is wrong on screen, and the workaround is retyping four characters. It sits in a list
alongside items where confidential notes attach to the wrong child and where a leader's edits vanish
without warning, and it earned its slot mostly because it recurs constantly rather than because any
single occurrence matters. If there is one item here to cut for capacity, it is this one. The
counter-argument is only that it is genuinely a few lines — but "cheap" is not the same as "worth
the regression risk of touching the render path every other item also touches."
