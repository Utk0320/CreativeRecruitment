const getCookieSettings = (env = process.env) => {
    const sameSite = (env.COOKIE_SAME_SITE || 'lax').toLowerCase();
    const secureSetting = env.COOKIE_SECURE || 'auto';
    if (!['lax', 'strict', 'none'].includes(sameSite)) {
        throw new Error('COOKIE_SAME_SITE must be Lax, Strict, or None');
    }
    if (!['auto', 'true', 'false'].includes(secureSetting)) {
        throw new Error('COOKIE_SECURE must be auto, true, or false');
    }
    const secure = secureSetting === 'true' || (secureSetting === 'auto' && env.NODE_ENV === 'production');
    if (env.NODE_ENV === 'production' && !secure) {
        throw new Error('Secure cookies are required in production');
    }
    if (sameSite === 'none' && !secure) {
        throw new Error('SameSite=None cookies require Secure');
    }

    return {
        sameSite,
        secure,
        domain: env.COOKIE_DOMAIN?.trim() || undefined
    };
};

const validateEnvironment = (env = process.env) => {
    if (typeof env.JWT_SECRET !== 'string' || env.JWT_SECRET.length < 32) {
        throw new Error('JWT_SECRET must be configured with at least 32 characters');
    }
    const ssoProvider = env.SSO_PROVIDER || 'none';
    if (!['none', 'console', 'google'].includes(ssoProvider)) {
        throw new Error('SSO_PROVIDER must be none, console, or google');
    }
    if (env.NODE_ENV === 'production' && ssoProvider === 'console') {
        throw new Error('Console SSO cannot be used in production');
    }
    if (ssoProvider === 'google' && !env.GOOGLE_CLIENT_ID) {
        throw new Error('GOOGLE_CLIENT_ID is required when Google SSO is enabled');
    }
    const emailProvider = env.EMAIL_PROVIDER || 'console';
    if (!['console', 'smtp'].includes(emailProvider)) throw new Error('EMAIL_PROVIDER must be console or smtp');
    if (env.NODE_ENV === 'production' && emailProvider !== 'smtp') {
        throw new Error('SMTP email delivery is required in production');
    }
    if (emailProvider === 'smtp' && (!env.SMTP_HOST || !env.EMAIL_FROM || !env.FRONTEND_URL)) {
        throw new Error('SMTP_HOST, EMAIL_FROM, and FRONTEND_URL are required for SMTP delivery');
    }
    const allowedOrigins = (env.CORS_ORIGIN || 'http://localhost:5173')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);
    if (env.NODE_ENV === 'production') {
        if (allowedOrigins.some(origin => {
            try { return new URL(origin).protocol !== 'https:'; } catch { return true; }
        })) throw new Error('CORS_ORIGIN must contain only valid HTTPS origins in production');
        if (emailProvider === 'smtp' && new URL(env.FRONTEND_URL).protocol !== 'https:') {
            throw new Error('FRONTEND_URL must use HTTPS in production');
        }
    }

    return {
        port: Number(env.PORT) || 5000,
        timezone: env.TIMEZONE || 'Asia/Kolkata',
        ssoProvider,
        emailProvider,
        cookie: getCookieSettings(env),
        allowedOrigins
    };
};

module.exports = { getCookieSettings, validateEnvironment };