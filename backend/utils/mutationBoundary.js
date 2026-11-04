let transactionQueue = Promise.resolve();

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(error) {
        if (error) return reject(error);
        resolve(this);
    });
});

const acquireTransaction = async () => {
    const previous = transactionQueue;
    let release;
    transactionQueue = new Promise(resolve => { release = resolve; });
    await previous;
    return release;
};

const logActivity = (db, req, activity) => run(db,
    `INSERT INTO activity_log
        (actor_id, actor_role, action, entity_type, entity_id, club_id, season_id, before_json, after_json, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
        req.activityActorId ?? req.user?.id ?? null,
        req.activityActorRole ?? req.user?.role ?? null,
        activity.action,
        activity.entityType,
        req.activityEntityId ?? req.params.id ?? null,
        req.activityClubId ?? req.body?.club_id ?? null,
        req.activitySeasonId ?? req.body?.season_id ?? null,
        req.activityBeforeJson ? (typeof req.activityBeforeJson === 'string' ? req.activityBeforeJson : JSON.stringify(req.activityBeforeJson)) : null,
        req.activityAfterJson ? (typeof req.activityAfterJson === 'string' ? req.activityAfterJson : JSON.stringify(req.activityAfterJson)) : null,
        req.ip || null,
        req.get('user-agent')?.slice(0, 256) || null
    ]
);

const withTransaction = (db, action, entityType) => (req, res, next) => {
    const begin = async () => {
        const release = await acquireTransaction();
        try {
            await run(db, 'BEGIN IMMEDIATE');
        } catch (error) {
            release();
            throw error;
        }

        const sendJson = res.json.bind(res);
        let finalized = false;
        let settled = false;

        const rollback = async () => {
            if (settled) return;
            settled = true;
            try {
                await run(db, 'ROLLBACK');
            } finally {
                release();
            }
        };

        res.once('close', () => {
            if (!finalized) rollback().catch(() => {});
        });

        res.json = (body) => {
            if (finalized) return res;
            finalized = true;
            const statusCode = res.statusCode;
            const finish = async () => {
                if (statusCode >= 400) {
                    await rollback();
                    sendJson(body);
                    return;
                }
                try {
                    await logActivity(db, req, { action, entityType });
                    await run(db, 'COMMIT');
                    settled = true;
                    release();
                } catch (error) {
                    if (!settled) {
                        try { await run(db, 'ROLLBACK'); } catch {}
                        settled = true;
                        release();
                    }
                    res.statusCode = 500;
                    body = { error: 'Unable to record activity' };
                }
                sendJson(body);
            };
            finish().catch(() => {
                res.statusCode = 500;
                sendJson({ error: 'Unable to complete transaction' });
            });
            return res;
        };

        next();
    };

    begin().catch(next);
};

module.exports = { logActivity, withTransaction };