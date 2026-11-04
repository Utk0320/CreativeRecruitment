const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken } = require('../middlewares/authMiddleware');
const { withTransaction } = require('../utils/mutationBoundary');
const { dispatchNotification } = require('../services/notifications/dispatcher');

const SLA_HOURS = {
    Urgent: 4,
    High: 12,
    Medium: 24,
    Low: 48
};

function parseUtcTime(timestamp) {
    if (!timestamp) return Date.now();
    const str = String(timestamp).trim();
    if (str.endsWith('Z')) return new Date(str).getTime();
    return new Date(str.replace(' ', 'T') + 'Z').getTime();
}

/**
 * POST /api/tickets
 * Create a support ticket.
 * Routes club-related tickets to club lead, and account/technical to admin.
 */
router.post('/', authenticateToken, withTransaction(db, 'tickets.create', 'support_tickets'), async (req, res) => {
    const { subject, message, category, priority = 'Medium', club_id, application_id, attachment_url } = req.body;

    if (!subject || typeof subject !== 'string' || subject.trim().length < 3) {
        return res.status(400).json({ error: 'Subject is required (min 3 chars)' });
    }
    if (!message || typeof message !== 'string' || message.trim().length < 5) {
        return res.status(400).json({ error: 'Message description is required (min 5 chars)' });
    }

    const validCategories = ['Account', 'Application', 'Technical', 'Appeal-related', 'Other'];
    const chosenCategory = validCategories.includes(category) ? category : 'Other';

    const validPriorities = ['Low', 'Medium', 'High', 'Urgent'];
    const chosenPriority = validPriorities.includes(priority) ? priority : 'Medium';

    // Calculate SLA due date
    const hours = SLA_HOURS[chosenPriority] || 24;
    const slaDueAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

    // Generate ticket number e.g. TICK-1729123456
    const ticketNumber = `TICK-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;

    const resolveRouting = (cb) => {
        const isClubRelated = Boolean(club_id) || ['Application', 'Appeal-related'].includes(chosenCategory);
        if (isClubRelated && club_id) {
            db.get(
                `SELECT user_id FROM club_members WHERE club_id = ? AND role = 'lead' LIMIT 1`,
                [club_id],
                (err, lead) => {
                    if (!err && lead) return cb(null, lead.user_id, club_id);
                    cb(null, null, club_id);
                }
            );
        } else {
            // Route to admin
            db.get(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`, (err, admin) => {
                const assignedTo = (!err && admin) ? admin.id : null;
                cb(null, assignedTo, club_id || null);
            });
        }
    };

    resolveRouting((err, assignedTo, finalClubId) => {
        db.run(
            `INSERT INTO support_tickets (
                ticket_number, user_id, club_id, application_id, category, priority, status, subject, assigned_to, sla_due_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'Open', ?, ?, ?)`,
            [ticketNumber, req.user.id, finalClubId, application_id || null, chosenCategory, chosenPriority, subject.trim(), assignedTo, slaDueAt],
            function(ticketErr) {
                if (ticketErr) return res.status(500).json({ error: 'Failed to create ticket' });
                const ticketId = this.lastID;

                // Insert initial message into ticket_replies
                db.run(
                    `INSERT INTO ticket_replies (ticket_id, sender_id, message, attachment_url)
                     VALUES (?, ?, ?, ?)`,
                    [ticketId, req.user.id, message.trim(), attachment_url || null],
                    (replyErr) => {
                        if (replyErr) console.error('Failed to save initial ticket reply:', replyErr);

                        // Notify assigned user
                        if (assignedTo) {
                            dispatchNotification(db, {
                                userId: assignedTo,
                                eventType: 'ticket_update',
                                title: `New Support Ticket [${ticketNumber}]`,
                                message: `Ticket: ${subject.trim()} (${chosenPriority} priority)`,
                                link: `/tickets/${ticketId}`
                            }).catch(() => {});
                        }

                        res.status(201).json({
                            id: ticketId,
                            ticket_number: ticketNumber,
                            subject: subject.trim(),
                            category: chosenCategory,
                            priority: chosenPriority,
                            status: 'Open',
                            assigned_to: assignedTo,
                            sla_due_at: slaDueAt,
                            message: 'Ticket created successfully'
                        });
                    }
                );
            }
        );
    });
});

/**
 * GET /api/tickets
 * List tickets based on role and filters.
 */
