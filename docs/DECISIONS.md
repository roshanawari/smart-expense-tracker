# Architecture and Implementation Decisions

- **2026-10-11**: Configured `prisma7.config.ts` per Prisma 7 standards with `defineConfig` from `prisma/config` to manage SQLite datasource URL and migration seed script.
- **2026-10-11**: Disabled `cacheComponents` and `partialPrefetching` in `next.config.ts` per `TECH.md` requirements.
- **2026-10-11**: Created `docs/` folder to host `docs/PRD.md`, `docs/TECH.md`, and `docs/DECISIONS.md` while retaining root files.
- **2026-10-11**: Used system font stack in `app/layout.tsx` and `app/globals.css` without external font downloads.
- **2026-10-11**: Added Vitest test `tests/m0-categories.test.ts` to test SQLite database seeding and the `GET /api/categories` endpoint.
- **2026-10-11**: Implemented F1 Auth using `jose` (HS256 signed JWTs with 7-day expiration) and `bcryptjs` (cost 10) in `lib/auth.ts`.
- **2026-10-11**: Used `NextResponse.cookies.set()` and `removeSessionCookie()` in Route Handlers to cleanly manage `httpOnly` session cookies across both unit tests and production requests.
- **2026-10-11**: Implemented route protection on `/dashboard` and `/` redirecting unauthenticated requests to `/login`.
- **2026-10-11**: Implemented F2-F5 Transactions: `Transaction` table in SQLite with index `[userId, date]`, minor currency units (paise) integer storage, strict category-type validation, and cross-user isolation returning 404.
- **2026-10-11**: Implemented F6-F7 Dashboard: Date utilities in `lib/date.ts` for clean month ranges, Recharts with fixed 5 category colors, overview metric cards (Income, Expenses, Net Balance), budget card, and 6-month historical trends.
- **2026-10-11**: Implemented F8-F9 Budgets & Goals: Overall budget on User model, per-category budget upserts with "Over budget" detection, and savings goals tracking with incremental contributions and 100% "Goal reached" status, maintaining strict 404 cross-user security.
- **2026-10-11**: Implemented F10 Reports & Export: Pure TypeScript CSV generator in `lib/csv.ts` with RFC 4180 escaping and spreadsheet formula injection protection (`'`, `=`, `+`, `-`, `@`), and PDF export in `lib/pdf.ts` via `pdfkit` (built-in Helvetica, title, period, totals, and formatted rows table). Exposed via `GET /api/transactions/export?format=csv|pdf` with dynamic filter support.
