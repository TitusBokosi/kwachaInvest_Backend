import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(helmet());

// Simple test route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API is running 🚀',
  });
});

// Health check route (important for deployments)
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
  });
});

export default app;
