/**
 * services/ai/claudeClient.js — Anthropic Claude SDK / HTTP Adapter
 */

const {
    scrubPII,
    wrapInDelimiters,
    SYSTEM_PROMPT_EVALUATION,
    SYSTEM_PROMPT_RUBRIC,
    SYSTEM_PROMPT_EMAIL
} = require('./promptGuard');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

async function callClaude({ systemPrompt, userPrompt, model, maxTokens = 1500, apiKey }) {
    const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model: model || process.env.AI_MODEL || 'claude-3-5-sonnet-20241022',
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
        })
    });

    if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Anthropic API error (${res.status}): ${errorBody}`);
    }

    const data = await res.json();
    const content = data.content?.[0]?.text || '';
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;

    // Parse JSON from text
    let parsed;
    try {
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
        parsed = JSON.parse(jsonStr);
    } catch {
        throw new Error(`Failed to parse Claude response as JSON: ${content}`);
    }

    return {
        ...parsed,
        model: data.model || model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        tokens_used: inputTokens + outputTokens
    };
}

const claudeClient = {
    async draftRubric({ category, description, roleTitle }, apiKey) {
        const userPrompt = `Create an evaluation rubric for a college club recruitment drive.
Club Category: ${category || 'Technical'}
Role/Position: ${roleTitle || 'General Member'}
Drive Description: ${description || 'Not specified'}`;

        return callClaude({
            systemPrompt: SYSTEM_PROMPT_RUBRIC,
            userPrompt,
            apiKey
        });
    },

    async evaluateApplication({ rubric, application, student }, apiKey) {
        const scrubbedMotivation = scrubPII(application.motivation || '');
        const studentInfo = {
            department: student.department,
            year: student.year,
            skills: typeof student.skills === 'string' ? JSON.parse(student.skills || '[]') : (student.skills || []),
            projects: typeof student.projects === 'string' ? JSON.parse(student.projects || '[]') : (student.projects || []),
            achievements: typeof student.achievements === 'string' ? JSON.parse(student.achievements || '[]') : (student.achievements || [])
        };

        const userPrompt = `Evaluate this applicant submission against the drive rubric.

RUBRIC CRITERIA:
${JSON.stringify(rubric, null, 2)}

CANDIDATE BACKGROUND:
Department: ${studentInfo.department}
Year: ${studentInfo.year}
Skills: ${studentInfo.skills.join(', ')}
Projects: ${JSON.stringify(studentInfo.projects)}
Achievements: ${JSON.stringify(studentInfo.achievements)}

STUDENT MOTIVATION & APPLICATION SUBMISSION:
${wrapInDelimiters(scrubbedMotivation)}`;

        return callClaude({
            systemPrompt: SYSTEM_PROMPT_EVALUATION,
            userPrompt,
            apiKey
        });
    },

    async draftEmail({ student, drive, club, outcome, feedback }, apiKey) {
        const userPrompt = `Draft an email for a recruitment applicant.
Candidate Name: ${student.name || 'Candidate'}
Club Name: ${club.name || 'Club'}
Drive Title: ${drive.title || 'Recruitment Drive'}
Decision Outcome: ${outcome}
Reviewer Feedback: ${feedback || 'None provided'}`;

        return callClaude({
            systemPrompt: SYSTEM_PROMPT_EMAIL,
            userPrompt,
            apiKey
        });
    }
};

module.exports = claudeClient;

