# KUDO KUDO - Smart Attendance Management System

A modern, mobile-optimized attendance management system built with React, Tailwind CSS, and Firebase.

## Features

- **Face Recognition**: Secure attendance tracking using face-api.js.
- **Geofencing**: Ensures attendance is only recorded within the specified work location.
- **Role-Based Access Control**: Different views and permissions for Employees, Managers, and Admins.
- **Payroll Management**: Automated salary calculations, bonuses, deductions, and financial reports.
- **Real-time Notifications**: Instant alerts for salary updates, attendance events, and requests.
- **Dynamic Scheduling**: Weekly work schedules and group-based management.
- **Mobile Optimized**: 100% responsive design with PWA support.

## Deployment to GitHub Pages

I have added an automated deployment system using **GitHub Actions**. This is the most reliable way to fix the "white screen" and "MIME type" errors.

### 🚀 How to activate the fix:
1. **Push your code**: Commit and push these latest changes to your `main` branch.
2. **Enable GitHub Actions**: 
   - Go to your repository on GitHub.
   - Click on **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, change the dropdown from "Deploy from a branch" to **"GitHub Actions"**.
3. **Wait for completion**: 
   - Click the **Actions** tab at the top of your repo.
   - You will see a workflow named "Deploy static content to Pages" running.
   - Once it turns green, your site will be live and functional!

### 🔍 Why it was failing:
- **MIME Type Error**: GitHub Pages was trying to serve the raw `.tsx` files. The new system compiles these into high-performance JavaScript that browsers can understand.
- **Path Issues**: The automated build correctly handles the `/KUDO-KUDO/` subdirectory automatically.
- **NoJekyll**: I added a `.nojekyll` file to ensure GitHub doesn't block your app's internal folders.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 4.
- **Animations**: Framer Motion.
- **Database & Auth**: Firebase Firestore & Firebase Authentication.
- **Export**: jsPDF, SheetJS (XLSX).

## Getting Started

1. Clone the repository.
2. Install dependencies: `npm install`.
3. Set up your Firebase project and add your configuration to `src/firebase-applet-config.json` (based on `.env.example`).
4. Run development server: `npm run dev`.
5. Build for production: `npm run build`.

## License

Private
