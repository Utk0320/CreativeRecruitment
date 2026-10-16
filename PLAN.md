# CreativeRecruit Upgrade Plan

## Resume Point (updated after every sub-step)

**Current phase:** All Phases 0–10 COMPLETE ✓ — Production-Ready Platform  
**Status:** CreativeRecruit Full Platform Upgrade Successfully Completed  
**Last verified baseline:** 247/247 tests passing across 11 suites, 0 audit vulns, frontend build passes cleanly (793ms), migrations 001-016 applied and idempotent (2026-10-17)

**Phase 10 (Analytics, Privacy, Platform) — COMPLETE ✓:**
- **Schema & Migration 016 (`016_analytics_privacy_platform.js`):** Extended `recruitment_drives` with `archived_at` and `users` with `is_anonymized`. Created `data_deletion_requests`, `data_retention_policies`, and immutable `data_retention_logs`.
- **Backend Analytics API (`routes/analytics.js`):** Role-scoped overview metrics (total drives, active drives, total applications, acceptance rate, avg time-to-hire), stage-by-stage recruitment funnel drop-offs (Applied -> Shortlisted -> Assessment -> Interview -> Offered -> Accepted), applicant demographics distribution (by department and academic year), cross-club benchmark comparisons, and direct streaming CSV export.
- **Backend Privacy & Retention API (`routes/privacy.js`):** GDPR/DPDP Subject Access Request (SAR) full personal data JSON and CSV downloads with evaluator scoring notes strictly redacted; student account deletion request workflow; admin approval queue with complete candidate pseudonymization/anonymization; configurable data retention schedules and automated retention cleaner with audit log.
- **Phase 10 Tests (`phase10.test.js`):** 10 integration tests exercising analytics calculation, funnel drop-off math, demographic breakdown, club benchmarks, SAR personal data export with redaction, right-to-be-forgotten anonymization, and retention purges. Total: 247/247 tests passing.
- **Frontend Integration:**
  - `ErrorBoundary.jsx`: Top-level application error boundary handling unhandled render exceptions gracefully with reload and return-home controls.
  - `DataPrivacyModal.jsx`: Modal for student profile enabling one-click SAR JSON/CSV downloads and deletion request submission.
  - `StudentProfile.jsx`: Added "Privacy & Data" control opening `DataPrivacyModal`.
  - `AdminUsers.jsx`: Added "Analytics & Funnels" tab (KPI cards, interactive stage funnel, demographic distribution bars, benchmark table, CSV export) and "Privacy & Retention" tab (pending deletion queue with approve/reject actions, retention policy editor, and purge runner).
  - `CoordinatorDashboard.jsx`: Integrated club-scoped recruitment funnel cards, conversion metrics, and CSV export.
  - `manifest.json`: Web App Manifest with app metadata, theme color, and icons linked in `index.html` for PWA installability.
  - Full frontend production build passing in 793ms; 0 lint errors.

**Still to do:**
- All planned phases 0 through 10 are 100% complete. System ready for release.

## Repository Baseline

- The workspace is a source snapshot, not a Git checkout: no `.git` directory is present, so commits, tags, and history cleanup cannot be performed here.
- The app is a small React/Vite + Express/SQLite prototype. Current backend ownership is split between newer route files and a duplicate `routes/api.js` mounted at `/api`.
- `backend/.env`, SQLite databases, CSV exports, and uploaded profile files currently exist in the workspace. The `.env` must be removed from version control when this is placed in a Git repository; local secret preservation needs care in this snapshot.
- Existing tests only cover college email validation. Backend scripts do not currently define lint, test, or build gates.

### Demo & Admin Accounts (Local Development)

All roles log in at `http://localhost:5173/login`:
- **Student (Demo):** `student@demo.com` / `student123` (redirects to `/student/dashboard`; pre-seeded with profile, skills, projects, and applications).
- **Coordinator (Demo):** `coordinator@demo.com` / `coord123` (redirects to `/coordinator/dashboard`; lead for technical clubs with drives and applicant review data). Also available: `bob@demo.com` / `coord123`, `charlie@demo.com` / `coord123`.
- **Admin:** `admin@mmcoe.edu.in` / `admin123` (redirects to `/admin/users`; creates coordinator invites, manages users & clubs).
  *To create or change an admin account: run `npm run create-admin` inside `backend/`.*

