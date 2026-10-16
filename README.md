# CreativeRecruit 

CreativeRecruit is a full-stack web application designed to centralize and simplify college club recruitment. It provides a unified platform where students can discover clubs, explore recruitment drives, and apply seamlessly, while giving club coordinators powerful tools to manage drives and review applicants.

---


##  Features

### For Students
* **Club Discovery:** Browse, search, and filter through all college clubs in one centralized place.
* **Recruitment Tracking:** View active recruitment drives, eligibility criteria, and deadlines.
* **Easy Application:** Apply to open drives by submitting a motivation statement and a portfolio URL.
* **Application Dashboard:** Track the real-time status of submitted applications (Applied, Under Review, Shortlisted, Selected, Rejected).
* **Notifications:** Receive instant updates when application statuses change.

### For Club Coordinators
* **Coordinator Dashboard:** Get a quick overview of total applications, active recruitment drives, and shortlisted candidates.
* **Drive Management:** Create and publish new recruitment drives with specific eligibility criteria and deadlines.
* **Application Review System:** View all applicants for a specific drive, review their details and portfolios, and dynamically update their application status.

---

##  Tech Stack

### Frontend
* **React 19** (Bootstrapped with Vite)
* **Tailwind CSS v4** (For modern, responsive, and premium styling)
* **React Router DOM** (For client-side routing and protected routes)
* **Lucide React** (For clean SVG icons)
* **Axios** (For API communication)

### Backend
* **Node.js & Express** (REST API framework)
* **SQLite** (Lightweight relational database)
* **JWT (JSON Web Tokens)** (For secure, stateless authentication)
* **Bcrypt** (For secure password hashing)

---

##  Project Structure

```
CreativeRecruit/
├── backend/                  # Node.js + Express Backend
│   ├── database/             # Seeded SQLite database used by the app
│   ├── data/              # CSV/import data
│   ├── middlewares/          # JWT Auth & Role-based access middlewares
│   ├── routes/               # API endpoint definitions (api.js)
│   ├── utils/                # Database initialization (db.js)
│   └── server.js             # Express server entry point
│
├── frontend/                 # React + Vite Frontend
│   ├── src/
│   │   ├── components/       # Reusable UI components (Navbar, etc.)
│   │   ├── context/          # React Context (AuthContext for global user state)
│   │   ├── pages/            # Page components (Landing, Dashboards, Auth, etc.)
│   │   ├── App.jsx           # Main routing & protected route logic
│   │   ├── index.css         # Tailwind v4 imports & global CSS
│   │   └── main.jsx          # React DOM mounting
│   ├── vite.config.js        # Vite + Tailwind configuration
│   └── package.json          # Frontend dependencies
```

---

## Setup & Installation

### Prerequisites
* Node.js 20.19+ or 22+
* npm

### 1. Backend Setup
1. Open a terminal and navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `backend/.env` from `backend/.env.example` and replace `JWT_SECRET` with a random value of at least 32 characters. The server applies numbered migrations at startup.
4. Optionally add development sample clubs (the command never resets the database and refuses to run in production):
   ```bash
   npm run seed:dev
   ```
5. Start the backend server:
   ```bash
   npm start
   ```
   *The backend will run on `http://localhost:5000`*

---

## Demo & Default Login Accounts

The local development SQLite database (`backend/database/creativerecruit.db`) comes pre-seeded with sample data for testing all role flows. All roles sign in via the main login page at **`http://localhost:5173/login`**.

| Role | Email | Password | Landing Page | Pre-seeded Demo Data |
| --- | --- | --- | --- | --- |
| **Student** | `student@demo.com` | `student123` | `/student/dashboard` | Fully completed profile (skills, projects, achievements, bio, portfolio) with submitted applications across recruitment drives in various stages (*Under Review*, *Shortlisted*, *Selected*, *Rejected*, *Applied*). |
| **Club Coordinator** | `coordinator@demo.com` | `coord123` | `/coordinator/dashboard` | Lead coordinator for Technical Clubs (GDSC, CODE, MLSC, Cybersecurity, etc.) with active recruitment drives, applicant scorecards, and candidate review access. Additional demo coordinators: `bob@demo.com` / `coord123`, `charlie@demo.com` / `coord123`. |
| **Administrator** | `admin@mmcoe.edu.in` | `admin123` | `/admin/users` | Full system access to user management, coordinator invite generation (48h single-use tokens), account activation/deactivation, and club oversight. |

