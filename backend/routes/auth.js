const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db } = require('../utils/db');
const { authenticateToken } = require('../middlewares/authMiddleware');const { isOfficialCollegeEmail } = require('../utils/emailValidation');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const crypto = require('crypto');
const { withTransaction } = require('../utils/mutationBoundary');
const { getCookieSettings } = require('../utils/config');
const { validatePassword } = require('../utils/passwordPolicy');
const { createEmailAdapter } = require('../services/email/adapter');
const { isVerifiedCollegeIdentity } = require('../utils/ssoValidation');
const { verifyConsoleIdentity } = require('../services/identity/consoleSsoAdapter');

const createAuthLimiter = () => rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
const registrationLimiter = createAuthLimiter();
const verificationLimiter = createAuthLimiter();
const inviteLimiter = createAuthLimiter();
const recoveryLimiter = createAuthLimiter();
const ssoLimiter = createAuthLimiter();
const loginLimiter = createAuthLimiter();
const refreshLimiter = createAuthLimiter();
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const registrationSchema = z.object({
    name: z.string().trim().min(1),
    email: z.string().email(),
    password: z.string().min(10),
    role: z.string().optional(),
    department: z.string().optional(),
    year: z.union([z.number(), z.string()]).optional(),
    phone: z.string().optional(),
    prn: z.string().optional(),
    bio: z.string().optional()
});
const googleSsoSchema = z.object({ credential: z.string().min(1) });
const consoleSsoSchema = z.object({ email: z.string().email() });
const inviteAcceptSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/i), password: z.string().min(10) });
const resetRequestSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/i), password: z.string().min(10) });
const changePasswordSchema = z.object({ current_password: z.string().optional(), password: z.string().min(10) });

const runDb = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(error) {
        if (error) return reject(error);
        resolve(this);
    });
});

