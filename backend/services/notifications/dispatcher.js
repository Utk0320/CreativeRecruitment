/**
 * Notification Dispatcher
 * Coordinates channel delivery behind adapters and enforces:
 *  1. Delayed notification gate (no student notification before required maker-checker approval)
 *  2. User notification preferences per event type and channel
 */

const { InAppAdapter } = require('./adapters/inAppAdapter');
const { EmailNotificationAdapter } = require('./adapters/emailNotificationAdapter');
const { SmsAdapter } = require('./adapters/smsAdapter');
const { PushAdapter } = require('./adapters/pushAdapter');

const inApp = new InAppAdapter();
const emailAdapter = new EmailNotificationAdapter();
const smsAdapter = new SmsAdapter();
const pushAdapter = new PushAdapter();

const DEFAULT_PREFERENCES = {
    in_app: true,
    email: true,
    sms: false,
    push: false
};

const VALID_EVENT_TYPES = [
    'stage_change',
    'deadline_reminder',
    'interview_reminder',
    'offer_expiry',
    'appeal_update',
    'ticket_update',
    'mentions_assignments',
    'announcements'
];

/**
 * Checks if notification to student should be delayed due to pending maker-checker approval.
 */
function isDelayedByApproval(approvalStatus, eventType) {
    if (approvalStatus === 'pending' && ['stage_change', 'outcome_change'].includes(eventType)) {
        return true;
    }
    return false;
}

/**
 * Fetch effective channel preferences for a user on a given event type.
 */
async function getEffectivePreferences(db, userId, eventType) {
    return new Promise((resolve) => {
        db.all(
            `SELECT channel, enabled FROM notification_preferences WHERE user_id = ? AND event_type = ?`,
            [userId, eventType],
            (err, rows) => {
                if (err || !rows) {
                    return resolve({ ...DEFAULT_PREFERENCES });
                }
                const prefs = { ...DEFAULT_PREFERENCES };
                for (const row of rows) {
                    if (row.channel in prefs) {
                        prefs[row.channel] = row.enabled === 1;
                    }
                }
                resolve(prefs);
            }
        );
    });
}

/**
 * Dispatch notification across enabled channels.
 */
async function dispatchNotification(db, {
    userId,
    eventType = 'system',
    title,
    message,
    link = null,
    approvalStatus = null,
    metadata = {}
}) {
    // 1. Delayed notification gate: do not notify student before required approval
    if (isDelayedByApproval(approvalStatus, eventType)) {
        return {
            delivered: false,
            reason: 'suppressed_pending_approval',
            channels: []
        };
    }

    // 2. Fetch user preferences
    const prefs = await getEffectivePreferences(db, userId, eventType);

    // 3. Get user contact details (email, phone)
    const user = await new Promise((resolve) => {
        db.get('SELECT email, phone FROM users WHERE id = ?', [userId], (err, row) => resolve(row || {}));
    });

    const results = [];

    // Channel 1: In-App (SSE + DB)
    if (prefs.in_app) {
        try {
            await inApp.send(db, { userId, title, message, link, eventType });
            results.push('in_app');
        } catch (e) {
            console.error('In-app dispatch failed:', e.message);
        }
    }

    // Channel 2: Email
    if (prefs.email && user.email) {
        try {
            await emailAdapter.send({ email: user.email, title, message, link });
            results.push('email');
        } catch (e) {
            console.error('Email dispatch failed:', e.message);
        }
    }

    // Channel 3: SMS / WhatsApp
    if (prefs.sms && user.phone) {
        try {
            await smsAdapter.send({ phone: user.phone, message: `${title}: ${message}`, channel: 'sms' });
            results.push('sms');
        } catch (e) {
            console.error('SMS dispatch failed:', e.message);
        }
    }

    // Channel 4: Web Push (PWA)
    if (prefs.push) {
        try {
            await pushAdapter.send({ userId, title, body: message, data: { link, ...metadata } });
            results.push('push');
        } catch (e) {
            console.error('Push dispatch failed:', e.message);
        }
    }

    return {
        delivered: results.length > 0,
        channels: results,
        suppressedChannels: Object.keys(prefs).filter(c => !prefs[c])
    };
}

module.exports = {
    dispatchNotification,
    isDelayedByApproval,
    getEffectivePreferences,
    DEFAULT_PREFERENCES,
    VALID_EVENT_TYPES
};

