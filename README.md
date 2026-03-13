# NeverMiss – Full-Stack Setup Guide
# RENDER (https://nevermiss-i6bj.onrender.com/)

> **Never miss an internship, hackathon, or scholarship again.**  
> React + TypeScript + Vite frontend · PHP REST API backend · MySQL database

---

## Architecture

```
Browser (localhost:3000)
  └── React / Vite dev server
        └── Proxy  /api/*  →  http://localhost/NeverMiss/api/*.php
                                    └── PHP (XAMPP Apache)
                                          └── MySQL  (nevermiss DB)
```

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18+ | https://nodejs.org |
| XAMPP | Any recent | Apache + MySQL must both be running |
| phpMyAdmin | bundled with XAMPP | used to create the DB |

---

## Step 1 – Start XAMPP

1. Open **XAMPP Control Panel**.
2. Start **Apache** and **MySQL**.
3. Confirm Apache is serving this folder — your project should already be at  
   `C:\xampp\htdocs\NeverMiss\` (or wherever you placed it).

---

## Step 2 – Create the MySQL Database

1. Open **phpMyAdmin** → `http://localhost/phpmyadmin`
2. Click **SQL** tab (or "Import").
3. Copy-paste (or import) the contents of [`database/schema.sql`](database/schema.sql).
4. Click **Go**.

This creates the `nevermiss` database and the `opportunities` table.

> **Default credentials** used in `api/db.php`:  
> Host: `localhost` · User: `root` · Password: *(empty)*  
> If your XAMPP MySQL uses a different password, edit [`api/db.php`](api/db.php) lines 10–11.

---

## Step 3 – Install Node Dependencies

```bash
npm install
```

---

## Step 4 – Configure Gemini API Key (optional)

The AI features (Deep Dive, Career Roadmap) need a Gemini key.  
Create a `.env.local` file in the project root:

```
GEMINI_API_KEY=your_key_here
```

The app works perfectly without this key — only the AI features will be disabled.

---

## Step 5 – Run the React Dev Server

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

The Vite dev server automatically proxies all `/api/*` requests to  
`http://localhost/NeverMiss/api/` (XAMPP Apache), so no CORS setup is needed during development.

---

## Step 6 – Verify the API

Open these URLs in your browser to confirm PHP + MySQL are working:

```
http://localhost/NeverMiss/api/getOpportunities.php
```

Expected response:
```json
{ "success": true, "data": [] }
```

---

## Using the App

### Smart Capture
1. Click **"+ Capture Opportunity"** in the header or sidebar.
2. Paste any job posting, WhatsApp message, email excerpt, or URL.
3. Click **"Extract Details"** — the PHP backend detects company, role, deadline, and link.
4. Review and edit the extracted fields.
5. Click **"Save to Dashboard"** — the opportunity is stored in MySQL.

### Dashboard
- All captured opportunities appear as cards and in the deadline table.
- Click **Apply** to toggle status between *Applied* and *Not Applied*.
- Click the **×** button to permanently delete an opportunity.
- Stats at the top update automatically.

### AI Features (requires Gemini key)
- **Career Advice** — generates a detailed roadmap using Gemini Pro with deep thinking.
- **AI Deep Dive** (brain icon on each card) — analyses an opportunity and suggests strategy.
- **Search bar** — searches for live opportunities using Gemini + Google Search.

---

## Folder Structure

```
NeverMiss/
├── api/                         ← PHP REST API (served by XAMPP Apache)
│   ├── db.php                   ← Shared PDO connection + CORS headers
│   ├── getOpportunities.php     ← GET  /api/getOpportunities.php
│   ├── addOpportunity.php       ← POST /api/addOpportunity.php
│   ├── extractOpportunity.php   ← POST /api/extractOpportunity.php
│   ├── updateStatus.php         ← PATCH /api/updateStatus.php
│   └── deleteOpportunity.php    ← DELETE /api/deleteOpportunity.php
├── database/
│   └── schema.sql               ← MySQL CREATE TABLE script
├── src/
│   ├── App.tsx                  ← Main React dashboard (integrated)
│   ├── services/
│   │   └── api.ts               ← API fetch helpers (TypeScript)
│   ├── lib/utils.ts
│   ├── index.css
│   └── main.tsx
├── index.html
├── package.json
├── vite.config.ts               ← Proxy /api → XAMPP configured here
└── README.md
```

