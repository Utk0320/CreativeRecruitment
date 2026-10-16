/**
 * routes/analytics.js — Phase 10: Recruitment & Season Analytics API
 *
 * Implements:
 * 1. Overview metrics (Drives, Applications, Offers, Acceptance Rate, Time to Hire)
 * 2. Stage-by-stage recruitment funnel drop-off analysis
 * 3. Applicant demographic distribution (Department, Academic Year)
 * 4. Cross-club performance comparisons (for Admins)
 * 5. Recruitment analytics CSV export
 */

const express = require('express');
const router = express.Router();
const { db } = require('../utils/db');
const { authenticateToken } = require('../middlewares/authMiddleware');
const { can } = require('../utils/can');

const all = (sql, params = []) =>
    new Promise((resolve, reject) =>
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])))
    );

const get = (sql, params = []) =>
    new Promise((resolve, reject) =>
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)))
    );

/**
 * Helper to resolve club authorization filter for coordinator / admin
 */
async function resolveClubScope(user, clubIdParam) {
    if (user.role === 'admin') {
        return clubIdParam ? [Number(clubIdParam)] : null; // null means all clubs
    }

    // Coordinator: find clubs they belong to
    const memberRows = await all(`SELECT club_id FROM club_members WHERE user_id = ?`, [user.id]);
    const userClubIds = memberRows.map(r => r.club_id);

    if (clubIdParam) {
        const targetClubId = Number(clubIdParam);
        if (!userClubIds.includes(targetClubId)) {
            const hasPerm = await can(db, user, 'club.view', { clubId: targetClubId });
            if (!hasPerm) return false; // forbidden
        }
        return [targetClubId];
    }

    return userClubIds;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. OVERVIEW METRICS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/overview', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'coordinator') {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const seasonId = req.query.season_id ? Number(req.query.season_id) : null;
        const clubScope = await resolveClubScope(req.user, req.query.club_id);

        if (clubScope === false) {
            return res.status(403).json({ error: 'Not authorized for this club' });
        }

        let whereClauses = [];
        let params = [];

        if (seasonId) {
            whereClauses.push('rd.season_id = ?');
            params.push(seasonId);
        }
        if (clubScope !== null) {
            if (clubScope.length === 0) {
                return res.json({
                    total_drives: 0,
                    total_applications: 0,
                    total_shortlisted: 0,
                    total_interviewed: 0,
                    total_offers: 0,
                    total_accepted: 0,
                    acceptance_rate: 0,
                    offer_acceptance_rate: 0,
                    avg_time_to_hire_days: 0
                });
            }
            whereClauses.push(`rd.club_id IN (${clubScope.map(() => '?').join(',')})`);
            params.push(...clubScope);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Drive counts
        const driveRow = await get(`
            SELECT COUNT(DISTINCT rd.id) AS total_drives
            FROM recruitment_drives rd
            ${whereSql}
        `, params);

        // Application metrics
        const appRow = await get(`
            SELECT
                COUNT(DISTINCT a.id) AS total_applications,
                COUNT(DISTINCT a.id) FILTER (WHERE a.current_stage_id NOT IN ('screening') OR a.status IN ('Approved', 'Accepted')) AS total_shortlisted,
                COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'Accepted') AS total_accepted
            FROM applications a
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            ${whereSql}
        `, params);

        // Interviews count
        const interviewRow = await get(`
            SELECT COUNT(DISTINCT ib.id) AS total_interviewed
            FROM interview_bookings ib
            JOIN applications a ON a.id = ib.application_id
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            ${whereSql}
        `, params);

        // Offers count
        const offerRow = await get(`
            SELECT
                COUNT(DISTINCT o.id) AS total_offers,
                COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'accepted') AS accepted_offers
            FROM offers o
            JOIN applications a ON a.id = o.application_id
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            ${whereSql}
        `, params);

        // Average time to hire (days from applied_at to offer created_at)
        const timeToHireRow = await get(`
            SELECT AVG(julianday(o.created_at) - julianday(a.applied_at)) AS avg_days
            FROM offers o
            JOIN applications a ON a.id = o.application_id
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            ${whereSql ? whereSql + ' AND' : 'WHERE'} a.applied_at IS NOT NULL AND o.created_at IS NOT NULL
        `, params);

        const totalApplications = appRow ? appRow.total_applications : 0;
        const totalOffers = offerRow ? offerRow.total_offers : 0;
        const totalAccepted = Math.max(appRow ? appRow.total_accepted : 0, offerRow ? offerRow.accepted_offers : 0);

        const acceptanceRate = totalApplications > 0
            ? Math.round((totalAccepted / totalApplications) * 100)
            : 0;

        const offerAcceptanceRate = totalOffers > 0
            ? Math.round((totalAccepted / totalOffers) * 100)
            : 0;

        const avgTimeToHireDays = timeToHireRow && timeToHireRow.avg_days
            ? Math.max(1, Math.round(timeToHireRow.avg_days * 10) / 10)
            : 0;

        res.json({
            total_drives: driveRow ? driveRow.total_drives : 0,
            total_applications: totalApplications,
            total_shortlisted: appRow ? appRow.total_shortlisted : 0,
            total_interviewed: interviewRow ? interviewRow.total_interviewed : 0,
            total_offers: totalOffers,
            total_accepted: totalAccepted,
            acceptance_rate: acceptanceRate,
            offer_acceptance_rate: offerAcceptanceRate,
            avg_time_to_hire_days: avgTimeToHireDays
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load analytics overview' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. RECRUITMENT FUNNEL ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/funnel', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'coordinator') {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const seasonId = req.query.season_id ? Number(req.query.season_id) : null;
        const driveId = req.query.drive_id ? Number(req.query.drive_id) : null;
        const clubScope = await resolveClubScope(req.user, req.query.club_id);

        if (clubScope === false) {
            return res.status(403).json({ error: 'Not authorized for this club' });
        }

        let whereClauses = [];
        let params = [];

        if (driveId) {
            whereClauses.push('rd.id = ?');
            params.push(driveId);
        }
        if (seasonId) {
            whereClauses.push('rd.season_id = ?');
            params.push(seasonId);
        }
        if (clubScope !== null) {
            if (clubScope.length === 0) {
                return res.json({ funnel: [], total_candidates: 0, overall_conversion_pct: 0 });
            }
            whereClauses.push(`rd.club_id IN (${clubScope.map(() => '?').join(',')})`);
            params.push(...clubScope);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // 1. Total Applied
        const appliedRow = await get(`
            SELECT COUNT(DISTINCT a.id) AS count
            FROM applications a
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            ${whereSql}
        `, params);
        const appliedCount = appliedRow ? appliedRow.count : 0;

        // 2. Shortlisted (stage past screening or status approved/reviewing)
        const shortlistedRow = await get(`
            SELECT COUNT(DISTINCT a.id) AS count
            FROM applications a
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            ${whereSql ? whereSql + ' AND' : 'WHERE'}
            (a.current_stage_id NOT IN ('screening') OR a.status IN ('Approved', 'Accepted', 'Reviewing'))
        `, params);
        const shortlistedCount = Math.min(appliedCount, shortlistedRow ? shortlistedRow.count : 0);

        // 3. Assessment / Technical Test
        const assessmentRow = await get(`
            SELECT COUNT(DISTINCT a.id) AS count
            FROM applications a
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            LEFT JOIN test_submissions ts ON ts.application_id = a.id
            ${whereSql ? whereSql + ' AND' : 'WHERE'}
            (ts.id IS NOT NULL OR a.current_stage_id IN ('task', 'interview', 'final'))
        `, params);
        const assessmentCount = Math.min(shortlistedCount, assessmentRow ? assessmentRow.count : 0);

        // 4. Interview Round
        const interviewRow = await get(`
            SELECT COUNT(DISTINCT a.id) AS count
            FROM applications a
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            LEFT JOIN interview_bookings ib ON ib.application_id = a.id
            ${whereSql ? whereSql + ' AND' : 'WHERE'}
            (ib.id IS NOT NULL OR a.current_stage_id IN ('interview', 'final'))
        `, params);
        const interviewCount = Math.min(assessmentCount, interviewRow ? interviewRow.count : 0);

        // 5. Offered
        const offeredRow = await get(`
            SELECT COUNT(DISTINCT a.id) AS count
            FROM applications a
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            LEFT JOIN offers o ON o.application_id = a.id
            ${whereSql ? whereSql + ' AND' : 'WHERE'}
            (o.id IS NOT NULL OR a.status = 'Accepted')
        `, params);
        const offeredCount = Math.min(interviewCount, offeredRow ? offeredRow.count : 0);

        // 6. Accepted
        const acceptedRow = await get(`
            SELECT COUNT(DISTINCT a.id) AS count
            FROM applications a
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            LEFT JOIN offers o ON o.application_id = a.id
            ${whereSql ? whereSql + ' AND' : 'WHERE'}
            (o.status = 'accepted' OR a.status = 'Accepted')
        `, params);
        const acceptedCount = Math.min(offeredCount, acceptedRow ? acceptedRow.count : 0);

        // Stage conversion math
        const rawStages = [
            { stage: 'Applied', count: appliedCount },
            { stage: 'Shortlisted', count: shortlistedCount },
            { stage: 'Assessment', count: assessmentCount },
            { stage: 'Interview', count: interviewCount },
            { stage: 'Offered', count: offeredCount },
            { stage: 'Accepted', count: acceptedCount }
        ];

        const funnel = rawStages.map((st, idx) => {
            const prevCount = idx === 0 ? st.count : rawStages[idx - 1].count;
            const dropOff = prevCount > st.count ? prevCount - st.count : 0;
            const conversionFromPrev = prevCount > 0 ? Math.round((st.count / prevCount) * 1000) / 10 : 0;
            const conversionFromTotal = appliedCount > 0 ? Math.round((st.count / appliedCount) * 1000) / 10 : 0;

            return {
                ...st,
                drop_off_count: dropOff,
                conversion_from_prev: conversionFromPrev,
                conversion_from_total: conversionFromTotal
            };
        });

        const overallConversion = appliedCount > 0
            ? Math.round((acceptedCount / appliedCount) * 1000) / 10
            : 0;

        res.json({
            funnel,
            total_candidates: appliedCount,
            overall_conversion_pct: overallConversion
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to compute recruitment funnel' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. APPLICANT DEMOGRAPHICS (Department & Year of Study)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/demographics', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'coordinator') {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const seasonId = req.query.season_id ? Number(req.query.season_id) : null;
        const clubScope = await resolveClubScope(req.user, req.query.club_id);

        if (clubScope === false) {
            return res.status(403).json({ error: 'Not authorized for this club' });
        }

        let whereClauses = [];
        let params = [];

        if (seasonId) {
            whereClauses.push('rd.season_id = ?');
            params.push(seasonId);
        }
        if (clubScope !== null) {
            if (clubScope.length === 0) {
                return res.json({ departments: [], years: [], total: 0 });
            }
            whereClauses.push(`rd.club_id IN (${clubScope.map(() => '?').join(',')})`);
            params.push(...clubScope);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Distinct applicants
        const deptRows = await all(`
            SELECT
                COALESCE(NULLIF(TRIM(u.department), ''), 'Unspecified') AS department,
                COUNT(DISTINCT a.student_id) AS count
            FROM applications a
            JOIN users u ON u.id = a.student_id
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            ${whereSql}
            GROUP BY COALESCE(NULLIF(TRIM(u.department), ''), 'Unspecified')
            ORDER BY count DESC
        `, params);

        const yearRows = await all(`
            SELECT
                COALESCE(u.year, 0) AS year,
                COUNT(DISTINCT a.student_id) AS count
            FROM applications a
            JOIN users u ON u.id = a.student_id
            JOIN recruitment_drives rd ON rd.id = a.drive_id
            ${whereSql}
            GROUP BY COALESCE(u.year, 0)
            ORDER BY year ASC
        `, params);

        const totalUniqueApplicants = deptRows.reduce((acc, row) => acc + row.count, 0);

        const departments = deptRows.map(row => ({
            department: row.department,
            count: row.count,
            percentage: totalUniqueApplicants > 0 ? Math.round((row.count / totalUniqueApplicants) * 1000) / 10 : 0
        }));

        const yearLabels = {
            1: '1st Year (FE)',
            2: '2nd Year (SE)',
            3: '3rd Year (TE)',
            4: '4th Year (BE)',
            0: 'Unspecified'
        };

        const years = yearRows.map(row => ({
            year: row.year,
            label: yearLabels[row.year] || `Year ${row.year}`,
            count: row.count,
            percentage: totalUniqueApplicants > 0 ? Math.round((row.count / totalUniqueApplicants) * 1000) / 10 : 0
        }));

        res.json({
            departments,
            years,
            total: totalUniqueApplicants
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to compute applicant demographics' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CROSS-CLUB PERFORMANCE BENCHMARK
// ─────────────────────────────────────────────────────────────────────────────
router.get('/clubs-comparison', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'coordinator') {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const seasonId = req.query.season_id ? Number(req.query.season_id) : null;
        let driveSeasonFilter = '';
        let params = [];

        if (seasonId) {
            driveSeasonFilter = 'AND rd.season_id = ?';
            params.push(seasonId);
        }

        const clubs = await all(`
            SELECT
                c.id, c.name, c.category, c.logo_url,
                COUNT(DISTINCT rd.id) AS drives_count,
                COUNT(DISTINCT a.id) AS applications_count,
                COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'Accepted') AS accepted_count,
                COUNT(DISTINCT cm.user_id) FILTER (WHERE cm.status = 'active') AS active_members_count
            FROM clubs c
            LEFT JOIN recruitment_drives rd ON rd.club_id = c.id ${driveSeasonFilter}
            LEFT JOIN applications a ON a.drive_id = rd.id
            LEFT JOIN club_members cm ON cm.club_id = c.id
            GROUP BY c.id
            ORDER BY applications_count DESC, c.name ASC
        `, params);

        const comparison = clubs.map(club => {
            const apps = club.applications_count || 0;
            const accepted = club.accepted_count || 0;
            return {
                ...club,
                acceptance_rate: apps > 0 ? Math.round((accepted / apps) * 100) : 0
            };
        });

        res.json(comparison);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load club comparison analytics' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. CSV EXPORT FOR RECRUITMENT ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/export/csv', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'coordinator') {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const seasonId = req.query.season_id ? Number(req.query.season_id) : null;
        const clubScope = await resolveClubScope(req.user, req.query.club_id);

        if (clubScope === false) {
            return res.status(403).json({ error: 'Not authorized for this club' });
        }

        let whereClauses = [];
        let params = [];

        if (seasonId) {
            whereClauses.push('rd.season_id = ?');
            params.push(seasonId);
        }
        if (clubScope !== null) {
            if (clubScope.length === 0) {
                return res.status(200).send('No data available');
            }
            whereClauses.push(`rd.club_id IN (${clubScope.map(() => '?').join(',')})`);
            params.push(...clubScope);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const drives = await all(`
            SELECT
                rd.id, rd.title AS drive_title, rd.status AS drive_status,
                c.name AS club_name, s.name AS season_name,
                rd.created_at,
                COUNT(DISTINCT a.id) AS applications_count,
                COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'Accepted') AS accepted_count,
                COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'Rejected') AS rejected_count,
                COUNT(DISTINCT o.id) AS offers_count
            FROM recruitment_drives rd
            JOIN clubs c ON c.id = rd.club_id
            LEFT JOIN recruitment_seasons s ON s.id = rd.season_id
            LEFT JOIN applications a ON a.drive_id = rd.id
            LEFT JOIN offers o ON o.application_id = a.id
            ${whereSql}
            GROUP BY rd.id
            ORDER BY rd.created_at DESC
        `, params);

        const escapeCsv = (str) => {
            if (str == null) return '""';
            const s = String(str).replace(/"/g, '""');
            return `"${s}"`;
        };

        const headers = ['Drive ID', 'Drive Title', 'Club Name', 'Recruitment Season', 'Status', 'Total Applications', 'Offers Issued', 'Accepted', 'Rejected', 'Conversion Rate (%)', 'Created At'];
        const rows = drives.map(d => {
            const apps = d.applications_count || 0;
            const accepted = d.accepted_count || 0;
            const rate = apps > 0 ? Math.round((accepted / apps) * 100) : 0;
            return [
                d.id,
                escapeCsv(d.drive_title),
                escapeCsv(d.club_name),
                escapeCsv(d.season_name || 'General'),
                escapeCsv(d.drive_status),
                apps,
                d.offers_count || 0,
                accepted,
                d.rejected_count || 0,
                `${rate}%`,
                escapeCsv(d.created_at)
            ].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="recruitment_analytics.csv"');
        res.send(csvContent);
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate analytics CSV export' });
    }
});

module.exports = router;
