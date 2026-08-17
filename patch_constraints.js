const { Client } = require('pg');
(async () => {
    try {
        const dbUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
        if (!dbUrl) { console.log('No DB URL'); process.exit(0); }
        const client = new Client({ connectionString: dbUrl });
        await client.connect();
        await client.query(`ALTER TABLE signals DROP CONSTRAINT IF EXISTS chk_signal_status`);
        await client.query(`ALTER TABLE history DROP CONSTRAINT IF EXISTS chk_history_status`);
        console.log("Constraints dropped successfully");
        await client.end();
    } catch(e) {
        console.log("Err:", e.message);
    }
    process.exit(0);
})();
