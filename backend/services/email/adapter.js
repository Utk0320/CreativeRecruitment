const createEmailAdapter = ({ env = process.env, logger = console } = {}) => {
    const provider = env.EMAIL_PROVIDER || 'console';

    if (provider === 'console') {
        if (env.NODE_ENV === 'production') throw new Error('Console email adapter cannot be used in production');
        return {
            async sendVerification({ email, token }) {
                const link = new URL('/verify-email', env.FRONTEND_URL || 'http://localhost:5173');
                link.searchParams.set('token', token);
                logger.info(`Development verification email for ${email}: ${link.href}`);
            },
            async sendCoordinatorInvite({ email, token }) {
                const link = new URL('/accept-invite', env.FRONTEND_URL || 'http://localhost:5173');
                link.searchParams.set('token', token);
                logger.info(`Development coordinator invite for ${email}: ${link.href}`);
            },
            async sendPasswordReset({ email, token }) {
                const link = new URL('/reset-password', env.FRONTEND_URL || 'http://localhost:5173');
                link.searchParams.set('token', token);
                logger.info(`Development password reset for ${email}: ${link.href}`);
            }
        };
    }

    if (provider === 'smtp') {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: Number(env.SMTP_PORT) || 587,
            secure: env.SMTP_SECURE === 'true' || Number(env.SMTP_PORT) === 465,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined
        });
        return {
            async sendVerification({ email, token }) {
                const link = new URL('/verify-email', env.FRONTEND_URL);
                link.searchParams.set('token', token);
                await transporter.sendMail({
                    from: env.EMAIL_FROM,
                    to: email,
                    subject: 'Verify your CreativeRecruit account',
                    text: `Verify your email address: ${link.href}`
                });
            },
            async sendCoordinatorInvite({ email, token }) {
                const link = new URL('/accept-invite', env.FRONTEND_URL);
                link.searchParams.set('token', token);
                await transporter.sendMail({
                    from: env.EMAIL_FROM,
                    to: email,
                    subject: 'CreativeRecruit coordinator invitation',
                    text: `Accept your coordinator invitation: ${link.href}`
                });
            },
            async sendPasswordReset({ email, token }) {
                const link = new URL('/reset-password', env.FRONTEND_URL);
                link.searchParams.set('token', token);
                await transporter.sendMail({
                    from: env.EMAIL_FROM,
                    to: email,
                    subject: 'Reset your CreativeRecruit password',
                    text: `Reset your password: ${link.href}`
                });
            }
        };
    }

    throw new Error(`Unsupported email adapter: ${provider}`);
};

module.exports = { createEmailAdapter };