const attachSession = async (req, res, user) => {
    const token = jwt.sign({ id: user.id, role: user.role, token_version: user.token_version }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await runDb('INSERT INTO refresh_sessions (user_id, token_hash, expires_at, token_version) VALUES (?, ?, ?, ?)',
        [user.id, refreshHash, refreshExpiresAt, user.token_version]);
    const cookieSettings = getCookieSettings();
    const cookieOptions = { sameSite: cookieSettings.sameSite, secure: cookieSettings.secure, path: '/' };
    res.cookie('access_token', token, { ...cookieOptions, maxAge: 15 * 60 * 1000, httpOnly: true });
    res.cookie('refresh_token', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true });
    res.cookie('csrf_token', crypto.randomBytes(32).toString('hex'), { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000, domain: cookieSettings.domain });
    req.activityActorId = user.id;
    req.activityActorRole = user.role;
    req.activityEntityId = user.id;
    const { password_hash: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
};

const finishSsoLogin = (req, res, claims, provider) => {
    if (!isVerifiedCollegeIdentity(claims, provider, process.env.MICROSOFT_TENANT_ID)) {
        return res.status(403).json({ error: 'College identity could not be verified' });
    }
    const email = claims.email.trim().toLowerCase();
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Unable to authenticate with SSO' });
        if (user && user.role !== 'student') return res.status(403).json({ error: 'This identity is not a student account' });
        if (user && !user.is_active) return res.status(401).json({ error: 'This account is inactive' });
        if (user) {
            db.run(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
                email_verification_token_hash = NULL, email_verification_expires_at = NULL WHERE id = ?`, [user.id], updateError => {
                if (updateError) return res.status(500).json({ error: 'Unable to authenticate with SSO' });
                attachSession(req, res, { ...user, email_verified_at: user.email_verified_at || new Date().toISOString() }).catch(() => res.status(500).json({ error: 'Unable to create session' }));
            });
            return;
        }
        const placeholderHash = await bcrypt.hash(crypto.randomBytes(48).toString('hex'), 10);
        db.run(`INSERT INTO users (name, email, password_hash, role, email_verified_at)
            VALUES (?, ?, ?, 'student', CURRENT_TIMESTAMP)`,
        [claims.name || email.split('@')[0], email, placeholderHash], function(insertError) {
            if (insertError) return res.status(500).json({ error: 'Unable to create student account' });
            attachSession(req, res, {
                id: this.lastID,
                name: claims.name || email.split('@')[0],
                email,
                role: 'student',
                token_version: 0,
                is_active: 1,
                email_verified_at: new Date().toISOString()
            }).catch(() => res.status(500).json({ error: 'Unable to create session' }));
        });
    });
};

router.post('/register', registrationLimiter, withTransaction(db, 'user.registered', 'user'), async (req, res) => {
    const { name, email, password, role, department, year, phone, prn, bio } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const parsed = registrationSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            error: 'Provide a valid email address and all required fields.'
        });
    }
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) return res.status(400).json({ error: passwordCheck.error });
    try {
        const hash = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        db.run(`INSERT INTO users
            (name, email, password_hash, role, department, year, phone, prn, bio, approval_status, is_active, email_verification_token_hash, email_verification_expires_at)
            VALUES (?, ?, ?, 'student', ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
            [name.trim(), normalizedEmail, hash, department?.trim() || null, year || null, phone?.trim() || null, prn?.trim() || null, bio?.trim() || null, verificationHash, expiresAt],
            async function(err) {
                if (err) return res.status(400).json({ error: 'Email already exists or invalid data' });
                req.activityEntityId = this.lastID;
                req.activityActorId = this.lastID;
                req.activityActorRole = 'student';
                try {
                    await createEmailAdapter().sendVerification({ email: normalizedEmail, token: verificationToken });
                } catch {
                    // Non-blocking
                }
                res.status(201).json({
                    message: 'Registration submitted successfully! Your account is pending administrator approval.',
                    id: this.lastID,
                    approval_status: 'pending'
                });
            }
        );
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/verify-email', verificationLimiter, withTransaction(db, 'user.email.verified', 'user'), (req, res) => {
    const token = typeof req.body.token === 'string' ? req.body.token : '';
    if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ error: 'Invalid verification token' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    db.get(`SELECT id FROM users
        WHERE email_verification_token_hash = ?
          AND julianday(email_verification_expires_at) > julianday('now')
          AND email_verified_at IS NULL`, [tokenHash], (err, user) => {
        if (err) return res.status(500).json({ error: 'Unable to verify email' });
        if (!user) return res.status(400).json({ error: 'Verification link is invalid, expired, or already used' });
        db.run(`UPDATE users SET email_verified_at = CURRENT_TIMESTAMP,
            email_verification_token_hash = NULL, email_verification_expires_at = NULL WHERE id = ?`, [user.id], updateError => {
            if (updateError) return res.status(500).json({ error: 'Unable to verify email' });
            req.activityEntityId = user.id;
            req.activityActorId = user.id;
            req.activityActorRole = 'student';
            res.json({ message: 'Email verified. You can now sign in.' });
        });
    });
});

router.post('/accept-invite', inviteLimiter, withTransaction(db, 'coordinator.invite.accepted', 'user'), async (req, res) => {
    const parsed = inviteAcceptSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide a valid invite token and password' });
    const passwordCheck = validatePassword(parsed.data.password);
    if (!passwordCheck.valid) return res.status(400).json({ error: passwordCheck.error });
    const tokenHash = crypto.createHash('sha256').update(parsed.data.token).digest('hex');
    db.get(`SELECT * FROM coordinator_invites
        WHERE token_hash = ? AND accepted_at IS NULL AND julianday(expires_at) > julianday('now')`,
    [tokenHash], async (err, invite) => {
        if (err) return res.status(500).json({ error: 'Unable to accept invitation' });
        if (!invite) return res.status(400).json({ error: 'Invite is invalid, expired, or already used' });
        db.get('SELECT id FROM users WHERE email = ?', [invite.email], async (queryError, existing) => {
            if (queryError) return res.status(500).json({ error: 'Unable to accept invitation' });
            if (existing) return res.status(409).json({ error: 'An account already exists for this email' });
            try {
                const passwordHash = await bcrypt.hash(parsed.data.password, 10);
                db.run(`INSERT INTO users
                    (name, email, password_hash, role, department, year, phone, is_active, token_version, email_verified_at)
                    VALUES (?, ?, ?, 'coordinator', ?, ?, ?, 1, 0, CURRENT_TIMESTAMP)`,
                [invite.name, invite.email, passwordHash, invite.department, invite.year, invite.phone], function(insertError) {
                    if (insertError) return res.status(500).json({ error: 'Unable to create coordinator account' });
                    const userId = this.lastID;
                    db.run('UPDATE coordinator_invites SET accepted_at = CURRENT_TIMESTAMP WHERE id = ? AND accepted_at IS NULL', [invite.id], function(updateError) {
                        if (updateError || this.changes !== 1) return res.status(409).json({ error: 'Invite was already used' });
                        req.activityActorId = userId;
                        req.activityActorRole = 'coordinator';
                        req.activityEntityId = userId;
                        res.status(201).json({ message: 'Coordinator account created. Sign in with the password you chose.' });
                    });
                });
            } catch {
                res.status(500).json({ error: 'Unable to create coordinator account' });
            }
        });
    });
});

router.post('/forgot-password', recoveryLimiter, withTransaction(db, 'auth.password.reset.requested', 'user'), (req, res) => {
    const parsed = resetRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide a valid email address' });
    const email = parsed.data.email.trim().toLowerCase();
    db.get('SELECT id, email FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Unable to process password reset' });
        if (!user) return res.json({ message: 'If the account exists, a reset link will be sent.' });
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        db.run(`UPDATE users SET password_reset_token_hash = ?, password_reset_expires_at = ?,
            token_version = token_version + 1 WHERE id = ?`, [tokenHash, expiresAt, user.id], async updateError => {
            if (updateError) return res.status(500).json({ error: 'Unable to process password reset' });
            req.activityEntityId = user.id;
            try {
                await createEmailAdapter().sendPasswordReset({ email: user.email, token });
            } catch {
                return res.json({ message: 'If the account exists, a reset link will be sent.' });
            }
            res.json({ message: 'If the account exists, a reset link will be sent.' });
        });
    });
});

