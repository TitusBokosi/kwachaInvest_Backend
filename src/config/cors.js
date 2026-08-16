import { env } from './env.js';

const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((origin) =>
  origin.trim(),
);

export const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin "${origin}" is not allowed by CORS`));
  },

  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],

  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],

  credentials: true,
};