---

## API Reference

| Method | Endpoint | Body / Params | Description |
|--------|----------|---------------|-------------|
| GET | `/api/getOpportunities.php` | `?status=Applied` (optional) | List all opportunities |
| POST | `/api/addOpportunity.php` | `{ company, role, deadline, link, source, status }` | Add new opportunity |
| POST | `/api/extractOpportunity.php` | `{ text }` | Extract fields from pasted text |
| PATCH | `/api/updateStatus.php` | `{ id, status }` | Toggle Applied / Not Applied |
| DELETE | `/api/deleteOpportunity.php` | `{ id }` | Remove an opportunity |

---

## Production Build

To serve everything from XAMPP without the Vite server:

```bash
npm run build
```

Copy the contents of `dist/` into your htdocs folder (or configure Apache to serve it).  
The `/api` calls will resolve against Apache automatically.

---

## Deploy From Git (Recommended)

This project is best deployed on infrastructure that supports **PHP + MySQL + static files**.

### Option A – cPanel / Shared Hosting (Fastest)

1. Create a MySQL database + user in your hosting panel.
2. Import [`database/schema.sql`](database/schema.sql) into that database.
3. Clone or upload this repo to your server.
4. Build frontend assets (local machine or server):

```bash
npm install
npm run build
```

5. In `public_html/` (or your domain root), place:
      - all files from `dist/` at the root level
      - your `api/` folder as `public_html/api/`
6. Update DB credentials in [`api/db.php`](api/db.php):
      - `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`
7. Open your domain and test:
      - `https://your-domain.com/api/getOpportunities.php`

### Option B – VPS (Ubuntu + Nginx/Apache)

1. SSH into server and clone your repo:

```bash
git clone <your-repo-url> nevermiss
cd nevermiss
```

2. Install dependencies and build frontend:

```bash
npm install
npm run build
```

3. Configure web root to serve `dist/`.
4. Expose PHP endpoints at `/api` by serving the `api/` directory via PHP-FPM/Apache PHP.
5. Create MySQL database and import `database/schema.sql`.
6. Update `api/db.php` with production DB credentials.

---

## Environment Config For Production

Frontend API base is configurable:

```
VITE_API_BASE=/api
```

If your API lives on another domain, set for build:

```
VITE_API_BASE=https://api.your-domain.com/api
```

AI key (optional):

```
GEMINI_API_KEY=your_key_here
```

---

## Zero-Downtime Deploy Flow (Git)

Use this workflow whenever you push updates:

1. Push changes to `main`.
2. Pull latest on server:

```bash
git pull origin main
```

3. Rebuild frontend:

```bash
npm install
npm run build
```

4. Restart/reload web service if needed (Apache/Nginx/PHP-FPM).
5. Smoke-test:
      - homepage loads
      - add opportunity works
      - status update works
      - delete works

---

## Deploy On Render

This repository now includes `Dockerfile` + `render.yaml` for Render deployment.

### Important

Render does **not** provide managed MySQL. You must use an external MySQL database
(for example PlanetScale, Aiven MySQL, or another hosted MySQL provider).

### Steps

1. Push latest code to your GitHub repo.
2. In Render, click **New +** -> **Blueprint**.
3. Select your repo; Render will detect `render.yaml`.
4. Set environment variables in Render service:
      - `DB_HOST`
      - `DB_NAME`
      - `DB_USER`
      - `DB_PASS`
5. Create the service.
6. Import [`database/schema.sql`](database/schema.sql) into your external MySQL DB.
7. Open:
      - `https://<your-render-service>.onrender.com/api/getOpportunities.php`
      - then the root app URL.

If `/api/getOpportunities.php` returns JSON, your deployment is successful.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Could not reach the PHP API` banner | Start Apache in XAMPP Control Panel |
| `Database connection failed` | Check `DB_USER`/`DB_PASS` in `api/db.php`; run schema.sql |
| Empty dashboard after saving | Verify the `nevermiss` database and `opportunities` table exist |
| CORS error in browser console | Make sure the Vite proxy is running (`npm run dev`), never open `index.html` directly |
| AI features not working | Add `GEMINI_API_KEY=...` to `.env.local` and restart `npm run dev` |
