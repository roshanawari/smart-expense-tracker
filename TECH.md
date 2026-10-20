# TECH: Smart Expense Tracker

## 1. Stack (use exactly these versions)
Versions checked on 11 Oct 2026 against the npm registry and each project's official docs.

| Layer | Technology | Version |
| --- | --- | --- |
| Runtime | Node.js | 22.22.0 or newer (every package here accepts 22.12+) |
| Language | TypeScript | 5.9.3 |
| Framework (frontend + API) | Next.js (App Router, Cache Components OFF) | 16.4.0 |
| UI library | React / react-dom | 19.3.0 |
| Database | SQLite (file) | via better-sqlite3 12.11.1 (installed by the Prisma adapter) |
| ORM | Prisma (`prisma`, `@prisma/client`, `@prisma/adapter-better-sqlite3`) | 7.10.0 (all three the same) |
| Styling | Tailwind CSS + `@tailwindcss/turbopack` | 4.3.3 (both) |
| Auth | Own session: signed JWT in an httpOnly cookie, `jose` + `bcryptjs` | jose 6.2.12, bcryptjs 3.0.3 |
| Validation | zod | 4.6.5 |
| Charts | Recharts | 3.10.1 |
| PDF export | pdfkit (+ `@types/pdfkit`) | 0.20.2 (+ 0.17.6) |
| AI Bill Scanning | `@google/genai` | 2.28.0 |
| Tests | Vitest | 5.0.3 |

Approved packages: only the ones above plus `dotenv` 18.0.7, `tsx` 4.23.15 (runs the seed script), `server-only` 0.0.1, `@types/node` 22.20.5, `@types/better-sqlite3` 9.6.0, and what `create-next-app` installs (`@types/react` and `@types/react-dom` 19.3.0, `eslint` 9.39.5, `eslint-config-next` 16.4.0).

Notes:
- Do **not** install `prisma@latest`. Its npm `latest` tag is currently `8.0.0-rc.22` (a release candidate). Use 7.10.0 exactly.
- Do not install TypeScript 7.x; Next.js uses 5.9.3.
- Pin exact versions in package.json (no `^`).
- CSV export is plain code in `lib/csv.ts` (no package).
- Next.js 16 route `params` and `cookies()` are async in this version.
- `@google/genai` 2.28.0 used exclusively on server route `POST /api/bills/scan`. Model: `gemini-3.8-flash`.

## 2. UI and theme
- Layout: top navbar (Dashboard, Transactions, Budgets, Goals, Friends, Groups, History, Log out), centered content, max width 1100px. Login and Register have no navbar.
- Colors: primary #0F766E, background #F8FAFC, text #0F172A, error #DC2626, income #16A34A, expense #DC2626. Pie chart uses 5 fixed distinct colors, one per expense category.
- Font: system font stack (no web font download).
- Components: Button, Input, Select, Card, Table, ConfirmDialog (modal), FormModal, ProgressBar, Toast; reuse them, do not restyle per page.
- Responsive: works at 360px wide (phone) and 1280px wide (desktop); tables scroll sideways on phones.
- States every data screen must show: loading, empty, error (with **Try again**), success.
- Money display: `Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" })`.

## 3. Architecture (short)
Browser (React client components) calls `/api` routes in the same Next.js app and shows loading, empty and error states. API routes validate input with zod, check session cookie, and read or write the database through Prisma. Real-time updates operate via 5-second polling when the browser tab is active. Shared ledger balances are calculated dynamically from expenses and settlements. Non-members or unauthenticated requests to private group/friend resources strictly return 404.

## 4. Folder structure
/app pages and API routes (auth, transactions, dashboard, budgets, goals, friends, groups, expenses, history, bills)
/components shared UI components, navbar, charts, modals
/lib db client (`db.ts`), session and auth, zod schemas, `money.ts`, `csv.ts`, `pdf.ts`, `split.ts`, `simplify.ts`
/prisma schema.prisma, migrations, seed.ts
/generated Prisma client output (git-ignored)
/tests tests
prisma7.config.ts Prisma config
.env.example every environment variable, with fake values

## 5. Data model
One table per entity from PRD section 6. Money is integer paise in `amountMinor`, `totalMinor`, `shareMinor`. Dates are `YYYY-MM-DD` strings.

