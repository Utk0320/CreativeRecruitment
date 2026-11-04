# Decisions

- Keep the populated `backend/database/creativerecruit.db`; ignore it and remove only the duplicate legacy database so existing app data is not destroyed.
- Remove the local `.env` and provide `.env.example`; the workspace has no Git metadata, so prior history cannot be rewritten here.
- Preserve the three frontend-used coordinator read endpoints under `/api/coordinator` and remove the unsafe duplicate `/api` router.
- Return a non-disclosing 404 for unauthorized application detail reads; unrelated user profile reads return only non-contact fields.
- Use the current `coordinator_id` ownership model until Phase 2 introduces memberships, so Phase 0 security does not require a premature ownership migration.
- Preserve existing `open` and `closed` drive states in Phase 0; normalize date-only UI values to Asia/Kolkata ISO datetimes and keep stage/status redesign for Phase 4.
- Use httpOnly JWT plus double-submit CSRF now because authenticated SSE and the shared API client need a cookie-compatible contract; refresh rotation remains Phase 1 work.
- Use a generic authenticated SSE data-change event; detailed notifications remain stored and are fetched through their existing permission-scoped endpoint.
- Remove the demo credential autofill and demo seed records from scripts/UI; retain the existing ignored database file rather than rewriting its user data.
- Keep external provider integration and AI work out of Phase 0; later phases must use local/console adapters as specified.
- Do not create commits or tags because this workspace is not a Git checkout; verify and report the repository limitation instead.
- Student password and SSO identities use the explicit `.comp` student-email suffix; provider claims must also prove email verification and the Google hosted domain.
- Google Identity Services is the real SSO provider in this implementation; Microsoft tenant-claim validation is covered as a policy helper, but no Microsoft OAuth flow is wired.
- Development SSO and console email links are disabled in production; production auth requires HTTPS, Google or password-email configuration, SMTP delivery, and the matching frontend/API cookie settings.
- Coordinator invite links expire after 48 hours, are stored as hashes, and let the invitee choose their own password before the first login.
- Keep `clubs.coordinator_id` as the Phase 1 admin assignment model; Phase 2 replaces it with club membership and lead/member roles.
- Frontend build (npm run build) fails in this environment because rolldown 1.2.13 bundles a Node 20.12.2 runtime that rejects `styleText([...])` array syntax; Vite 8 requires Node ≥20.19/22.12. The existing dist/ from the previous session is intact; lint passes. Document as environment issue and do not downgrade Vite (would require changing node_modules lockfile). A deployment build must use Node 22+.
- Phase 2 permissions model: define named permissions in a shared `utils/can.js` helper as role-keyed sets; club-scoped checks query club_members; admin bypasses club checks. This avoids scattering ad-hoc SQL checks across routes.
- Seasons are admin-only to create/edit/close. Drives reference season_id (nullable FK for backward compat). Migration adds season_id to recruitment_drives without breaking existing drive reads.
- club_members table replaces clubs.coordinator_id as the authority for club access; clubs.coordinator_id is kept as a legacy display column and backfilled from club_members where possible to preserve existing UI until Phase 3 removes it.
- Phase 2 test isolation: all integration tests that touch club_members, seasons, or coordinator-scoped queries must use an in-memory SQLite database populated via runMigrations(), injected into require.cache before any route module is loaded. Tests that do not exercise club_members or ownership (e.g. users.test.js avatar tests) may retain a fakeDb mock, but any query touching the clubs/club_members schema must use a real in-memory DB.
- db.js safety guard: if NODE_ENV=test and DATABASE_PATH is not set (or resolves to the real DB file), db.js throws at startup to prevent tests from silently mutating production data. Tests must inject a fake DB via require.cache before loading any route.
- Test artifact cleanup: user 15 (admin_season_test@mmcoe.edu.in) was created by a previous session's integration test that hit the real DB. Deleted manually. The db.js guard prevents this from happening again.
- INSERT OR REPLACE deleted and re-inserted rows, losing created_at and added_by in club_members. Changed to INSERT ... ON CONFLICT DO UPDATE SET role = ... to preserve audit fields.
- SeasonSwitcher component: implemented as a context provider (SeasonProvider) wrapping the whole app plus a controlled dropdown widget. Active season is persisted in sessionStorage (per-tab, no cross-tab pollution). The Navbar shows the switcher for coordinator and admin roles only.
- ClubMembers page: accessible to coordinator members and admin; lead or admin can add/remove/transfer; any coordinator member can declare conflicts; admin can set permission overrides. Conflict and permission modals are inline (no separate route needed for Phase 2).
- Phase 2 rollover endpoint: GET /api/admin/clubs/rollover-check returns clubs with no active lead. POST /api/admin/clubs/:clubId/reassign is a stub (full reviewer_assignments wiring is Phase 5). Both are admin-only.
- Phase 2 test isolation: all integration tests that touch club_members, seasons, or coordinator-scoped queries must use an in-memory SQLite database populated via runMigrations(), injected into require.cache before any route module is loaded. Tests that do not exercise club_members or ownership (e.g. users.test.js avatar tests) may retain a fakeDb mock, but any query touching the clubs/club_members schema must use a real in-memory DB.
- db.js safety guard: if NODE_ENV=test and DATABASE_PATH is not set (or resolves to the real DB file), db.js throws at startup to prevent tests from silently mutating production data. Tests must inject a fake DB via require.cache before loading any route.
- Test artifact cleanup: user 15 (admin_season_test@mmcoe.edu.in) was created by a previous session's integration test that hit the real DB. Deleted manually. The db.js guard prevents this from happening again.
- INSERT OR REPLACE deleted and re-inserted rows, losing created_at and added_by in club_members. Changed to INSERT ... ON CONFLICT DO UPDATE SET role = ... to preserve audit fields.
- SeasonSwitcher component: implemented as a context provider (SeasonProvider) wrapping the whole app plus a controlled dropdown widget. Active season is persisted in sessionStorage (per-tab, no cross-tab pollution). The Navbar shows the switcher for coordinator and admin roles only.
- ClubMembers page: accessible to coordinator members and admin; lead or admin can add/remove/transfer; any coordinator member can declare conflicts; admin can set permission overrides. Conflict and permission modals are inline (no separate route needed for Phase 2).
- Phase 2 rollover endpoint: GET /api/admin/clubs/rollover-check returns clubs with no active lead. POST /api/admin/clubs/:clubId/reassign is a stub (full reviewer_assignments wiring is Phase 5). Both are admin-only.
- club_members table replaces clubs.coordinator_id as the authority for club access; clubs.coordinator_id is kept as a legacy display column and backfilled from club_members where possible to preserve existing UI until Phase 3 removes it.
## Phase 3A decisions

