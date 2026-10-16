const { isOfficialCollegeEmail } = require('./emailValidation');

const isVerifiedCollegeIdentity = (claims, provider, expectedMicrosoftTenant) => {
    if (!claims || claims.email_verified !== true) return false;
    if (!isOfficialCollegeEmail(claims.email, 'student')) return false;
    if (provider === 'google') return claims.hd === 'mmcoe.edu.in';
    if (provider === 'microsoft') return Boolean(expectedMicrosoftTenant) && claims.tid === expectedMicrosoftTenant;
    return false;
};

module.exports = { isVerifiedCollegeIdentity };