router.post('/reset-password', recoveryLimiter, withTransaction(db, 'auth.password.reset', 'user'), async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide a valid reset token and password' });
    const passwordCheck = validatePassword(parsed.data.password);
    if (!passwordCheck.valid) return res.status(400).json({ error: passwordCheck.error });
    const tokenHash = crypto.createHash('sha256').update(parsed.data.token).digest('hex');
    db.get(`SELECT id FROM users WHERE password_reset_token_hash = ?
        AND julianday(password_reset_expires_at) > julianday('now')`, [tokenHash], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Unable to reset password' });
        if (!user) return res.status(400).json({ error: 'Reset link is invalid, expired, or already used' });
        const passwordHash = await bcrypt.hash(parsed.data.password, 10);
        db.run(`UPDATE users SET password_hash = ?, password_reset_token_hash = NULL,
            password_reset_expires_at = NULL, must_change_password = 0, token_version = token_version + 1
            WHERE id = ?`, [passwordHash, user.id], updateError => {
            if (updateError) return res.status(500).json({ error: 'Unable to reset password' });
            req.activityEntityId = user.id;
            req.activityActorId = user.id;
            res.json({ message: 'Password reset. Sign in with your new password.' });
        });
    });
});

router.post('/change-password', authenticateToken, withTransaction(db, 'auth.password.changed', 'user'), async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide a valid new password' });
    const passwordCheck = validatePassword(parsed.data.password);
    if (!passwordCheck.valid) return res.status(400).json({ error: passwordCheck.error });
    db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id], async (err, user) => {
        if (err || !user) return res.status(500).json({ error: 'Unable to change password' });
        if (!req.user.must_change_password) {
            if (!parsed.data.current_password) return res.status(400).json({ error: 'Current password is required' });
            if (!await bcrypt.compare(parsed.data.current_password, user.password_hash)) {
                return res.status(403).json({ error: 'Current password is incorrect' });
            }
        }
        const passwordHash = await bcrypt.hash(parsed.data.password, 10);
        db.run(`UPDATE users SET password_hash = ?, must_change_password = 0,
            token_version = token_version + 1 WHERE id = ?`, [passwordHash, req.user.id], updateError => {
            if (updateError) return res.status(500).json({ error: 'Unable to change password' });
            req.activityEntityId = req.user.id;
            res.json({ message: 'Password changed. Sign in again.' });
        });
    });
});

router.post('/sso/console', ssoLimiter, withTransaction(db, 'auth.sso.console', 'session'), async (req, res) => {
    if (process.env.NODE_ENV === 'production' || process.env.SSO_PROVIDER !== 'console') {
        return res.status(404).json({ error: 'Development SSO is unavailable' });
    }
    const parsed = consoleSsoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide a valid college email' });
    try {
        const claims = await verifyConsoleIdentity(parsed.data.email);
        finishSsoLogin(req, res, claims, 'google');
    } catch (error) {
        res.status(403).json({ error: error.message });
    }
});

router.post('/sso/google', ssoLimiter, withTransaction(db, 'auth.sso.google', 'session'), async (req, res) => {
    if (process.env.SSO_PROVIDER !== 'google' || !process.env.GOOGLE_CLIENT_ID) {
        return res.status(404).json({ error: 'Google SSO is not configured' });
    }
    const parsed = googleSsoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide a valid Google credential' });
    try {
        const { OAuth2Client } = require('google-auth-library');
        const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({ idToken: parsed.data.credential, audience: process.env.GOOGLE_CLIENT_ID });
        finishSsoLogin(req, res, ticket.getPayload(), 'google');
    } catch {
        res.status(401).json({ error: 'Google identity could not be verified' });
    }
});

