/**
 * services/ai/mockClient.js — Offline / Test AI Adapter
 *
 * Produces deterministic, high-quality recruitment rubrics, application evaluations,
 * and email drafts without network calls or external API keys.
 */

const { detectInjectionAttempt, scrubPII } = require('./promptGuard');

const mockClient = {
    async draftRubric({ category = 'technical', description = '', roleTitle = '' }) {
        const cat = (category || 'technical').toLowerCase();
        let criteria;

        if (cat.includes('cult') || cat.includes('art') || cat.includes('music') || cat.includes('dance') || cat.includes('drama')) {
            criteria = [
                { criterion: 'Artistic Expression & Creativity', description: 'Originality, emotional resonance, and creative depth', weight: 35 },
                { criterion: 'Technical Execution & Skill', description: 'Foundational technique, precision, and mastery of form', weight: 25 },
                { criterion: 'Commitment & Availability', description: 'Rehearsal consistency, reliability, and event dedication', weight: 20 },
                { criterion: 'Ensemble Collaboration & Fit', description: 'Receptiveness to direction and team synchronization', weight: 20 }
            ];
        } else if (cat.includes('sport') || cat.includes('fit') || cat.includes('athle')) {
            criteria = [
                { criterion: 'Physical Conditioning & Skill', description: 'Stamina, agility, and sport-specific technical prowess', weight: 35 },
                { criterion: 'Tactical Game IQ', description: 'Situational decision making and positional awareness', weight: 25 },
                { criterion: 'Sportsmanship & Teamwork', description: 'Fair play, respect for peers and coaches, and positive attitude', weight: 20 },
                { criterion: 'Discipline & Consistency', description: 'Regularity in training sessions and match readiness', weight: 20 }
            ];
        } else if (cat.includes('lit') || cat.includes('debat') || cat.includes('mun') || cat.includes('media')) {
            criteria = [
                { criterion: 'Articulation & Verbal Clarity', description: 'Structured arguments, persuasive rhetoric, and clarity of thought', weight: 35 },
                { criterion: 'Research & Domain Knowledge', description: 'Depth of background research and factual command', weight: 25 },
                { criterion: 'Presence & Composure', description: 'Confidence under pressure and adaptability during rebuttal/impromptu prompts', weight: 20 },
                { criterion: 'Team Collaboration', description: 'Constructive participation in group discussions and committee work', weight: 20 }
            ];
        } else {
            // Default Technical criteria
            criteria = [
                { criterion: 'Technical Competence', description: 'Proficiency in relevant languages, frameworks, and engineering tools', weight: 35 },
                { criterion: 'Problem Solving & Logic', description: 'Analytical reasoning, architectural sensibility, and debugging acumen', weight: 25 },
                { criterion: 'Project Depth & Execution', description: 'Demonstrated hands-on experience and quality of previous projects', weight: 20 },
                { criterion: 'Communication & Culture Fit', description: 'Ability to explain ideas clearly and contribute effectively to team projects', weight: 20 }
            ];
        }

        // If a specific roleTitle was supplied, incorporate it in the first criterion description
        if (roleTitle) {
            criteria[0].description += ` specifically for the ${roleTitle} role`;
        }

        return {
            criteria,
            model: 'mock-claude-3-5-sonnet',
            input_tokens: 180,
            output_tokens: 140,
            tokens_used: 320
        };
    },

    async evaluateApplication({ rubric = [], application = {}, student = {} }) {
        const rawMotivation = application.motivation || '';
        const scrubbedMotivation = scrubPII(rawMotivation);
        const hasInjection = detectInjectionAttempt(rawMotivation);

        const skills = typeof student.skills === 'string' ? JSON.parse(student.skills || '[]') : (student.skills || []);
        const projects = typeof student.projects === 'string' ? JSON.parse(student.projects || '[]') : (student.projects || []);
        const achievements = typeof student.achievements === 'string' ? JSON.parse(student.achievements || '[]') : (student.achievements || []);

        const parsedRubric = Array.isArray(rubric) && rubric.length > 0 ? rubric : [
            { criterion: 'Domain Skills', weight: 40 },
            { criterion: 'Communication', weight: 30 },
            { criterion: 'Problem Solving', weight: 30 }
        ];

        const scores = {};
        let weightedSum = 0;
        let totalWeight = 0;

        parsedRubric.forEach(c => {
            const weight = Number(c.weight) || 0;
            totalWeight += weight;
            let score;

            if (hasInjection) {
                // Heavily penalize prompt injection attempt
                score = 30;
            } else {
                // Realistic mock scoring based on submission richness
                let base = 75;
                if (skills.length > 3) base += 5;
                if (projects.length > 0) base += 5;
                if (achievements.length > 0) base += 4;
                if (rawMotivation.length > 150) base += 4;
                // Add pseudo-deterministic variation based on criterion name length
                const variation = (c.criterion.length % 7) - 3;
                score = Math.min(95, Math.max(60, base + variation));
            }

            scores[c.criterion] = score;
            weightedSum += (score * weight);
        });

        const totalScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 75;

        const flags = [];
        if (hasInjection) {
            flags.push('Detected potential prompt manipulation or override instruction in candidate answers');
        }

        const strengths = [];
        if (skills.length > 0) {
            strengths.push(`Relevant skills demonstrated: ${skills.slice(0, 3).join(', ')}`);
        }
        if (projects.length > 0) {
            strengths.push(`Practical hands-on experience through project: "${projects[0].name || 'Personal Project'}"`);
        }
        if (rawMotivation.length > 80 && !hasInjection) {
            strengths.push('Articulate personal motivation demonstrating genuine interest in the club');
        }
        if (strengths.length === 0) {
            strengths.push('Candidate submitted a complete application profile');
        }

        const growthAreas = [];
        if (projects.length === 0) {
            growthAreas.push('No documented portfolio projects provided in profile');
        }
        if (skills.length < 3) {
            growthAreas.push('Could expand breadth of relevant technical/domain skills');
        }
        if (growthAreas.length === 0) {
            growthAreas.push('Assess production-readiness and deadline management during interview');
        }

        const suggestedQuestions = [];
        if (projects.length > 0) {
            suggestedQuestions.push(`Can you walk us through the architecture and key challenges you faced when building "${projects[0].name || 'your project'}"?`);
        } else {
            suggestedQuestions.push('What is a challenging problem or project you have tackled recently, and how did you approach it?');
        }
        suggestedQuestions.push('How do you plan to balance club responsibilities and event deliverables with your academic coursework?');

        const summary = hasInjection
            ? 'Application contains text attempting to manipulate the automated evaluation. Manual review strongly recommended.'
            : `Promising applicant with a solid weighted score of ${totalScore}/100. Shows good alignment with club expectations and active motivation.`;

        return {
            scores,
            total_score: totalScore,
            strengths,
            growth_areas: growthAreas,
            suggested_questions: suggestedQuestions,
            flags,
            summary,
            model: 'mock-claude-3-5-sonnet',
            input_tokens: 420,
            output_tokens: 280,
            tokens_used: 700
        };
    },

    async draftEmail({ application = {}, student = {}, drive = {}, club = {}, outcome = 'Advanced', feedback = '' }) {
        const studentName = student.name || 'Candidate';
        const clubName = club.name || 'our club';
        const driveTitle = drive.title || 'Recruitment Drive';

        let subject;
        let body;

        switch (outcome) {
            case 'Selected':
                subject = `Congratulations! Offer to join ${clubName} — ${driveTitle}`;
                body = `Dear ${studentName},\n\nWe are delighted to inform you that you have been Selected to join ${clubName} for the ${driveTitle}!\n\nThe panel was thoroughly impressed by your performance and potential. Please log in to your CreativeRecruit dashboard to review your offer details and confirm your acceptance.\n\nWelcome to the team!\n\nWarm regards,\n${clubName} Recruitment Team`;
                break;
            case 'Waitlisted':
                subject = `Update on your application for ${clubName} — ${driveTitle}`;
                body = `Dear ${studentName},\n\nThank you for your interest in joining ${clubName} and taking the time to participate in ${driveTitle}.\n\nAt this time, we have placed your application on our Waitlist. Our seat capacity is currently reached, but spots may open up as offers are confirmed. We will reach out immediately if a position becomes available.\n\n${feedback ? `Reviewer feedback: "${feedback}"\n\n` : ''}Thank you for your enthusiasm and effort.\n\nWarm regards,\n${clubName} Recruitment Team`;
                break;
            case 'Rejected':
                subject = `Update regarding your ${clubName} application — ${driveTitle}`;
                body = `Dear ${studentName},\n\nThank you for applying to ${clubName} and participating in ${driveTitle}.\n\nAfter careful consideration by our panel, we regret to inform you that we are unable to offer you a position at this time due to high competition and limited openings.\n\n${feedback ? `Constructive feedback for your growth:\n${feedback}\n\n` : ''}We encourage you to continue developing your skills and look forward to seeing your application in future seasons.\n\nWarm regards,\n${clubName} Recruitment Team`;
                break;
            default: // Advanced / Shortlisted
                subject = `Next Steps: ${clubName} Recruitment — ${driveTitle}`;
                body = `Dear ${studentName},\n\nCongratulations! We are pleased to inform you that your application for ${driveTitle} has been Advanced to the next stage.\n\nPlease check your student dashboard for upcoming interview schedules or task details.\n\nBest of luck!\n\nWarm regards,\n${clubName} Recruitment Team`;
                break;
        }

        return {
            subject,
            body,
            model: 'mock-claude-3-5-sonnet',
            input_tokens: 150,
            output_tokens: 180,
            tokens_used: 330
        };
    }
};

module.exports = mockClient;

