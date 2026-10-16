const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken, requireRole } = require('../middlewares/authMiddleware');
const { withTransaction } = require('../utils/mutationBoundary');
const aiService = require('../services/ai');

// ── POST /draft-rubric — AI-assisted rubric generation ───────────────────────
router.post('/draft-rubric', authenticateToken, requireRole('coordinator'), withTransaction(db, 'ai.rubric_drafted', 'ai'), async (req, res) => {
    try {
        const { category = 'technical', description = '', role_title = '' } = req.body || {};
        const result = await aiService.draftRubric({
            category,
            description,
            roleTitle: role_title
        }, req.user.id, db);

        req.activityEntityId = req.user.id;
        req.activityAfterJson = { category, criteriaCount: result.criteria?.length, model: result.model };

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to generate rubric' });
    }
});

// ── GET /usage — Aggregated token metrics (Admin) ─────────────────────────────
router.get('/usage', authenticateToken, requireRole('admin'), (req, res) => {
    db.all(`
        SELECT feature, model,
               COUNT(*) AS calls_count,
               SUM(input_tokens) AS total_input_tokens,
               SUM(output_tokens) AS total_output_tokens,
               SUM(total_tokens) AS total_tokens
        FROM ai_usage_log
        GROUP BY feature, model
        ORDER BY total_tokens DESC
    `, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch AI usage statistics' });
        res.json(rows || []);
    });
});

// ── GET /usage/history — Recent token logs (Admin) ───────────────────────────
router.get('/usage/history', authenticateToken, requireRole('admin'), (req, res) => {
    db.all(`
        SELECT l.*, u.name AS user_name, u.email AS user_email
        FROM ai_usage_log l
        LEFT JOIN users u ON l.user_id = u.id
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT 50
    `, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch AI usage history' });
        res.json(rows || []);
    });
});

module.exports = router;

