/**
 * utils/can.js — shared authorization helper (Phase 2)
 *
 * Usage (async):
 *   const allowed = await can(db, user, 'drive.create', { clubId: 3 });
 *
 * Usage as Express middleware (throws 403 on denial):
 *   router.post('/...', requirePermission('drive.create', req => ({ clubId: req.params.clubId })), handler)
 *
 * Permission sets:
 *   Admin:       all permissions (no club check needed)
 *   Lead:        all club-scoped permissions
 *   Member:      limited set; admins can grant/revoke per club via club_permission_overrides
 */

const LEAD_PERMISSIONS = new Set([
    'drive.create',
    'drive.publish',
    'drive.edit',
    'drive.archive',
    'drive.clone',
    'drive.qa.answer',
    'application.review',
    'application.decide',
    'application.approve',
    'application.assign',
    'application.export',
    'club.manage_members',
    'club.view',
    'club.edit',
    'ai.run',
    'export.data',
    'season.view',
]);

const MEMBER_PERMISSIONS = new Set([
    'drive.create',
    'drive.edit',
    'drive.qa.answer',
    'application.review',
    'application.assign',
    'club.view',
    'season.view',
]);

/**
 * Check if user has a permission, optionally scoped to a club.
 *
 * @param {object} db      - SQLite db instance
 * @param {object} user    - req.user (id, role, …)
 * @param {string} permission
 * @param {object} [opts]
 * @param {number} [opts.clubId]  - required for club-scoped permissions
 * @returns {Promise<boolean>}
 */
const can = async (db, user, permission, opts = {}) => {
    if (!user) return false;

    // Admins can do everything
    if (user.role === 'admin') return true;

    // Only coordinators can have club-scoped permissions
    if (user.role !== 'coordinator') return false;

    const { clubId } = opts;
    if (!clubId) return false;

    // Resolve membership role for this user+club
    const membership = await new Promise((resolve, reject) =>
        db.get(
            `SELECT cm.role FROM club_members cm
             JOIN users u ON u.id = cm.user_id
             WHERE cm.club_id = ? AND cm.user_id = ? AND u.is_active = 1`,
            [clubId, user.id],
            (err, row) => (err ? reject(err) : resolve(row))
        )
    );
    if (!membership) return false;

    // Check for an admin-set override first
    const override = await new Promise((resolve, reject) =>
        db.get(
            `SELECT granted FROM club_permission_overrides
             WHERE club_id = ? AND user_id = ? AND permission = ?`,
            [clubId, user.id, permission],
            (err, row) => (err ? reject(err) : resolve(row))
        )
    );
    if (override) return override.granted === 1;

    // Fall back to role-based defaults
    if (membership.role === 'lead') return LEAD_PERMISSIONS.has(permission);
    return MEMBER_PERMISSIONS.has(permission);
};

/**
 * Express middleware factory.
 * Denies with 403 if the user lacks the permission.
 *
 * @param {string} permission
 * @param {function(req): {clubId?:number}} [getOpts] - derive opts from req
 */
const requirePermission = (permission, getOpts = () => ({})) =>
    async (req, res, next) => {
        try {
            const { db } = require('./db');
            const opts = getOpts(req);
            const allowed = await can(db, req.user, permission, opts);
            if (!allowed) {
                return res.status(403).json({ error: 'You do not have permission for this action' });
            }
            next();
        } catch (err) {
            next(err);
        }
    };

/**
 * Resolve which club IDs the user may access for a given permission.
 * Returns null for admins (= all clubs).
 *
 * @param {object} db
 * @param {object} user
 * @param {string} permission
 * @returns {Promise<number[]|null>}
 */
const accessibleClubIds = async (db, user, permission) => {
    if (user.role === 'admin') return null;
    if (user.role !== 'coordinator') return [];

    const rows = await new Promise((resolve, reject) =>
        db.all(
            `SELECT cm.club_id, cm.role FROM club_members cm
             JOIN users u ON u.id = cm.user_id
             WHERE cm.user_id = ? AND u.is_active = 1`,
            [user.id],
            (err, rs) => (err ? reject(err) : resolve(rs))
        )
    );

    const result = [];
    for (const row of rows) {
        // Check override
        const override = await new Promise((resolve, reject) =>
            db.get(
                `SELECT granted FROM club_permission_overrides
                 WHERE club_id = ? AND user_id = ? AND permission = ?`,
                [row.club_id, user.id, permission],
                (err, r) => (err ? reject(err) : resolve(r))
            )
        );
        if (override) {
            if (override.granted === 1) result.push(row.club_id);
        } else {
            const set = row.role === 'lead' ? LEAD_PERMISSIONS : MEMBER_PERMISSIONS;
            if (set.has(permission)) result.push(row.club_id);
        }
    }
    return result;
};

/**
 * Check whether a coordinator has declared a conflict of interest with an applicant,
 * OR the applicant IS the coordinator (self-review ban).
 */
const hasConflict = async (db, coordinatorId, applicantId) => {
    if (coordinatorId === applicantId) return true;
    const row = await new Promise((resolve, reject) =>
        db.get(
            `SELECT id FROM conflict_declarations
             WHERE coordinator_id = ? AND applicant_id = ?`,
            [coordinatorId, applicantId],
            (err, r) => (err ? reject(err) : resolve(r))
        )
    );
    return Boolean(row);
};

module.exports = { can, requirePermission, accessibleClubIds, hasConflict, LEAD_PERMISSIONS, MEMBER_PERMISSIONS };

