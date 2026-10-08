const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const csv = require('csv-parser');

const dbDir = path.resolve(__dirname, '../database');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir);
}

const dbPath = path.join(dbDir, 'creativerecruit.db');
// Remove old db if exists to start fresh as requested
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
}

const db = new sqlite3.Database(dbPath);

const initSchema = `
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    department TEXT,
    year INTEGER,
    phone TEXT,
    portfolio_url TEXT,
    bio TEXT,
    profile_picture_url TEXT,
    skills TEXT DEFAULT '[]',
    interests TEXT DEFAULT '[]',
    projects TEXT DEFAULT '[]',
    achievements TEXT DEFAULT '[]',
    github_url TEXT,
    linkedin_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    description TEXT,
    logo_url TEXT,
    coordinator_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (coordinator_id) REFERENCES users(id)
);

CREATE TABLE recruitment_drives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    eligibility TEXT,
    open_date TEXT,
    deadline TEXT,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (club_id) REFERENCES clubs(id)
);

CREATE TABLE applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drive_id INTEGER,
    student_id INTEGER,
    portfolio_url TEXT,
    motivation TEXT,
    skills TEXT,
    experience TEXT,
    status TEXT DEFAULT 'Applied',
    notes TEXT DEFAULT '',
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (drive_id) REFERENCES recruitment_drives(id),
    FOREIGN KEY (student_id) REFERENCES users(id)
);

CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT NOT NULL,
    message TEXT,
    type TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
`;

