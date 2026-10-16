/**
 * utils/pipelineTransitions.js — Shared pipeline stages, outcome & transition rules (Phase 4)
 *
 * Defines:
 *  - OUTCOMES: 'Pending', 'Advanced', 'Waitlisted', 'Selected', 'Rejected', 'Withdrawn'
 *  - OFFER_STATES: 'None', 'Offered', 'Accepted', 'Declined', 'Expired'
 *  - REASON_CODES: 'skill_mismatch', 'seat_limit', 'incomplete_application', 'ineligible', 'other'
 *  - Transition validation logic used by backend and frontend
 */

const OUTCOMES = ['Pending', 'Advanced', 'Waitlisted', 'Selected', 'Rejected', 'Withdrawn'];

const OFFER_STATES = ['None', 'Offered', 'Accepted', 'Declined', 'Expired'];

const REASON_CODES = [
    'skill_mismatch',
    'seat_limit',
    'incomplete_application',
    'ineligible',
    'other'
];

const REASON_LABELS = {
    skill_mismatch: 'Skill requirements not met',
    seat_limit: 'Seat capacity reached',
    incomplete_application: 'Incomplete application or missing tasks',
    ineligible: 'Eligibility criteria not satisfied',
    other: 'Other / Discretionary review'
};

const DEFAULT_STAGES = [
    { id: 'screening', name: 'Screening', order: 1 },
    { id: 'task',      name: 'Task',      order: 2 },
    { id: 'interview', name: 'Interview', order: 3 },
    { id: 'final',     name: 'Final',     order: 4 }
];

/**
 * Normalizes stages array or JSON string into structured [{ id, name, order }]
 */
const normalizeStages = (stagesInput) => {
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

/**
 * Validate an outcome change
 * @param {string} currentOutcome
 * @param {string} targetOutcome
 * @param {string} [reasonCode]
 * @returns {{ valid: boolean, error?: string }}
 */
const validateOutcomeTransition = (currentOutcome, targetOutcome, reasonCode) => {
    if (!OUTCOMES.includes(targetOutcome)) {
        return { valid: false, error: `Invalid outcome: '${targetOutcome}'. Allowed: ${OUTCOMES.join(', ')}` };
    }

    if (currentOutcome === 'Withdrawn') {
        return { valid: false, error: 'Cannot update a withdrawn application' };
    }

    // Reason code mandatory for Rejected or Waitlisted
    if (['Rejected', 'Waitlisted'].includes(targetOutcome)) {
        if (!reasonCode || !REASON_CODES.includes(reasonCode)) {
            return {
                valid: false,
                error: `Reason code is required when marking an applicant as '${targetOutcome}'. Allowed: ${REASON_CODES.join(', ')}`
            };
        }
    }

    return { valid: true };
};

/**
 * Validate moving an application to a target stage
 * @param {string} currentStageId
 * @param {string} targetStageId
 * @param {Array} driveStages
 * @returns {{ valid: boolean, error?: string }}
 */
const validateStageTransition = (currentStageId, targetStageId, driveStages) => {
    const stages = normalizeStages(driveStages);
    const target = stages.find(s => s.id === targetStageId);
    if (!target) {
        return {
            valid: false,
            error: `Target stage '${targetStageId}' does not exist in this recruitment drive`
        };
    }
    return { valid: true, targetStage: target };
};

/**
 * Derive legacy status string from stage + outcome for backward compatibility
 */
const mapOutcomeToLegacyStatus = (outcome, stageId, driveStages) => {
    if (outcome === 'Selected') return 'Selected';
    if (outcome === 'Rejected') return 'Rejected';
    if (outcome === 'Waitlisted') return 'Shortlisted';
    if (outcome === 'Withdrawn') return 'Applied';

    const stages = normalizeStages(driveStages);
    const currentIndex = stages.findIndex(s => s.id === stageId);

    if (outcome === 'Advanced') {
        if (currentIndex === stages.length - 1) return 'Shortlisted';
        return 'Under Review';
    }

    // Pending
    if (currentIndex <= 0) return 'Applied';
    return 'Under Review';
};

module.exports = {
    OUTCOMES,
    OFFER_STATES,
    REASON_CODES,
    REASON_LABELS,
    DEFAULT_STAGES,
    normalizeStages,
    validateOutcomeTransition,
    validateStageTransition,
    mapOutcomeToLegacyStatus
};

