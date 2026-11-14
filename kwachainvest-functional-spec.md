# KwachaInvest — Functional & Business Logic Specification

This document describes the system **as actually built**, not an aspirational roadmap. Every flow described here traces to real code (module, function, or endpoint named explicitly for traceability). Section 6 lists known gaps honestly rather than glossing over them — read it before assuming something works that isn't listed as a requirement here.

---

## 0. System Overview

KwachaInvest is a mobile-money-first savings platform for Malawi. Users create structured savings plans (locked until a date or until a target amount), fund them via TNM Mpamba or Airtel Money through PayChangu (the sole payment gateway — no in-app wallet), and withdraw according to rules set at account creation. Two roles exist: `USER` and `ADMIN`.

---

## 1. Backend Functional Requirements

Each requirement follows: **Use Case → Flow → Business Rules → Edge Cases**.

### 1.1 Authentication & Session Management

#### FR-AUTH-01 — User Registration
**Use case**: A new user creates an account with name, email, phone, and password.

**Flow**:
1. `POST /users/register` — body validated (`user.validator.js`: required fields, valid email, password ≥ 8 chars).
2. `user.service.js#registerUser` checks `existsByEmailOrPhone` — rejects with `409 Conflict` if either is already taken.
3. Password hashed (`bcrypt`, via `utils/hash.js`).
4. User row created with `role: USER` (default), `isActive: true`.
5. Welcome email sent (`notification.service.js#sendWelcomeEmail`) — best-effort, never blocks the response.

**Business rules**: Email and phone must each be globally unique. No KYC step. No email verification step — an account is immediately usable after registration.

**Edge cases**: Duplicate email/phone → `409`. Weak password → `400` before any DB write.

---

#### FR-AUTH-02 — Login
**Use case**: A registered user signs in with either their email or phone number, plus password.

**Flow**:
1. `POST /auth/login` (rate-limited — see FR-AUTH-08).
2. `auth.service.js#login` resolves the identifier as email or phone (`isEmail()` check), fetches the user **with** `passwordHash` via the `ForAuth` repository variant.
3. `bcrypt.compare` against stored hash.
4. On success: a new `AuthSession` row is created (hashed refresh token, device info, IP, expiry), an access token (JWT, 15 min) is signed, both returned — **refresh token now goes in an `httpOnly` cookie, not the response body** (see FR-AUTH-09 for the full cookie model).

**Business rules**: **Identical error message for "no such user" and "wrong password"** — this is deliberate, not an oversight, to prevent account enumeration. An `isActive: false` account is rejected with `403`, distinct from a credentials failure.

**Edge cases**: Deactivated account → `403` "This account has been deactivated". Wrong password 5+ times → no account lockout exists at this layer (only the OTP flow has attempt-limiting — see FR-AUTH-05); brute-force protection here is the rate limiter only.

---

#### FR-AUTH-03 — Token Refresh (rotation)
**Use case**: A user's short-lived access token has expired; the app silently obtains a new one without forcing re-login.

**Flow**:
1. `POST /auth/refresh` — no body; refresh token read from the `httpOnly` cookie, CSRF token validated against the `X-CSRF-Token` header (double-submit pattern — see FR-AUTH-09).
2. `auth.service.js#refreshAccessToken` looks up the `AuthSession` by hashed token; rejects if revoked or expired.
3. **The old session is immediately revoked** and a brand-new one created — this is single-use rotation, not reuse of the same refresh token.
4. New access token + new refresh/CSRF cookies issued.

**Business rules**: A refresh token can only ever be used once. If it's replayed (e.g., stolen and used after the legitimate client already rotated it), the second use fails because the first use already revoked it.

**Edge cases**: Expired/revoked/missing token → `401`, frontend treats this as session-expired (silent redirect to login, no toast — see Section 4.1).

---

#### FR-AUTH-04 — Logout / Logout All Devices
**Use case**: A user signs out of the current device, or every device at once.

