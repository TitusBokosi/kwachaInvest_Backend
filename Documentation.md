# MVP Features – Digital Savings Platform (PiggyVest-like)

This document outlines the core features for the Minimum Viable Product (MVP) of a digital savings platform designed for Malawi. The focus is on building a simple, secure, and functional system that enables users to save money individually and in groups.

---

# 1. User Authentication System

A secure authentication system for user access control.

## Features:

- User registration (name, email, phone number, password)
- User login and logout
- Password hashing (secure storage)
- JWT-based authentication
- Protected routes for authenticated users

## Purpose:

Ensures only verified users can access financial features and personal data.

---

# 2. Wallet System

A digital wallet that tracks user balances.

## Features:

- User wallet creation on signup
- Real-time balance tracking
- Available balance vs locked balance separation
- Wallet funding (manual deposit simulation for MVP)
- Wallet history tracking

## Purpose:

Acts as the central account where all savings and transactions are recorded.

---

# 3. Goal-Based Savings (Target Savings)

Users can create savings goals for specific purposes.

## Features:

- Create savings goals (e.g. “Laptop”, “School fees”)
- Set target amount
- Set target date (optional)
- Track progress percentage
- Add money to specific goals
- View active and completed goals

## Purpose:

Helps users save with intention and discipline.

---

# 4. Locked Savings (SafeLock)

A feature that allows users to lock funds for a fixed period.

## Features:

- Lock funds for a selected duration (1, 3, 6, 12 months)
- Prevent withdrawal before maturity date
- Early withdrawal penalty rules (optional for MVP logic)
- Auto-unlock at maturity
- Interest simulation (optional for MVP)

## Purpose:

Encourages disciplined savings behavior by restricting early access to funds.

---

# 5. Group Savings (Chilimba Digital System)

A digital version of traditional village savings groups.

## Features:

- Create savings groups
- Invite members via link or code
- Group contribution tracking
- Member contribution history
- Group balance overview
- Admin controls (group creator permissions)

## Purpose:

Digitizes informal savings systems widely used in Malawi.

---

# 6. Transaction System (Ledger System)

A complete record of all financial activity.

## Features:

- Record every deposit, withdrawal, and transfer
- Transaction history per user
- Transaction status tracking (pending, success, failed)
- Unique transaction references
- Immutable transaction records (no deletion)

## Purpose:

Ensures financial transparency and prevents data inconsistencies.

---

# 7. Automated Savings Engine

A system that automatically deducts savings based on user rules.

## Features:

- Daily, weekly, or monthly auto-savings setup
- Scheduled deduction system (background jobs)
- Retry failed deductions
- Notification on successful or failed deductions

## Purpose:

Helps users save consistently without manual effort.

---

# 8. Notifications System

Keeps users informed about account activity.

## Features:

- Email notifications (account activity, savings updates)
- SMS notifications (optional integration for MVP)
- Transaction alerts
- Goal completion notifications
- Failed payment alerts

## Purpose:

Improves user engagement and financial awareness.

---

# 9. Manual Wallet Funding (MVP Simulation)

A simplified funding system for early development.

## Features:

- Simulated deposits into wallet
- Admin-approved funding (optional)
- Manual balance updates for testing
- Transaction logging for all deposits

## Purpose:

Allows testing without full mobile money integration.

---

# 10. Admin System (Basic)

Basic control system for platform management.

## Features:

- View all users
- View all transactions
- Monitor wallet balances
- Manage flagged accounts (optional)
- System oversight dashboard (basic API-level control)

## Purpose:

Helps manage and monitor platform activity during MVP phase.

---

# MVP Scope Summary

The MVP focuses on:

- Secure user authentication
- Wallet-based financial tracking
- Goal-based savings
- Locked savings system
- Group savings (chilimba digitization)
- Transaction ledger system
- Basic automation (scheduled savings)
- Notifications

---

# Important Design Principle

All financial operations must follow a **ledger-first approach**, meaning:

> Every balance change must be recorded as a transaction.

This ensures:

