import './config/env.js'; // validate env FIRST — fail fast before anything else runs

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/user.routes.js';
import savingsRoutes from './modules/savings/savings.routes.js';
import transactionRoutes from './modules/transactions/transaction.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import paymentRoutes, {
  webhookRouter,
} from './modules/payments/payment.routes.js';

import { generalRateLimiter } from './middlewares/rateLimit.middleware.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { env } from './config/env.js';
import { corsOptions } from './config/cors.js';

const app = express();

app.use(helmet());
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use('/api/payments/webhooks', webhookRouter);

app.use(express.json());
app.use(generalRateLimiter);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/savings', savingsRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

export default app;