**Flow — single device**: `POST /auth/logout` reads the refresh token from the cookie, revokes that one `AuthSession`, clears both cookies. Idempotent — calling it twice, or with an already-revoked token, doesn't error.

**Flow — all devices**: `POST /auth/logout-all` (authenticated) revokes **every** `AuthSession` for the user, including the one making the request. The frontend must redirect to login immediately after calling this — the current session is dead too.

**Business rules**: There is **no single-device revoke** — only "this device" (via its own cookie) or "all devices." A user cannot remotely kill *one specific other* session from a list.

---

#### FR-AUTH-05 — Forgot Password (OTP)
**Use case**: A user who forgot their password requests a reset code via email.

**Flow**:
1. `POST /auth/forgot-password` (rate-limited, tighter window than login).
2. `auth.service.js#forgotPassword` looks up the user; **if not found, still returns the same generic success message** — no indication of whether the account exists.
3. If found: any existing unconsumed OTP for this user+purpose is invalidated, a new 6-digit code is generated, hashed with `bcrypt` (deliberately slow — a 6-digit code is brute-forceable at scale, needs resistance), stored with a 10-minute expiry, and emailed.

**Business rules**: One active OTP at a time per user. Delivery is **email only** — no SMS provider is wired up.

---

#### FR-AUTH-06 — Reset Password
**Use case**: A user submits the emailed OTP plus a new password to regain access.

