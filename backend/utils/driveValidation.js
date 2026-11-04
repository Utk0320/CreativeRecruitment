const { z } = require('zod');
const crypto = require('crypto');

// All valid drive statuses (zod enforces; SQLite CHECK not relied on)
const DRIVE_STATUSES = ['draft', 'scheduled', 'published', 'closed', 'archived'];

// Valid transitions: from → [allowed tos]
const STATUS_TRANSITIONS = {
    draft:     ['published', 'scheduled', 'archived'],
    scheduled: ['published', 'draft', 'archived'],
    published: ['closed'],
    closed:    ['archived'],
    archived:  []
};

const rubricItemSchema = z.object({
    criterion:   z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).optional(),
    weight:      z.number().int().min(1).max(100)
});

const customQuestionSchema = z.object({
    id:       z.string().optional(),
    type:     z.enum(['text', 'mcq', 'file', 'link']),
    prompt:   z.string().trim().min(1).max(500),
    options:  z.array(z.string()).optional(),
    required: z.boolean().default(false)
});

const driveInputSchema = z.object({
    club_id:              z.coerce.number().int().positive(),
    title:                z.string().trim().min(1).max(200),
    description:          z.string().trim().min(1).max(5000),
    eligibility:          z.string().trim().max(2000).optional().default(''),
    open_date:            z.string().min(10),
    deadline:             z.string().min(10),
    status:               z.enum(DRIVE_STATUSES).optional(),
    season_id:            z.coerce.number().int().positive().nullable().optional(),
    // 3B fields — all optional so existing callers keep working
    seats:                z.coerce.number().int().positive().nullable().optional(),
    required_skills:      z.array(z.string()).optional(),
    preferred_skills:     z.array(z.string()).optional(),
    allowed_years:        z.array(z.coerce.number().int().min(1).max(4)).optional(),
    allowed_departments:  z.array(z.string()).optional(),
    min_motivation_length: z.coerce.number().int().min(0).optional(),
    rubric:               z.array(rubricItemSchema).optional(),
    deal_breakers:        z.array(z.string()).optional(),
    custom_questions:     z.array(customQuestionSchema).optional(),
    stages:               z.union([z.array(z.string()), z.array(z.object({ id: z.string().optional(), name: z.string(), order: z.number().optional() })), z.string()]).optional(),
    expected_decision_date: z.string().optional().nullable(),
    is_template:          z.boolean().optional(),
    template_for_category: z.string().trim().max(100).nullable().optional()
});

const normalizeDateTime = (value, endOfDay = false) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return `${value}T${endOfDay ? '23:59:59' : '00:00:00'}+05:30`;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

/** Returns {success, data} or {success:false, error} */
const parseDriveInput = (input) => {
    const parsed = driveInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const value = parsed.data;
    const openDate = normalizeDateTime(value.open_date);
    const deadline = normalizeDateTime(value.deadline, true);
    if (!openDate || !deadline || new Date(deadline) <= new Date(openDate)) {
        return { success: false, error: 'Deadline must be after open date' };
    }

    // Rubric weight validation
    if (value.rubric && value.rubric.length > 0) {
        const total = value.rubric.reduce((sum, r) => sum + r.weight, 0);
        if (total !== 100) return { success: false, error: `Rubric weights must sum to 100 (got ${total})` };
    }

    return { success: true, data: { ...value, open_date: openDate, deadline } };
};

const getInitialDriveStatus = (drive, now = new Date()) => {
    if (drive.status === 'closed' || drive.status === 'archived') return drive.status;
    if (drive.status === 'draft') return 'draft';
    if (drive.status === 'published' || drive.status === 'open') {
        return new Date(drive.open_date) > now ? 'scheduled' : 'published';
    }
    if (drive.status === 'scheduled' || new Date(drive.open_date) > now) return 'scheduled';
    return 'published';  // open_date has passed — treat as published

};

/** Generate a random 10-char hex slug */
const generateSlug = () => crypto.randomBytes(5).toString('hex');

/** Validate a status transition, returning an error string or null */
const validateTransition = (from, to) => {
    if (!STATUS_TRANSITIONS[from]) return `Unknown current status: ${from}`;
    if (!STATUS_TRANSITIONS[from].includes(to)) {
        return `Cannot transition from '${from}' to '${to}'. Allowed: ${STATUS_TRANSITIONS[from].join(', ') || 'none'}`;
    }
    return null;
};

module.exports = {
    normalizeDateTime,
    parseDriveInput,
    getInitialDriveStatus,
    generateSlug,
    validateTransition,
    DRIVE_STATUSES,
    STATUS_TRANSITIONS
};