> **Note on SSO vs Password Login:** Password authentication is enabled when `SSO_PROVIDER=none` (the default in `.env.example`). If `SSO_PROVIDER=console` or `google` is set, password forms are disabled in favor of college SSO.

### Administrator Account (Creating / Resetting)
To provision or reset an administrator account at any time, run from `backend/`:
```bash
npm run create-admin
```
The command prompts for the administrator's name, official college email (`@mmcoe.edu.in`), and password. For non-interactive script provisioning:
```bash
ADMIN_NAME="System Admin" ADMIN_EMAIL="admin@mmcoe.edu.in" ADMIN_PASSWORD="admin123" npm run create-admin
```
Once logged in at `/login`, admins can manage accounts and provision club coordinators via one-time, 48-hour invite links generated from `/admin/users`.

### Student Registration & Admin Approval Gate
- **General Email Support:** Students can register and sign in with any standard email provider (including `@gmail.com`, `@yahoo.com`, or `@mmcoe.edu.in`). There is no `.comp` suffix or college domain restriction on registration or password sign-in.
- **Captured Profile Fields:** Registration captures Full Name, Email, Password (min 10 chars), PRN / College Roll Number, Department, Year of Study (1st–4th), Phone Number, and Statement of Intent / Bio.
- **Approval Queue:** Newly registered accounts default to `approval_status = 'pending'` and `is_active = 0`. Administrators review pending applicants directly from `/admin/users` under the **Registration Approvals** tab. Clicking **Approve Access** activates the account and automatically marks email as verified; clicking **Reject** marks the status as rejected with an optional explanation note.
- **Pending Sign-in Protection:** If an unapproved student attempts to sign in, they receive an informative message: *"Your registration is currently pending administrator approval. Please wait for an administrator to review your request."*

### Identity Providers
Local password/email verification works with `EMAIL_PROVIDER=console`; verification links are printed by the development email adapter. For SMTP, set `EMAIL_PROVIDER=smtp`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, and optional SMTP credentials. To simulate college SSO locally, set backend `SSO_PROVIDER=console` and frontend `VITE_SSO_PROVIDER=console`. For Google, configure `SSO_PROVIDER=google`, `GOOGLE_CLIENT_ID`, and the same `VITE_GOOGLE_CLIENT_ID`; Google ID tokens are verified server-side and must carry the MMCOE hosted-domain and `.comp` email claims. Password registration/login is disabled whenever an SSO provider is configured.

### 2. Frontend Setup
1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `frontend/.env` from `frontend/.env.example` if the API is not at the default URL.
4. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *The frontend will run on `http://localhost:5173`*

---

## Authentication & Security
The API requires a configured `JWT_SECRET` of at least 32 characters and refuses to start otherwise. Passwords are hashed using **bcrypt**. Sessions use an httpOnly JWT cookie and a readable double-submit CSRF cookie; the frontend does not persist JWTs in browser storage. Every existing state-changing route runs through `withTransaction()` and writes an append-only `activity_log` row before commit. Do not commit `.env` files, SQLite databases, uploads, or generated logs. Admin-provisioned coordinator accounts, refresh-token rotation, and college SSO are being implemented in Phase 1.

### Production Deployment
Serve both the frontend and API over HTTPS, under the same site (for example, `recruit.example.edu.in` and `api.example.edu.in`). Cross-site frontend/API deployments are not supported by the default `SameSite=Lax` cookie flow. Set `CORS_ORIGIN` to the exact HTTPS frontend origin, `FRONTEND_URL` to that HTTPS frontend, `VITE_API_URL` to the HTTPS API base (for example, `https://api.example.edu.in/api`), `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=lax`, and `EMAIL_PROVIDER=smtp` with SMTP configuration. Set `COOKIE_DOMAIN=.example.edu.in` so the frontend can read the CSRF double-submit cookie across the two subdomains; leave it empty for local development. The JWT cookie remains host-only and httpOnly. Terminate TLS at a trusted reverse proxy and forward HTTPS correctly to Express. Never disable Secure cookies in production.

## Checks
Run `npm test` in `backend`, then `npm run lint` and `npm run build` in `frontend`. The CI workflow runs these gates and applies migrations against a clean database.