- Auditability
- Data integrity
- Fraud prevention
- Future scalability

---

# Backend Tech Stack (MVP)

This document describes all backend tools used in the MVP of the PiggyVest-like savings platform and what each one is responsible for.

## Core Backend Framework

### Express

A minimal and flexible Node.js web framework used to build REST APIs.

#### Used for:

Creating API routes (auth, savings, wallet, transactions)
Handling HTTP requests and responses
Structuring backend logic
Node.js

### JavaScript runtime that executes backend code outside the browser.

#### Used for:

Running the server
Handling asynchronous operations (payments, jobs, DB calls)
Powering the entire backend system
dotenv

### Loads environment variables from a .env file into process.env.

Used for:

Storing sensitive config (API keys, database URLs)
Keeping secrets out of codebase
Managing environment-specific settings
axios

A promise-based HTTP client for making external API requests.

Used for:

Integrating mobile money APIs (Airtel Money, Mpamba)
Calling third-party services
Sending HTTP requests to external systems

## Database Layer

PostgreSQL (via pg driver)

A powerful relational database system.

Used for:

Storing users, wallets, savings plans, and transactions
Ensuring data consistency for financial operations
Supporting complex queries and relationships
Prisma

A modern ORM (Object Relational Mapper) for Node.js.

Used for:

Defining database schema using models
Running migrations safely
Querying the database in a type-safe way
Managing relationships between tables
@prisma/client

Auto-generated Prisma database client.

Used for:

Executing database queries in code
Accessing models like User, Wallet, Transaction
Ensuring type-safe database access
Authentication & Security
bcrypt

Library for hashing passwords securely.

Used for:

Hashing user passwords before storing in DB
Verifying login passwords
Preventing password leakage in case of database breaches
jsonwebtoken (JWT)

Library for creating and verifying authentication tokens.

Used for:

User login sessions
Access control for protected routes
Stateless authentication (no need to store sessions in DB)
helmet

Middleware that secures Express apps by setting HTTP headers.

Used for:

Preventing common web vulnerabilities
Securing HTTP responses
Hardening API security
cors

Middleware for enabling Cross-Origin Resource Sharing.

Used for:

Allowing frontend (React app) to communicate with backend
Controlling which domains can access the API
Preventing unauthorized cross-origin requests
express-rate-limit

Middleware for limiting repeated requests.

Used for:

Preventing brute-force login attempts
Protecting APIs from abuse
Rate-limiting sensitive endpoints (login, withdrawals)

## Validation

zod

A schema validation library.

Used for:

Validating API request bodies
Ensuring correct data types (e.g. amount is a number)
Preventing invalid data from reaching the database
Strengthening financial data integrity

## Logging & Monitoring

morgan

HTTP request logger middleware.

Used for:

Logging all incoming requests
Debugging API behavior
Monitoring backend activity in development

## Background Jobs & Caching

redis

In-memory data store used for caching and queues.

Used for:

Storing temporary data (sessions, OTPs)
Supporting job queues (with BullMQ)
Improving performance of frequent operations
bullmq

Redis-based job queue system.

Used for:

Scheduled savings deductions (daily/weekly auto-save)
Processing background tasks
Retry failed transactions
Sending delayed notifications

## Notifications

nodemailer

Library for sending emails.

Used for:

Sending OTP verification emails
Transaction receipts
Account alerts and notifications

## Development & Testing Tools

nodemon

Development tool that auto-restarts server on file changes.

Used for:

Faster development workflow
Automatically restarting backend when code changes
eslint

Code linting tool.

Used for:

Enforcing coding standards
Preventing bugs and bad patterns
Keeping codebase consistent
prettier

Code formatter.

Used for:

Automatically formatting code
Ensuring consistent style across the project
Improving readability
jest

JavaScript testing framework.

Used for:

Unit testing business logic
Testing services like wallet and savings
Ensuring correctness of financial operations
supertest

HTTP testing library for Express apps.

Used for:

Testing API endpoints
Simulating real HTTP requests in tests
Validating authentication and transaction flows
