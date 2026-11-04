/**
 * services/ai/geminiService.js — High-level Gemini AI Screening Service
 *
 * Orchestrates:
 *  - Automated candidate screening upon application submission
 *  - Weighted score calculation (40% skills, 25% portfolio, 20% experience, 15% availability)
 *  - Configurable rejection threshold (default 30%)
 *  - Safe fallback to NEEDS_REVIEW whenever information is missing or API errors occur
 *  - Preventing duplicate evaluations on identical versions
 *  - Coordinator manual overrides with audit logging
 */

const { evaluateWithGemini } = require('./geminiClient');

const DEFAULT_THRESHOLD = 30.0;

/**
 * Calculates weighted final score
 * skillMatch * 0.40 + portfolioRelevance * 0.25 + experience * 0.20 + availability * 0.15
 */
function calculateFinalScore({ skillMatch = 0, portfolioRelevance = 0, experience = 0, availability = 0 }) {
    const weighted = (skillMatch * 0.40) + (portfolioRelevance * 0.25) + (experience * 0.20) + (availability * 0.15);
    return Math.max(0, Math.min(100, Math.round(weighted * 10) / 10));
}

/**
 * Screens an application against drive requirements
 *
 * @param {object} params
 * @param {object} params.db - SQLite database instance
 * @param {number} params.applicationId - Application ID
 * @param {boolean} [params.force=false] - Whether to re-run even if already evaluated
 * @param {number} [params.coordinatorId=null] - Coordinator user ID if manual trigger
 * @returns {Promise<object>} Evaluation and screening decision
 */
