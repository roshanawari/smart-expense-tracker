# RULES.md
Read this at the start of every session. These rules override default behavior.

## 1. Project
- Name: Smart Expense Tracker
- Goal: A web app where one person records income and expenses, sets budgets and savings goals, sees charts, and exports reports.
- Current milestone: M7
- Source of truth: docs/PRD.md and docs/TECH.md. If they contradict each other or a file is missing, tell me before coding.

## 2. Accuracy
1. Do not invent APIs, functions, packages, config options or versions. If unsure something exists, check the official docs or the installed package source, or mark it UNVERIFIED.
2. Use the versions pinned in docs/TECH.md. Do not use syntax from other versions.
3. Report real results only. After running something, show the actual output. Say "works" only if you ran it and saw it work; otherwise say "not tested yet".
4. If you find your own earlier mistake, say so plainly and fix it.

## 3. When to ask and when to decide
Ask me first when a choice:
- changes scope, the data model, the stack or the user-visible behavior,
- costs money or needs a key or account I have not given,
- is hard to undo (deleting files, changing the schema after data exists).

For everything else (small naming, layout, minor wording, helper functions), choose the simplest option, keep going, and add one line to docs/DECISIONS.md.

## 4. Scope
- Work one feature ID at a time and state the ID before you start.
- Do not add features, screens, routes or fields that are not in the PRD or TECH. Respect the PRD's "Will NOT build" list.
- Do not change files unrelated to the current task. Tell me before deleting or overwriting a file.
- Keep it simple. One folder per feature; add service or repository layers only when a feature clearly needs them.

## 5. Real data, real backend
- Build a real full-stack app: real database, real API routes. No hard-coded, static or fake data in app code, and no fake loaders or simulated responses.
- Mock data is allowed only inside automated tests and must be labeled as test data.
- Development seed data goes through prisma/seed.ts into the real database.
- All reads and writes go through the API and the database layer. Nothing is stored in the browser as a replacement for a database.
- Use migrations for every schema change.
- Validation and permission checks run on the server, not only in the UI.
- Secrets and URLs come from environment variables. Keep .env.example current.
- Build order for each feature: database, then API (test it with curl or a test), then UI, then check the full path: click, API call, database change, screen update.
- If a feature cannot be connected to real data yet, stop and tell me. Do not fake it and move on.

## 6. Working loop (keep it short)
1. Say which feature ID you are building and which files you will touch.
2. Build the smallest change that meets its "Done when".
3. Run the app, the tests and the build. Show the real output.
4. Report in three lines: what changed, what you verified, what is still untested.

## 7. Coding
- Follow the existing structure and style. Do not introduce new patterns without asking.
- Small, clearly named functions. Handle errors explicitly; no empty catch blocks.
- Return errors in the format in docs/TECH.md. Never log passwords, tokens or personal data.
- Comments only where the reason is not obvious.
- Do not delete, skip or weaken a failing test. Fix the code, or tell me the test looks wrong.

## 8. Definition of done (per feature)
- [ ] Meets its "Done when" in the PRD
- [ ] Uses real database records and real API calls
- [ ] Data survives an app restart
- [ ] Build passes and tests pass, with real output shown
- [ ] No unrelated files changed and no unapproved packages added

## 9. When stuck
Say what you know, what you do not know and what you need. Offer 2 or 3 options with a recommendation. Do not silently pick a workaround that changes scope, behavior or the stack.

## 10. Project-specific rules
- Money is stored as integer smallest units (paise), never floats; convert only at the form and display edges (`lib/money.ts`).
- Dates are `YYYY-MM-DD` strings with no time zone conversion; months are `YYYY-MM`.
- Every query on user data filters by the session user's id; another user's record returns 404.
- Read `node_modules/next/dist/docs/` before writing Next.js code; never install `prisma@latest` (it is a release candidate) or TypeScript 7.
- Latest 2 versions of Chrome, Safari and Firefox; all buttons reachable by keyboard.
