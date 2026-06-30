<div align="center">

<img src="frontend/public/favicon.svg" alt="Community Hero Logo" width="160" height="160" />

# 🦸‍♂️ Community Hero

**A Next-Generation Civic Infrastructure Platform.**

[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black&style=for-the-badge)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white&style=for-the-badge)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white&style=for-the-badge)](https://nodejs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-V10-FFCA28?logo=firebase&logoColor=black&style=for-the-badge)](https://firebase.google.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwind-css&logoColor=white&style=for-the-badge)](https://tailwindcss.com/)

[**Working Process**](#-how-it-works-in-the-real-world) • [**User Profiles**](#-user-profiles--roles) • [**Architecture**](#-system-architecture) • [**Setup Guide**](#-getting-started-setup-guide)

</div>

---

## 📖 Executive Summary

**Community Hero** replaces archaic, manual municipal ticketing systems with a highly automated, mobile-first Progressive Web Application (PWA). It empowers citizens to report civic issues (like potholes, downed power lines, or vandalism) instantly, while providing municipal workers and administrators with powerful, glassmorphism-styled dashboards to track, assign, and resolve these issues efficiently.

We've adopted a 100% Serverless architecture utilizing **Firebase** for Authentication and Database storage, making the platform infinitely scalable and incredibly fast.

---

## 🌍 How It Works in the Real World

The lifecycle of a civic issue in Community Hero follows a streamlined, digital-first approach:

1. **Report (The Citizen):** A citizen notices a broken streetlight. They open the Community Hero web app on their phone, log in with Google, and submit a report with the location and description. 
2. **Gamification (The Reward):** The citizen instantly receives XP (Experience Points) for their civic duty, contributing to their trust score and unlocking badges on their profile.
3. **Triage (The Admin):** A city administrator sees the new ticket on their Admin Dashboard queue. They review the severity and assign the ticket to an available Public Works Officer.
4. **Action (The Officer):** The assigned Officer receives the ticket on their mobile Dashboard. They drive to the location, fix the streetlight, and mark the ticket as `resolved` (optionally uploading proof).
5. **Resolution:** The citizen is notified that their reported issue has been fixed, closing the loop and building community trust.

---

## 👥 User Profiles & Roles

Community Hero features a strict Role-Based Access Control (RBAC) system. When a user first signs up, they are automatically assigned the **Citizen** role. Only an **Admin** can promote a user to an Officer or Admin role.

### 1. 🧍 Citizen
* **Real-World Persona:** Everyday residents of the municipality.
* **Capabilities:** 
  * Can submit new civic issues.
  * Can view the status of their own reported issues.
  * Earns XP, levels up, and collects gamification badges for community participation.

### 2. 👷 Officer
* **Real-World Persona:** Municipal workers, public works employees, sanitation crews, etc.
* **Capabilities:**
  * Has a dedicated "Officer Dashboard" showing their assigned queue.
  * Can view the exact location and details of assigned issues.
  * Can update the status of an issue (e.g., from `assigned` to `in_progress` to `resolved`).

### 3. 👑 Admin
* **Real-World Persona:** City managers, dispatchers, and department heads.
* **Capabilities:**
  * Has access to the global "Admin Dashboard".
  * Can view ALL issues reported across the city.
  * Can assign unassigned tickets to specific Officers or teams.
  * Can manage users (promote a Citizen to an Officer/Admin, or demote them).
  * Can view high-level analytics (total open issues, average resolution times).

---

## 🏗️ System Architecture

Our platform utilizes a highly scalable, fully serverless stack.

* **Frontend:** React + Vite + Tailwind CSS (with custom Glassmorphism and Neumorphism UI components).
* **Backend:** Node.js + Express (Deployed as Vercel Serverless Functions).
* **Database:** Firebase Firestore (NoSQL Document Database).
* **Authentication:** Firebase Authentication (Email/Password & Google OAuth).

---

## 🚀 Getting Started (Setup Guide)

Follow these instructions to run the entire stack locally.

### 1. Prerequisites
* **Node.js** (v18 or higher)
* **Git**
* A **Firebase Project** (with Firestore and Authentication enabled)

### 2. Configure Firebase Credentials
You must set up your environment variables for both the frontend and backend to talk to Firebase.

**Create `.env` in the root directory:**
\`\`\`env
# Frontend Config
VITE_FIREBASE_API_KEY=your_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_API_URL=http://localhost:8000/api

# Backend Config
PORT=8000
CORS_ORIGINS=http://localhost:5173
FIREBASE_SERVICE_ACCOUNT_BASE64=your_base64_encoded_service_account_json
\`\`\`
*(Note: To get your `FIREBASE_SERVICE_ACCOUNT_BASE64`, download your Firebase Admin SDK service account JSON file, convert the entire file content to a base64 string, and paste it here).*

### 3. Start the Backend
Open a terminal and start the Express server:
\`\`\`bash
cd backend
npm install
npm run dev
\`\`\`
*The backend will start on `http://localhost:8000`.*

### 4. Start the Frontend
Open a second terminal and start the Vite React app:
\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`
*The frontend will start on `http://localhost:5173`.*

---

## 🌐 Deployment (Vercel)

Both the Frontend and Backend are optimized for seamless Vercel deployment.

1. **Deploy Backend:** Create a Vercel project pointing to the `backend/` directory. Add `FIREBASE_SERVICE_ACCOUNT_BASE64` to the Vercel Environment Variables.
2. **Deploy Frontend:** Create a separate Vercel project pointing to the `frontend/` directory. Add your `VITE_FIREBASE_*` keys to the Environment Variables. 
3. **Link Them:** In the Frontend Vercel project, set `VITE_API_URL` to your newly deployed backend URL (e.g., `https://my-backend.vercel.app/api`).

---
<div align="center">
  <p><i>Building the smart cities of tomorrow, together.</i></p>
</div>
