const test = require('node:test');
const assert = require('node:assert/strict');
const { getCookieSettings, validateEnvironment } = require('./config');

test('server configuration requires a long JWT secret', () => {
    assert.throws(() => validateEnvironment({}), /JWT_SECRET/);
    assert.throws(() => validateEnvironment({ JWT_SECRET: 'too-short' }), /JWT_SECRET/);
});

test('server configuration parses origins and defaults to India time', () => {
    const config = validateEnvironment({
        JWT_SECRET: 'x'.repeat(32),
        CORS_ORIGIN: 'https://app.example, https://admin.example'
    });
    assert.equal(config.timezone, 'Asia/Kolkata');
    assert.deepEqual(config.allowedOrigins, ['https://app.example', 'https://admin.example']);
});

test('production cookie settings require Secure and support a shared CSRF cookie domain', () => {
    assert.deepEqual(getCookieSettings({ NODE_ENV: 'production', COOKIE_DOMAIN: '.example.edu.in' }), {
        sameSite: 'lax',
        secure: true,
        domain: '.example.edu.in'
    });
    assert.throws(() => getCookieSettings({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }), /Secure cookies/);
    assert.throws(() => getCookieSettings({ COOKIE_SAME_SITE: 'none' }), /require Secure/);
});

test('production requires real email delivery and configured Google SSO', () => {
    assert.throws(() => validateEnvironment({ JWT_SECRET: 'x'.repeat(32), NODE_ENV: 'production' }), /SMTP email delivery/);
    assert.throws(() => validateEnvironment({ JWT_SECRET: 'x'.repeat(32), SSO_PROVIDER: 'google' }), /GOOGLE_CLIENT_ID/);
    assert.throws(() => validateEnvironment({ JWT_SECRET: 'x'.repeat(32), NODE_ENV: 'production', EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example', EMAIL_FROM: 'noreply@example.edu', FRONTEND_URL: 'https://app.example', SSO_PROVIDER: 'console' }), /Console SSO/);
    assert.throws(() => validateEnvironment({ JWT_SECRET: 'x'.repeat(32), NODE_ENV: 'production', EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example', EMAIL_FROM: 'noreply@example.edu', FRONTEND_URL: 'https://app.example', CORS_ORIGIN: 'http://app.example' }), /HTTPS origins/);
});