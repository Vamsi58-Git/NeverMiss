<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# NeverMiss – Full-Stack Setup Guide

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

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Could not reach the PHP API` banner | Start Apache in XAMPP Control Panel |
| `Database connection failed` | Check `DB_USER`/`DB_PASS` in `api/db.php`; run schema.sql |
| Empty dashboard after saving | Verify the `nevermiss` database and `opportunities` table exist |
| CORS error in browser console | Make sure the Vite proxy is running (`npm run dev`), never open `index.html` directly |
| AI features not working | Add `GEMINI_API_KEY=...` to `.env.local` and restart `npm run dev` |
