const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { validateEnvironment } = require('./utils/config');

if (require.main === module) {
    try {
        validateEnvironment();
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}

const { db } = require('./utils/db');
const { runMigrations } = require('./utils/migrationRunner');
const { hasValidCsrfToken, requiresCsrfToken } = require('./utils/csrf');
const { addClient, broadcast } = require('./utils/eventStream');
const { authenticateToken } = require('./middlewares/authMiddleware');

const app = express();
app.use(helmet());
app.use(cors({
    origin(origin, callback) {
        const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
            .split(',')
            .map(value => value.trim());
        callback(null, !origin || allowedOrigins.includes(origin));
    },
    credentials: true,
    exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Limit', 'X-Page-Count']
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
        console.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - startedAt}ms`);
    });
    next();
});

app.use((req, res, next) => {
    if (!requiresCsrfToken(req.method, req.path)) return next();
    if (!hasValidCsrfToken(req.cookies?.csrf_token, req.get('X-CSRF-Token'))) {
        return res.status(403).json({ error: 'CSRF token validation failed' });
    }
    next();
});

app.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        res.on('finish', () => {
            if (res.statusCode >= 200 && res.statusCode < 400) broadcast({ type: 'data_changed' });
        });
    }
    next();
});

const uploadsDir = path.join(__dirname, 'uploads', 'profiles');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
}, express.static(path.join(__dirname, 'uploads')));

app.get('/health', (req, res) => {
    db.get('SELECT 1 AS healthy', (err) => {
        if (err) return res.status(503).json({ status: 'unavailable' });
        res.json({ status: 'ok' });
    });
});

app.get('/api/events', authenticateToken, (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    const removeClient = addClient(res);
    const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25000);
    req.on('close', () => {
        clearInterval(heartbeat);
        removeClient();
    });
});

// Routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const clubsRoutes = require('./routes/clubs');
const drivesRoutes = require('./routes/drives');
const applicationsRoutes = require('./routes/applications');
const notificationsRoutes = require('./routes/notifications');
const coordinatorRoutes = require('./routes/coordinator');
const adminRoutes = require('./routes/admin');
const seasonsRoutes = require('./routes/seasons');
const clubMembersRoutes = require('./routes/clubMembers');
const collaborationRoutes = require('./routes/collaboration');
const aiRoutes = require('./routes/ai');
const testsRoutes = require('./routes/tests');
const interviewsRoutes = require('./routes/interviews');
const offersRoutes = require('./routes/offers');
const messagesRoutes = require('./routes/messages');
const appealsRoutes = require('./routes/appeals');
const ticketsRoutes = require('./routes/tickets');
const announcementsRoutes = require('./routes/announcements');
const lifecycleRoutes = require('./routes/lifecycle');
const analyticsRoutes = require('./routes/analytics');
const privacyRoutes = require('./routes/privacy');

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/clubs', clubsRoutes);
app.use('/api/clubs/:clubId/members', clubMembersRoutes);
app.use('/api/drives', drivesRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/coordinator', coordinatorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/seasons', seasonsRoutes);
app.use('/api/collaboration', collaborationRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/tests', testsRoutes);
app.use('/api/interviews', interviewsRoutes);
app.use('/api/offers', offersRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/appeals', appealsRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/lifecycle', lifecycleRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/privacy', privacyRoutes);


app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || err.statusCode || 500;
    const message = status >= 500 ? 'Internal server error' : err.message;
    if (status >= 500) console.error(`Request failed: ${req.method} ${req.path}`);
    res.status(status).json({ error: message });
});

const publishAndCloseDrives = (timezone) => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    db.serialize(() => {
        db.run("UPDATE recruitment_drives SET status = 'published' WHERE status = 'scheduled' AND substr(open_date, 1, 10) <= ? AND deleted_at IS NULL", [today]);
        db.run("UPDATE recruitment_drives SET status = 'closed' WHERE status = 'published' AND substr(deadline, 1, 10) < ? AND deleted_at IS NULL", [today]);
    });
};

const start = async () => {
    const config = validateEnvironment();
    await runMigrations(db);
    cron.schedule('*/15 * * * *', () => publishAndCloseDrives(config.timezone), { timezone: config.timezone });
    publishAndCloseDrives(config.timezone);
    const host = process.env.HOST || '0.0.0.0';
    app.listen(config.port, host, () => console.log(`Server running on port ${config.port} (host: ${host})`));
};

if (require.main === module) {
    start().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
        db.close();
    });
}

module.exports = { app, start, publishAndCloseDrives };
