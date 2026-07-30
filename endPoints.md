# KwachaInvest MVP — API Endpoint Reference

Base path assumed: `/api`. All request/response bodies are JSON.
Standard envelope: `{ success: true, data?, message?, ...paginationFields }` on
success, `{ success: false, message }` on error (via `error.middleware.js`).

Legend: 🟢 Built · 🟡 Planned, not yet built · 🔒 Requires `Authorization: Bearer <token>` · 🔑 Admin only (`role: ADMIN`)

---

## Auth — `/api/auth` 🟢

| Method & Path           | Auth   | Request                                                   | Returns                                                                                                                                         |
| ----------------------- | ------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /login`           | Public | `{ identifier, password }` — identifier is email or phone | `{ accessToken, refreshToken, user: {id, firstName, lastName, fullName, email, phoneNumber, role, kycStatus, isActive, createdAt, updatedAt} }` |
| `POST /refresh`         | Public | `{ refreshToken }`                                        | `{ accessToken, refreshToken }` — old refresh token is revoked (rotation)                                                                       |
| `POST /logout`          | Public | `{ refreshToken }`                                        | `{ message }` — idempotent                                                                                                                      |
| `POST /forgot-password` | Public | `{ identifier }`                                          | `{ message }` — always generic, doesn't reveal if account exists                                                                                |
| `POST /reset-password`  | Public | `{ identifier, otp, newPassword, confirmNewPassword }`    | `{ message }` — revokes all sessions on success                                                                                                 |
| `GET /sessions`         | 🔒     | —                                                         | `{ data: [{ id, deviceInfo, ipAddress, createdAt, expiresAt }] }`                                                                               |
| `POST /logout-all`      | 🔒     | —                                                         | `{ message }`                                                                                                                                   |

---

## Users — `/api/users` 🟢

| Method & Path              | Auth   | Request                                                      | Returns                                                      |
| -------------------------- | ------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `POST /register`           | Public | `{ firstName, lastName, email, phoneNumber, password }`      | `{ data: user }` (no passwordHash)                           |
| `GET /me`                  | 🔒     | —                                                            | `{ data: user }`                                             |
| `GET /me/profile`          | 🔒     | —                                                            | `{ data: user + mobileMoneyAccounts[] + savingsAccounts[] }` |
| `PATCH /me`                | 🔒     | `{ firstName?, lastName?, email?, phoneNumber? }` (≥1 field) | `{ data: user }`                                             |
| `POST /me/change-password` | 🔒     | `{ currentPassword, newPassword, confirmNewPassword }`       | `{ message }`                                                |
| `DELETE /me`               | 🔒     | —                                                            | `{ message }` — deactivates own account                      |
| `GET /search`              | 🔒🔑   | Query: `q, page?, pageSize?`                                 | `{ data: user[], total, page, pageSize, totalPages }`        |
| `GET /`                    | 🔒🔑   | Query: `page?, pageSize?, isActive?, createdAfter?`          | Same paginated shape                                         |
| `GET /:id`                 | 🔒🔑   | —                                                            | `{ data: user }`                                             |
| `PATCH /:id/deactivate`    | 🔒🔑   | —                                                            | `{ data: user }`                                             |
| `PATCH /:id/reactivate`    | 🔒🔑   | —                                                            | `{ data: user }`                                             |
| `PATCH /:id/role`          | 🔒🔑   | `{ role: "USER" \| "ADMIN" }`                                | `{ data: user }` — blocked if self-demoting                  |

---

## Savings — `/api/savings` 🟢

| Method & Path        | Auth | Request                                                                    | Returns                                                                             |
| -------------------- | ---- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `POST /time-based`   | 🔒   | `{ name, withdrawalPolicy, maturityDate, startDate?, penaltyPercentage? }` | `{ data: savingsAccount + timeBasedDetails }`                                       |
| `POST /target-based` | 🔒   | `{ name, withdrawalPolicy, target, penaltyPercentage? }`                   | `{ data: savingsAccount + targetBasedDetails }`                                     |
| `GET /`              | 🔒   | Query: `status?, type?, page?, pageSize?`                                  | `{ data: savingsAccount[], total, page, pageSize, totalPages }` (own accounts only) |
| `GET /:id`           | 🔒   | —                                                                          | `{ data: savingsAccount + details + last 20 transactions }`                         |
| `PATCH /:id`         | 🔒   | `{ name }`                                                                 | `{ data: savingsAccount }`                                                          |
| `PATCH /:id/pause`   | 🔒   | —                                                                          | `{ data: savingsAccount }` — ACTIVE → PAUSED                                        |
| `PATCH /:id/resume`  | 🔒   | —                                                                          | `{ data: savingsAccount }` — PAUSED → ACTIVE; blocked if FROZEN                     |
| `PATCH /:id/cancel`  | 🔒   | —                                                                          | `{ data: savingsAccount }` — blocked if balance > 0 or FROZEN                       |

Each `savingsAccount` object: `{ id, userId, name, type, status, balance, withdrawalPolicy, penaltyPercentage, maturedAt, createdAt, updatedAt, timeBasedDetails?, targetBasedDetails? }`.

---

## Transactions — `/api/transactions` 🟢

Read-only. Transactions are created internally by `payments` once built — no public write endpoint.

| Method & Path | Auth | Request                                                                  | Returns                                                                              |
| ------------- | ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `GET /me`     | 🔒   | Query: `savingsAccountId?, type?, status?, from?, to?, page?, pageSize?` | `{ data: transaction[], total, page, pageSize, totalPages }` (own transactions only) |
| `GET /me/:id` | 🔒   | —                                                                        | `{ data: transaction }`                                                              |
| `GET /`       | 🔒🔑 | Same filters + `userId?`                                                 | Paginated, across all users                                                          |
| `GET /:id`    | 🔒🔑 | —                                                                        | `{ data: transaction }`                                                              |

Each `transaction` object: `{ id, savingsAccountId, mobileMoneyAccountId, type, amount, status, providerReference, createdAt, updatedAt, savingsAccount: {id, name}, mobileMoneyAccount: {provider, phoneNumber} }`.

---

## Admin — `/api/admin` 🟢 (all routes 🔒🔑)

| Method & Path                          | Request                                                              | Returns                                                                                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /dashboard`                       | —                                                                    | `{ data: { users: {total, active}, savings: {totalAccounts, totalBalance, byStatus[], byType[]}, transactions: {totalSuccessful, totalSuccessfulAmount, byStatus[]} } }` |
| `GET /audit-logs`                      | Query: `userId?, entityType?, action?, from?, to?, page?, pageSize?` | Paginated audit log entries                                                                                                                                              |
| `GET /savings-accounts`                | Query: `status?, type?, userId?, page?, pageSize?`                   | Paginated, includes owning user's name/email/phone                                                                                                                       |
| `GET /savings-accounts/:id`            | —                                                                    | Single account + user + details + last 20 transactions                                                                                                                   |
| `PATCH /savings-accounts/:id/freeze`   | `{ reason? }`                                                        | Updated account (status → FROZEN), writes an audit log entry                                                                                                             |
| `PATCH /savings-accounts/:id/unfreeze` | —                                                                    | Updated account (status → ACTIVE), writes an audit log entry                                                                                                             |

