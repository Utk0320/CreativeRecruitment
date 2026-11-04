const crypto = require('crypto');

const CSRF_EXEMPT_AUTH_PATHS = new Set([
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/verify-email',
    '/api/auth/accept-invite',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/sso/console',
    '/api/auth/sso/google'
]);

const requiresCsrfToken = (method, path) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
    return !CSRF_EXEMPT_AUTH_PATHS.has(path);
};

const hasValidCsrfToken = (cookieToken, headerToken) => {
    if (typeof cookieToken !== 'string' || typeof headerToken !== 'string') return false;
    const cookie = Buffer.from(cookieToken);
    const header = Buffer.from(headerToken);
    return cookie.length === header.length && crypto.timingSafeEqual(cookie, header);
};

module.exports = { CSRF_EXEMPT_AUTH_PATHS, hasValidCsrfToken, requiresCsrfToken };