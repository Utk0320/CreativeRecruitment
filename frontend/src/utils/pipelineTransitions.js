/**
 * utils/pipelineTransitions.js — Shared pipeline stages, outcome & transition rules (Frontend)
 */

export const OUTCOMES = ['Pending', 'Advanced', 'Waitlisted', 'Selected', 'Rejected', 'Withdrawn'];

export const OFFER_STATES = ['None', 'Offered', 'Accepted', 'Declined', 'Expired'];

export const REASON_CODES = [
    'skill_mismatch',
    'seat_limit',
    'incomplete_application',
    'ineligible',
    'other'
];

export const REASON_LABELS = {
    skill_mismatch: 'Skill requirements not met',
    seat_limit: 'Seat capacity reached',
    incomplete_application: 'Incomplete application or missing tasks',
    ineligible: 'Eligibility criteria not satisfied',
    other: 'Other / Discretionary review'
};

export const DEFAULT_STAGES = [
    { id: 'screening', name: 'Screening', order: 1 },
    { id: 'task',      name: 'Task Round',order: 2 },
    { id: 'interview', name: 'Interview', order: 3 },
    { id: 'final',     name: 'Final Offer',order: 4 }
];

export const normalizeStages = (stagesInput) => {
    let parsed = stagesInput;
    if (typeof stagesInput === 'string') {
        try {
            parsed = JSON.parse(stagesInput);
        } catch {
            parsed = [];
        }
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
        return DEFAULT_STAGES;
    }
    return parsed.map((s, index) => {
        if (typeof s === 'string') {
            return {
                id: s.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                name: s,
                order: index + 1
            };
        }
        return {
            id: s.id || (s.name ? s.name.toLowerCase().replace(/[^a-z0-9_]/g, '_') : `stage_${index + 1}`),
            name: s.name || `Stage ${index + 1}`,
            order: typeof s.order === 'number' ? s.order : index + 1
        };
    }).sort((a, b) => a.order - b.order);
};

export const OUTCOME_BADGES = {
    Pending:    'bg-amber-50 text-amber-700 border-amber-200',
    Advanced:   'bg-blue-50 text-blue-700 border-blue-200',
    Waitlisted: 'bg-purple-50 text-purple-700 border-purple-200',
    Selected:   'bg-emerald-50 text-emerald-700 border-emerald-200',
    Rejected:   'bg-rose-50 text-rose-700 border-rose-200',
    Withdrawn:  'bg-gray-100 text-gray-500 border-gray-200'
};

export const OUTCOME_BADGE_CLASSES = OUTCOME_BADGES;