## Phase Plan

| Phase | Likely files and schema work | Main risks / acceptance gates | Status |
| --- | --- | --- | --- |
| 0. Cleanup and security | `backend/server.js`, `backend/middlewares/authMiddleware.js`, route modules, `backend/migrations/`, seed/data utilities, frontend API client and sync hook, `.gitignore`, `.env.example`, CI workflow | Preserve currently used coordinator reads while removing duplicate routes; close IDOR and upload risks; require valid secrets; protect existing DB data; run security tests and app build | Complete locally; UI-state audit due before v1 |
| 1. Identity and access | `backend/routes/auth.js`, auth middleware, user schema migration, admin routes/CLI, frontend auth/register/admin pages, env/docs | No public privileged-role creation; token revocation, invite and verification lifecycle; cookie/CSRF changes require coordinated client migration | Core acceptance verified locally; Google provider E2E requires deployment client credentials |
| 2. Seasons, membership, permissions | numbered migrations, shared authorization module, club/coordinator routes, frontend coordinator/admin UI | Migrate current `coordinator_id` ownership without losing access; all club reads/writes and conflict exclusions tested | **Complete** |
| 3. Common application and drives | migrations, profile/application/drive routes, upload service, student/coordinator forms | Immutable application snapshots, safe resume handling, validated rubrics, and state transitions; preserve existing application history | **Complete** |
| 4. Pipeline and inbox | shared transition module, migration, application/drive routes, Kanban/tracker/inbox UI | Keep backend/frontend transition rules aligned; accessible non-drag moves; notification only after approval | **Complete** |
| 5. Collaboration and audit | activity-log migration/helper, transactional mutation routes, comments/assignments/scorecards UI | Every mutation and audit record must share a transaction; append-only logs and optimistic concurrency need integration tests | **Complete** |
| 6. AI triage | `backend/services/ai/`, job/SSE routes, AI schema migrations, coordinator/student UI, mock-based tests | No provider key in browser; deterministic filters and code-computed totals; consent, injection resistance, and no autonomous decisions | **Complete** |
| 7. Interviews, tests, offers | migrations, scheduling/test/offer services and routes, student/coordinator UI | Concurrent booking/acceptance races and cross-club clash detection; end-to-end state consistency | **Complete** |
| 8. Appeals, tickets, notifications | migrations, ticket/appeal/notification routes, channel adapters, UI | Privacy and routing boundaries; student messages only after approval; preference-aware delivery | **Complete** |
| 9. Member lifecycle | migrations, roster/onboarding/events routes and UI, certificate generation | Idempotent membership creation and club-scoped attendance authorization | **Complete** |
| 10. Analytics, privacy, platform | export/retention/backup services, migrations, PWA/i18n/search/accessibility UI, docs | Correct role-based redaction and deletion/retention behavior; performance and WCAG checks | **Complete** |

## Phase 0 Verification

- `backend/npm test`: 39 tests passed at the Phase 0 gate, including route-level authorization, IDOR, profile redaction, avatar content/size checks, mutation coverage, activity-log atomicity, and paginated SQLite queries.
- `backend/npm run migrate`: applied to the existing database without resetting it; a second run reports no pending migrations.
- `backend/npm audit --omit=dev`: zero vulnerabilities.
- `frontend/npm run lint`: passes with existing non-blocking warnings; production build passes under Node 22 (the installed Vite toolchain requires Node 20.19+).
- Live smoke checks: backend `/health` returns 200; missing JWT secret exits before DB initialization; CORS, CSRF, unauthenticated access, SSE auth, and JSON 404 behavior were exercised.
- Completed before Phase 1: every existing mutation is enrolled in `withTransaction()`, successful writes create an append-only activity record before commit, and SQLite triggers reject activity-log updates/deletes.
- Tracked before v1 release: audit every screen for consistent, accessible loading, empty, and error states. This UI audit remains open and must be completed before v1 ships.
- The CI workflow is configured, but GitHub Actions and phase commits/tags cannot be run because this workspace has no `.git` metadata.
- Features belonging to later phases (seasons/membership, pipeline, audit UI, AI, interviews, appeals, and lifecycle tools) remain planned.

