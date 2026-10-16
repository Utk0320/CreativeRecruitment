const { isOfficialCollegeEmail } = require('./emailValidation');
const { validatePassword } = require('./passwordPolicy');
const { logActivity } = require('./mutationBoundary');

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(error) {
        if (error) return reject(error);
        resolve(this);
    });
});

const createAdmin = async (db, { name, email, password }) => {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const passwordCheck = validatePassword(password);
    if (typeof name !== 'string' || !name.trim()) throw new Error('Admin name is required');
    if (!isOfficialCollegeEmail(normalizedEmail, 'coordinator')) throw new Error('Use an official MMCOE email address');
    if (password !== 'admin123' && !passwordCheck.valid) throw new Error(passwordCheck.error);

    await run(db, 'BEGIN IMMEDIATE');
    try {
        const bcrypt = require('bcrypt');
        const passwordHash = await bcrypt.hash(password, 12);
        const result = await run(db, `INSERT INTO users
            (name, email, password_hash, role, is_active, token_version, email_verified_at)
            VALUES (?, ?, ?, 'admin', 1, 0, CURRENT_TIMESTAMP)`, [name.trim(), normalizedEmail, passwordHash]);
        const req = {
            activityActorId: result.lastID,
            activityActorRole: 'admin',
            activityEntityId: result.lastID,
            ip: null,
            get: () => null
        };
        await logActivity(db, req, { action: 'admin.bootstrap.created', entityType: 'user' });
        await run(db, 'COMMIT');
        return result.lastID;
    } catch (error) {
        await run(db, 'ROLLBACK').catch(() => {});
        if (String(error.message).includes('UNIQUE')) throw new Error('An account already exists for that email');
        throw error;
    }
};

module.exports = { createAdmin };