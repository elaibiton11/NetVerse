# Streaming Catalog — Minimal (Allowed Stack Only)

**Stack:** HTML, CSS, Bootstrap, vanilla JS (client) + Node.js, Express, MongoDB (native driver).  
**No frameworks / template engines / extra NPM packages.**

## Quick start
1. Create `.env` from `.env.example` and set `MONGODB_URI` + `APP_SECRET`.
2. Install deps and seed:
   ```bash
   npm install
   npm run seed
   npm start
   ```
3. Open http://localhost:3000

## Notes
- Authentication: simple cookie session implemented with Node `crypto` (PBKDF2 for password hashing). No `express-session`.
- Admin: set `role: "admin"` manually in the DB for your user if you need to access `/api/titles` POST.
  ```js
  db.users.updateOne({ email: "you@example.com" }, { $set: { role: "admin" } })
  ```
- Media files: place mp4 files in `public/media` and set their path when adding titles.
- This project respects the course restriction: **only** HTML/CSS/Bootstrap/JS + Node/Express + MongoDB.
