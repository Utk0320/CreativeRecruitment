/**
 * Web Push Notification Channel Adapter Interface (PWA)
 */
class PushAdapter {
    constructor({ env = process.env, logger = console } = {}) {
        this.env = env;
        this.logger = logger;
    }

    async send({ userId, title, body, data }) {
        this.logger.info(`[WEB PUSH] User ${userId}: "${title}" - ${body}`);
        return { success: true, userId };
    }
}

module.exports = { PushAdapter };