router.get('/', authenticateToken, (req, res) => {
    let whereClause = '';
    const params = [];

    if (req.user.role === 'student') {
        whereClause = 'WHERE st.user_id = ?';
        params.push(req.user.id);
    } else if (req.user.role === 'coordinator') {
        whereClause = `WHERE (st.assigned_to = ? OR st.club_id IN (
            SELECT club_id FROM club_members WHERE user_id = ?
        ))`;
        params.push(req.user.id, req.user.id);
    } else {
        // Admin sees all tickets
        whereClause = 'WHERE 1=1';
    }

    if (req.query.status) {
        whereClause += ' AND st.status = ?';
        params.push(req.query.status);
    }
    if (req.query.category) {
        whereClause += ' AND st.category = ?';
        params.push(req.query.category);
    }
    if (req.query.priority) {
        whereClause += ' AND st.priority = ?';
        params.push(req.query.priority);
    }

    db.all(
        `SELECT st.*, u.name AS creator_name, u.email AS creator_email,
                assignee.name AS assignee_name, c.name AS club_name,
                CASE WHEN st.sla_due_at < CURRENT_TIMESTAMP AND st.status IN ('Open', 'In Progress') THEN 1 ELSE 0 END AS is_sla_breached,
                (SELECT COUNT(*) FROM ticket_replies tr WHERE tr.ticket_id = st.id) AS reply_count
         FROM support_tickets st
         JOIN users u ON u.id = st.user_id
         LEFT JOIN users assignee ON assignee.id = st.assigned_to
         LEFT JOIN clubs c ON c.id = st.club_id
         ${whereClause}
         ORDER BY
            CASE WHEN st.status IN ('Open', 'In Progress') THEN 0 ELSE 1 END,
            st.sla_due_at ASC,
            st.created_at DESC`,
        params,
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Failed to fetch tickets' });
            res.json(rows || []);
        }
    );
});

/**
 * GET /api/tickets/:id
 * Fetch single ticket details and replies.
 */
router.get('/:id', authenticateToken, (req, res) => {
    const ticketId = Number(req.params.id);

    db.get(
        `SELECT st.*, u.name AS creator_name, u.email AS creator_email,
                assignee.name AS assignee_name, c.name AS club_name,
                CASE WHEN st.sla_due_at < CURRENT_TIMESTAMP AND st.status IN ('Open', 'In Progress') THEN 1 ELSE 0 END AS is_sla_breached
         FROM support_tickets st
         JOIN users u ON u.id = st.user_id
         LEFT JOIN users assignee ON assignee.id = st.assigned_to
         LEFT JOIN clubs c ON c.id = st.club_id
         WHERE st.id = ?`,
        [ticketId],
        (err, ticket) => {
            if (err) return res.status(500).json({ error: 'Database query failed' });
            if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

            // Authorization check
            const isCreator = ticket.user_id === req.user.id;
            const isAssignee = ticket.assigned_to === req.user.id;
            const isAdmin = req.user.role === 'admin';

            const checkClubAccess = (cb) => {
                if (isCreator || isAssignee || isAdmin) return cb(true);
                if (ticket.club_id && req.user.role === 'coordinator') {
                    db.get(
                        'SELECT role FROM club_members WHERE club_id = ? AND user_id = ?',
                        [ticket.club_id, req.user.id],
                        (err, member) => cb(Boolean(member))
                    );
                } else {
                    cb(false);
                }
            };

            checkClubAccess((hasAccess) => {
                if (!hasAccess) return res.status(403).json({ error: 'You do not have permission to view this ticket' });

                // Fetch replies
                db.all(
                    `SELECT tr.*, u.name AS sender_name, u.role AS sender_role, u.profile_picture_url AS sender_avatar
                     FROM ticket_replies tr
                     JOIN users u ON u.id = tr.sender_id
                     WHERE tr.ticket_id = ?
                     ORDER BY tr.created_at ASC`,
                    [ticketId],
                    (err, replies) => {
                        if (err) return res.status(500).json({ error: 'Failed to fetch replies' });
                        res.json({
                            ...ticket,
                            replies: replies || []
                        });
                    }
                );
            });
        }
    );
});

/**
 * POST /api/tickets/:id/replies
 * Add a reply to a support ticket.
 */
