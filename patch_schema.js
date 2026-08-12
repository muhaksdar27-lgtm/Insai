const { getDatabaseClient } = require('./lib/db/client');
(async () => {
    try {
        const pool = getDatabaseClient().getPool();
        // drop the constraints and add them back
        await pool.query(`ALTER TABLE signals DROP CONSTRAINT IF EXISTS chk_signal_status`);
        await pool.query(`ALTER TABLE signals ADD CONSTRAINT chk_signal_status CHECK (status IN ('PENDING', 'ACTIVE', 'SIGNAL_ACTIVE', 'TAKE_PARTIAL', 'FINISHED', 'REJECTED', 'EXPIRED', 'SUPPRESSED', 'WAIT_AI', 'WAIT_RETEST', 'WAIT_CONFIRMATION', 'WAIT_NECKLINE_BREAK', 'WAIT_NEWS', 'APPROVED', 'DISPATCHED', 'FAILED'))`);
        
        await pool.query(`ALTER TABLE history DROP CONSTRAINT IF EXISTS chk_history_status`);
        await pool.query(`ALTER TABLE history ADD CONSTRAINT chk_history_status CHECK (status IN ('FINISHED', 'REJECTED', 'EXPIRED', 'SUPPRESSED', 'DISPATCHED', 'FAILED'))`);
        console.log("Constraints updated");
    } catch(e) {
        console.log("Err:", e);
    }
    process.exit(0);
})();
