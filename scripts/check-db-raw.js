import "dotenv/config"
import pg from "pg"

const { Client } = pg;

const run = async () => {
    console.log("Connecting via raw pg (no Prisma involved)...");
    console.log(`URL: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":****@")}`); // hide password in log

    const client = new Client({ connectionString: process.env.DATABASE_URL });
    const start = Date.now();

    try {
        await client.connect();
        console.log(`✅ Connected in ${Date.now() - start}ms`);

        const result = await client.query("SELECT NOW() as now, current_database() as db");
        console.log(`✅ Query succeeded:`, result.rows[0]);

        const activity = await client.query(
            "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()"
        );
        console.log(`ℹ️  Current connections to this database: ${activity.rows[0].count}`);
    } catch (err) {
        console.error(`❌ Failed after ${Date.now() - start}ms`);
        console.error(err);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

run();
