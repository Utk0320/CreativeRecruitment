const COLLEGE_DOMAIN = 'mmcoe.edu.in';
const STUDENT_EMAIL_PATTERN = /^[^\s@]+\d+\.[a-z]+@mmcoe\.edu\.in$/i;
const COORDINATOR_EMAIL_PATTERN = /^[^\s@]+@mmcoe\.edu\.in$/i;

const isOfficialCollegeEmail = (email, role) => {
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return false;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const domain = normalizedEmail.split('@').at(-1);

    if (domain !== COLLEGE_DOMAIN) {
        return false;
    }

    return role === 'coordinator'
        ? COORDINATOR_EMAIL_PATTERN.test(normalizedEmail)
        : STUDENT_EMAIL_PATTERN.test(normalizedEmail);
};

module.exports = { isOfficialCollegeEmail };
