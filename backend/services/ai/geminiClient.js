/**
 * services/ai/geminiClient.js — Google Gemini SDK Client for Application Screening
 *
 * Uses the official @google/genai SDK to evaluate candidate applications
 * against recruitment drive requirements and rubrics.
 *
 * Evaluation Weights:
 *  - Skill match: 40%
 *  - Portfolio relevance: 25%
 *  - Relevant experience: 20%
 *  - Availability: 15%
 */

const { GoogleGenAI, Type } = require('@google/genai');
const { scrubPII, wrapInDelimiters } = require('./promptGuard');

const DEFAULT_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-3-flash-preview';
const REQUEST_TIMEOUT_MS = 20000;


const SYSTEM_PROMPT_SCREENING = `You are an objective, unbiased AI recruiting evaluation assistant for college club recruitments.
Your role is to evaluate student candidate applications against specific club recruitment drive requirements.

EVALUATION CATEGORIES AND WEIGHTS:
1. Skill Match (40% weight): Compare the student's claimed and demonstrated skills strictly against the required and preferred skills of the drive. Do NOT invent skills.
2. Portfolio Relevance (25% weight): Evaluate the relevance and quality of the portfolio and past projects based ONLY on what was actually provided.
3. Relevant Experience (20% weight): Assess practical, club, project, or domain experience relevant to the role. Do NOT assume or invent experience.
4. Availability (15% weight): Assess commitment and availability only if stated by the candidate. Do NOT assume availability if not provided.

CRITICAL RULES:
- Base scoring ONLY on evidence provided in the application and profile.
- If important information is missing or the submission lacks sufficient details to judge fairly, set "needsReview": true and provide a clear "reviewReason" instead of assigning an unfair zero.
- NEVER use gender, religion, caste, ethnicity, nationality, disability, age, photographs, or personal identity factors in scoring.
- Do NOT use the candidate's name or personal background in scoring.
- Provide a concise, professional explanation suitable for review.
- Suggest concrete strengths and missing required skills.

RETURN SCHEMA:
You MUST return valid JSON matching the exact schema:
{
  "skillMatch": number (0 to 100),
  "portfolioRelevance": number (0 to 100),
  "experience": number (0 to 100),
  "availability": number (0 to 100),
  "explanation": "Short, objective explanation of the evaluation",
  "strengths": ["string"],
  "missingSkills": ["string"],
  "needsReview": boolean,
  "reviewReason": "string"
}`;

/**
 * Validates and clamps a numeric score between 0 and 100
 */
function parseScore(val) {
    if (typeof val !== 'number' || isNaN(val)) {
        const num = parseFloat(val);
        if (isNaN(num)) return null;
        val = num;
    }
    return Math.max(0, Math.min(100, Math.round(val * 10) / 10));
}

/**
 * Validates and sanitizes structured evaluation output
 */
function validateEvaluationOutput(raw) {
    if (!raw || typeof raw !== 'object') {
        return {
            skillMatch: 0,
            portfolioRelevance: 0,
            experience: 0,
            availability: 0,
            explanation: 'Application requires manual review by coordinators.',
            strengths: [],
            missingSkills: [],
            needsReview: true,
            reviewReason: 'Malformed AI response'
        };
    }

    const skillMatch = parseScore(raw.skillMatch);
    const portfolioRelevance = parseScore(raw.portfolioRelevance);
    const experience = parseScore(raw.experience);
    const availability = parseScore(raw.availability);

    // If any core score is completely missing/invalid, mark as needsReview
    const hasInvalidScore = [skillMatch, portfolioRelevance, experience, availability].some(s => s === null);

    const strengths = Array.isArray(raw.strengths)
        ? raw.strengths.filter(s => typeof s === 'string' && s.trim().length > 0).slice(0, 5)
        : [];

    const missingSkills = Array.isArray(raw.missingSkills)
        ? raw.missingSkills.filter(s => typeof s === 'string' && s.trim().length > 0).slice(0, 5)
        : [];

    const explanation = typeof raw.explanation === 'string' && raw.explanation.trim()
        ? raw.explanation.trim()
        : 'Application evaluated against role requirements.';

    const needsReview = Boolean(raw.needsReview) || hasInvalidScore;
    const reviewReason = raw.reviewReason && typeof raw.reviewReason === 'string'
        ? raw.reviewReason.trim()
        : (hasInvalidScore ? 'Uncertain or incomplete score breakdown' : '');

    return {
        skillMatch: skillMatch ?? 0,
        portfolioRelevance: portfolioRelevance ?? 0,
        experience: experience ?? 0,
        availability: availability ?? 0,
        explanation,
        strengths,
        missingSkills,
        needsReview,
        reviewReason
    };
}

/**
 * Evaluates candidate application with Google Gemini
 */
