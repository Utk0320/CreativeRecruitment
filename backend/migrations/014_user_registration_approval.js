/**
 * Migration 014 — User Registration Approval & PRN
 *
 * Adds registration approval gate columns to users:
 *  - prn: Student Roll Number / PRN
 *  - approval_status: 'pending', 'approved', 'rejected' (defaults to 'approved' for backward compatibility)
 *  - approval_notes: Rejection or approval notes from administrator
 *  - reviewed_by: Administrator who reviewed the request
 *  - reviewed_at: Timestamp of administrator review
 */

exports.up = async (db) => {
    const exec = sql => new Promise((resolve, reject) => {
        db.exec(sql, err => err ? reject(err) : resolve());
    });

    const userColumns = await new Promise((resolve, reject) => {
        db.all('PRAGMA table_info(users)', (err, rows) => err ? reject(err) : resolve(rows));
    });

    const existingCols = new Set(userColumns.map(r => r.name));

    if (!existingCols.has('prn')) {
        await exec('ALTER TABLE users ADD COLUMN prn TEXT');
    }
    if (!existingCols.has('approval_status')) {
        await exec("ALTER TABLE users ADD COLUMN approval_status TEXT DEFAULT 'approved'");
    }
    if (!existingCols.has('approval_notes')) {
        await exec('ALTER TABLE users ADD COLUMN approval_notes TEXT');
    }
    if (!existingCols.has('reviewed_by')) {
        await exec('ALTER TABLE users ADD COLUMN reviewed_by INTEGER REFERENCES users(id)');
    }
    if (!existingCols.has('reviewed_at')) {
        await exec('ALTER TABLE users ADD COLUMN reviewed_at DATETIME');
    }

    // Ensure all existing accounts are marked approved and active
    await exec("UPDATE users SET approval_status = 'approved' WHERE approval_status IS NULL");
    await exec("CREATE INDEX IF NOT EXISTS idx_users_approval ON users(approval_status, is_active)");
};

