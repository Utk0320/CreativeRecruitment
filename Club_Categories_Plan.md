# Implementation Plan: Discover Clubs Categorization

## 1. Current Architecture Analysis
The "Discover Clubs" functionality relies on a React frontend and an Express/SQLite backend. 
- **Data Source:** The clubs are stored in a local SQLite database (`backend/database/creativerecruit.db`). The data is currently populated by a seed script (`setupDb.js`) containing dummy records with categories like "Technology" and "Arts & Culture".
- **Frontend Fetching:** The `StudentClubs.jsx` page fetches the list of clubs from `GET /api/clubs` when the component mounts and stores it in React state.
- **Search & Filtering Logic:** Both search and category filtering currently happen on the client side. The frontend iterates over the fetched clubs array, checking if the `category` matches the selected tab and if the `name` includes the search query string. 
- **Routing:** Clicking a club card navigates to `/student/clubs/:id`, which fetches detailed info from `GET /api/clubs/:id`.

## 2. Files That Need Modification
- **`backend/utils/setupDb.js`**: Needs to be heavily modified to remove the old dummy clubs and insert the 22 new specific college clubs. It also needs adjustments to ensure dummy recruitment drives map to the new valid `club_id`s.
- **`frontend/src/pages/StudentClubs.jsx`**: Needs modification to replace the hardcoded array of category tabs (Technology, Creative, Music, etc.) with the new list (Technical, Core, Extracurricular).

## 3. Data Changes
The `clubs` table schema in SQLite is perfectly fine (`id`, `name`, `category`, `description`, etc.), but the **seed data** must be completely replaced. 
I will update the initialization script to seed exactly these records:
- **Technical (9):** GDSC, CODE, MLSC, Cybersecurity Club, S4DS, AESA, NEURA, IT Tech Club, ITSA.
- **Core (8):** SAEINDIA, Robocon Team Rudra, VLSI & Embedded System Club, RC Drone Club, Electronics Hobby Club, BETA, Zenith Astronomy Club, Aadhar Club.
- **Extracurricular (5):** Career Development Club, Career Guidance Club, Design Thinking & Innovation Club, The Capital Society, Kalangan.

*(Note: "Kalangan" will be explicitly hardcoded with the exact string `"Extracurricular"` so it does not appear anywhere else).*

## 4. Frontend Changes
In `StudentClubs.jsx`:
- Locate the hardcoded state/array that dictates the category pills: `['All', 'Technology', 'Creative', 'Music', 'Cultural', 'Sports', 'Literary']`.
- Replace it strictly with: `['All', 'Technical', 'Core', 'Extracurricular']`.
- The existing filtering logic `(selectedCategory === 'All' || club.category === selectedCategory)` and search logic `(club.name.toLowerCase().includes(searchQuery.toLowerCase()))` will natively handle the new data without requiring a complex UI rewrite. 
- The club cards will render normally.

## 5. Backend/Database Changes
- **No schema modifications are required.** The existing REST APIs (`GET /api/clubs`) and the database schema are perfectly structured to handle these new entries.
- **Database Wipe & Re-seed:** Because SQLite enforces foreign key constraints, safely deleting the old dummy clubs means we also need to clear out the old dummy recruitment drives and applications, and generate new ones mapped to the newly inserted clubs. Rerunning an updated `setupDb.js` will handle this automatically.

## 6. Testing Plan
After implementation, I will perform the following manual verifications:
1. **Category "All":** Verify that exactly 22 clubs appear.
2. **Category Tabs:** Click "Technical", "Core", and "Extracurricular" to verify only the correctly mapped clubs appear.
3. **The "Kalangan" Rule:** Click the "Extracurricular" tab to verify "Kalangan" is present, and check "Technical" and "Core" to ensure it is absolutely absent.
4. **Search + Category:** Select the "Technical" tab, type "GDSC" into the search bar, and verify the list filters down correctly. Type "Kalangan" while in the "Technical" tab and verify it returns 0 results (proving search respects the active category).
5. **View Club:** Click a club card (e.g., MLSC) to verify the app navigates successfully to `/student/clubs/:id` without crashing.

## 7. Implementation Steps
1. **Modify Data:** Edit `backend/utils/setupDb.js` to contain the new 22 clubs and safely re-map dummy recruitment drives to the new club IDs.
2. **Execute Data Change:** Run `node backend/utils/setupDb.js` to wipe the old SQLite data and inject the new clubs.
3. **Modify Frontend:** Edit `frontend/src/pages/StudentClubs.jsx` to update the category tabs array.
4. **Restart & Test:** Ensure both the Vite and Express servers are running, then run through the Testing Plan.

## 8. Risks / Things That Could Break
- **Loss of prior test data:** Because we are wiping and re-seeding the database to cleanly insert these 22 new clubs, any accounts, applications, or profile edits you manually created in the last 20 minutes via the UI will be reset to the default seed state.
- **Foreign Key Mismatches:** If the seed script isn't updated carefully, dummy recruitment drives might try to reference old `club_id`s that no longer exist, throwing an SQLite constraint error. I have accounted for this in step 1 of the implementation.
- **Case Sensitivity:** If the frontend categories array says "Technical" but the database seed uses "technical", the filter will break. I will ensure exact casing alignment.

