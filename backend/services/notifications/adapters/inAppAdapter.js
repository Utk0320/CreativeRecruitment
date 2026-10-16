/**
 * In-App Notification Channel Adapter (Database + SSE)
 */
const { broadcast } = require('../../../utils/eventStream');

class InAppAdapter {
    async send(db, { userId, title, message, link, eventType }) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO notifications (user_id, title, message, type, is_read, channel, link, event_type)
                 VALUES (?, ?, ?, ?, 0, 'in_app', ?, ?)`,
                [userId, title, message, eventType || 'system', link, eventType],
                function(err) {
                    if (err) return reject(err);
                    const notificationId = this.lastID;
                    // Broadcast SSE event
                    try {
                        broadcast({
                            type: 'notification',
                            id: notificationId,
                            userId,
                            title,
                            message,
                            link,
                            eventType
                        });
                    } catch (e) {
                        // Non-critical if stream fails
                    }
                    resolve({ success: true, id: notificationId });
                }
            );
        });
    }
}

module.exports = { InAppAdapter };

