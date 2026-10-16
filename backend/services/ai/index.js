/**
 * services/ai/index.js — AI Service Gateway
 *
 * Dispatches to Claude SDK/HTTP or Mock Adapter based on configuration.
 * Logs token usage to ai_usage_log for cost auditing.
 */

const mockClient = require('./mockClient');
const claudeClient = require('./claudeClient');

const DISCLAIMER = 'AI-generated evaluation to assist, not replace, human reviewers.';

function getAdapter() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const adapterMode = process.env.AI_ADAPTER;

    if (apiKey && adapterMode !== 'mock') {
        return { client: claudeClient, apiKey };
    }
    return { client: mockClient, apiKey: null };
}

function logUsage(db, { userId, feature, model, inputTokens = 0, outputTokens = 0, totalTokens = 0 }) {
    if (!db) return Promise.resolve();
    return new Promise((resolve) => {
        db.run(
            `INSERT INTO ai_usage_log (user_id, feature, model, input_tokens, output_tokens, total_tokens)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId || null, feature, model || 'unknown', inputTokens, outputTokens, totalTokens || (inputTokens + outputTokens)],
            (err) => {
                if (err) console.error('Failed to log AI usage:', err.message);
                resolve();
            }
        );
    });
}

const aiService = {
    DISCLAIMER,

    async draftRubric({ category, description, roleTitle }, userId, db) {
        const { client, apiKey } = getAdapter();
        const result = await client.draftRubric({ category, description, roleTitle }, apiKey);

        await logUsage(db, {
            userId,
            feature: 'draft_rubric',
            model: result.model,
            inputTokens: result.input_tokens,
            outputTokens: result.output_tokens,
            totalTokens: result.tokens_used
        });

        return result;
    },

    async evaluateApplication({ rubric, application, student }, userId, db) {
        const { client, apiKey } = getAdapter();
        const result = await client.evaluateApplication({ rubric, application, student }, apiKey);

        await logUsage(db, {
            userId,
            feature: 'evaluate_application',
            model: result.model,
            inputTokens: result.input_tokens,
            outputTokens: result.output_tokens,
            totalTokens: result.tokens_used
        });

        return {
            ...result,
            disclaimer: DISCLAIMER
        };
    },

    async draftEmail({ application, student, drive, club, outcome, feedback }, userId, db) {
        const { client, apiKey } = getAdapter();
        const result = await client.draftEmail({ application, student, drive, club, outcome, feedback }, apiKey);

        await logUsage(db, {
            userId,
            feature: 'draft_email',
            model: result.model,
            inputTokens: result.input_tokens,
            outputTokens: result.output_tokens,
            totalTokens: result.tokens_used
        });

        return result;
    }
};

module.exports = aiService;

