const fs = require('fs');
const path = require('path');

const commonPasswords = new Set(fs.readFileSync(path.resolve(__dirname, '../data/common-passwords.txt'), 'utf8')
    .split(/\r?\n/)
    .map(password => password.trim().toLowerCase())
    .filter(Boolean));

const validatePassword = (password) => {
    if (typeof password !== 'string' || password.length < 10) {
        return { valid: false, error: 'Password must contain at least 10 characters.' };
    }
    if (commonPasswords.has(password.toLowerCase())) {
        return { valid: false, error: 'Choose a password that is not on the common-password list.' };
    }
    return { valid: true };
};

module.exports = { validatePassword };