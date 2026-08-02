import 'dotenv/config';

import app from './src/app.js';
import { env } from './src/config/env.js';
import prisma from './src/config/client.js';

const server = app.listen(env.PORT, () => {
  console.log(
    `KwachaInvest API listening on port ${env.PORT} (${env.NODE_ENV})`,
  );
});

const shutdown = async (signal) => {
  console.log(`\n${signal} received — shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    console.log('Shutdown complete.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