| Table | Field | Type | Rules |
| --- | --- | --- | --- |
| User | id | string (cuid) | primary key |
| User | name | string | required, 1-50 chars |
| User | email | string | unique, required, stored lowercase |
| User | passwordHash | string | required, never returned by API |
| User | monthlyBudgetMinor | int | optional; overall monthly budget |
| User | createdAt | datetime | default now |
| Category | id | string (cuid) | primary key |
| Category | name | string | required; unique together with type |
| Category | type | enum (INCOME, EXPENSE) | required |
| Transaction | id | string (cuid) | primary key |
| Transaction | userId | string | foreign key to User, delete cascades |
| Transaction | categoryId | string | foreign key to Category |
| Transaction | type | enum (INCOME, EXPENSE) | required |
| Transaction | amountMinor | int | required, greater than 0 |
| Transaction | date | string | required, `YYYY-MM-DD` |
| Transaction | description | string | optional, max 200 chars |
| Transaction | createdAt | datetime | default now |
| Budget | id | string (cuid) | primary key |
| Budget | userId | string | foreign key to User, delete cascades |
| Budget | categoryId | string | foreign key to Category; unique with userId |
| Budget | amountMinor | int | required, greater than 0 |
| SavingsGoal | id | string (cuid) | primary key |
| SavingsGoal | userId | string | foreign key to User, delete cascades |
| SavingsGoal | name | string | required, 1-50 chars |
| SavingsGoal | targetMinor | int | required, greater than 0 |
| SavingsGoal | savedMinor | int | default 0 |
| SavingsGoal | targetDate | string | optional, `YYYY-MM-DD` |
| SavingsGoal | createdAt | datetime | default now |
| Friendship | id | string (cuid) | primary key |
| Friendship | userAId | string | foreign key to User, delete cascades |
| Friendship | userBId | string | foreign key to User, delete cascades |
| Friendship | createdAt | datetime | default now; unique([userAId, userBId]) |
| Group | id | string (cuid) | primary key |
| Group | name | string | required, 1-50 chars |
| Group | createdById | string | foreign key to User, delete cascades |
| Group | createdAt | datetime | default now |
| GroupMember | id | string (cuid) | primary key |
| GroupMember | groupId | string | foreign key to Group, delete cascades |
| GroupMember | userId | string | foreign key to User, delete cascades |
| GroupMember | joinedAt | datetime | default now; unique([groupId, userId]) |
| SharedExpense | id | string (cuid) | primary key |
| SharedExpense | groupId | string | optional, foreign key to Group, delete cascades |
| SharedExpense | paidById | string | foreign key to User, delete cascades |
| SharedExpense | totalMinor | int | required, greater than 0 |
| SharedExpense | description | string | required, 1-200 chars |
| SharedExpense | date | string | required, `YYYY-MM-DD` |
| SharedExpense | splitMethod | enum (EQUAL, PERCENT, EXACT) | required |
| SharedExpense | createdById | string | foreign key to User, delete cascades |
| SharedExpense | createdAt | datetime | default now |
| ExpenseShare | id | string (cuid) | primary key |
| ExpenseShare | expenseId | string | foreign key to SharedExpense, delete cascades |
| ExpenseShare | userId | string | foreign key to User, delete cascades |
| ExpenseShare | shareMinor | int | required, greater than or equal to 0; unique([expenseId, userId]) |
| Settlement | id | string (cuid) | primary key |
| Settlement | groupId | string | optional, foreign key to Group, delete cascades |
| Settlement | fromUserId | string | foreign key to User, delete cascades |
| Settlement | toUserId | string | foreign key to User, delete cascades |
| Settlement | amountMinor | int | required, greater than 0 |
| Settlement | date | string | required, `YYYY-MM-DD` |
| Settlement | note | string | optional, max 200 chars |
| Settlement | createdAt | datetime | default now |