- **ai_consent order:** The `ai_consent` check is placed AFTER the email-verified check in the POST /applications route. This ensures unverified students get 403 (auth failure) rather than 400 (business rule failure), consistent with the principle that auth errors take priority over business-rule errors.
- **withdraw route declaration:** The `router.patch('/:id/withdraw', ...)` declaration was collapsed onto one line so the `mutationBoundary.test.js` regex (which matches `^router.(post|put|patch|delete)([^\n]*` and checks the same line for `withTransaction`) finds the call. A better long-term fix would be to make that test parse multi-line declarations, but was deferred to avoid touching the test harness mid-phase.
- **Draft autosave storage:** Application draft autosave uses `localStorage` (key `apply_draft_<driveId>`), not a backend `application_drafts` table, to minimise schema complexity. The spec says "draft autosave" without specifying the medium. Draft is cleared on successful submit.
- **Resume completeness:** The server computes completeness from 10 fields (bio, phone, github_url, linkedin_url, portfolio_url, resume_path, skills, interests, projects, achievements). The frontend shows the server score (not a client-computed duplicate), so they can never diverge.

## Phase 3B & 3C decisions

- **Drive status enum & 'open' retirement:** Status `'open'` was fully retired in favor of `'published'`. Migration 008 remapped existing database rows. Transition validation enforces the directed graph: `draft` → `published`/`scheduled`/`archived`, `scheduled` → `published`/`draft`/`archived`, `published` → `closed`, `closed` → `archived`. Frontend and client lists tolerate `'open'` as a fallback to avoid regressions.
- **Drive defaults to 'draft':** New drives default to `'draft'` rather than published, requiring coordinators to explicitly publish or schedule their recruitment drive.
- **Rubric validation:** Rubrics enforce that item weights sum to exactly 100% on both backend (Zod in `driveValidation.js`) and frontend (`CoordinatorDrives.jsx`).
- **QR codes via URL API:** QR codes are rendered dynamically via `https://api.qrserver.com/v1/create-qr-code/`, avoiding adding external npm packages to the bundle.
- **Q&A visibility boundary:** `GET /drives/:driveId/qa` filters to answered questions only for students to keep unanswered questions private until addressed, while coordinators and administrators receive all questions (including pending) so they can post answers. Answers are immutable once posted.
 