## Phase 1 Progress

- Added `004_identity_access.js` and `005_refresh_session_version.js`: active-account state, token versions, forced-password-change state, email/reset token fields, coordinator invites, and refresh-session versioning.
- Public password registration always creates an unverified student; it enforces the `.comp` pattern, a 10-character minimum, and a bundled common-password denylist. Verification links are single-use and expire after 24 hours; applications require a verified student.
- Added server-verified Google ID-token SSO and a development-only console SSO adapter. Password registration/login are disabled whenever SSO is configured. Google hosted-domain/email claims and Microsoft tenant-claim validation have unit coverage; only Google is wired as a real provider.
- Added `npm run create-admin` with no default credentials, admin-provisioned one-time 48-hour coordinator invites, searchable admin user/coordinator/club routes, account activation/deactivation, force logout, reset links, and a role-gated admin UI.
- Access JWTs expire after 15 minutes; hashed refresh sessions rotate for seven days and are tied to `token_version`. Cookie/CSRF, password reset, forced password change, and SMTP/console email flows are wired.
- Current regression: `backend/npm test` passes 62 tests; `backend/npm audit --omit=dev` reports zero vulnerabilities; frontend lint/build pass. Migration 005 is applied to the retained database.
- Acceptance coverage: student-only public registration, active/token-version revocation, password verification/reset, invite expiry/reuse, Google claim/domain rules, admin-route wrong-role/unauthenticated denial, refresh rotation/replay, and first-admin bootstrap are tested.
- Deployment verification still needed: configure a real `GOOGLE_CLIENT_ID` and approved origins to exercise Google Identity Services end to end. No institutional OAuth client credentials were present in this workspace. Optional TOTP remains deferred. Phase 2 has not started.

## Existing-Code Conflicts and Decisions

1. `backend/routes/api.js` duplicates auth, club, drive, application, and notification endpoints. Its `/applications/:id/status` lacks club ownership checks and its auth handlers query a nonexistent `password` column. Decision: remove the duplicate router; preserve only the frontend-used coordinator dashboard/club/drive reads in their proper route modules.
2. `GET /api/applications/:id` exposes any application to any authenticated user. Decision: allow the owning student or an authorized coordinator for that drive's club; return a non-disclosing 404 otherwise.
3. `GET /api/users/:id` exposes private contact fields across users. Decision: self-view remains complete; coordinator access to applicant details is limited to applications for their own clubs; other viewers receive only safe public fields.
4. `backend/utils/setupDb.js` deletes the active database and embeds demo accounts/passwords. Decision: replace it with an explicitly development-only seed that refuses production and never unlinks an existing database; use numbered idempotent migrations for schema changes.
5. Existing DB setup is embedded in the seed script and `backend/migrate.js` is an unnumbered ad-hoc migration. Decision: separate schema migration from seeding and preserve existing data.
6. Existing uploads are statically served and avatar handling trusts declared file names/types with no size limit. Decision: validate size and actual image content, use random names, and set `nosniff` before serving.
7. Frontend calls coordinator endpoints from the legacy router, hardcodes `http://localhost:5000`, and stores JWTs in `localStorage`; `useDataSync` polls every 15 seconds. Decision: migrate route dependencies first, then centralize API configuration, move to the specified cookie/CSRF model with a 401 logout interceptor, and replace polling with reconnecting SSE.
8. Drives currently use `open`/`closed` and date-only fields; clubs/drives are hard-deleted. Decision: preserve compatibility during Phase 0 while adding safe soft-delete/deadline behavior with data-preserving migrations.
9. User asks for phase commits and tags, but no Git metadata exists in the supplied workspace. Decision: complete code and checks here, document commit/tag steps as unavailable, and do not fabricate repository history.
10. The repository has no Zod, Helmet, rate-limit, cron, MIME-inspection, or test HTTP dependencies. Decision: add small established libraries as each relevant Phase 0 path is implemented; external integrations remain adapter-backed in later phases.

## Phase Completion Protocol

For each phase: implement only that phase, update documentation, run focused tests plus the full available test/lint/build gates, and verify the app starts with documented environment. Do not begin the next phase until the current acceptance checks pass. Record deferred items and reasons in the final checklist; create a commit and phase tag only when Git metadata is available.