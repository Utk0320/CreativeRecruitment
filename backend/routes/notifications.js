const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken } = require('../middlewares/authMiddleware');
const { parseListOptions, setPaginationHeaders } = require('../utils/listOptions');
const { withTransaction } = require('../utils/mutationBoundary');
const { VALID_EVENT_TYPES, DEFAULT_PREFERENCES } = require('../services/notifications/dispatcher');

router.get('/', authenticateToken, (req, res) => {
    const options = parseListOptions(req.query, { created: 'created_at', title: 'title' }, 'created');
    const conditions = ['user_id = ?'];
    const params = [req.user.id];
    if (options.search) {
        conditions.push('(title LIKE ? OR message LIKE ?)');
        params.push(`%${options.search}%`, `%${options.search}%`);
    }
    if (['0', '1'].includes(req.query.is_read)) {
        conditions.push('is_read = ?');
        params.push(Number(req.query.is_read));
    }
    const where = conditions.join(' AND ');
    db.get(`SELECT COUNT(*) AS total FROM notifications WHERE ${where}`, params, (countErr, result) => {
        if (countErr) return res.status(500).json({ error: 'Request failed' });
        db.all(`SELECT * FROM notifications WHERE ${where}
            ORDER BY ${options.sortField} ${options.direction} LIMIT ? OFFSET ?`,
        [...params, options.limit, options.offset], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Request failed' });
            setPaginationHeaders(res, options, result.total);
            res.json(rows);
        });
    });
});

/**
 * GET /api/notifications/preferences
 * Returns the notification preferences map for the authenticated user.
 */
router.get('/preferences', authenticateToken, (req, res) => {
    db.all(
        `SELECT event_type, channel, enabled FROM notification_preferences WHERE user_id = ?`,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Failed to fetch preferences' });

            // Build full matrix with defaults
            const preferences = {};
            for (const eventType of VALID_EVENT_TYPES) {
                preferences[eventType] = { ...DEFAULT_PREFERENCES };
            }

            if (rows) {
                for (const row of rows) {
                    if (preferences[row.event_type]) {
                        preferences[row.event_type][row.channel] = row.enabled === 1;
                    }
                }
            }

            res.json(preferences);
        }
    );
});

/**
 * PUT /api/notifications/preferences
 * Update notification preferences for one or more event types.
 */
router.put('/preferences', authenticateToken, withTransaction(db, 'notifications.updatePreferences', 'notification_preferences'), async (req, res) => {
    const { event_type, channel, enabled } = req.body;

    if (!VALID_EVENT_TYPES.includes(event_type)) {
        return res.status(400).json({ error: `Invalid event_type. Allowed: ${VALID_EVENT_TYPES.join(', ')}` });
    }
    if (!['in_app', 'email', 'sms', 'push'].includes(channel)) {
        return res.status(400).json({ error: 'Invalid channel. Allowed: in_app, email, sms, push' });
    }

    const isEnabled = enabled ? 1 : 0;

    db.run(
        `INSERT INTO notification_preferences (user_id, event_type, channel, enabled)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, event_type, channel) DO UPDATE SET enabled = excluded.enabled`,
        [req.user.id, event_type, channel, isEnabled],
        function(err) {
            if (err) return res.status(500).json({ error: 'Failed to update preferences' });
            res.json({
                message: 'Preferences updated successfully',
                event_type,
                channel,
                enabled: Boolean(isEnabled)
            });
        }
    );
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read for current user.
 */
router.put('/read-all', authenticateToken, withTransaction(db, 'notifications.readAll', 'notifications'), (req, res) => {
    db.run(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`, [req.user.id], function(err) {
        if (err) return res.status(500).json({ error: 'Request failed' });
        res.json({ message: 'All notifications marked as read', count: this.changes });
    });
});

router.put('/:id/read', authenticateToken, withTransaction(db, 'notification.read', 'notification'), (req, res) => {
    db.run(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: 'Request failed' });
        if (this.changes === 0) return res.status(404).json({ error: 'Notification not found' });
        res.json({ message: 'Notification marked as read' });
    });
});

module.exports = router;