## Phase 4 decisions
 
- **Stage + Outcome dual-axis model:** Applications decouple spatial stage progression (`current_stage_id`) from final outcome status (`outcome`: Pending, Advanced, Waitlisted, Selected, Rejected, Withdrawn). Legacy `status` is kept in sync automatically (`Pending`/`Under Review` for in-progress, `Accepted` for Selected, `Rejected` for Rejected, `Waitlisted` for Waitlisted, `Withdrawn` for Withdrawn).
- **Mandatory reason code on Rejection/Waitlist:** Rejections and waitlists strictly require a valid reason code (`skill_mismatch`, `seat_limit`, `incomplete_application`, `ineligible`, `other`) to prevent unexplained rejections.
- **Stage deletion safety:** Deleting or replacing stages on a non-draft drive is forbidden if any applicant is currently placed in that stage (returns 409 Conflict).
- **Dual-mode Kanban accessibility:** Drag-and-drop HTML5 drag events are paired with a 3-dot dropdown menu on every candidate card, allowing full stage advancement and decision making using standard keyboard navigation and assistive technology.
- **Coordinator inbox boundary:** `GET /api/coordinator/inbox` computes an actionable queue scoped strictly to drives of clubs where the coordinator is an active member, flagging unreviewed applications, drives closing in ≤ 48 hours, and expiring offers.
## Phase 5 decisions

- **Optimistic Concurrency Control:** Added a monotonic `version` integer column to `recruitment_drives`, `clubs`, and `applications`. Any update payload that supplies an outdated version is rejected with HTTP 409 Conflict, returning `current_version` to prevent concurrent reviewer overwrites.
- **Reviewer Panel Anti-Anchoring:** When `hide_scores_until_submitted` is enabled on a recruitment drive, other panel members' rubric scores and remarks are masked (`hide_scores: true`) for any reviewer who has not yet submitted their own score. Unblinded averages and reviewer scores appear as soon as the reviewer submits.
- **Reviewer Disagreement Alert:** When multiple scorecards exist and the difference between maximum and minimum reviewer scores exceeds 25 points, an explicit disagreement alert is displayed to prompt discussion.
- **Blind Review Candidate Redaction:** When `blind_review` is enabled on a drive, `applications.js` automatically redacts applicant names to `"Candidate #{id}"` and removes emails, phone numbers, and portfolio URLs for coordinators who are not admins or club leads.
- **Maker-Checker Workflow:** Coordinators without final decision authority propose candidate selection/outcome (`POST /applications/:id/propose`), creating a pending proposal (`approval_status = 'pending'`). Club leads or admins act as checkers via `POST /:id/approve` or `POST /:id/reject-proposal`.
- **Single-Action Undo:** `POST /applications/:id/undo` inspects the append-only activity log for the latest `applications.stage_change` record on that application within 10 minutes and reverts `current_stage_id` and `outcome` back to `before_json`.
- **Active Presence Heartbeat:** Ephemeral `viewing_heartbeats` table records reviewer presence every 15 seconds, automatically cleaning entries older than 60 seconds to show live viewer avatars without heavy polling.
- **Internal Discussion & Mentions:** `application_comments` table supersedes legacy flat notes. Internal comments support editing by the author, and @mentioning active club members generates database notifications.
- **Admin Audit View & Export:** Full activity log query interface at `/admin/audit` and streaming CSV export at `GET /api/admin/audit/export-csv`.

## Phase 6 decisions

- **Dual-Adapter AI Architecture:** Implemented `backend/services/ai/` with `claudeClient.js` (native `fetch` to Anthropic Claude 3.5 Sonnet) and deterministic `mockClient.js` for offline tests and development (`AI_ADAPTER=mock`).
- **Prompt Injection Isolation:** Candidate submission text is delimited with `<student_submission>...</student_submission>`, with system prompt directives instructing the model to treat any instructions within delimiters as passive data rather than actionable commands.
- **Student Privacy & AI Consent Gate:** If an applicant did not grant consent during submission (`ai_consent = 0`), automated AI evaluation is strictly rejected (HTTP 400). PII (emails, phone numbers) is scrubbed via regex prior to model prompting.
- **Mandatory Non-Replacement Disclaimer:** Every AI-assisted rubric, scorecard evaluation, and email draft surfaces the prominent notice: *"AI-generated evaluation to assist, not replace, human reviewers"*.
- **Token Auditing:** Every AI invocation records input, output, and total token usage in `ai_usage_log`, viewable by college administrators.

