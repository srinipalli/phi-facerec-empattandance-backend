# ArgusScan – Face Recognition Attendance System (PWA)

ArgusScan is a fast, secure, and privacy-conscious face recognition–powered attendance system with a Progressive Web App (PWA) interface for both punch-in and punch-out. It uses Flask, face_recognition, and SQLite, making it lightweight and easy to deploy.

---

## Features

- Face-based attendance (no passwords or manual login)
- Unified PWA for Punch-In and Punch-Out
- Installable as a PWA on mobile/desktop
- Admin dashboard with:
  - Attendance logs and filtering
  - Pagination and dark mode support
  - Export to PDF
- Stores face encodings securely (no image files saved)
- Uses lightweight SQLite database (MongoDB-compatible structure)

---

## Tech Stack

- **Backend:** Flask, face_recognition, SQLite
- **Frontend:** HTML, CSS, JavaScript (with PWA features)
- **Libraries:** Pillow, NumPy, dotenv, ReportLab

---

## Getting Started (Local Setup)

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Ami202512/ArgusScan.git

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt

4. **Run the app**
   ```bash
   python app.py

6. **Open in browser**
   ```bash
   http://localhost:5000