const seedDatabase = async () => {
    db.serialize(() => {
        db.exec(initSchema, async (err) => {
            if (err) {
                console.error('Schema creation error:', err);
                return;
            }
            console.log('Schema created.');

            try {
                const password_hash = await bcrypt.hash('student123', 10);
                const coord_hash = await bcrypt.hash('coord123', 10);

                // Seed users
                const stmtUser = db.prepare(`INSERT INTO users (name, email, password_hash, role, department, year, phone, portfolio_url, bio, skills, interests, projects, achievements, github_url, linkedin_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                
                // Add demo coordinators. The first account is the primary demo account used in walkthroughs.
                stmtUser.run('Alice Coordinator', 'coordinator@demo.com', coord_hash, 'coordinator', 'Computer Science', 4, '555-0100', '', 'Lead Coordinator for the Technical Clubs program.', '[]', '["Recruitment","Community","Technology"]', '[]', '["Campus Leadership Award"]', '', '');
                stmtUser.run('Bob Admin', 'bob@demo.com', coord_hash, 'coordinator', 'Business', 3, '555-0101', '', 'Coordinator for the core engineering clubs.', '[]', '["Robotics","Operations"]', '[]', '[]', '', '');
                stmtUser.run('Charlie Comm', 'charlie@demo.com', coord_hash, 'coordinator', 'Arts', 4, '555-0102', '', 'Coordinator for extracurricular and cultural clubs.', '[]', '["Events","Design","Culture"]', '[]', '[]', '', '');

                // Demo student is intentionally well-populated so the prototype looks complete on first login.
                stmtUser.run(
                    'Demo Student', 'student@demo.com', password_hash, 'student', 'Computer Science', 2, '555-0200',
                    'https://github.com/student', 'Passionate about frontend development and building useful campus products.',
                    '["React","JavaScript","Tailwind CSS","Node.js"]',
                    '["Web Development","UI/UX","Open Source"]',
                    '[{"name":"Campus Connect","description":"A student community platform for discovering clubs and events.","technologies":"React, Node.js","link":"https://github.com/student/campus-connect"},{"name":"Event Planner","description":"A responsive event planning interface built as a college project.","technologies":"React, Tailwind CSS","link":"https://github.com/student/event-planner"}]',
                    '["Hackathon Finalist 2026","Frontend Development Workshop Volunteer"]',
                    'https://github.com/student', 'https://linkedin.com/in/demo-student'
                );
                for(let i=2; i<=10; i++) {
                    stmtUser.run(`Student ${i}`, `student${i}@demo.com`, password_hash, 'student', 'Engineering', 2, '555-0000', '', `I am student ${i}`, '["Communication","Teamwork"]', '["Technology","Clubs"]', '[]', '[]', '', '');
                }

                // Seed clubs
                const stmtClub = db.prepare('INSERT INTO clubs (name, category, description, logo_url, coordinator_id) VALUES (?, ?, ?, ?, ?)');
                
                // Technical (9)
                stmtClub.run('GDSC — Google Developer Students Club', 'Technical', 'Google Developer Student Clubs are community groups for college and university students.', '', 1);
                stmtClub.run('CODE — Code of Developers and Engineers', 'Technical', 'A club focused on programming and engineering solutions.', '', 1);
                stmtClub.run('MLSC — Microsoft Learn Students Club', 'Technical', 'Microsoft Learn Student Ambassadors club.', '', 1);
                stmtClub.run('Cybersecurity Club', 'Technical', 'Focusing on ethical hacking, security and networking.', '', 1);
                stmtClub.run('S4DS — Society for Data Science', 'Technical', 'Promoting data science, machine learning and AI.', '', 1);
                stmtClub.run('AESA — AI & DS Engineering Students Association', 'Technical', 'Association for AI and Data Science students.', '', 1);
                stmtClub.run('NEURA — Network Enthusiasts Understanding Research in AI', 'Technical', 'Research focused AI community.', '', 1);
                stmtClub.run('IT Tech Club', 'Technical', 'Information technology specific activities and projects.', '', 1);
                stmtClub.run('ITSA', 'Technical', 'IT Students Association.', '', 1);
                
                // Core (8)
                stmtClub.run('SAEINDIA', 'Core', 'Society of Automotive Engineers INDIA collegiate chapter.', '', 2);
                stmtClub.run('Robocon Team Rudra', 'Core', 'Official robotics team participating in Robocon.', '', 2);
                stmtClub.run('VLSI & Embedded System Club', 'Core', 'For students interested in hardware and embedded systems.', '', 2);
                stmtClub.run('RC Drone Club', 'Core', 'Designing, building, and racing RC drones.', '', 2);
                stmtClub.run('Electronics Hobby Club', 'Core', 'A place to tinker with electronics and IoT.', '', 2);
                stmtClub.run('BETA', 'Core', 'Biomedical Engineering Technology Association.', '', 2);
                stmtClub.run('Zenith Astronomy Club', 'Core', 'Explore the stars and space technologies.', '', 2);
                stmtClub.run('Aadhar Club', 'Core', 'Core engineering solutions for society.', '', 2);

                // Extracurricular (5)
                stmtClub.run('Career Development Club', 'Extracurricular', 'Focusing on placements and soft skills.', '', 3);
                stmtClub.run('Career Guidance Club', 'Extracurricular', 'Guidance for higher studies and career paths.', '', 3);
                stmtClub.run('Design Thinking & Innovation Club', 'Extracurricular', 'Promoting innovative thinking and design principles.', '', 3);
                stmtClub.run('The Capital Society', 'Extracurricular', 'Finance, investing, and economics.', '', 3);
                stmtClub.run('Kalangan', 'Extracurricular', 'Cultural and arts club.', '', 3);

                stmtClub.finalize();

                // Seed recruitment drives. Every drive is attached to a club owned by a demo coordinator,
                // so coordinator dashboards and management screens are populated on first login.
                const stmtDrive = db.prepare('INSERT INTO recruitment_drives (club_id, title, description, eligibility, open_date, deadline, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
                const today = new Date().toISOString().split('T')[0];
                const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                const inThreeWeeks = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

                // Alice / Technical
                stmtDrive.run(1, 'Frontend Developer Fall 2026', 'Build polished React experiences for campus products.', 'Know HTML/CSS/JS', today, nextWeek, 'open');
                stmtDrive.run(1, 'Backend Engineer', 'Work on APIs and data services for student projects.', 'CS / IT or equivalent experience', today, inThreeWeeks, 'open');
                stmtDrive.run(1, 'UI/UX Designer', 'Design accessible, student-first product experiences.', 'Figma or equivalent design experience', today, nextWeek, 'open');
                stmtDrive.run(2, 'Open Source Contributor', 'Help maintain community projects and documentation.', 'Git/GitHub basics', today, inThreeWeeks, 'open');

                // Bob / Core
                stmtDrive.run(10, 'Junior Automotive Analyst', 'Analyze mobility and automotive trends.', 'Any engineering major', today, nextWeek, 'open');
                stmtDrive.run(11, 'Hardware Engineer', 'Work on microcontrollers and robotics prototypes.', 'ECE/CS or hands-on electronics', today, inThreeWeeks, 'open');
                stmtDrive.run(13, 'Drone Systems Associate', 'Assist with RC drone builds and testing.', 'Interest in electronics and embedded systems', today, nextWeek, 'open');

                // Charlie / Extracurricular
                stmtDrive.run(22, 'Lead Actor', 'Audition for the upcoming campus production.', 'Acting or stage experience', today, nextWeek, 'open');
                stmtDrive.run(18, 'Social Media Manager', 'Own social content and event promotion.', 'Creative writing and social media skills', today, inThreeWeeks, 'open');
                stmtDrive.run(20, 'Innovation Program Associate', 'Help run design-thinking workshops.', 'Communication and facilitation skills', today, nextWeek, 'open');
                stmtDrive.run(1, 'Past UI/UX Drive', 'A completed design drive kept for application history.', 'Figma skills', today, nextWeek, 'closed');
                stmtDrive.finalize();

                // Seed applications with unique student/drive pairs. This avoids duplicate-looking entries
                // while still giving both student and coordinator screens meaningful activity.
                const stmtApp = db.prepare('INSERT INTO applications (drive_id, student_id, portfolio_url, motivation, skills, experience, status) VALUES (?, ?, ?, ?, ?, ?, ?)');

                // Demo student's visible application history.
                stmtApp.run(1, 4, 'https://github.com/student', 'I enjoy building polished React interfaces and would love to contribute.', 'React, JavaScript, Tailwind CSS', 'Campus Connect project', 'Applied');
                stmtApp.run(2, 4, 'https://github.com/student', 'I like building reliable APIs and want to learn from the team.', 'Node.js, Express', 'Event Planner API', 'Under Review');
                stmtApp.run(5, 4, 'https://github.com/student', 'I enjoy solving analytical problems and learning about mobility.', 'Python, Excel', 'Academic projects', 'Shortlisted');
                stmtApp.run(8, 4, 'https://github.com/student', 'I have experience creating content and presenting technical work.', 'Writing, Canva', 'Club event volunteer', 'Selected');

                // Additional candidate activity for coordinator dashboards.
                const seededApps = [
                    [1,5,'https://portfolio.example/student5','Strong frontend fundamentals and attention to detail.','React, CSS','2 projects','Under Review'],
                    [1,6,'https://portfolio.example/student6','Excited to contribute to a real product team.','JavaScript, React','1 project','Shortlisted'],
                    [2,7,'https://portfolio.example/student7','Interested in APIs and backend architecture.','Node.js, SQL','2 projects','Applied'],
                    [2,8,'https://portfolio.example/student8','Comfortable working across frontend and backend.','Node.js, React','3 projects','Selected'],
                    [3,9,'https://portfolio.example/student9','I enjoy turning user needs into clean interfaces.','Figma, UX Research','Design portfolio','Under Review'],
                    [5,10,'https://portfolio.example/student10','Curious about automotive data and market analysis.','Excel, Python','Research project','Shortlisted'],
                    [6,5,'https://portfolio.example/student5','Hands-on electronics and prototyping experience.','Arduino, C++','Robotics project','Applied'],
                    [7,6,'https://portfolio.example/student6','Interested in drones and embedded systems.','C++, Embedded','Personal project','Under Review'],
                    [8,7,'https://portfolio.example/student7','Confident on stage and in collaborative rehearsals.','Acting, Public Speaking','College theatre','Applied'],
                    [9,8,'https://portfolio.example/student8','Experienced in planning content calendars and campaigns.','Content, Social Media','Club campaign','Shortlisted'],
                    [10,9,'https://portfolio.example/student9','Love facilitating workshops and team activities.','Facilitation, Design Thinking','Workshop volunteer','Applied']
                ];
                seededApps.forEach(app => stmtApp.run(...app));
                stmtApp.finalize();

                // Seed realistic notification activity for the demo student.
                const stmtNotif = db.prepare('INSERT INTO notifications (user_id, title, message, type, is_read) VALUES (?, ?, ?, ?, ?)');
                stmtNotif.run(4, 'Welcome to CreativeRecruit!', 'Your profile is ready. Explore active drives and apply to clubs that match your interests.', 'system', 1);
                stmtNotif.run(4, 'Application under review', 'Your application for Backend Engineer is now under review by the coordinator.', 'status_update', 0);
                stmtNotif.run(4, 'You have been shortlisted', 'Great news! You have been shortlisted for Junior Automotive Analyst.', 'status_update', 0);
                stmtNotif.run(4, 'Application selected', 'Congratulations! Your application for Lead Actor has been selected.', 'status_update', 0);
                stmtNotif.run(4, 'New opportunity', 'Frontend Developer Fall 2026 is accepting applications until the deadline.', 'drive_announcement', 0);
                stmtNotif.finalize();

                console.log('Database seeded successfully!');
                
                setTimeout(() => db.close(), 1000);
            } catch (error) {
                console.error('Error during seeding:', error);
            }
        });
    });
};

seedDatabase();
