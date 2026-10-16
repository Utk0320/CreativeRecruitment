/**
 * SMS / WhatsApp Notification Channel Adapter Interface
 */
class SmsAdapter {
    constructor({ env = process.env, logger = console } = {}) {
        this.env = env;
        this.logger = logger;
    }

    async send({ phone, message, channel = 'sms' }) {
        if (!phone) return { success: false, reason: 'No phone number' };
        this.logger.info(`[${channel.toUpperCase()}] To: ${phone} | Content: ${message}`);
        return { success: true, channel, recipient: phone };
    }
}

module.exports = { SmsAdapter };