router.post('/login', loginLimiter, withTransaction(db, 'auth.login', 'session'), (req, res) => {
    const { email, password } = req.body;
    if (!loginSchema.safeParse(req.body).success) {
        return res.status(400).json({ error: 'Provide a valid email and password.' });
    }
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });

        if (user.approval_status === 'pending') {
            return res.status(403).json({ error: 'Your registration is currently pending administrator approval. Please wait for an administrator to review your request.' });
        }
        if (user.approval_status === 'rejected') {
            return res.status(403).json({ error: user.approval_notes ? `Your registration was rejected by the administrator: ${user.approval_notes}` : 'Your registration was rejected by the administrator.' });
        }
        if (!user.is_active) return res.status(403).json({ error: 'Your account is deactivated. Please contact an administrator.' });
        if (user.role === 'student' && !user.email_verified_at) {
            return res.status(403).json({ error: 'Verify your college email before signing in.' });
        }
        attachSession(req, res, user).catch(() => res.status(500).json({ error: 'Unable to create session' }));
    });
});

router.post('/refresh', refreshLimiter, withTransaction(db, 'auth.session.refreshed', 'session'), (req, res) => {
    const currentToken = req.cookies?.refresh_token;
    if (typeof currentToken !== 'string') return res.status(401).json({ error: 'Refresh token required' });
    const currentHash = crypto.createHash('sha256').update(currentToken).digest('hex');
    db.get(`SELECT rs.id AS session_id, rs.token_version AS session_version, u.id, u.name, u.email, u.role,
            u.token_version, u.is_active, u.email_verified_at
        FROM refresh_sessions rs JOIN users u ON u.id = rs.user_id
        WHERE rs.token_hash = ? AND rs.revoked_at IS NULL AND julianday(rs.expires_at) > julianday('now')`,
    [currentHash], (err, row) => {
        if (err) return res.status(500).json({ error: 'Unable to refresh session' });
        if (!row || !row.is_active || row.session_version !== row.token_version) {
            return res.status(401).json({ error: 'Refresh session is no longer valid' });
        }
        const nextToken = crypto.randomBytes(32).toString('hex');
        const nextHash = crypto.createHash('sha256').update(nextToken).digest('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        db.run('UPDATE refresh_sessions SET revoked_at = CURRENT_TIMESTAMP, replaced_by_hash = ? WHERE id = ? AND revoked_at IS NULL',
            [nextHash, row.session_id], function(revokeError) {
                if (revokeError || this.changes !== 1) return res.status(401).json({ error: 'Refresh session has already been used' });
                db.run('INSERT INTO refresh_sessions (user_id, token_hash, expires_at, token_version) VALUES (?, ?, ?, ?)',
                    [row.id, nextHash, expiresAt, row.token_version], function(insertError) {
                        if (insertError) return res.status(500).json({ error: 'Unable to refresh session' });
                        const accessToken = jwt.sign({ id: row.id, role: row.role, token_version: row.token_version }, process.env.JWT_SECRET, { expiresIn: '15m' });
                        const cookieSettings = getCookieSettings();
                        const options = { sameSite: cookieSettings.sameSite, secure: cookieSettings.secure, path: '/' };
                        res.cookie('access_token', accessToken, { ...options, maxAge: 15 * 60 * 1000, httpOnly: true });
                        res.cookie('refresh_token', nextToken, { ...options, maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true });
                        res.cookie('csrf_token', crypto.randomBytes(32).toString('hex'), { ...options, maxAge: 7 * 24 * 60 * 60 * 1000, domain: cookieSettings.domain });
                        req.activityActorId = row.id;
                        req.activityActorRole = row.role;
                        req.activityEntityId = row.id;
                        res.json({ user: { id: row.id, name: row.name, email: row.email, role: row.role, email_verified_at: row.email_verified_at } });
                    });
            });
    });
});

router.post('/logout', withTransaction(db, 'auth.logout', 'session'), (req, res) => {
    const cookieSettings = getCookieSettings();
    const refreshToken = req.cookies?.refresh_token;
    if (typeof refreshToken === 'string') {
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        db.run('UPDATE refresh_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND revoked_at IS NULL', [tokenHash]);
    }
    const cookieOptions = { sameSite: cookieSettings.sameSite, secure: cookieSettings.secure, path: '/' };
    res.clearCookie('access_token', { ...cookieOptions, httpOnly: true });
    res.clearCookie('refresh_token', { ...cookieOptions, httpOnly: true });
    res.clearCookie('csrf_token', { ...cookieOptions, domain: cookieSettings.domain });
    res.json({ message: 'Logged out' });
});

router.get('/me', authenticateToken, (req, res) => {
    db.get('SELECT id, name, email, role, department, year, phone, portfolio_url, bio, profile_picture_url, skills, interests, projects, achievements, github_url, linkedin_url, email_verified_at, is_active, token_version, must_change_password FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    });
});

module.exports = router;