router.post('/:id/replies', authenticateToken, withTransaction(db, 'tickets.reply', 'support_tickets'), async (req, res) => {
    const ticketId = Number(req.params.id);
    const { message, attachment_url } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message cannot be empty' });
    }

    db.get('SELECT * FROM support_tickets WHERE id = ?', [ticketId], (err, ticket) => {
        if (err) return res.status(500).json({ error: 'Database query failed' });
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        db.run(
            `INSERT INTO ticket_replies (ticket_id, sender_id, message, attachment_url)
             VALUES (?, ?, ?, ?)`,
            [ticketId, req.user.id, message.trim(), attachment_url || null],
            function(replyErr) {
                if (replyErr) return res.status(500).json({ error: 'Failed to post reply' });
                const replyId = this.lastID;

                // If ticket was closed/resolved and creator replies, reopen if within 7 days
                let newStatus = ticket.status;
                if (['Resolved', 'Closed'].includes(ticket.status) && req.user.id === ticket.user_id) {
                    const resolvedTime = parseUtcTime(ticket.resolved_at || ticket.updated_at);
                    if (Date.now() - resolvedTime <= 7 * 24 * 3600 * 1000) {
                        newStatus = 'Open';
                    }
                } else if (ticket.status === 'Open' && req.user.id !== ticket.user_id) {
                    newStatus = 'In Progress';
                }

                db.run(
                    `UPDATE support_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [newStatus, ticketId],
                    () => {
                        // Notify opposite party
                        const notifyTarget = req.user.id === ticket.user_id ? ticket.assigned_to : ticket.user_id;
                        if (notifyTarget) {
                            dispatchNotification(db, {
                                userId: notifyTarget,
                                eventType: 'ticket_update',
                                title: `New reply on ticket [${ticket.ticket_number}]`,
                                message: message.trim().slice(0, 100),
                                link: `/tickets/${ticketId}`
                            }).catch(() => {});
                        }

                        res.status(201).json({
                            id: replyId,
                            ticket_id: ticketId,
                            sender_id: req.user.id,
                            message: message.trim(),
                            ticket_status: newStatus
                        });
                    }
                );
            }
        );
    });
});

/**
 * PATCH /api/tickets/:id/status
 * Update ticket status ('Open', 'In Progress', 'Resolved', 'Closed').
 */
router.patch('/:id/status', authenticateToken, withTransaction(db, 'tickets.status', 'support_tickets'), async (req, res) => {
    const ticketId = Number(req.params.id);
    const { status } = req.body;

    const validStatuses = ['Open', 'In Progress', 'Resolved', 'Closed'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    db.get('SELECT * FROM support_tickets WHERE id = ?', [ticketId], (err, ticket) => {
        if (err) return res.status(500).json({ error: 'Database query failed' });
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        const resolvedAt = ['Resolved', 'Closed'].includes(status) ? new Date().toISOString() : null;

        db.run(
            `UPDATE support_tickets SET
                status = ?,
                resolved_at = COALESCE(?, resolved_at),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [status, resolvedAt, ticketId],
            function(updateErr) {
                if (updateErr) return res.status(500).json({ error: 'Failed to update ticket status' });

                dispatchNotification(db, {
                    userId: ticket.user_id,
                    eventType: 'ticket_update',
                    title: `Ticket [${ticket.ticket_number}] status changed`,
                    message: `Your ticket has been marked as ${status}.`,
                    link: `/tickets/${ticketId}`
                }).catch(() => {});

                res.json({
                    id: ticketId,
                    status,
                    message: `Ticket status updated to ${status}`
                });
            }
        );
    });
});

/**
 * POST /api/tickets/:id/reopen
 * Reopen a resolved/closed ticket within 7-day window.
 */
router.post('/:id/reopen', authenticateToken, withTransaction(db, 'tickets.reopen', 'support_tickets'), async (req, res) => {
    const ticketId = Number(req.params.id);

    db.get('SELECT * FROM support_tickets WHERE id = ?', [ticketId], (err, ticket) => {
        if (err) return res.status(500).json({ error: 'Database query failed' });
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        if (ticket.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only the ticket creator or admin can reopen this ticket' });
        }

        if (!['Resolved', 'Closed'].includes(ticket.status)) {
            return res.status(400).json({ error: 'Only resolved or closed tickets can be reopened' });
        }

        const resolvedTime = parseUtcTime(ticket.resolved_at || ticket.updated_at);
        const windowMs = 7 * 24 * 3600 * 1000;
        if (Date.now() - resolvedTime > windowMs) {
            return res.status(400).json({
                error: 'Ticket cannot be reopened after 7 days from resolution. Please open a new ticket.'
            });
        }

        db.run(
            `UPDATE support_tickets SET
                status = 'Open',
                reopened_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [ticketId],
            function(updateErr) {
                if (updateErr) return res.status(500).json({ error: 'Failed to reopen ticket' });

                if (ticket.assigned_to) {
                    dispatchNotification(db, {
                        userId: ticket.assigned_to,
                        eventType: 'ticket_update',
                        title: `Ticket [${ticket.ticket_number}] Reopened`,
                        message: `The user has reopened this ticket for further assistance.`,
                        link: `/tickets/${ticketId}`
                    }).catch(() => {});
                }

                res.json({
                    id: ticketId,
                    status: 'Open',
                    message: 'Ticket reopened successfully'
                });
            }
        );
    });
});

module.exports = router;
