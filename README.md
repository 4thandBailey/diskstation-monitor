# DiskStation Monitor (DSM)

> **Real-time fleet monitoring for Synology NAS appliances** — built on the Synology File Station Official API.
> Frontend on **Netlify** · Backend on **Railway** · CDN via **Bunny.net** · Storage on **Backblaze B2** · Cache with **Redis**

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start)
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DSM API](https://img.shields.io/badge/Synology-File%20Station%20API-cyan)](https://global.download.synology.com/download/Document/Software/DeveloperGuide/Package/FileStation/All/enu/Synology_File_Station_API_Guide.pdf)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Local Development](#local-development)
- [Deployment](#deployment)
  - [Frontend — Netlify](#frontend--netlify)
  - [Backend — Railway](#backend--railway)
  - [CDN — Bunny.net](#cdn--bunnynet)
  - [Object Storage — Backblaze B2](#object-storage--backblaze-b2)
  - [Cache — Redis](#cache--redis)
- [Device Registration](#device-registration)
  - [Scoped API Tokens](#scoped-api-tokens)
  - [MD5 Scan Scope](#md5-scan-scope)
- [Poll Engine](#poll-engine)
- [File Station API Integration](#file-station-api-integration)
- [Authentication Portal](#authentication-portal)
- [SMTP Alerts](#smtp-alerts)
- [File Integrity Monitoring](#file-integrity-monitoring)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Multi-Administrator Isolation](#multi-administrator-isolation)
- [Security](#security)
- [Security Architecture](#security-architecture)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**DiskStation Monitor (DSM)** is an open-source fleet management portal for Synology NAS appliances. It provides a single pane of glass across all managed devices — health status, active connections, volume growth trends, per-folder storage attribution, MD5 file integrity verification, DSM update tracking, virtual folder mount status, background task visibility, and real-time IP change detection — surfaced through a responsive, light/dark-mode web interface with a dedicated Security page covering token management, access logging, dependency scanning, encryption status, and GDPR data rights.

Unlike third-party monitoring services that probe from external data centers, DSM's poll engine runs **LAN-resident** — authenticating against each appliance via per-device **scoped API tokens** issued from DSM's own API Portal, then calling File Station endpoints for rich, authenticated health data. Every private IP address (`192.168.x`, `10.x`, `172.16.x`) is fully supported. No administrative DSM credentials are stored in this portal or on Railway.

Each administrator manages their own isolated portfolio of appliances. Isolation is enforced at the database query layer using the verified JWT subject claim — no administrator can view, modify, or receive alerts for another administrator's devices.

---

## Features

### Fleet Management

- **Serial-number registration** — add any Synology appliance by serial number; model, type, and hardware specs resolved from the built-in prefix database (30+ models across DS, RS, FS, UC series)
- **Scoped API token registration** — each device authenticates via a narrowly-scoped token from DSM Control Panel → Security → API Portal; no administrative credentials stored anywhere
- **MD5 sentinel scope** — configurable per-device list of high-value directories; full-volume scanning available as an explicit opt-in
- **DSM port selection** — HTTPS (5001) or HTTP (5000) per device at registration
- **Interactive fleet map** — Leaflet + OpenStreetMap with color-coded health markers; Nominatim geocoding at registration
- **Live summary strip** — total devices, healthy count, active alerts, pending DSM updates, pending package updates; 8-second refresh

### Real-Time Monitoring

- **Native poll engine** — LAN-resident `SYNO.API.Auth` heartbeat; 30 s – 5 min configurable interval; works on all private RFC 1918 addresses
- **Per-device poll timeline** — 20-tick history color-coded by outcome (green = OK, amber = slow, red = miss/timeout)
- **Live poll event log** — timestamped stream of every poll result with latency in milliseconds
- **Poll health summary** — fleet-wide healthy count, average latency, success rate, and last cycle timestamp
- **IP address change detection** — alerts when a device's IP differs from the registered value; previous IP retained for audit
- **Power loss detection** — consecutive missed polls beyond threshold trigger a critical alert with last-seen timestamp
- **CPU and RAM trending** — polled per cycle; configurable threshold alerts
- **Connection tracking** — active SMB, NFS, FTP, SFTP, WebDAV, iSCSI, and rsync sessions via `SYNO.Core.CurrentConnection` (labeled as Core API in the UI — distinct from File Station)

### File Integrity & Storage

- **MD5 integrity scanning** — `SYNO.FileStation.MD5` against sentinel-scoped baseline manifest stored in Backblaze B2
- **Per-folder growth attribution** — `SYNO.FileStation.DirSize` every 6 hours; 7-day weighted average growth rate per directory with percentage-of-volume and owner
- **Volume growth trending** — aggregate GB/day and days-to-full per device
- **CheckPermission pre-flight** — `SYNO.FileStation.CheckPermission` before every write; surfaces permission drift as a distinct diagnosable state rather than a silent failure
- **Virtual folder enumeration** — `SYNO.FileStation.VirtualFolder` lists all CIFS, NFS, and ISO mount points fleet-wide with mount status, remote path, and age
- **Background task visibility** — `SYNO.FileStation.BackgroundTask` surfaces running copy/move/delete/compress/extract operations with live progress bars; distinguishes high CPU from task load vs. anomalous conditions
- **Tamper-evident audit log** — `SYNO.FileStation.Sharing` generates device-hosted sharing links on each integrity event; the audit record survives portal database loss
- **Favorites registry** — `SYNO.FileStation.Favorite` stores device configuration bookmarks on NAS-PRIMARY with a failover replica on NAS-BACKUP; the agent reconstructs its device list without the Railway database

### Security & Compliance

- **Security Health summary** — live operational posture across token coverage, token expiry, failed sign-in attempts, dependency vulnerabilities, SAST findings, and offline devices; actionable items surface with direct resolution links
- **Scoped API token management** — per-device token registry derived from live device data; revoke, rotate, and register from the Security page; revocation immediately propagates to CheckPermission pre-flight
- **Administrator access log** — sign-in events, token rotations, failed attempts with IP and user agent; failed attempts flagged in red
- **Encryption status, network security, data retention, and incident response panels** — complete ISO A.10, A.13, A.17, A.16 coverage
- **Security report export** — downloads structured JSON with fleet token inventory, recent access log, dependency audit results, SAST summary, encryption configuration, and data retention schedule

### Access & UX

- **Multi-administrator portal** — email/password signup and sign-in; SSO via Microsoft, Google, and GitHub OAuth
- **Two-token JWT sessions** — 15-minute access token in `sessionStorage`; 7-day HttpOnly refresh token cookie; Redis-backed invalidation on logout
- **Shared session state** — auth portal writes token on sign-in; dashboard reads it on load; sign-out clears both
- **User dropdown** — avatar shows signed-in email, role badge, Settings and Security shortcuts, Sign Out
- **Responsive layout** — desktop, tablet (≤1024px), mobile (≤768px), small phone (≤390px)
- **Light and dark mode** — system preference detection with manual toggle; shared between auth portal and dashboard via `localStorage`

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Administrator Browser                        │
│        dsm-auth.html (sign-in)  →  synology-monitor.html        │
│        sessionStorage: access token  |  localStorage: theme      │
└────────────────────────┬─────────────────────────────────────────┘
                         │ HTTPS REST  (Authorization: Bearer)
                         │ HttpOnly cookie  (refresh token)
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Railway Backend  (Node.js 20 LTS)              │
│                                                                  │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │   Auth API   │  │  Devices API  │  │  Poll Engine Worker  │  │
│  │  /auth/*     │  │  /api/*       │  │  token-auth per dev  │  │
│  └──────┬───────┘  └──────┬────────┘  └──────────┬───────────┘  │
│         │                 │                       │              │
│  ┌──────▼─────────────────▼───────────────────────▼───────────┐  │
│  │                   PostgreSQL  (Railway plugin)              │  │
│  │  users · devices · device_tokens · alerts · poll_results   │  │
│  │  dirsize_results · integrity_log · access_log · smtp_config │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────┐       ┌──────────────────────────────┐  │
│  │  Redis  (Railway)  │       │  Backblaze B2                │  │
│  │  session store     │       │  manifests/{device}/{date}   │  │
│  │  alert cooldown    │       │  audit/{user}/{year}/{month} │  │
│  │  poll result TTL   │       │  exports/{user}/{timestamp}  │  │
│  └────────────────────┘       └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
         │ LAN-resident poll agent  (Docker / Node.js / Syno Package)
         │ Auth: per-device scoped API token  (no admin credentials)
         ├────────────────────┬──────────────────────┐
         ▼                    ▼                      ▼
  ┌────────────┐    ┌──────────────┐    ┌────────────────────┐
  │  DS923+    │    │  RS820RP+    │    │  DS1621+  ···      │
  │  192.168.  │    │  10.1.10.    │    │  10.0.0.5          │
  │  1.10:5001 │    │  20:5001     │    │  :5001             │
  └────────────┘    └──────────────┘    └────────────────────┘
        Synology appliances — private LAN (RFC 1918)
```

**Static assets** are served from **Bunny.net CDN** with Railway as origin. The **poll agent** runs LAN-resident and uses per-device scoped tokens — no administrative credentials transit the public internet. **Backblaze B2** stores MD5 manifests, audit archives, and device exports. **Redis** handles sessions, alert deduplication, and last-poll caching.

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend hosting | **Netlify** | Static site deployment, HTTPS, branch previews |
| Backend runtime | **Railway** (Node.js 20 LTS) | REST API, poll engine worker |
| Database | **PostgreSQL** (Railway plugin) | Users, devices, tokens, alerts, poll history |
| Cache | **Redis** (Railway plugin) | Session store, alert cooldown, poll TTL |
| CDN | **Bunny.net** | Static asset edge delivery |
| Object storage | **Backblaze B2** | MD5 manifests, audit archives, exports |
| Maps | **Leaflet + OpenStreetMap** | Fleet map — no API key required |
| Geocoding | **Nominatim** | Address → coordinates at registration |
| Auth | **JWT + bcrypt-12** | Session tokens, password hashing |
| SMTP | **DSM built-in relay** | Alert email via appliance SMTP |
| Device API | **Synology File Station API** | All device health and file operations |
| Session API | **Synology Core API** | `CurrentConnection` — active session data |
| Language | **TypeScript** | Full-stack type safety |

---

## Getting Started

### Prerequisites

- **Node.js** 20 LTS or later
- **PostgreSQL** 15 or later (Railway plugin recommended)
- **Redis** 7 or later (Railway plugin recommended)
- At least one Synology NAS running **DSM 7.2+** with API Portal enabled
- A **Backblaze B2** account and bucket
- A **Bunny.net** pull zone (optional for local development)
- A **Netlify** account for frontend deployment
- A **Railway** account for backend deployment

### Environment Variables

```bash
# ── Application ─────────────────────────────────────────────────
NODE_ENV=development
PORT=3001
APP_URL=http://localhost:3001
FRONTEND_URL=http://localhost:5173

# ── PostgreSQL ──────────────────────────────────────────────────
DATABASE_URL=postgresql://user:password@localhost:5432/dsm_monitor

# ── Redis ───────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── JWT ─────────────────────────────────────────────────────────
JWT_ACCESS_SECRET=your_access_token_secret_min_32_chars
JWT_REFRESH_SECRET=your_refresh_token_secret_min_32_chars
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# ── Credential encryption (AES-256-GCM, Railway env only) ───────
CREDENTIAL_ENCRYPTION_KEY=your_32_byte_hex_key

# ── OAuth SSO (optional) ────────────────────────────────────────
MICROSOFT_CLIENT_ID=your_azure_app_client_id
MICROSOFT_CLIENT_SECRET=your_azure_app_client_secret
MICROSOFT_TENANT_ID=your_azure_tenant_id
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret

# ── Backblaze B2 ────────────────────────────────────────────────
B2_KEY_ID=your_b2_application_key_id
B2_APPLICATION_KEY=your_b2_application_key
B2_BUCKET_NAME=dsm-monitor-storage
B2_BUCKET_ENDPOINT=https://s3.us-west-004.backblazeb2.com

# ── Bunny.net ───────────────────────────────────────────────────
BUNNY_CDN_URL=https://your-pullzone.b-cdn.net
BUNNY_API_KEY=your_bunny_api_key

# ── Poll Engine ─────────────────────────────────────────────────
POLL_DEFAULT_INTERVAL_SECONDS=60
POLL_OFFLINE_THRESHOLD_MISSES=5
POLL_AUTH_TIMEOUT_MS=10000
POLL_MD5_SCHEDULE_CRON=0 6 * * *
POLL_DIRSIZE_SCHEDULE_CRON=0 */6 * * *

# ── SMTP fallback ───────────────────────────────────────────────
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=dsm-alerts@yourcompany.com
SMTP_PASS=your_app_password
SMTP_FROM_NAME=DiskStation Monitor
```

### Local Development

```bash
git clone https://github.com/4thandbailey/diskstation-monitor.git
cd diskstation-monitor
npm install
cp .env.example .env   # edit with your values
npm run db:migrate
npm run db:seed        # optional demo data
npm run dev
# Frontend: http://localhost:5173
# Backend:  http://localhost:3001
```

---

## Deployment

### Frontend — Netlify

```toml
# netlify.toml
[build]
  base    = "frontend"
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"

[[redirects]]
  from = "/*"  to = "/index.html"  status = 200

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options        = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy        = "strict-origin-when-cross-origin"
    Permissions-Policy     = "camera=(), microphone=(), geolocation=()"
    Content-Security-Policy = "default-src 'self'; script-src 'self' https://your-pullzone.b-cdn.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://*.tile.openstreetmap.org; connect-src 'self' https://nominatim.openstreetmap.org"
```

**Netlify environment variables:**
```
VITE_API_URL=https://your-railway-app.railway.app
VITE_CDN_URL=https://your-pullzone.b-cdn.net
VITE_MAP_ATTRIBUTION=© OpenStreetMap contributors
```

---

### Backend — Railway

```bash
npm install -g @railway/cli
railway login && railway init
# Attach PostgreSQL and Redis plugins from the Railway dashboard
railway up
```

```toml
# railway.toml
[build]
  builder = "nixpacks"
  buildCommand = "npm run build"

[deploy]
  startCommand = "npm start"
  restartPolicyType = "ON_FAILURE"
  restartPolicyMaxRetries = 3

[healthcheck]
  path = "/health"
  timeout = 10
```

Migrations run automatically via `postinstall` in `package.json` on every deploy.

---

### CDN — Bunny.net

1. **CDN → Add Pull Zone** → Origin URL: your Netlify site URL
2. Enable **Smart Edge Routing** + **Perma-Cache** for `/assets/*`
3. Point `VITE_CDN_URL` in Netlify env to your pull zone hostname

| Path | TTL | Notes |
|---|---|---|
| `/assets/*` | 1 year | Immutable Vite content-hashed filenames |
| `/*.html` | No cache | Always fresh |
| `/api/*` | No cache | Proxied to Railway |

---

### Object Storage — Backblaze B2

```bash
b2 create-bucket dsm-monitor-storage allPrivate
b2 update-bucket \
  --lifecycleRules '[
    {"fileNamePrefix":"manifests/","daysFromHidingToDeleting":90,"daysFromUploadingToHiding":90},
    {"fileNamePrefix":"audit/","daysFromHidingToDeleting":365,"daysFromUploadingToHiding":365},
    {"fileNamePrefix":"exports/","daysFromHidingToDeleting":30,"daysFromUploadingToHiding":30}
  ]' dsm-monitor-storage
```

Use `@aws-sdk/client-s3` with `B2_BUCKET_ENDPOINT` as the endpoint override — no separate B2 SDK needed.

---

### Cache — Redis

Railway injects `REDIS_URL` automatically. Three key namespaces:

```
session:{userId}:{tokenId}       TTL 604800s   — JWT refresh token store
cooldown:{deviceId}:{alertType}  TTL configurable — alert deduplication
poll:last:{deviceId}             TTL 300s      — last poll result cache
```

---

## Device Registration

Every device is registered by serial number. The portal resolves model, type, and hardware specs from the prefix database.

### Scoped API Tokens

No administrative credentials are stored. Each appliance issues a narrowly-scoped token from **DSM Control Panel → Security → API Portal**.

**How to issue a token:**
1. Open DSM on the target appliance
2. Control Panel → Security → API Portal → **Add**
3. Select only the File Station endpoints listed below
4. Copy the generated token
5. Paste into the **Scoped API Token** field at device registration

**Permitted endpoint scope:**

| Endpoint | Purpose |
|---|---|
| `SYNO.FileStation.Info` | Liveness probe |
| `SYNO.FileStation.List` | Volume health and fill percentage |
| `SYNO.FileStation.MD5` | Integrity scanning |
| `SYNO.FileStation.DirSize` | Per-folder growth attribution |
| `SYNO.FileStation.CheckPermission` | Pre-flight write validation |
| `SYNO.FileStation.VirtualFolder` | CIFS/NFS/ISO mount enumeration |
| `SYNO.FileStation.BackgroundTask` | Running task visibility |
| `SYNO.FileStation.Sharing` | Audit record generation |

**Poll agent with token auth:**

```bash
# Docker
docker run -d --name dsm-poller \
  --restart unless-stopped --network host \
  -e DSM_DEVICES="192.168.1.10:5001,10.0.0.5:5001" \
  -e DSM_INTERVAL=60 \
  -e DSM_OFFLINE_THRESHOLD=5 \
  -e DSM_AUTH_MODE=token \
  -e DSM_TOKENS="SERIAL1:token1,SERIAL2:token2" \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  4thandbailey/dsm-poller:latest

# Node.js
npm install -g @4thandbailey/dsm-poller
dsm-poller start \
  --devices "192.168.1.10:5001,10.0.0.5:5001" \
  --interval 60 --auth-mode token \
  --tokens "SERIAL1:token1,SERIAL2:token2" \
  --db-url postgresql://... --redis-url redis://...
```

### Remote Devices

For appliances on the same LAN as the poll agent, use the device's direct IP address and port — `192.168.1.10:5001`, `10.0.0.5:5001`. This is the recommended path for all local devices.

**QuickConnect for remote locations:** if an appliance is at a remote site without VPN and without a port forwarded directly to DSM, Synology's QuickConnect relay can be used in place of a direct IP address. Enter the QuickConnect URL at registration:

```
https://your-quickconnect-id.quickconnect.to
```

Authentication is identical — the poll agent calls `SYNO.API.Auth` through the relay using the same local DSM credentials or scoped API token. The relay handles NAT traversal transparently.

QuickConnect is configured on each appliance under DSM Control Panel → External Access → QuickConnect, and is tied to the Synology Account associated with that device. DSM Monitor has no involvement with the Synology Account itself — it uses the relay purely as a transport. The Synology Account email used to register a device with Synology's services has no bearing on how the poll agent authenticates or what data it can access.

**Considerations for remote devices:**

| Factor | LAN (direct IP) | Remote (QuickConnect) |
|---|---|---|
| Latency | ~20–80 ms | ~100–400 ms (relay dependent) |
| Reliability | LAN uptime | LAN uptime + Synology relay uptime |
| Port exposure | None required | None required |
| VPN required | No | No |
| Poll interval | Any (30 s recommended) | 60 s or longer recommended |

If several remote devices are at the same site, a site-to-site VPN or a local poll agent instance at that site connecting back to the Railway database is preferable to routing all poll traffic through QuickConnect.

### MD5 Scan Scope

Configure sentinel directories per device at registration (one path per line). Full-volume scanning is an explicit opt-in — not the default.

```
/volume1/data/contracts
/volume1/data/financial
/volume1/config
/volume1/audit-logs
```

---

## Poll Engine

The poll engine runs as a background worker in Railway, with one staggered loop per device.

**Core cycle:**
```
1.  Load device record + scoped token from PostgreSQL
2.  SYNO.API.Auth  →  session token  (timeout: POLL_AUTH_TIMEOUT_MS)
3.  SYNO.FileStation.Info  →  confirm File Station responsive
4.  SYNO.FileStation.List (volume_status)  →  volume fill %
5.  SYNO.FileStation.CheckPermission  →  pre-flight sentinel paths
6.  SYNO.FileStation.BackgroundTask  →  detect running jobs
7.  SYNO.FileStation.VirtualFolder  →  enumerate mounts
8.  SYNO.Core.CurrentConnection  →  active session data (Core API)
9.  State change detection:
    ├─ IP changed?              →  alert + update prev_ip
    ├─ DSM version changed?     →  info alert
    ├─ Misses ≥ threshold?      →  critical alert, status = offline
    ├─ CheckPermission denied?  →  warning alert (distinct from network error)
    └─ CPU/RAM above threshold? →  warning alert
10. Write poll_results → PostgreSQL
11. Update poll:last:{deviceId} → Redis (TTL 5 min)
12. SYNO.API.Auth logout  →  release session
13. Sleep until next interval
```

**DirSize cycle (every 6 hours):**
```
1. SYNO.FileStation.DirSize per top-level directory
2. Store in dirsize_results table
3. Compute 7-day weighted average:
   SELECT path,
     (MAX(size_gb) - MIN(size_gb)) / 7.0 AS growth_gb_per_day,
     AVG(size_gb) AS avg_size_gb
   FROM dirsize_results
   WHERE device_id = $1
     AND measured_at > now() - interval '7 days'
   GROUP BY path ORDER BY growth_gb_per_day DESC;
```

**MD5 integrity scan (cron: 0 6 * * *):**
```
1. Load manifest from B2 (create baseline on first run)
2. SYNO.FileStation.MD5 for each file in scan_scope
3. Compare hashes against baseline
4. On mismatch:
   ├─ Integrity alert
   ├─ SYNO.FileStation.Sharing → device-hosted audit link
   └─ Store share_url in integrity_log
5. SYNO.FileStation.Favorite → update registry bookmark
6. Upload updated manifest to B2
7. Write integrity_log row to PostgreSQL
```

---

## File Station API Integration

| Endpoint | Frequency | UI Panel |
|---|---|---|
| `SYNO.API.Auth` | Every cycle | Poll Engine |
| `SYNO.FileStation.Info` | Every cycle | Fleet table |
| `SYNO.FileStation.List` | Every cycle | Fleet / Integrity |
| `SYNO.FileStation.MD5` | Cron 06:00 | Integrity — MD5 |
| `SYNO.FileStation.DirSize` | Every 6 hours | Integrity — DirSize |
| `SYNO.FileStation.CheckPermission` | Every cycle | Integrity — CheckPermission |
| `SYNO.FileStation.VirtualFolder` | Every cycle | Integrity — VirtualFolder |
| `SYNO.FileStation.BackgroundTask` | Every cycle | Integrity — BackgroundTask |
| `SYNO.FileStation.Sharing` | On integrity event | Integrity — Audit log |
| `SYNO.FileStation.Favorite` | On registry sync | Integrity — Favorites |
| `SYNO.FileStation.Search` | Planned | Duplicate detection |
| `SYNO.FileStation.Compress` | Planned | Cold-storage policy |
| `SYNO.FileStation.CreateFolder` | Planned | Self-healing scaffold |

> **Note on connection data:** `SYNO.Core.CurrentConnection` is a Synology Core API endpoint — not part of the File Station API. The Connections column is labeled **Core API** in the fleet table to make this distinction explicit.

---

## Authentication Portal

`dsm-auth.html` handles sign-in, registration, and password reset before handing off to the main dashboard.

**Sign-in flow:** email → existing account check → password (returning) or account creation (new user). SSO via Microsoft, Google, GitHub.

**Session handoff:**
```javascript
// dsm-auth.html — on successful sign-in
sessionStorage.setItem('dsm-access-token', accessToken);  // tab-scoped
sessionStorage.setItem('dsm-current-user', email);
// Theme already in localStorage — shared with dashboard
window.location.href = 'synology-monitor.html';

// synology-monitor.html — initSession() on load
// Reads token, updates avatar initial + sidebar email
// Avatar click → user dropdown (Settings, Security, Sign Out)
// Sign Out → POST /auth/logout → Redis session deleted + cookie cleared
//          → sessionStorage cleared → navigate to dsm-auth.html
```

---

## SMTP Alerts

Per-administrator SMTP configuration, stored encrypted with AES-256-GCM.

| Mode | Host | Port | Auth |
|---|---|---|---|
| Microsoft 365 | `smtp.office365.com` | 587 | OAuth 2.0 or SMTP AUTH |
| M365 SMTP Relay | Your MX connector | 25 | IP-based |
| Google Workspace | `smtp.gmail.com` | 587 | OAuth 2.0 or App Password |
| Generic SMTP | Your server | 587/465/25 | Login |

**Incident SLA commitments:**

| Severity | Trigger | SLA |
|---|---|---|
| Critical | Device offline · Power loss · Integrity breach | 15 minutes |
| Warning | IP change · CPU threshold · Disk quota 75% | 4 hours |
| Info | DSM update · Package update · Recovery | Next business day |

---

## File Integrity Monitoring

Sentinel-scoped `SYNO.FileStation.MD5` verification against a Backblaze B2 baseline manifest.

**Manifest structure:**
```json
{
  "device_id": "uuid",
  "scan_scope": ["/volume1/data/contracts", "/volume1/config"],
  "exclude_patterns": ["*.tmp", "*.log"],
  "file_count": 847,
  "files": [
    {
      "path": "/volume1/data/contracts/acme-2026.pdf",
      "md5":  "d41d8cd98f00b204e9800998ecf8427e",
      "mtime": 1742601600
    }
  ]
}
```

**Audit trail:** On mismatch, `SYNO.FileStation.Sharing` generates a device-hosted sharing link to the event log file on the affected volume. Stored in `integrity_log.share_url` — the chain of custody survives complete portal database loss.

**Favorites registry:** Device configuration stored as `SYNO.FileStation.Favorite` bookmarks on NAS-PRIMARY (registry host) with failover replica on NAS-BACKUP. The poll agent can rebuild its device list from on-device Favorites without the Railway database.

---

## API Reference

All endpoints require `Authorization: Bearer {access_token}` except `/health` and `/auth/*`.

### Devices

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/devices` | List all devices for the authenticated administrator |
| `POST` | `/api/devices` | Register device (serial, IP, port, token, scan scope) |
| `GET` | `/api/devices/:id` | Device detail + latest poll result + token status |
| `PATCH` | `/api/devices/:id` | Update name, location, coordinates, scan scope |
| `DELETE` | `/api/devices/:id` | Remove device |
| `GET` | `/api/devices/:id/poll-history` | Poll timeline |
| `GET` | `/api/devices/:id/dirsize` | Per-folder size history |
| `GET` | `/api/devices/:id/integrity` | Integrity scan history |
| `POST` | `/api/devices/:id/scan` | Trigger on-demand MD5 scan |
| `PUT` | `/api/devices/:id/token` | Register or rotate scoped API token |
| `DELETE` | `/api/devices/:id/token` | Revoke scoped API token |

### Alerts

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/alerts` | Active alerts |
| `PATCH` | `/api/alerts/:id/acknowledge` | Acknowledge |
| `DELETE` | `/api/alerts/:id` | Dismiss |
| `DELETE` | `/api/alerts` | Dismiss all |

### Settings

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/settings/smtp` | SMTP config (password redacted) |
| `PUT` | `/api/settings/smtp` | Save SMTP config |
| `POST` | `/api/settings/smtp/test` | Send test email |
| `GET` | `/api/settings/recipients` | Recipient list |
| `POST` | `/api/settings/recipients` | Add recipient |
| `DELETE` | `/api/settings/recipients/:id` | Remove recipient |

### Security

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/security/access-log` | Administrator access and token events |
| `GET` | `/api/security/report` | Security report — token inventory, access log, audit results, encryption config (JSON) |

### Account & Data Rights

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/account/export` | Export all personal data as JSON (GDPR Art. 20) |
| `DELETE` | `/api/account` | Permanent erasure of all personal data (GDPR Art. 17) |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Backend liveness (Railway healthcheck) |
| `GET` | `/api/status` | Poll engine status, uptime, version |

---

## Database Schema

Full migrations in `backend/db/migrations/`. Key tables:

```sql
-- Users and authentication
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,  name TEXT,
  password_hash TEXT,          oauth_provider TEXT,  oauth_subject TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),  last_login TIMESTAMPTZ,
  gdpr_consent_at TIMESTAMPTZ,         -- A.18.1: timestamp of explicit GDPR consent
  gdpr_consent_version TEXT,           -- Policy version accepted at signup
  deletion_requested_at TIMESTAMPTZ    -- A.18.1: Art. 17 erasure request timestamp
);

-- Devices — serial as immutable identity anchor
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  serial TEXT NOT NULL,  name TEXT NOT NULL,  model TEXT NOT NULL,
  device_type TEXT NOT NULL,
  ip TEXT,  prev_ip TEXT,  port INTEGER NOT NULL DEFAULT 5001,
  dsm_version TEXT,
  lat DOUBLE PRECISION,  lng DOUBLE PRECISION,  address TEXT,  location TEXT,
  status TEXT NOT NULL DEFAULT 'online',
  health TEXT NOT NULL DEFAULT 'good',  health_pct INTEGER DEFAULT 100,
  scan_scope TEXT[],   -- sentinel paths; NULL = full-volume opt-in
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),  last_seen TIMESTAMPTZ,
  UNIQUE(user_id, serial)
);

-- Scoped API tokens — replaces admin credential storage (ISO A.9.4)
CREATE TABLE device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID UNIQUE NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,   -- SHA-256; never stored in plaintext
  scope TEXT[] NOT NULL,      -- permitted File Station endpoint names
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,  revoked_at TIMESTAMPTZ,  last_used_at TIMESTAMPTZ
);

-- Poll results — 7-day retention window for growth calculations
CREATE TABLE poll_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  polled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL,  -- 'ok' | 'slow' | 'miss'
  latency_ms INTEGER,  cpu_pct INTEGER,  ram_pct INTEGER,
  ip_seen TEXT,  dsm_version TEXT
);
CREATE INDEX ON poll_results(device_id, polled_at DESC);

-- DirSize results — 7-day window for weighted average growth rate
CREATE TABLE dirsize_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  path TEXT NOT NULL,  size_gb NUMERIC(12,3) NOT NULL,  owner TEXT
);
CREATE INDEX ON dirsize_results(device_id, path, measured_at DESC);

-- Alerts
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,      -- 'offline'|'ip_change'|'dsm_update'|'integrity'|'quota'|'permission'
  severity TEXT NOT NULL,  -- 'critical'|'warning'|'info'
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,  acknowledged BOOLEAN DEFAULT false
);

-- Integrity log — with device-hosted audit sharing link
CREATE TABLE integrity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_count INTEGER,  changed_count INTEGER DEFAULT 0,
  status TEXT NOT NULL,   -- 'clean'|'changed'|'error'
  manifest_key TEXT,      -- B2 object key
  share_url TEXT          -- SYNO.FileStation.Sharing — device-hosted audit link
);

-- Access log — ISO A.12.4 administrator event audit
CREATE TABLE access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event TEXT NOT NULL,    -- 'signin'|'signout'|'token_rotate'|'token_revoke'|'failed_signin'
  ip INET,  user_agent TEXT,
  result TEXT NOT NULL,   -- 'success'|'failed'
  detail TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON access_log(logged_at DESC);

-- SMTP config — passwords AES-256-GCM encrypted at rest
CREATE TABLE smtp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  host TEXT NOT NULL,  port INTEGER NOT NULL DEFAULT 587,
  encryption TEXT NOT NULL DEFAULT 'starttls',
  auth_method TEXT NOT NULL DEFAULT 'login',
  username TEXT,  password_encrypted TEXT,
  oauth_tenant TEXT,  oauth_client_id TEXT,  oauth_secret_encrypted TEXT,
  from_address TEXT,  from_name TEXT DEFAULT 'DiskStation Monitor',
  enabled BOOLEAN DEFAULT true,  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alert recipients — per-admin, per-scope
CREATE TABLE alert_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'all',  -- 'all'|'critical'|'info'
  UNIQUE(user_id, email)
);
```

---

## Multi-Administrator Isolation

Every query touching device, alert, token, or settings data includes `WHERE user_id = $1` derived from the verified JWT subject — never from client-supplied parameters.

```typescript
// backend/api/devices.ts
router.get('/', requireAuth, async (req, res) => {
  const devices = await db.query(
    `SELECT d.*, dt.scope AS token_scope, dt.expires_at AS token_expires
     FROM devices d
     LEFT JOIN device_tokens dt
       ON dt.device_id = d.id AND dt.revoked_at IS NULL
     WHERE d.user_id = $1
     ORDER BY d.added_at DESC`,
    [req.user.id]  // verified JWT subject — never from req.body or req.params
  );
  res.json(devices.rows);
});

// Token revocation scoped to the authenticated user
router.delete('/:id/token', requireAuth, async (req, res) => {
  await db.query(
    `UPDATE device_tokens SET revoked_at = now()
     WHERE device_id = $1
       AND device_id IN (SELECT id FROM devices WHERE user_id = $2)`,
    [req.params.id, req.user.id]
  );
});
```

---

## Security

### Security Health Dashboard

The Security page provides a live operational posture summary across six checks, derived from actual system state and updated every 8 seconds:

| Check | What it monitors |
|---|---|
| API token coverage | Whether every online device has a registered scoped API token; names any that don't |
| Token expiry | Tokens within 30 days of expiry by device name and date |
| Failed sign-in attempts | Recent access log entries with `result: failed`; threshold at 3+ |
| Dependency vulnerabilities | npm audit critical and high severity count from CI results |
| SAST findings | Semgrep open finding count |
| Offline devices | Any registered appliances currently unreachable by the poll engine |

The badge reads **✓ Healthy** (green), **N issue(s)** (amber, 1–2 issues), or **N issues** (red, 3+). Token coverage checks include a direct "Register token" link opening the Add Device modal.

### Security Page Panels

**Left column**

- **Security Health** — live six-check posture summary; updates with every simRealtime cycle when the page is active
- **Scoped API Tokens** — per-device token registry derived from `DEVICES`; revoke individual tokens (writes to `access_log`; re-runs CheckPermission pre-flight); rotate all; register new
- **Administrator Access Log** — sign-in events, token operations, data exports, failed attempts with IP and user agent; failed attempts flagged in red
- **Dependency Security** — npm audit results (critical/high/moderate/low counts); per-finding detail with CVE, fix version, and Dependabot PR status; CI gate and Dependabot active status
- **Secure Development** — seven active controls: Semgrep SAST, CSP headers, SQL parameterization, Zod input validation, GitHub secret scanning, dependency pinning, security-gated PRs

**Right column**

- **Encryption Status** — AES-256-GCM credential storage, bcrypt-12, TLS 1.2+, HttpOnly JWT cookies, B2 server-side AES-256, Redis private network
- **Network Security** — RFC 1918 isolation, LAN-resident poller, Railway VPC, Netlify HTTPS, Bunny.net Force SSL, B2 private bucket, rate limiting, CSP
- **Data Retention & Continuity** — B2 lifecycle rules per category, PostgreSQL retention windows, last backup timestamps
- **Incident Response** — severity classification (Critical / Warning / Info), SLA commitments, trigger conditions, response actions per level
- **Data & Privacy** — GDPR data processing record with legal basis per category; "Download my data" (Art. 20 portability); "Request erasure" (Art. 17 deletion)

### Dependency Scanning

Automated scanning runs in GitHub Actions on every push and pull request to `main`. The `npm audit --audit-level=high` step is a required gate — builds fail on any critical or high severity finding. Dependabot opens automated PRs for dependency updates with a 7-day security-patch merge SLA.

```yaml
# .github/workflows/security.yml
name: Security

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'   # weekly Monday 06:00 UTC

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Dependency audit
        run: npm audit --audit-level=high
      - name: Semgrep SAST
        uses: semgrep/semgrep-action@v1
        with:
          config: >-
            p/nodejs
            p/typescript
            p/security-audit
            p/owasp-top-ten
```

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 10
    labels: ["dependencies", "security"]
```

### GDPR Data Rights

**Consent at signup** — explicit consent checkbox with data processing purpose and policy version stored in `users.gdpr_consent_at` and `users.gdpr_consent_version`. Account creation is blocked without consent.

**Right to erasure (Art. 17)** — `DELETE /api/account` permanently removes all personal data for a given `user_id`. Accessible via Settings → Data Rights → Delete my account (requires typing `DELETE` to confirm). Covers PostgreSQL rows across all tables and B2 objects under `manifests/{device_id}/*`, `audit/{user_id}/*`, `exports/{user_id}/*`. Completes within 30 days.

**Right to data portability (Art. 20)** — `GET /api/account/export` returns full JSON dataset for the authenticated user. Accessible via Settings → Data Rights → Download my data.

**Data processing record:**

| Category | Fields | Retention | Legal Basis |
|---|---|---|---|
| Account data | Email, name, bcrypt password hash | Until deleted | Contract |
| Device data | Serial, IP, name, model, coordinates | Until device removed | Legitimate interest |
| Poll results | CPU%, RAM%, latency, IP observed | 90 days | Legitimate interest |
| Integrity log | File hash deltas, timestamps, share URLs | 1 year (B2 lifecycle) | Legitimate interest |
| Access log | IP, user agent, event type, timestamp | 1 year | Legal obligation |
| SMTP config | Host, port, encrypted password | Until deleted | Contract |

**Third-party processors:** Railway (EU–US DPA) · Backblaze B2 (EU–US DPA) · Bunny.net (EU CDN nodes)


## Security Architecture

- **HttpOnly + Secure cookies** — refresh tokens inaccessible to JavaScript; HTTPS only
- **SameSite=Strict + double-submit token** — CSRF mitigation
- **Rate limiting** — 10 req/min on `/auth/login` and `/auth/signup` via Redis token bucket; failures logged to `access_log`
- **Scoped API tokens** — SHA-256 hashed at rest in `device_tokens`; no admin credentials stored or transmitted; token scope limited to 8 File Station endpoints
- **AES-256-GCM credential encryption** — SMTP passwords encrypted before storage; encryption key in Railway environment variable only, never in the database
- **bcrypt-12 password hashing** — work factor 12; never stored in plaintext; never returned in API responses
- **CSP headers** — `script-src 'self'` + Bunny.net CDN origin; set via `netlify.toml`; no inline scripts in production
- **Semgrep SAST** — 312 rules across nodejs/typescript/owasp-top-ten rulesets; runs as a required check on every PR to `main`; 0 findings
- **Dependabot** — automated weekly dependency PRs; `npm audit --audit-level=high` is a required CI gate
- **Dedicated DSM monitoring account** — use a read-only DSM account under Control Panel → User & Group, not the `admin` account; scoped token limits API access to the 8 required File Station endpoints only
- **Session lifecycle** — per-cycle: open → auth → poll → logout; no persistent DSM sessions held between cycles
- **LAN boundary** — poll agent runs LAN-resident; Railway backend handles API serving and data persistence only; it cannot reach private-IP appliances directly
- **Token revocation chain** — revoke on Security page → `device_tokens.revoked_at` set → polling stops → CheckPermission pre-flight surfaces denial → `access_log` entry written → Security page token list updates immediately
- **GDPR consent at signup** — explicit consent checkbox at registration; data processing purpose and policy version stored in `users.gdpr_consent_at`; account creation blocked without consent
- **Right to erasure** — `DELETE /api/account` and Settings → Data Rights → Delete my account; requires typing `DELETE` to confirm; completes within 30 days; covers PostgreSQL and Backblaze B2
- **Data portability** — `GET /api/account/export` returns full JSON dataset; accessible via Settings → Data Rights → Download my data
- **Secret scanning** — GitHub secret scanning and push protection enabled on the repository

---

## Contributing

```bash
git clone https://github.com/your-username/diskstation-monitor.git
git checkout -b feature/your-feature-name
npm test
# Submit a pull request against main
```

Commit convention ([Conventional Commits](https://www.conventionalcommits.org/)):
```
feat: add SYNO.FileStation.Search duplicate detection scanner
fix: resolve DirSize drift precision past 7-day window
security: clear Redis entry on token revocation immediately
docs: update ISO A.14.2 roadmap with Semgrep integration
chore: upgrade @aws-sdk/client-s3 to 3.x
```

---

## License

MIT © 2026 [4TH AND BAILEY](https://4thandbailey.com)

---

*DiskStation Monitor is an independent open-source project and is not affiliated with, endorsed by, or supported by Synology Inc. Synology, DiskStation, and DSM are trademarks of Synology Inc.*