---

## Payments — `/api/payments` 🟡 Not yet built

Needed before the MVP is functionally complete — this is what actually moves money and is what `payments/providers/airtel.provider.js` and `mpamba.provider.js` will plug into.

| Method & Path                            | Auth                       | Request                                                       | Returns                                                                                                                           |
| ---------------------------------------- | -------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `POST /mobile-money-accounts`            | 🔒                         | `{ provider: "TNM" \| "AIRTEL", phoneNumber }`                | `{ data: mobileMoneyAccount }` — `isVerified: false` until confirmed                                                              |
| `POST /mobile-money-accounts/:id/verify` | 🔒                         | `{ code }` (provider-sent verification code — exact flow TBD) | `{ data: mobileMoneyAccount }` — `isVerified: true`                                                                               |
| `GET /mobile-money-accounts`             | 🔒                         | —                                                             | `{ data: mobileMoneyAccount[] }` (own accounts)                                                                                   |
| `DELETE /mobile-money-accounts/:id`      | 🔒                         | —                                                             | `{ message }` — likely blocked if linked to an active savings account                                                             |
| `POST /deposits`                         | 🔒                         | `{ savingsAccountId, mobileMoneyAccountId, amount }`          | `{ data: transaction }` (status `PENDING`/`PROCESSING`) — calls the provider, creates `Transaction` + `PaymentGatewayTransaction` |
| `POST /webhooks/tnm`                     | Public, signature-verified | Raw TNM payload                                               | `200 OK` ack — updates the matching `Transaction`/`PaymentGatewayTransaction`                                                     |
| `POST /webhooks/airtel`                  | Public, signature-verified | Raw Airtel payload                                            | `200 OK` ack                                                                                                                      |

---

## Out of scope / pending a decision

- **KYC** — deliberately excluded from this MVP (per earlier decision). Hooks are left in the codebase for a later release.
- **`groups`, `safelock`, `notifications`** — not yet scoped/built. `safelock` may turn out to be redundant with `SavingsAccount.withdrawalPolicy`; `groups` (collective/group savings) is a meaningfully larger feature that may belong post-MVP, similar to `wallet`. Flagging again since these were raised earlier and not yet resolved.
- **`wallet`** — confirmed out of scope; module to be deleted.
