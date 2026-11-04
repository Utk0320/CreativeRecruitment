const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');
const { withTransaction } = require('../utils/mutationBoundary');
const { parseListOptions, setPaginationHeaders } = require('../utils/listOptions');
const { z } = require('zod');

const heartbeatSchema = z.object({
    entity_type: z.enum(['application', 'drive', 'club']),
    entity_id: z.coerce.number().int().positive()
});

// ── Heartbeat endpoints ───────────────────────────────────────────────────────

router.post('/heartbeat', authenticateToken, withTransaction(db, 'collaboration.heartbeat', 'collaboration'), (req, res) => {
    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid heartbeat payload' });

    const { entity_type, entity_id } = parsed.data;
    const userName = req.user.name || req.user.email || 'Anonymous';

    // Clean up stale heartbeats older than 60 seconds
    db.run("DELETE FROM viewing_heartbeats WHERE last_seen_at < datetime('now', '-60 seconds')", () => {});

    // Upsert current user's heartbeat
    db.run(`
        INSERT INTO viewing_heartbeats (entity_type, entity_id, user_id, user_name, last_seen_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(entity_type, entity_id, user_id) DO UPDATE SET
            user_name = excluded.user_name,
            last_seen_at = CURRENT_TIMESTAMP
    `, [entity_type, entity_id, req.user.id, userName], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to record heartbeat' });
        req.activityEntityId = entity_id;
        res.json({ status: 'ok', active: true });
    });
});

router.get('/viewers/:entityType/:entityId', authenticateToken, (req, res) => {
    const { entityType, entityId } = req.params;
    db.all(`
        SELECT user_id, user_name, last_seen_at
        FROM viewing_heartbeats
        WHERE entity_type = ? AND entity_id = ? AND user_id != ?
          AND last_seen_at >= datetime('now', '-60 seconds')
        ORDER BY last_seen_at DESC
    `, [entityType, Number(entityId), req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch viewers' });
        res.json({ viewers: rows || [] });
    });
});

// ── Last Edited Summary ───────────────────────────────────────────────────────

router.get('/last-edited/:entityType/:entityId', authenticateToken, (req, res) => {
    const { entityType, entityId } = req.params;
    db.get(`
        SELECT a.id, a.action, a.created_at, u.name AS actor_name, u.email AS actor_email
        FROM activity_log a
        LEFT JOIN users u ON a.actor_id = u.id
        WHERE a.entity_type = ? AND a.entity_id = ?
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 1
    `, [entityType, Number(entityId)], (err, row) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch last edit' });
        if (!row) return res.json({ last_edited: null });
        res.json({
            last_edited: {
                action: row.action,
                created_at: row.created_at,
                actor_name: row.actor_name || row.actor_email || 'System'
            }
        });
    });
});

// ── Club Activity Feed ────────────────────────────────────────────────────────

router.get('/activity/club/:clubId', authenticateToken, requireRole('coordinator'), (req, res) => {
    const clubId = Number(req.params.clubId);

    // Verify coordinator is member of the club or admin
    const checkAuth = (cb) => {
        if (req.user.role === 'admin') return cb(true);
        db.get('SELECT id FROM club_members WHERE club_id = ? AND user_id = ?', [clubId, req.user.id], (err, row) => {
            cb(!err && Boolean(row));
        });
    };

    checkAuth((isMember) => {
        if (!isMember) return res.status(403).json({ error: 'Forbidden: not a member of this club' });

        const options = parseListOptions(req.query, { created: 'a.created_at', action: 'a.action' }, 'created');
        const conditions = ['a.club_id = ?'];
        const params = [clubId];

        if (req.query.person) {
            conditions.push('a.actor_id = ?');
            params.push(Number(req.query.person));
        }
        if (req.query.action) {
            conditions.push('a.action LIKE ?');
            params.push(`%${req.query.action}%`);
        }
        if (req.query.from_date) {
            conditions.push('a.created_at >= ?');
            params.push(req.query.from_date);
        }
        if (req.query.to_date) {
            conditions.push('a.created_at <= ?');
            params.push(req.query.to_date);
        }

        const where = conditions.join(' AND ');

        db.get(`SELECT COUNT(*) AS total FROM activity_log a WHERE ${where}`, params, (countErr, countRes) => {
            if (countErr) return res.status(500).json({ error: 'Failed to count activity logs' });

            db.all(`
                SELECT a.id, a.actor_id, a.actor_role, a.action, a.entity_type, a.entity_id,
                       a.created_at, a.before_json, a.after_json,
                       u.name AS actor_name, u.email AS actor_email
                FROM activity_log a
                LEFT JOIN users u ON a.actor_id = u.id
                WHERE ${where}
                ORDER BY a.created_at DESC, a.id DESC
                LIMIT ? OFFSET ?
            `, [...params, options.limit, options.offset], (err, rows) => {
                if (err) return res.status(500).json({ error: 'Failed to fetch activity logs' });
                setPaginationHeaders(res, options, countRes.total);
                res.json(rows || []);
            });
        });
    });
});

// ── Application Timeline ──────────────────────────────────────────────────────

router.get('/activity/application/:applicationId', authenticateToken, requireRole('coordinator'), (req, res) => {
    const appId = Number(req.params.applicationId);

    db.get(`
        SELECT a.id, a.drive_id, d.club_id
        FROM applications a
        JOIN recruitment_drives d ON a.drive_id = d.id
        WHERE a.id = ?
    `, [appId], (err, app) => {
        if (err || !app) return res.status(404).json({ error: 'Application not found' });

        const checkAuth = (cb) => {
            if (req.user.role === 'admin') return cb(true);
            db.get('SELECT id FROM club_members WHERE club_id = ? AND user_id = ?', [app.club_id, req.user.id], (err2, row) => {
                cb(!err2 && Boolean(row));
            });
        };

        checkAuth((isMember) => {
            if (!isMember) return res.status(403).json({ error: 'Forbidden: not authorized for this application' });

            // Fetch activity log events, scorecards, and comments
            db.all(`
                SELECT a.id, a.actor_id, a.actor_role, a.action, a.created_at,
                       a.before_json, a.after_json,
                       u.name AS actor_name, u.email AS actor_email,
                       'log' AS entry_type
                FROM activity_log a
                LEFT JOIN users u ON a.actor_id = u.id
                WHERE a.entity_type = 'application' AND a.entity_id = ?
                ORDER BY a.created_at ASC
            `, [appId], (logErr, logs) => {
                if (logErr) return res.status(500).json({ error: 'Failed to fetch application timeline' });

                res.json({ timeline: logs || [] });
            });
        });
    });
});

module.exports = router;

