/**
 * Email Notification Channel Adapter
 */
class EmailNotificationAdapter {
    constructor({ env = process.env, logger = console } = {}) {
        this.env = env;
        this.logger = logger;
    }

    async send({ email, title, message, link }) {
        if (!email) return { success: false, reason: 'No email provided' };

        const provider = this.env.EMAIL_PROVIDER || 'console';

        if (provider === 'console') {
            this.logger.info(`[EMAIL NOTIFICATION] To: ${email} | Subject: ${title} | Message: ${message} | Link: ${link || 'N/A'}`);
            return { success: true, provider: 'console' };
        }

        if (provider === 'smtp') {
            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport({
                host: this.env.SMTP_HOST?.trim(),
                port: Number(this.env.SMTP_PORT) || 587,
                secure: this.env.SMTP_SECURE === 'true' || Number(this.env.SMTP_PORT) === 465,
                auth: this.env.SMTP_USER?.trim() ? { user: this.env.SMTP_USER.trim(), pass: this.env.SMTP_PASSWORD } : undefined
            });

            await transporter.sendMail({
                from: this.env.EMAIL_FROM?.trim() || 'noreply@mmcoe.edu.in',
                to: email,
                subject: `CreativeRecruit: ${title}`,
                text: `${message}\n\n${link ? `View in CreativeRecruit: ${link}` : ''}`
            });
            return { success: true, provider: 'smtp' };
        }

        return { success: true, provider: 'mock' };
    }
}

module.exports = { EmailNotificationAdapter };

