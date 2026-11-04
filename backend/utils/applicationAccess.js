const APPLICATION_STATUSES = Object.freeze([
    'Applied',
    'Under Review',
    'Shortlisted',
    'Selected',
    'Rejected',
    'Withdrawn'
]);

const canViewApplication = (user, application) => {
    if (!user || !application) return false;
    if (user.role === 'student') return Number(user.id) === Number(application.student_id);
    if (user.role === 'coordinator') return Number(user.id) === Number(application.coordinator_id);
    return user.role === 'admin';
};

module.exports = { APPLICATION_STATUSES, canViewApplication };