# PRD: Smart Expense Tracker

## 1. Goal
People who track money by hand (notebooks, memory) lose time and cannot see where it goes. Smart Expense Tracker lets one person record income and expenses, group them by category, set budgets and savings goals, and see simple charts and reports. Furthermore, users can split shared expenses with friends and groups, view computed ledger balances of who owes whom, record settlements, simplify group debts, and scan physical receipts with AI. Success: a new user signs up, logs personal transactions, connects with friends, splits bills accurately down to the paise, and settles up cleanly.

Similar products (Monarch Money, YNAB, Goodbudget, PocketGuard, EveryDollar, Splitwise) share personal budgeting and group splitting. We copy that core with manual entry and lightweight AI assistance.

## 2. Scope
**Will build:**
- Sign up, log in, log out (email + password)
- Add, edit, delete income and expense transactions
- Fixed category lists (expense and income)
- Dashboard with totals, pie chart and bar chart
- Overall monthly budget and per-category budgets
- Savings goals with progress
- Transaction history with filters, CSV export and PDF export
- Friends: add by exact email, mutual instant friendship, list friends with net balance (F11)
- Groups: create group with name and friends as members, add members later (F12)
- Split expenses: Equal, Percent, or Exact methods; extra paise in fixed order; live remaining line (F13)
- Balances: computed from ledger (expenses and settlements), per friend and per group (F14)
- Settlements: record payments in a group or one-on-one, settlement history at /history (F15)
- Live updates: 5-second polling on active tabs (F16)
- Debt simplification: compute minimal payments for groups (F17)
- Upload bill image: scan receipt (JPG/PNG/WEBP <= 5MB) via Gemini to prefill expense forms (F18)

**Will NOT build (do not add these):**
- Bank/card sync or importing files
- Custom categories, tags, recurring transactions, multiple accounts or wallets
- Multiple currencies or currency conversion
- Forgot/reset password, email verification, social login, two-factor auth
- Email, SMS or push notifications and budget alerts (status is shown on screen only)
- Admin role or admin pages, shared or family accounts
- Mobile app, dark mode, multi-language, offline mode
- AI financial forecasts, net worth, investments, debt interest tracking
- Payments or external payment gateways (UPI, PayPal, Stripe)
- Guest contacts without accounts, friend requests/invites, comments or chat, deleting groups, editing past settlements
- Storing receipt images on disk, assigning line items to different people, automatic saving without review, multi-page/PDF bills

## 3. Roles
| Role | Can do | Cannot do |
| --- | --- | --- |
| Visitor | Open /login and /register, create an account | See any other page or any data |
| User | Create, read, update, delete own transactions, budgets, goals; manage friendships, member groups, shared expenses, settlements; export data; scan bills | See or change another user's personal data or non-member group data (404) |
| Admin | None (no admin role in this app) | None |

## 4. Screens and user flow
Top bar: **Dashboard**, **Transactions**, **Budgets**, **Goals**, **Friends**, **Groups**, **History**, **Log out**. Log out clears session and redirects to /login. Opening `/` goes to /dashboard when logged in, otherwise /login.

