const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../backend/routes/api.js');
let code = fs.readFileSync(file, 'utf8');

const newRoutes = `
// ==========================================
// COORDINATOR ROUTES
// ==========================================
router.get('/coordinator/dashboard', authenticateToken, requireRole('coordinator'), (req, res) => {
    // get my club
    db.get('SELECT * FROM clubs WHERE coordinator_id = ?', [req.user.id], (err, club) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!club) return res.json({ club: null, stats: { totalApplications: 0, activeDrives: 0, shortlisted: 0 } });
        
        const stats = { totalApplications: 0, activeDrives: 0, shortlisted: 0 };
        
        db.get('SELECT COUNT(*) as count FROM recruitment_drives WHERE club_id = ? AND status = "open"', [club.id], (err, row) => {
            if (row) stats.activeDrives = row.count;
            
            db.get('SELECT COUNT(a.id) as count FROM applications a JOIN recruitment_drives rd ON a.drive_id = rd.id WHERE rd.club_id = ?', [club.id], (err, row) => {
                if (row) stats.totalApplications = row.count;
                
                db.get('SELECT COUNT(a.id) as count FROM applications a JOIN recruitment_drives rd ON a.drive_id = rd.id WHERE rd.club_id = ? AND a.status = "Shortlisted"', [club.id], (err, row) => {
                    if (row) stats.shortlisted = row.count;
                    res.json({ club, stats });
                });
            });
        });
    });
});

router.get('/coordinator/drives', authenticateToken, requireRole('coordinator'), (req, res) => {
    db.get('SELECT id FROM clubs WHERE coordinator_id = ?', [req.user.id], (err, club) => {
        if (err || !club) return res.json([]);
        db.all('SELECT * FROM recruitment_drives WHERE club_id = ?', [club.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });
});
`;

code = code.replace("module.exports = router;", newRoutes + "\nmodule.exports = router;");
fs.writeFileSync(file, code);
