import 'dotenv/config';
import prisma from '../../src/config/client.js';

const run = async () => {
  console.log(
    'Connecting via Prisma (your actual app setup, @prisma/adapter-pg)...',
  );

  try {
    const connectStart = Date.now();
    await prisma.$connect();
    console.log(`✅ $connect() succeeded in ${Date.now() - connectStart}ms`);

    const queryStart = Date.now();
    const result = await prisma.$queryRaw`SELECT NOW() as now`;
    console.log(
      `✅ Simple query succeeded in ${Date.now() - queryStart}ms`,
      result,
    );

    // This is the specific pattern that's been failing (P2028) — an
    // interactive transaction, same shape as savings/admin use.
    const txStart = Date.now();
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1`;
    });
    console.log(
      `✅ Interactive $transaction() succeeded in ${Date.now() - txStart}ms`,
    );

    console.log(
      '\n🎉 All checks passed — Prisma can connect and run transactions.',
    );
  } catch (err) {
    console.error('❌ Failed:', err.code ?? '', err.message);
    console.error(err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

run();