async function screenApplication({ db, applicationId, force = false, coordinatorId = null }) {
    if (!db) throw new Error('Database connection required for screening');

    // Fetch application, drive, and student info
    const app = await new Promise((resolve, reject) => {
        db.get(`
            SELECT a.*,
                   rd.title AS drive_title, rd.description AS drive_description,
                   rd.required_skills, rd.preferred_skills, rd.eligibility,
                   rd.screening_threshold, rd.club_id,
                   u.skills AS user_skills, u.projects AS user_projects,
                   u.achievements AS user_achievements, u.department, u.year
            FROM applications a
            JOIN recruitment_drives rd ON a.drive_id = rd.id
            LEFT JOIN users u ON a.student_id = u.id
            WHERE a.id = ?
        `, [applicationId], (err, row) => err ? reject(err) : resolve(row));
    });

    if (!app) {
        throw new Error(`Application #${applicationId} not found`);
    }

    // Prevent duplicate evaluations unless forced
    if (app.ai_evaluated_at && app.screening_status && app.screening_status !== 'pending' && !force) {
        return {
            applicationId,
            alreadyEvaluated: true,
            screening_status: app.screening_status,
            ai_score: app.ai_score,
            explanation: app.ai_explanation,
            strengths: JSON.parse(app.ai_strengths_json || '[]'),
            missingSkills: JSON.parse(app.ai_missing_skills_json || '[]'),
            needsReview: Boolean(app.ai_needs_review),
            reviewReason: app.ai_review_reason || ''
        };
    }

    const threshold = Number(app.screening_threshold) > 0 ? Number(app.screening_threshold) : DEFAULT_THRESHOLD;
    const apiKey = process.env.GEMINI_API_KEY || null;

    const driveData = {
        title: app.drive_title,
        description: app.drive_description,
        required_skills: app.required_skills,
        preferred_skills: app.preferred_skills,
        eligibility: app.eligibility
    };

    const applicationData = {
        motivation: app.motivation,
        experience: app.experience,
        skills: app.skills,
        portfolio_url: app.portfolio_url
    };

    const studentProfile = {
        skills: app.user_skills,
        projects: app.user_projects,
        achievements: app.user_achievements,
        department: app.department,
        year: app.year
    };

    // Run evaluation via Gemini SDK
    const rawResult = await evaluateWithGemini(
        { drive: driveData, application: applicationData, studentProfile },
        apiKey
    );

    const finalScore = calculateFinalScore(rawResult);

    // Decision rules
    let screeningStatus;
    let newAppStatus = app.status;
    let newOutcome = app.outcome || 'Pending';
    let rejectionReasonCode = app.rejection_reason_code || null;
    let rejectionFeedback = app.rejection_feedback || null;

    if (rawResult.needsReview) {
        // Missing info, API error, or uncertain evaluation: NEVER automatically reject!
        screeningStatus = 'needs_review';
        newAppStatus = 'Under Review';
        newOutcome = 'Pending';
    } else if (finalScore < threshold) {
        // Score strictly below threshold
        screeningStatus = 'rejected';
        newAppStatus = 'Rejected';
        newOutcome = 'Rejected';
        rejectionReasonCode = 'skill_mismatch';
        rejectionFeedback = rawResult.explanation;
    } else {
        // Passed screening
        screeningStatus = 'passed';
        newAppStatus = 'Under Review';
        newOutcome = 'Pending';
    }

    // Persist to applications table
    await new Promise((resolve, reject) => {
        db.run(`
            UPDATE applications
            SET ai_score = ?,
                ai_skill_match = ?,
                ai_portfolio_relevance = ?,
                ai_experience = ?,
                ai_availability = ?,
                ai_explanation = ?,
                ai_strengths_json = ?,
                ai_missing_skills_json = ?,
                ai_needs_review = ?,
                ai_review_reason = ?,
                screening_status = ?,
                screening_threshold_used = ?,
                ai_evaluated_at = CURRENT_TIMESTAMP,
                status = ?,
                outcome = ?,
                rejection_reason_code = ?,
                rejection_feedback = ?,
                decision_date = CASE WHEN ? = 'Rejected' THEN CURRENT_TIMESTAMP ELSE decision_date END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            finalScore,
            rawResult.skillMatch,
            rawResult.portfolioRelevance,
            rawResult.experience,
            rawResult.availability,
            rawResult.explanation,
            JSON.stringify(rawResult.strengths || []),
            JSON.stringify(rawResult.missingSkills || []),
            rawResult.needsReview ? 1 : 0,
            rawResult.reviewReason || null,
            screeningStatus,
            threshold,
            newAppStatus,
            newOutcome,
            rejectionReasonCode,
            rejectionFeedback,
            newAppStatus,
            applicationId
        ], (err) => err ? reject(err) : resolve());
    });

    // Also record in ai_evaluations table for backward-compatible history
    await new Promise((resolve) => {
        db.run(`
            INSERT INTO ai_evaluations
                (application_id, scores_json, total_score, strengths_json, growth_areas_json,
                 suggested_questions_json, flags_json, summary, model, tokens_used)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            applicationId,
            JSON.stringify({
                skillMatch: rawResult.skillMatch,
                portfolioRelevance: rawResult.portfolioRelevance,
                experience: rawResult.experience,
                availability: rawResult.availability
            }),
            finalScore,
            JSON.stringify(rawResult.strengths || []),
            JSON.stringify(rawResult.missingSkills || []),
            JSON.stringify([]),
            JSON.stringify(rawResult.needsReview ? [rawResult.reviewReason] : []),
            rawResult.explanation,
            rawResult.model || 'gemini',
            rawResult.tokensUsed || 0
        ], (err) => {
            if (err) console.error('Failed to insert ai_evaluations entry:', err.message);
            resolve();
        });
    });

    // Log AI token usage for admin audit
    if (rawResult.tokensUsed > 0) {
        await new Promise((resolve) => {
            db.run(`
                INSERT INTO ai_usage_log
                    (user_id, feature, model, input_tokens, output_tokens, total_tokens)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                coordinatorId || null,
                'application_screening',
                rawResult.model || 'gemini',
                Math.round(rawResult.tokensUsed * 0.7),
                Math.round(rawResult.tokensUsed * 0.3),
                rawResult.tokensUsed
            ], () => resolve());
        });
    }

    return {
        applicationId,
        finalScore,
        skillMatch: rawResult.skillMatch,
        portfolioRelevance: rawResult.portfolioRelevance,
        experience: rawResult.experience,
        availability: rawResult.availability,
        explanation: rawResult.explanation,
        strengths: rawResult.strengths,
        missingSkills: rawResult.missingSkills,
        needsReview: rawResult.needsReview,
        reviewReason: rawResult.reviewReason,
        screening_status: screeningStatus,
        status: newAppStatus,
        outcome: newOutcome,
        thresholdUsed: threshold,
        evaluatedAt: new Date().toISOString()
    };
}

/**
 * Allows a coordinator to manually override an AI screening decision
 */
async function overrideScreening({ db, applicationId, newStatus, reason, coordinatorId }) {
    if (!db) throw new Error('Database connection required');
    if (!applicationId || !newStatus) throw new Error('Application ID and new status required');

    let derivedOutcome = 'Pending';
    if (newStatus === 'Selected') derivedOutcome = 'Selected';
    else if (newStatus === 'Rejected') derivedOutcome = 'Rejected';
    else if (newStatus === 'Shortlisted') derivedOutcome = 'Advanced';

    await new Promise((resolve, reject) => {
        db.run(`
            UPDATE applications
            SET status = ?,
                outcome = ?,
                manual_override = 1,
                override_reason = ?,
                overridden_by = ?,
                overridden_at = CURRENT_TIMESTAMP,
                decision_date = CASE WHEN ? IN ('Selected', 'Rejected') THEN CURRENT_TIMESTAMP ELSE decision_date END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            newStatus,
            derivedOutcome,
            reason || 'Coordinator manual override of AI evaluation',
            coordinatorId,
            newStatus,
            applicationId
        ], function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });

    return { success: true, applicationId, newStatus, derivedOutcome };
}

module.exports = {
    DEFAULT_THRESHOLD,
    calculateFinalScore,
    screenApplication,
    overrideScreening
};