| Screen | URL | Main elements | Action and result |
| --- | --- | --- | --- |
| Register | /register | Name, Email, Password, **Create account** button, "Log in" link | Valid form: account created, logged in, goes to /dashboard. Email taken: "Email already in use". Bad input: message under field. |
| Login | /login | Email, Password, **Log in** button, "Create account" link | Valid: goes to /dashboard. Invalid: "Wrong email or password". |
| Dashboard | /dashboard | Month switcher (**◀** **▶**), cards Income / Expenses / Balance, pie chart, bar chart, budget card, **+ Add income**, **+ Add expense** | ◀ / ▶ reload for previous/next month (`?month=YYYY-MM`). Quick adds open transaction form. Personal dashboard is unaffected by shared expenses. |
| Transactions | /transactions | Filters (month, type, category), table, per-row **Edit** and **Delete**, **Export CSV**, **Export PDF**, **+ Add income**, **+ Add expense** | Filters reload table. Export buttons download matching records. |
| Transaction form | /transactions/new and /transactions/:id/edit | Type, Amount, Date, Category, Description, **Scan bill** button, **Save**, **Cancel** | **Scan bill** reads receipt and autofills fields. **Save** persists personal transaction. |
| Budgets | /budgets | Overall monthly budget input + **Save**; category table: budget input, spent, progress, status, **Save** and **Clear** | **Save** stores budget. Status turns "Over budget" (red) when spent exceeds budget. |
| Goals | /goals | Goal cards, **+ New goal**, per card **Add savings**, **Edit**, **Delete** | Form modal to create/edit goal. **Add savings** increments saved amount. Reaching target shows "Goal reached". |
| Friends | /friends | Add friend input (email + **Add friend** button), list of friends with net balance ("you owe ₹X" / "owes you ₹Y" / "settled up") | Adding email creates mutual friendship. Clicking a friend row navigates to `/friends/:id`. Unknown email shows "No user with that email". |
| Friend details | /friends/:id | Friend name, net balance, shared expenses list, **+ Add expense**, **Settle up** | **+ Add expense** opens `/expenses/new?friendId=:id`. **Settle up** opens modal (who pays, amount, note, Save, Cancel). |
| Groups | /groups | Group list with net balance, **+ New group** button | Displays groups where user is a member. **+ New group** navigates to `/groups/new`. |
| New group | /groups/new | Name input, member selection checkboxes (from friends list), **Create**, **Cancel** | Creates group with creator and selected friends, redirects to `/groups/:id`. |
| Group details | /groups/:id | Group name, members list + **Add member**, net balances, expenses list (Edit/Delete for creator), **+ Add expense**, **Settle up**, **Simplify debts** | Non-members get 404. **Simplify debts** displays minimized settlement graph with "Record payment" buttons. |
| Split expense form | /expenses/new and /expenses/:id/edit | Description, Total amount, Date, Paid by (dropdown), Group/Friend selection, Participants checkboxes, Method tabs (Equal, Percent, Exact), live remaining amount line, **Scan bill**, **Save**, **Cancel** | Computes shares according to method. Blocks save if shares don't sum to total. Redirects back to group/friend page. |
| Settlement history | /history | Table of past settlements (date, from, to, amount, group/one-on-one, note), filter by friend or group | Displays audit ledger of all recorded payments. |

## 5. Features (one ID each)
| ID | Feature | Done when |
| --- | --- | --- |
| F1 | Sign up, login, logout | A new user can register, log in and log out; a wrong password shows "Wrong email or password"; opening /dashboard while logged out goes to /login |
| F2 | Add income | Saving the income form creates a row typed Income that is still in /transactions after refresh and restart |
| F3 | Add expense | Saving the expense form creates a row typed Expense that is still in /transactions after refresh and restart |
| F4 | Expense categories | The expense form offers Food, Travel, Shopping, Bills, Other; income offers Salary, Pocket money, Other income |
| F5 | Edit and delete transactions | Editing changes values; deleting removes after confirm; user B cannot open user A's /transactions/:id/edit (404) |
| F6 | Dashboard overview | For selected month, Income, Expenses and Balance match rows in /transactions for that month |
| F7 | Expense charts | Pie chart shows one slice per category; bar chart shows 6 months with income and expense bars |
| F8 | Budget management | After setting category budget below spending, shows "Over budget"; overall budget shows spent vs budget |
| F9 | Savings goal tracker | Creating a goal shows 0%; Add savings with half shows 50%; full amount shows "Goal reached" |
| F10 | Reports and export | Filtered transactions download formula-safe CSV and Helvetica PDF with totals |
| F11 | Friends | Adding a registered email shows that person in /friends for both users; unknown email shows "No user with that email" |
| F12 | Groups | Group created by A with B shows in both A's and B's /groups; a non-member opening /groups/:id gets 404 |
| F13 | Split an expense | Equal 100.00 among 3 saves shares 33.34 / 33.33 / 33.33 (extra paise to first participants in fixed order); Percent must total 100 and Exact must total expense, otherwise Save blocked with remaining amount; shares add up exactly to total |
| F14 | Balances | If A paid 90.00 split equally with B and C, B and C each owe A 30.00 on group page and /friends |
| F15 | Record a payment | B records paying A 30.00; B's balance with A becomes 0.00 and payment appears in /history with date, from, to, amount and group |
| F16 | Live updates | With two browsers logged in as two group members, an expense added in one appears in the other within 5 seconds without manual refresh |
| F17 | Debt simplification | A group where A paid for B and C, and B paid for C, shows fewer or equal suggested payments than raw debts, and recording all suggested payments brings every balance to 0.00 |
| F18 | Upload a bill image and add expenses | Uploading a clear receipt fills description, date and total; blurry/non-bill shows "Could not read this bill. Enter it manually." and leaves form usable; no image file stored on server |