## Phase 7 decisions

- **Server-Side Assessment Timer & Auto-Grading:** Assessments record `started_at` in UTC. Timeouts are evaluated server-side upon submit using `parseUtcTime` with a 2-minute latency grace window. Late submissions are marked `status = 'timed_out'` and MCQs are auto-graded.
- **One-Attempt Assessment Constraint:** Students are permitted one assessment attempt per drive. Coordinators can grant additional attempts via `POST /tests/applications/:appId/grant-retry`, audited via `extra_attempt_granted_by`.
- **Cross-Club Interview Clash Detection:** When booking an interview slot, `POST /interviews/book` verifies that the student does not have any other confirmed interview booking across ANY club that overlaps with the requested time window (`(s.start_time < new_end_time AND s.end_time > new_start_time)`). Conflicting requests are rejected with HTTP 409 Conflict displaying the conflicting club and schedule.
- **Atomic Slot Capacity Enforcement:** Slot capacity validation and booking reservation run within `withTransaction` to eliminate race conditions under concurrent bookings.
- **RFC 5545 iCalendar (.ics) Generation:** Standard `.ics` calendar invitation files are generated natively (`GET /interviews/:bookingId/ics`) without third-party dependencies, allowing 1-click import into Google, Outlook, and Apple calendars.
- **Multi-Offer Preference Ranking & Auto-Cascades:** Students receiving multiple offers can rank their club preferences. Accepting an offer via `POST /offers/:appId/accept` atomically declines the student's other offers and automatically cascades the freed seats to the top waitlisted candidate (`outcome = 'Waitlisted'`), setting a 48-hour expiration timer. Declining an offer or sweeping expired offers triggers the same automatic waitlist cascade.
- **Bulk Stage Broadcasts with Template Interpolation:** Coordinators can create reusable club message templates and preview variable interpolation (`{{student_name}}`, `{{club_name}}`, `{{drive_title}}`, `{{stage_name}}`) before dispatching stage-wide announcements, with every broadcast logged to `stage_message_logs`.

## Phase 8 decisions

- **Appeals Window & Uniqueness:** A student can file exactly one appeal per rejected or waitlisted application (`UNIQUE(application_id)` on `appeals`). The appeal window defaults to 7 days from the application's `decision_date` (configurable via `recruitment_drives.appeal_window_days`). Attempting to submit after the window returns 400 Bad Request.
- **Non-Original Decider Rule:** If a club has more than one coordinator in `club_members`, the coordinator who originally recorded or proposed the decision (`applications.decided_by` or `applications.proposed_by`) is strictly forbidden from reviewing that student's appeal (HTTP 403 Forbidden).
- **Overturned Appeal Pipeline Restoration:** When a lead or panel coordinator overturns an appeal (`POST /appeals/:id/review`), the application is atomically restored to the selected pipeline stage (`current_stage_id`), setting `outcome = 'Advanced'` and `status = 'Under Review'`, clearing previous rejection reason codes, and dispatching reviewer notes to the student.
- **Support Ticket Auto-Routing & SLA Tracking:** Tickets are categorized (`Account`, `Application`, `Technical`, `Appeal-related`, `Other`). Club-related tickets (`Application`, `Appeal-related`, or `club_id` provided) auto-route to the club lead; account and technical tickets route to college administrators. SLA due dates are computed dynamically based on priority (Urgent: 4h, High: 12h, Medium: 24h, Low: 48h). Resolved/closed tickets can be reopened by their creator within 7 days.
- **Pluggable Notification Channel Adapters:** Designed `backend/services/notifications/` with adapters for In-App (SSE + SQLite), Email (SMTP / console), SMS & WhatsApp, and Web Push. User preferences in `notification_preferences` allow granular channel toggling per event type (`stage_change`, `deadline_reminder`, `interview_reminder`, `offer_expiry`, `appeal_update`, `ticket_update`, `mentions_assignments`, `announcements`).
- **Delayed Notification Gating:** Notification dispatcher enforces the rule that student notifications for stage/outcome changes are strictly suppressed while a maker-checker decision proposal is pending (`approvalStatus === 'pending'`).
- **Audience-Targeted Club Announcements:** Coordinators can broadcast announcements to all club stakeholders, drive applicants only, or club members only (`audience IN ('all', 'applicants', 'members')`), with automated notification dispatch across users' preferred channels.