**Flow**:
1. `POST /auth/reset-password` (rate-limited) with identifier, OTP, new password, confirmation.
2. OTP looked up; **5 wrong attempts locks it out** (`OTP_MAX_ATTEMPTS`) — a 6th attempt is rejected even before checking the code itself.
3. Correct OTP → consumed (can't be reused), password hash updated, **every active session for this user is revoked** — forces re-login on every device, since a password reset should invalidate any session an attacker might already hold.

**Business rules**: Same generic error for "no user," "wrong/expired OTP," and "too many attempts" where reasonable, to avoid leaking account-existence or attempt-count information.

---

#### FR-AUTH-07 — Active Sessions List
**Use case**: A user reviews which devices are currently logged in.

**Flow**: `GET /auth/sessions` returns device info, IP, created/expiry timestamps for all non-revoked, non-expired sessions. **The token hash itself is never included in the response**, even hashed.

---

#### FR-AUTH-08 — Rate Limiting
**Use case**: Prevent brute-force and abuse on sensitive endpoints.

**Rules**:
- `login`: 10 attempts / 15 min, but only **failed** attempts count (`skipSuccessfulRequests`) — a legitimate user logging in repeatedly across devices is never blocked.
- `forgot-password` / `reset-password`: 5 / hour (both OTP brute-force and inbox-spam protection).
- `register`: 10 accounts / hour per origin (slows bulk fake-account creation).
- `generalRateLimiter`: 300 requests / 15 min, applied globally.

---

#### FR-AUTH-09 — Cookie-Based Refresh Token Model (security architecture)
**Use case**: Prevent XSS from being able to steal the long-lived refresh credential.

**Flow**: Access token stays short-lived, returned in the JSON body, kept in-memory only on the frontend (never `localStorage`). Refresh token moves to an `httpOnly`, `Secure` (prod only), `SameSite=Strict` cookie, path-scoped to `/api/auth/refresh` only — the browser never attaches it to any other request. A companion `csrfToken` cookie (readable, **not** `httpOnly`, scoped to `path: "/"`) is echoed back as an `X-CSRF-Token` header on the one endpoint that uses the cookie, as defense-in-depth on top of `SameSite=Strict`.

**Business rule**: Every other endpoint authenticates via `Authorization: Bearer` — **none of them are cookie-based**, so CSRF has no purchase on anything except `/auth/refresh`.

---

### 1.2 User Account Management

#### FR-USER-01 — View / Update Profile
**Flow**: `GET /users/me` / `PATCH /users/me` (first/last name, email, phone — each uniqueness-checked before saving, `409` on conflict). `role`, `isActive`, `kycStatus` are never client-editable.

#### FR-USER-02 — Change Password (self-service)
**Flow**: `POST /users/me/change-password` — current password verified, new password hashed and saved. **Does NOT revoke sessions** — distinct from the OTP-based reset flow (FR-AUTH-06), which does. This is a deliberate asymmetry: self-service change (you're already proven to know the old password) is lower-risk than a recovery flow (you might be an attacker who just guessed the OTP).

#### FR-USER-03 — Admin: List / Search Users
**Flow**: `GET /users` (filterable: `isActive`, `createdAfter`) / `GET /users/search` (name/email/phone match). Both paginated, hard-capped at 100/page.

#### FR-USER-04 — Admin: Deactivate / Reactivate User
**Flow**: `PATCH /users/:id/deactivate` / `.../reactivate`. A deactivated user fails login (FR-AUTH-02) but their existing access tokens remain valid until natural expiry (15 min) — there is no mechanism to instantly kill an active session on deactivation.

#### FR-USER-05 — Admin: Change User Role
**Flow**: `PATCH /users/:id/role`, body `{ role: "USER" | "ADMIN" }`.

**Business rule — self-demotion guard**: an admin **cannot** demote their own account via this endpoint. Prevents an admin accidentally locking themselves (and possibly the only admin) out with no one able to reverse it. Promoting the very first admin account must be done directly via database/script — there is intentionally no API path to self-escalate to `ADMIN`.

---

### 1.3 Savings Accounts

#### FR-SAV-01 / FR-SAV-02 — Create Time-Based / Target-Based Savings
**Use case**: A user starts a new savings plan, either locked to a date or to a target amount.

**Flow**:
1. `POST /savings/time-based` (name, maturityDate, withdrawalPolicy) or `POST /savings/target-based` (name, target, withdrawalPolicy).
2. `savings.model.js` writes the `SavingsAccount` row **and** its type-specific detail row (`TimeBasedSavings` or `TargetBasedSavings`) inside one atomic transaction (`withTransaction` — tuned with a longer `maxWait`/`timeout` than Prisma's defaults, since the remote pooled Postgres endpoint has real cold-start latency that the defaults were too tight for) — a savings account can never exist without its matching detail row.
3. `penaltyPercentage` is **forced server-side** to the fixed constant (`DEFAULT_PENALTY_PERCENTAGE = 5`) — not accepted from the client at all, even if sent.

**Business rules**: Balance starts at 0. Status starts `ACTIVE`.

#### FR-SAV-03 — View Savings List / Detail
**Flow**: `GET /savings` (own accounts, filterable by status/type, paginated) / `GET /savings/:id` (includes type-specific details + last 20 transactions). Ownership enforced — a mismatched or nonexistent ID returns the same generic `404`, never a `403` that would confirm the ID exists but belongs to someone else.

#### FR-SAV-04 — Rename Savings Account
**Flow**: `PATCH /savings/:id` (name only). Blocked on `CANCELLED`/`COMPLETED` accounts.

#### FR-SAV-05 / FR-SAV-06 — Pause / Resume
**Use case**: A user temporarily halts (and later resumes) a savings account.

**Flow**: `PATCH /savings/:id/pause` (ACTIVE → PAUSED) / `.../resume` (PAUSED → ACTIVE).

**Business rule — the critical one**: **a `FROZEN` account cannot be resumed by the user.** This is the entire reason `PAUSED` (self-service) and `FROZEN` (admin-only) are separate statuses rather than the same thing — without this distinction, a user could silently undo an admin's fraud hold by calling the resume endpoint.

#### FR-SAV-07 — Cancel Savings Account
**Flow**: `PATCH /savings/:id/cancel`. **Blocked if `balance > 0`** — the user must withdraw to zero first. Reasoning: there's no separate "forced payout on cancel" mechanism, so allowing cancellation with funds still present would strand that money with no way to retrieve it.

#### FR-SAV-08 — Withdrawal Policy Rules (the core business logic)
**Use case**: Determine whether a withdrawal is allowed, and whether it costs a penalty.

**Flow** (`savings.service.js#getWithdrawalBreakdown`, called by `payment.service.js` before any money moves):
1. Determine "is this early?" — for `TIME_BASED`: `now < maturityDate`. For `TARGET_BASED`: `balance < target`.
2. **If `FLEXIBLE` and early**: withdrawal is **allowed**, but `penaltyPercentage` (5%) of the requested amount is deducted — the full requested amount still leaves the account balance, but only `amount − penalty` is actually paid out. The forfeited penalty portion is not paid to anyone (not refunded, not retained as a tracked platform fee in the current schema — see Section 6).
3. **If `LOCKED` and early**: withdrawal is **denied entirely** — `ValidationError`, no money moves, nothing is deducted.
4. **If not early at all** (matured / target reached), regardless of policy: full amount, zero penalty.

**This is the single most counter-intuitive rule in the system**: the label "FLEXIBLE" sounds like it should be the lenient one, but it's actually the one that *always allows* withdrawal (at a cost), while "LOCKED" is the one that *refuses outright*. Document this explicitly anywhere it's user-facing.

#### FR-SAV-09 — Target-Based Auto-Completion
**Use case**: A target-based account automatically marks itself done once funded enough.

**Flow**: Inside the payment webhook handler (FR-PAY-05), immediately after a successful deposit increments the balance, the account is re-fetched and checked: if `TARGET_BASED` and `balance >= target`, status flips to `COMPLETED` automatically. **No equivalent exists for time-based maturity** — a time-based account does not auto-complete when its date passes; maturity only matters at withdrawal time (FR-SAV-08). This is a deliberate scope decision (no background job infrastructure exists to proactively check dates), not an oversight.

#### FR-SAV-10 — Admin Freeze / Unfreeze
See FR-ADM-03.

---

### 1.4 Payments (Deposits & Withdrawals)

All payment logic routes through **PayChangu** — the sole gateway. No in-app wallet exists; money is either in a savings account or has moved via mobile money.

#### FR-PAY-01 — List Mobile Money Operators
**Flow**: `GET /payments/mobile-money-operators` proxies PayChangu's live operator list — the client never calls PayChangu directly.

#### FR-PAY-02 — Initiate Mobile Money Deposit
**Use case**: A user funds a specific savings account via TNM or Airtel.

**Flow**:
1. `POST /payments/deposits/mobile-money` (savingsAccountId, amount, provider, phoneNumber).
2. `assertDepositable` — rejects unless account status is `ACTIVE` (blocks `PAUSED`/`FROZEN`/`CANCELLED`/`COMPLETED` before any charge attempt).
3. Operator name matched to PayChangu's `ref_id` (`TNM`/`AIRTEL` enum mapped by regex against the live operator list name — see Section 6 for the maintenance implication).
4. A `Transaction` (status `PENDING`) and `PaymentGatewayTransaction` (`DIRECT_MOBILE_MONEY` mode, `INITIATED`) are created, **before** the actual charge call — so there's a durable record even if the subsequent network call fails outright.
5. PayChangu's charge endpoint is called; on success, status moves to `PROCESSING` and the response is `202 Accepted` (not `200`) — correctly signaling "started," not "done," since PayChangu asynchronously waits for the user to approve a prompt on their phone.
6. On the charge call itself failing (network error, etc.): both records marked `FAILED` immediately, balance untouched (nothing was ever deducted for a deposit), generic error returned to the client.

#### FR-PAY-03 — Hosted Checkout Deposit (alternate mode)
**Flow**: `POST /payments/deposits/checkout` — same `assertDepositable` gate, but instead of collecting phone/provider directly, generates a PayChangu-hosted checkout link and returns it for redirect. User picks their own method (mobile money, bank, card) on PayChangu's page. **One unconfirmed detail**: the exact response field containing the checkout URL was never verified against a live PayChangu call — flagged directly in code comments.

#### FR-PAY-04 — Initiate Mobile Money Withdrawal
**Use case**: A user withdraws from a savings account back to their mobile money wallet.

**Flow**:
1. `POST /payments/withdrawals/mobile-money`.
2. `getWithdrawalBreakdown` (FR-SAV-08) computes penalty/payout or throws if `LOCKED`+early.
3. **Balance is decremented optimistically, before the payout call is even attempted** — this is deliberate: it's what prevents a user from firing two withdrawal requests against the same money while the first is still in flight. There's no separate "reserved funds" concept; the decremented balance *is* the reservation.
4. If the payout call itself fails: **the full amount is refunded back** (`incrementBalance`) — this is the closest thing the system has to a "refund" mechanism, and it's automatic, not something a user or admin has to manually trigger.
5. If it succeeds: `202`, status `PROCESSING`, resolved later by webhook.
6. If the withdrawal was early on a `FLEXIBLE` account, an `EARLY_WITHDRAWAL_PENALTY_APPLIED` audit log entry is recorded with the full breakdown (requested amount, penalty %, penalty amount, payout amount) — this is the only place penalty details are durably recorded; `Transaction.amount` itself stores the full requested amount, not the net payout.

#### FR-PAY-05 — Webhook Processing
**Use case**: PayChangu asynchronously confirms the real outcome of a deposit or withdrawal.

**Flow**:
1. Signature verified first — HMAC-SHA256 over the **raw** request body (requires `express.raw()` on this one route, mounted **before** `express.json()` in `app.js`; parsing the body first and re-serializing would break the hash match). Invalid signature → rejected before anything else happens.
2. Duplicate delivery detection — if this exact `providerEventId` was already recorded, acknowledge and stop (idempotent against PayChangu's own retries).
3. The matching `PaymentGatewayTransaction` is found by `gatewayReference`. **The webhook payload's own status field is never trusted directly** — the handler calls PayChangu's own verify-status endpoint server-side (the specific endpoint depends on mode **and** transaction type: direct-charge-deposit, direct-charge-payout, or hosted-checkout each verify differently) before deciding anything.
4. **On confirmed success**:
   - Deposit → balance incremented, target-completion checked (FR-SAV-09), success email sent, saved payment method marked `isVerified: true` (first time this exact number+provider has had a real successful charge).
   - Withdrawal → balance already decremented at initiation (step 3 of FR-PAY-04) — nothing further happens to the balance; success email sent (including penalty amount, looked up from the audit log recorded at initiation).
5. **On confirmed failure**:
   - Deposit → marked `FAILED`, failure email sent. Nothing to refund (money never left the balance for a deposit).
   - Withdrawal → marked `FAILED`, **balance refunded** (undoing the optimistic decrement), failure email explicitly states the funds were restored.

#### FR-PAY-06 — Saved Payment Methods
**Use case**: Repeat deposits don't require retyping a phone number.

**Flow**: Created/updated automatically after a Direct Charge attempt (`isVerified: false` at creation), flipped to `isVerified: true` only once a real webhook-confirmed success occurs for that exact number+provider. **Never manually added** — there's no "add a payment method" action independent of making a deposit. `GET /payments/saved-methods` / `DELETE /payments/saved-methods/:id`, ownership-checked.

#### FR-PAY-07 — Idempotency
**Business rule**: `Transaction.idempotencyKey` is `@unique` at the database level — not just checked in application logic. A reused reference fails the insert outright, which is a stronger guarantee than an application-level check alone.

#### FR-PAY-08 — Failed Withdrawal Auto-Refund
Documented fully under FR-PAY-04/FR-PAY-05 above — called out separately here because it's effectively the system's refund mechanism, and it's entirely automatic.

---

### 1.5 Transactions

#### FR-TXN-01 / FR-TXN-02 — Transaction History
**Flow**: `GET /transactions/me` (own, filterable by account/type/status/date, paginated) / `GET /transactions/:id` for detail. Admin equivalents (`GET /transactions`, with an added `userId` filter) exist under the same module, not under `/admin`. **Read-only module** — no transaction is ever created via a direct client request; every one originates inside `payment.service.js`.

---

### 1.6 Admin Oversight

#### FR-ADM-01 — Dashboard Stats
**Flow**: `GET /admin/dashboard` — user counts, savings totals (count/balance/breakdown by status+type), transaction totals (successful count/amount, breakdown by status). Computed via Prisma `aggregate`/`groupBy`, not by loading every row into memory.

#### FR-ADM-02 — Audit Log Viewing
**Flow**: `GET /admin/audit-logs`, filterable by user/entity-type/action/date-range. **Coverage is partial** — freeze/unfreeze and early-withdrawal-penalty events are logged; logins, role changes, and password resets currently are **not**, despite the table existing for exactly that purpose (see Section 6).

#### FR-ADM-03 — Savings Account Freeze / Unfreeze
**Use case**: An admin places a fraud/compliance hold on a specific account.

**Flow**: `PATCH /admin/savings-accounts/:id/freeze` (optional `reason`) / `.../unfreeze`. Freeze blocked on already-`FROZEN` or already-`COMPLETED`/`CANCELLED` accounts. Both actions: write an audit log entry with the acting admin's ID, and email the affected user.

**Business rule**: This is the **only** way a `FROZEN` account returns to `ACTIVE` — no self-service path exists (see FR-SAV-05/06).

---

### 1.7 Notifications

Email only (no SMS/push). Every send is wrapped so a delivery failure **never** breaks the underlying operation — logged and swallowed, not thrown.

| Trigger | Email |
|---|---|
| Registration | Welcome |
| Forgot password | OTP code |
| Deposit confirmed success | Deposit successful |
| Deposit confirmed failure | Deposit failed |
| Withdrawal confirmed success | Withdrawal successful (includes penalty amount if any) |
| Withdrawal confirmed failure | Withdrawal failed, balance restored |
| Admin freezes account | Account frozen (+ reason if given) |
| Admin unfreezes account | Account active again |

---

## 2. State Machines

### 2.1 `SavingsAccount.status`

```
ACTIVE ──pause (user)──────────▶ PAUSED ──resume (user)──▶ ACTIVE
ACTIVE ──freeze (admin only)───▶ FROZEN ──unfreeze (admin only)──▶ ACTIVE
ACTIVE ──cancel (user, balance=0)──▶ CANCELLED  [terminal]
ACTIVE ──target reached / (no time-based equivalent)──▶ COMPLETED  [terminal-ish — withdrawal still allowed]
PAUSED ──freeze (admin only)───▶ FROZEN
```
**Rules**: `FROZEN` is reachable from any non-terminal state, admin-only, and only admin-reversible. `CANCELLED` requires `balance = 0` first. `COMPLETED` only triggers automatically for `TARGET_BASED` accounts on a qualifying deposit — never for `TIME_BASED`, and never admin-triggered.

### 2.2 `Transaction.status`

```
PENDING ──(initiation record created, before gateway call)
   │
   ▼
PROCESSING ──(gateway call succeeded, awaiting webhook confirmation)
   │
   ├──▶ SUCCESS  [terminal — webhook confirmed]
   └──▶ FAILED   [terminal — webhook confirmed, OR gateway call itself failed]
```
**`REVERSED` exists in the schema enum but is never set anywhere in the codebase** — there is no reversal/chargeback flow implemented. Flagged in Section 6.

### 2.3 `PaymentGatewayTransaction.status`
```
INITIATED → PENDING (gateway accepted the request) → SUCCESS | FAILED (webhook-confirmed)
```
Mirrors `Transaction.status` but tracks the gateway-specific leg independently — e.g. `PENDING` here while `Transaction` is also `PROCESSING`.

---

## 3. Business Rules Quick Reference

| Rule | Value / Logic |
|---|---|
| Penalty percentage | Fixed at 5% (`DEFAULT_PENALTY_PERCENTAGE`), backend-controlled, not client-suppliable |
| FLEXIBLE + early withdrawal | Allowed, penalized |
| LOCKED + early withdrawal | Denied entirely |
| Either policy, not early | Allowed, no penalty |
| FROZEN account | Admin-only to set and to clear; blocks pause/resume/cancel/deposit/withdraw |
| Pagination cap | 100 items/page, every list endpoint |
| Refresh token lifetime | Configurable (`REFRESH_TOKEN_TTL_DAYS`), rotated on every use |
| OTP lifetime / attempts | 10 min / 5 attempts |
| Self-demotion | Admin cannot demote their own account |
| Withdrawal balance impact | Full requested amount always leaves the balance; only the *payout* is reduced by any penalty |

---

## 4. Frontend Features

Pages are grouped by the backend module they primarily talk to. "Flow" describes what loads on mount and what each action does; "Logic" calls out business-rule-driven behavior the UI must reflect correctly.

### 4.1 Auth

**Login** — identifier + password. On success, store access token (memory only — see FR-AUTH-09) and redirect to Dashboard. Generic error display (matches backend's deliberately non-specific message).

**Register** — name/email/phone/password, client-side mirrors of backend validation. Success → auto-login or redirect to Login with a success note (implementation choice, not specified by backend).

**Forgot Password** — identifier only. Always shows the same "if an account exists..." message — the UI must not reveal whether the submitted identifier matched a real account.

**Reset Password** — identifier + OTP + new password + confirm. Surfaces "too many attempts" distinctly if that's the specific error, since the remedy (request a new code) differs from a simple wrong-code retry.

**Boot sequence** (app-wide, not a page): silent refresh attempt before rendering any protected route — see the full auth spec document for the complete interceptor/concurrency logic (401 handling, single shared in-flight refresh promise, session-expired redirect with no toast).

### 4.2 Dashboard
Landing page post-login. Summary cards (total balance, account count), recent transactions preview, "Create Savings" CTA. No dedicated endpoint for the aggregate — composed client-side from `GET /savings` + `GET /transactions/me`.

### 4.3 Savings — List / Create / Detail

**List**: `GET /savings`, filter by status/type. Each card shows balance, status badge, and — per the card redesign — a progress bar (blue→green gradient) representing either deposit-progress-toward-target (target-based) or time-elapsed-toward-maturity (time-based, **not** deposit progress — these are different metrics by account type, a direct consequence of FR-SAV-08's "is this early?" logic operating differently per type).

**Create**: type selector (time-based/target-based) → conditional fields → `withdrawalPolicy` choice. **The FLEXIBLE/LOCKED labels must be explained in plain language in the UI** — per FR-SAV-08, the names alone are actively misleading about which one blocks withdrawal.

**Detail**: balance, status, maturity/target progress, recent transactions, entry points to Deposit/Withdraw/Pause/Resume/Cancel/Rename. The Pause/Resume/Cancel/Deposit/Withdraw buttons must each reflect current status — e.g., no Withdraw/Deposit button rendered at all on a `FROZEN` account, rather than rendering it and letting the backend reject the attempt.

### 4.4 Deposit (one page: `/savings/:id/deposit`)
Account-status-gated (only renders the form if `ACTIVE`). Form → `202` response → polling state (`GET /payments/deposits/:id`, stops polling on `SUCCESS`/`FAILED`) → success/failure/timeout display. Full state-machine detail already built and reviewed earlier in this project — see `DepositPage.jsx`.

### 4.5 Withdraw (one page: `/savings/:id/withdraw`)
Same async/polling pattern as Deposit, but with an added **confirmation step before submission**: live client-side preview of the penalty breakdown (mirrors `getWithdrawalBreakdown`'s logic — FR-SAV-08 — for instant feedback without a round-trip), shown in a confirmation dialog, not a full page. Visual treatment must distinguish "no penalty" (neutral) from "penalty applies" (clear but not alarmist — most withdrawals won't have one).

### 4.6 Transactions
Full history, filterable, table/list with status badges. No create action (FR-TXN is read-only).

### 4.7 Saved Payment Methods
List only — provider, phone, `Verified` badge (only once backend-confirmed, per FR-PAY-06), delete action. No "add" action — empty state should explain this explicitly ("added automatically after your first deposit"), not just show a blank list.

### 4.8 Account — Profile / Change Password / Sessions
**Profile**: editable form, `PATCH /users/me`, inline `409` handling per field.
**Change Password**: does **not** trigger logout (FR-USER-02) — UI should not imply it will.
**Sessions**: list + single "Log out of all devices" action (no per-device revoke exists — FR-AUTH-04). Confirmation copy must make clear this also logs out the *current* device.

### 4.9 Admin — Dashboard / Users / Savings Oversight / Audit Logs
Mirrors the corresponding backend FRs (1.6) directly — stats cards, searchable/filterable user and savings-account tables, a Freeze dialog capturing an optional reason, and a filterable audit log table. Gated by `AdminRoute` (role check, not just auth check — an authenticated non-admin is redirected elsewhere, not to `/login`).

---

## 5. Cross-Cutting Rules (apply everywhere)

- **Ownership checks return `404`, never `403`**, for any resource a user doesn't own — prevents ID enumeration across savings accounts, transactions, and saved payment methods alike.
- **Every list endpoint is paginated**, capped at 100/page — no endpoint can be used to dump a full table.
- **Money amounts from the API are strings** (Prisma `Decimal` serialization) — frontend must `Number()`-convert before any arithmetic or `.toLocaleString()` call; this caused a real bug caught earlier in this project.
- **PayChangu fee-absorption is currently unresolved** — whether the merchant or the customer pays PayChangu's transaction fee is a dashboard setting that was never explicitly configured during this build. Worth confirming, since it directly affects unit economics (see the earlier gateway-cost-comparison discussion).

---

## 6. Known Gaps (explicitly out of scope or unresolved — not hidden, not forgotten)

- **No true refund/reversal mechanism** beyond the automatic failed-withdrawal balance refund (FR-PAY-08). An admin cannot manually reverse a completed, successful transaction.
- **`Transaction.status = REVERSED`** exists in the schema but is never set by any code path.
- **No per-device session revoke** — only "this device" or "all devices."
- **No recurring/automated debits** — every deposit is a manual user action; "time-based" means locked-until-date, not auto-debited.
- **No KYC** — hooks exist in code (`// KYC HOOK` comments) but nothing is wired up.
- **Bank payout** (`initiateBankPayout`/`getSupportedBanks`) exists in the PayChangu provider layer but has no route — mobile-money-only for withdrawals currently.
- **Hosted Checkout's response field for the checkout URL is unconfirmed** against a real PayChangu response.
- **Audit log coverage is partial** — freeze/unfreeze and penalty events are logged; logins, role changes, and password resets are not.
- **No SMS** — email is the only notification channel.
- **The `TNM`/`AIRTEL` operator-matching logic depends on PayChangu's live operator list containing a name matching `/tnm/i` or `/airtel/i`** — if PayChangu ever renames an operator or adds a third one, this needs a corresponding code update; it's not fully decoupled from PayChangu's naming.