## 6. Data (main entities)
- **User**: id, name, email (unique, lowercase), passwordHash, monthlyBudgetMinor, createdAt
- **Category**: id, name, type (INCOME / EXPENSE)
- **Transaction**: id, userId, categoryId, type, amountMinor, date, description, createdAt
- **Budget**: id, userId, categoryId, amountMinor
- **SavingsGoal**: id, userId, name, targetMinor, savedMinor, targetDate, createdAt
- **Friendship**: id, userAId, userBId, createdAt (unique together [userAId, userBId], symmetric querying)
- **Group**: id, name, createdById, createdAt
- **GroupMember**: id, groupId, userId, joinedAt (unique together [groupId, userId])
- **SharedExpense**: id, groupId (optional), paidById, totalMinor, description, date, splitMethod (EQUAL, PERCENT, EXACT), createdById, createdAt
- **ExpenseShare**: id, expenseId, userId, shareMinor (unique together [expenseId, userId])
- **Settlement**: id, groupId (optional), fromUserId, toUserId, amountMinor, date, note, createdAt

## 7. Rules and edge cases
- Required fields: name (1-50 chars), email (valid format), password (8+ chars), amount (greater than 0, at most 2 decimals, below 1,000,000,000), date (valid calendar date YYYY-MM-DD).
- Friendship is mutual and instant; cannot add oneself; duplicate friend shows existing friendship.
- Group members must be friends of the creator at addition time. Non-members receive 404 when querying group data or its expenses.
- Shared expenses are distinct from personal transactions and do not alter personal dashboard balances.
- Splitting extra paise: `totalMinor % N` extra paise are assigned (+1 paise each) to the first participants in fixed order.
- In Percent splitting, sum of percentages must equal exactly 100.00%. In Exact splitting, sum of shares must equal exactly totalMinor.
- Balances are dynamically calculated from the ledger: `Net Balance = (Total Paid - Total Share) + (Settlements Received - Settlements Paid)`.
- Live polling runs every 5 seconds only when document is visible (`document.visibilityState === 'visible'`).
- Debt simplification: repeated greedy matching of maximal debtor to maximal creditor until net balances equal zero. Produces at most (N - 1) transactions.
- Bill images: JPG, PNG, WEBP up to 5 MB. Evaluated in ephemeral memory buffer; never saved to disk.

## 8. Milestones
| Milestone | Includes | Done when |
| --- | --- | --- |
| M0 Skeleton | Project setup, SQLite DB, Category seed, /api/categories, / | Page / lists 8 categories from DB |
| M1 Auth | F1 | Register, login, logout work; passwords hashed; route protection |
| M2 Transactions | F2, F3, F4, F5 | Full create, read, update, delete of personal transactions; 404 isolation |
| M3 Dashboard | F6, F7 | Totals and Recharts match transaction records for selected month |
| M4 Budgets and goals | F8, F9 | Budget over-budget indicator and savings goal progress |
| M5 Reports and polish | F10, empty and error states, 360px layout | CSV & PDF downloads work, formula safety, mobile responsiveness |
| M6 Split with friends & groups | F11, F12, F13, F14, F15, F16 | Mutual friends, groups, Equal/Percent/Exact splits, ledger balances, settlements, 5s polling |
| M7 Debt simplification & AI scan | F17, F18 | Debt simplification algorithm and Gemini structured bill scanning |

## 9. Open questions and assumptions
- Currency: Indian rupee (₹), shown as `₹1,234.50`.
- Balances: Personal Balance is selected month; Group/Friend balances are computed from full ledger history.
- AI Model: Gemini structured output using `@google/genai` 2.28.0.
