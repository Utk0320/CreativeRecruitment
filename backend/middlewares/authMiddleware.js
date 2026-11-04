const jwt = require('jsonwebtoken');
require('dotenv').config();
const { db } = require('../utils/db');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = req.cookies?.access_token || (authHeader && authHeader.split(' ')[1]);
    
    if (!token) return res.status(401).json({ error: 'Access token required' });

    jwt.verify(token, process.env.JWT_SECRET, (err, tokenUser) => {
        if (err) return res.status(401).json({ error: 'Invalid or expired token' });
        db.get('SELECT role, is_active, token_version, must_change_password FROM users WHERE id = ?', [tokenUser.id], (dbError, account) => {
            if (dbError) return res.status(500).json({ error: 'Unable to authenticate request' });
            if (!account || !account.is_active || tokenUser.token_version !== account.token_version || tokenUser.role !== account.role) {
                return res.status(401).json({ error: 'Session is no longer valid' });
            }
            const authPath = req.originalUrl?.split('?')[0];
            const passwordChangePath = ['/api/auth/change-password', '/api/auth/me'].includes(authPath);
            if (account.must_change_password && !passwordChangePath) {
                return res.status(403).json({ error: 'Change your password before continuing' });
            }
            req.user = {
                ...tokenUser,
                role: account.role,
                token_version: account.token_version,
                must_change_password: account.must_change_password
            };
            next();
        });
    });
};

const requireRole = (role) => {
    return (req, res, next) => {
        if (!req.user || req.user.role !== role) {
            return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
        }
        next();
    };
};

module.exports = { authenticateToken, requireRole };
