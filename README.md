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
* Node.js (v18+ recommended)
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
3. Seed/reset the demo database (safe for a fresh prototype setup):
   ```bash
   npm run seed
   ```
4. Start the backend server:
   ```bash
   npm start
   ```
   *The backend will run on `http://localhost:5000`*

### 2. Frontend Setup
1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *The frontend will run on `http://localhost:5173`*

---

##  Demo Accounts

You can explore both sides of the platform using the following pre-configured demo accounts:

**Student Account:**
* **Email:** `student@demo.com`
* **Password:** `student123`

**Coordinator Account:**
* **Email:** `coordinator@demo.com`
* **Password:** `coord123`

---

##  Authentication & Security
The platform utilizes **JWT (JSON Web Tokens)** stored in local storage for session management. Passwords are never stored in plain text; they are hashed using **bcrypt** before being saved to the SQLite database. Protected routes ensure that Students cannot access Coordinator dashboards, and vice versa.