async function evaluateWithGemini({ drive, application, studentProfile }, apiKey = process.env.GEMINI_API_KEY) {
    if (!apiKey) {
        return {
            skillMatch: 0,
            portfolioRelevance: 0,
            experience: 0,
            availability: 0,
            explanation: 'Gemini API key is not configured. Application routed to manual coordinator review.',
            strengths: [],
            missingSkills: [],
            needsReview: true,
            reviewReason: 'Gemini API key not configured',
            model: 'none',
            tokensUsed: 0
        };
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

    // Prepare role requirements (from drive)
    const roleInfo = {
        title: drive.title || 'Club Role',
        description: drive.description || '',
        required_skills: drive.required_skills ? (typeof drive.required_skills === 'string' ? drive.required_skills : JSON.stringify(drive.required_skills)) : 'General member skills',
        preferred_skills: drive.preferred_skills || '',
        eligibility: drive.eligibility || 'Open to all students'
    };

    // Scrub student PII before passing to Gemini
    const scrubbedMotivation = scrubPII(application.motivation || '');
    const scrubbedExperience = scrubPII(application.experience || '');
    const candidateSkills = application.skills || studentProfile?.skills || '';

    // Projects summary without private details
    let projectsList = [];
    try {
        const rawProjects = studentProfile?.projects;
        if (typeof rawProjects === 'string') projectsList = JSON.parse(rawProjects);
        else if (Array.isArray(rawProjects)) projectsList = rawProjects;
    } catch {}

    const safeProjects = projectsList.map(p => ({
        title: p.title || p.name || 'Project',
        tech_stack: p.tech_stack || p.skills || '',
        description: scrubPII(p.description || '')
    }));

    const userPrompt = `EVALUATE THIS CANDIDATE FOR THE ROLE BELOW:

ROLE REQUIREMENTS:
- Position/Title: ${roleInfo.title}
- Required Skills: ${roleInfo.required_skills}
- Preferred Skills: ${roleInfo.preferred_skills || 'None specified'}
- Role Description: ${roleInfo.description}
- Eligibility Criteria: ${roleInfo.eligibility}

CANDIDATE SUBMISSION DATA:
- Candidate Skills: ${typeof candidateSkills === 'string' ? candidateSkills : JSON.stringify(candidateSkills)}
- Candidate Experience: ${scrubbedExperience || 'None specified in application'}
- Portfolio Link: ${application.portfolio_url ? '[Provided: Verified Link]' : 'None provided'}
- Projects Summary: ${JSON.stringify(safeProjects)}
- Candidate Motivation & Answers:
${wrapInDelimiters(scrubbedMotivation, 'candidate_statement')}

Evaluate strictly against the 4 categories (skillMatch, portfolioRelevance, experience, availability).`;

    let response;
    let actualModel = model;
    try {
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Gemini API call timed out')), REQUEST_TIMEOUT_MS)
        );

        const callModel = (targetModel) => ai.models.generateContent({
            model: targetModel,
            contents: userPrompt,
            config: {
                systemInstruction: SYSTEM_PROMPT_SCREENING,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        skillMatch: { type: Type.NUMBER, description: 'Score from 0 to 100 for required and preferred skills match' },
                        portfolioRelevance: { type: Type.NUMBER, description: 'Score from 0 to 100 for portfolio and past projects relevance' },
                        experience: { type: Type.NUMBER, description: 'Score from 0 to 100 for relevant domain experience' },
                        availability: { type: Type.NUMBER, description: 'Score from 0 to 100 for commitment and availability' },
                        explanation: { type: Type.STRING, description: 'Short objective evaluation summary' },
                        strengths: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: 'Key candidate strengths'
                        },
                        missingSkills: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: 'Missing required skills for the role'
                        },
                        needsReview: { type: Type.BOOLEAN, description: 'Whether application lacks sufficient information or requires human review' },
                        reviewReason: { type: Type.STRING, description: 'Reason for review if needsReview is true' }
                    },
                    required: ['skillMatch', 'portfolioRelevance', 'experience', 'availability', 'explanation', 'strengths', 'missingSkills', 'needsReview']
                }
            }
        });

        try {
            response = await Promise.race([callModel(actualModel), timeoutPromise]);
        } catch (firstErr) {
            // Handle deprecated or unavailable model by falling back to modern preview/available models
            const errStr = (firstErr?.message || '').toLowerCase();
            if (errStr.includes('no longer available') || errStr.includes('not found') || errStr.includes('404')) {
                console.warn(`Model ${actualModel} unavailable, falling back to gemini-3-flash-preview...`);
                actualModel = 'gemini-3-flash-preview';
                response = await Promise.race([callModel(actualModel), timeoutPromise]);
            } else {
                throw firstErr;
            }
        }
    } catch (apiErr) {
        console.error('Gemini API error during screening:', apiErr.message || apiErr);
        return {
            skillMatch: 0,
            portfolioRelevance: 0,
            experience: 0,
            availability: 0,
            explanation: 'Automated screening was temporarily unavailable. Routed to coordinator review.',
            strengths: [],
            missingSkills: [],
            needsReview: true,
            reviewReason: `AI Service Error: ${apiErr.message || 'Call failed'}`,
            model: actualModel,
            tokensUsed: 0
        };
    }

    const text = response?.text || '';
    let parsed;
    try {
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
        parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
        console.error('Failed to parse Gemini screening response:', text);
        return {
            skillMatch: 0,
            portfolioRelevance: 0,
            experience: 0,
            availability: 0,
            explanation: 'Evaluation output was unparseable. Routed to coordinator review.',
            strengths: [],
            missingSkills: [],
            needsReview: true,
            reviewReason: 'Malformed AI response format',
            model: actualModel,
            tokensUsed: 0
        };
    }

    const validated = validateEvaluationOutput(parsed);
    const tokensUsed = response?.usageMetadata?.totalTokenCount || 0;

    return {
        ...validated,
        model: actualModel,
        tokensUsed
    };
}

module.exports = {
    DEFAULT_MODEL,
    REQUEST_TIMEOUT_MS,
    validateEvaluationOutput,
    evaluateWithGemini
};

