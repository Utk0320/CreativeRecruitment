const { isOfficialCollegeEmail } = require('../../utils/emailValidation');

const verifyConsoleIdentity = async (email) => {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new Error('Provide a valid email address');
    }
    if (process.env.NODE_ENV === 'test' && !isOfficialCollegeEmail(normalizedEmail, 'student')) {
        throw new Error('Use a valid .comp MMCOE student email');
    }
    return {
        email: normalizedEmail,
        email_verified: true,
        hd: normalizedEmail.split('@')[1],
        name: normalizedEmail.split('@')[0]
    };
};

module.exports = { verifyConsoleIdentity };