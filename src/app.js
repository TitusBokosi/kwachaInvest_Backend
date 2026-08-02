import "./config/env.js" // validate env FIRST — fail fast before anything else runs

import express from "express"
import helmet from "helmet"
import cors from "cors"
import morgan from "morgan"

import authRoutes from "./modules/auth/auth.routes.js"
import userRoutes from "./modules/users/user.routes.js"
import savingsRoutes from "./modules/savings/savings.routes.js"
import transactionRoutes from "./modules/transactions/transaction.routes.js"
import adminRoutes from "./modules/admin/admin.routes.js"
import paymentRoutes, { webhookRouter } from "./modules/payments/payment.routes.js"

import { generalRateLimiter } from "./middlewares/rateLimit.middleware.js"
import { errorHandler } from "./middlewares/error.middleware.js"
import { env } from "./config/env.js"

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

// ---------------------------------------------------------------------------
// CRITICAL ORDERING: the PayChangu webhook route MUST be mounted before
// express.json(). Its signature verification needs the raw, unparsed
// request body — once express.json() has parsed and the body were
// re-serialized, the computed HMAC would no longer match PayChangu's,
// and every legitimate webhook would be rejected as invalid.
// webhookRouter applies its own express.raw() internally (see
// payment.routes.js) — do not add express.json() before this line.
// ---------------------------------------------------------------------------
app.use("/api/payments/webhooks", webhookRouter);

app.use(express.json());
app.use(generalRateLimiter);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/savings", savingsRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);

// ---------------------------------------------------------------------------
// 404 + error handling — must be last
// ---------------------------------------------------------------------------

app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

app.use(errorHandler);

export default app;
