/**
 * 006_seasons_membership_permissions
 *
 * Adds:
 *   - recruitment_seasons  (admin-managed; drives belong to a season)
 *   - club_members         (replaces clubs.coordinator_id as the access authority)
 *   - club_permission_overrides (per-member, per-club permission adjustments)
 *   - conflict_declarations (coordinator declares conflicts of interest)
 *
 * Alters (ADD COLUMN only, idempotent via helper):
 *   - recruitment_drives.season_id
 *
 * Backfills:
 *   - Existing clubs.coordinator_id → club_members as 'lead'
 *
 * Does NOT drop clubs.coordinator_id (kept for display compatibility until Phase 3).
 */

const run = (db, sql, params = []) =>
    new Promise((resolve, reject) =>
        db.run(sql, params, err => (err ? reject(err) : resolve()))
    );

const columnExists = (db, table, column) =>
    new Promise((resolve, reject) =>
        db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows.some(r => r.name === column));
        })
    );

exports.up = async (db) => {
    // ── 1. recruitment_seasons ────────────────────────────────────────────────
    await run(db, `
        CREATE TABLE IF NOT EXISTS recruitment_seasons (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            start_date  TEXT    NOT NULL,
            end_date    TEXT    NOT NULL,
            status      TEXT    NOT NULL DEFAULT 'upcoming',
            created_by  INTEGER,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id),
            CHECK (status IN ('upcoming', 'active', 'closed', 'archived'))
        )
    `);

    // ── 2. club_members ───────────────────────────────────────────────────────
    await run(db, `
        CREATE TABLE IF NOT EXISTS club_members (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            club_id    INTEGER NOT NULL,
            user_id    INTEGER NOT NULL,
            role       TEXT    NOT NULL DEFAULT 'member',
            added_by   INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (club_id)  REFERENCES clubs(id),
            FOREIGN KEY (user_id)  REFERENCES users(id),
            FOREIGN KEY (added_by) REFERENCES users(id),
            UNIQUE (club_id, user_id),
            CHECK (role IN ('lead', 'member'))
        )
    `);

    // ── 3. club_permission_overrides ─────────────────────────────────────────
    await run(db, `
        CREATE TABLE IF NOT EXISTS club_permission_overrides (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            club_id     INTEGER NOT NULL,
            user_id     INTEGER NOT NULL,
            permission  TEXT    NOT NULL,
            granted     INTEGER NOT NULL DEFAULT 1,
            set_by      INTEGER,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (club_id)  REFERENCES clubs(id),
            FOREIGN KEY (user_id)  REFERENCES users(id),
            UNIQUE (club_id, user_id, permission)
        )
    `);

    // ── 4. conflict_declarations ──────────────────────────────────────────────
    await run(db, `
        CREATE TABLE IF NOT EXISTS conflict_declarations (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            coordinator_id INTEGER NOT NULL,
            applicant_id   INTEGER NOT NULL,
            reason         TEXT,
            declared_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (coordinator_id) REFERENCES users(id),
            FOREIGN KEY (applicant_id)   REFERENCES users(id),
            UNIQUE (coordinator_id, applicant_id)
        )
    `);

    // ── 5. season_id on recruitment_drives ────────────────────────────────────
    const hasSeason = await columnExists(db, 'recruitment_drives', 'season_id');
    if (!hasSeason) {
        await run(db, `ALTER TABLE recruitment_drives ADD COLUMN season_id INTEGER REFERENCES recruitment_seasons(id)`);
    }

    // ── 6. Backfill club_members from clubs.coordinator_id ───────────────────
    //    Insert a 'lead' row for every club that has a coordinator_id and whose
    //    coordinator is still an active coordinator-role user.
    //    ON CONFLICT IGNORE keeps it idempotent.
    await run(db, `
        INSERT OR IGNORE INTO club_members (club_id, user_id, role, added_by)
        SELECT c.id, c.coordinator_id, 'lead', c.coordinator_id
        FROM clubs c
        JOIN users u ON u.id = c.coordinator_id
        WHERE c.coordinator_id IS NOT NULL
          AND u.role = 'coordinator'
          AND u.is_active = 1
          AND c.deleted_at IS NULL
    `);
};