## 6. API routes (list)
| Method | Path | Purpose | Who | Success | Errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/categories | list all categories | anyone | 200 | none |
| POST | /api/auth/register | create account and log in | anyone | 201 | 400, 409 |
| POST | /api/auth/login | log in | anyone | 200 | 400, 401 |
| POST | /api/auth/logout | clear session | user | 204 | none |
| GET | /api/auth/me | get current user info | user | 200 | 401 |
| GET | /api/transactions | list own personal transactions | user | 200 | 401 |
| POST | /api/transactions | create personal transaction | user | 201 | 400, 401 |
| GET | /api/transactions/:id | read one personal transaction | owner | 200 | 401, 404 |
| PATCH | /api/transactions/:id | update personal transaction | owner | 200 | 400, 401, 404 |
| DELETE | /api/transactions/:id | delete personal transaction | owner | 204 | 401, 404 |
| GET | /api/transactions/export | export CSV or PDF | user | 200 | 400, 401 |
| GET | /api/dashboard | totals, category spend, 6 months | user | 200 | 400, 401 |
| GET | /api/budgets | overall & category budgets | user | 200 | 401 |
| PUT | /api/budgets/overall | set/clear overall budget | user | 200 | 400, 401 |
| PUT | /api/budgets/:categoryId | set category budget | user | 200 | 400, 401, 404 |
| DELETE | /api/budgets/:categoryId | clear category budget | user | 204 | 401, 404 |
| GET | /api/goals | list own goals | user | 200 | 401 |
| POST | /api/goals | create goal | user | 201 | 400, 401 |
| PATCH | /api/goals/:id | edit goal | owner | 200 | 400, 401, 404 |
| POST | /api/goals/:id/savings | add to saved amount | owner | 200 | 400, 401, 404 |
| DELETE | /api/goals/:id | delete goal | owner | 204 | 401, 404 |
| GET | /api/friends | list friends with computed net balance | user | 200 | 401 |
| POST | /api/friends | add friend by exact email | user | 201 | 400, 401, 404 |
| GET | /api/friends/:id | friend details, balance, shared expenses | friend | 200 | 401, 404 |
| GET | /api/groups | list groups user belongs to with balance | user | 200 | 401 |
| POST | /api/groups | create group with name and friends | user | 201 | 400, 401 |
| GET | /api/groups/:id | group details, members, balances, expenses | member | 200 | 401, 404 |
| POST | /api/groups/:id/members | add friend to existing group | member | 200 | 400, 401, 404 |
| POST | /api/expenses | create shared expense (Equal/Percent/Exact) | member | 201 | 400, 401, 404 |
| GET | /api/expenses/:id | read shared expense details | member | 200 | 401, 404 |
| PATCH | /api/expenses/:id | edit shared expense | creator | 200 | 400, 401, 404 |
| DELETE | /api/expenses/:id | delete shared expense | creator | 204 | 401, 404 |
| GET | /api/settlements | list settlements (filter friendId, groupId) | user | 200 | 401 |
| POST | /api/settlements | record payment in group or one-on-one | member | 201 | 400, 401, 404 |
| GET | /api/groups/:id/simplify | compute debt simplification transfers | member | 200 | 401, 404 |
| POST | /api/bills/scan | multipart receipt upload to Gemini OCR | user | 200 | 400, 401, 500 |

Another user's record or non-member group returns 404, not 403. Error format: `{ "error": { "code": "STRING", "message": "Readable text" } }`.

## 7. Security
- Passwords hashed with bcryptjs (cost 10).
- Check login and authorization on server for every protected route.
- Group and shared expense operations strictly verify user membership; non-members receive 404.
- Receipt images processed entirely in-memory buffers; never written to filesystem or cloud storage.
- GEMINI_API_KEY stored strictly in `.env`; never sent to the client or logged.

## 8. Third-party services
- Google Gemini API via `@google/genai` 2.28.0 (Model: `gemini-3.8-flash`) for structured receipt data extraction in `POST /api/bills/scan`.
- No payment gateways or other third-party APIs.

Library docs:
- Gemini Structured Output: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini Image Understanding: https://ai.google.dev/gemini-api/docs/image-understanding
- Prisma SQLite quickstart: https://www.prisma.io/docs/v7/prisma-orm/quickstart/sqlite

## 9. Commands
- Install: npm install
- Set up database: npx prisma migrate dev && npx prisma db seed
- Run: npm run dev (http://localhost:3000)
- Test: npm test
- Build: npm run build

## 10. Environment variables (.env.example)
DATABASE_URL="file:./dev.db"
SESSION_SECRET="change-me-to-a-long-random-string"
GEMINI_API_KEY="your-gemini-api-key-here"
