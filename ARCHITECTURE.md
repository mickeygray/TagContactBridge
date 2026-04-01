# TagContactBridge v2 — Architecture

## What This Is

Internal platform for **Tax Advocate Group (TAG)** and **Wynn Tax Solutions (WYNN)**. Handles lead intake, automated outreach cadences, agent phone monitoring, client marketing campaigns, and an operations dashboard. Everything runs from one codebase, one database, one domain.

## System Map

```
                        ┌──────────────────────────┐
                        │   nginx (:80/:443)        │
                        │   TLS termination         │
                        │   auth_request → :5000    │
                        └─────────┬────────────────┘
                                  │
             ┌────────────────────┼────────────────────┐
             │                    │                     │
     ┌───────┴────────┐  ┌───────┴────────┐   ┌───────┴────────┐
     │  leadBridge     │  │  clientBridge   │   │  ringBridge    │
     │  :4000          │  │  :5000          │   │  :6000         │
     │                 │  │                 │   │                │
     │  Lead intake    │  │  React app      │   │  Agent phones  │
     │  Cadence engine │  │  Auth (login)   │   │  Call scoring  │
     │  Social webhooks│  │  Client tools   │   │  SSE dashboard │
     │  PhoneBurner    │  │  SMS Intel      │   │  Transcription │
     │  RVM drops      │  │  Email/Text     │   │  Daily reports │
     │  Deploy panel   │  │  Consent vault  │   │                │
     └───────┬────────┘  └───────┬────────┘   └───────┬────────┘
             │                    │                     │
             └────────────────────┼─────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │  shared/                   │
                    │  Models, config, services, │
                    │  utils, middleware          │
                    │  (no Express, just modules) │
                    └─────────────┬─────────────┘
                                  │
                           ┌──────┴──────┐
                           │   MongoDB   │
                           │  (Atlas or  │
                           │   local)    │
                           └─────────────┘
```

## Directory Layout

```
TagContactBridge/
├── .env                          ← all env vars, shared by all bridges
├── package.json                  ← scripts, shared node_modules
├── ARCHITECTURE.md               ← you are here
├── audio/                        ← RVM audio files (served by leadBridge)
│
├── shared/                       ← UNIVERSAL (no Express, no ports)
│   ├── config/
│   │   ├── companyConfig.js      ← TAG/WYNN/AMITY brand settings
│   │   ├── db.js                 ← MongoDB connection
│   │   └── dbHealth.js           ← boot-time migrations & hygiene
│   ├── models/                   ← all Mongoose schemas + barrel index.js
│   ├── services/
│   │   ├── aiService.js          ← unified Claude + Whisper wrapper
│   │   ├── logicsService.js      ← Logics CRM API
│   │   ├── validationService.js  ← Real Validation + NeverBounce
│   │   └── callRailService.js    ← CallRail API
│   ├── utils/
│   │   ├── sendEmail.js          ← SendGrid via nodemailer
│   │   ├── sendTextMessage.js    ← RingCentral SMS
│   │   ├── deactivateLead.js     ← lead deactivation (Logics + Mongo + PB)
│   │   └── systemLog.js          ← structured logging + SSE broadcast
│   └── middleware/
│       └── authMiddleware.js     ← session cookie + nginx header + JWT
│
├── leadBridge/                   ← PORT 4000
│   ├── server.js                 ← Express app (was webhook.js)
│   ├── services/                 ← cadence engine, PB, RVM, social, deploy
│   └── Templates/                ← prospect email templates (HBS)
│
├── clientBridge/                 ← PORT 5000
│   ├── server.js                 ← Express app + React static serve
│   ├── routes/                   ← auth, admin, clients, emails, sms, etc.
│   ├── controllers/              ← business logic behind routes
│   ├── services/                 ← SMS intelligence, LexisNexis
│   ├── utils/                    ← list cleaners, validation checks
│   ├── libraries/                ← email/text template content
│   ├── Templates/                ← client email templates (HBS)
│   └── client/                   ← React frontend
│       └── src/
│           ├── hooks/            ← custom hooks (replace context providers)
│           ├── components/       ← organized by bridge
│           ├── styles/           ← dark terminal CSS design system
│           └── utils/            ← api singleton, toast pub/sub
│
├── ringBridge/                   ← PORT 6000
│   ├── server.js
│   ├── engine/stateEngine.js     ← agent state machine + SSE
│   ├── services/                 ← RC auth, webhooks, transcription, scoring
│   ├── routes/                   ← webhook + API routes
│   └── models/                   ← Agent, ContactActivity, EventLog
│
└── _deprecated/                  ← dead code (delete after stable)
```

## Authentication

Email + pin code. No passwords.

```
User → /login (React)
  → picks email from allowed list
  → POST /api/auth/send-code → 6-digit pin via SendGrid
  → enters pin
  → POST /api/auth/verify → session created in MongoDB (AuthSession)
  → tcb_session cookie set (httpOnly, secure, strict)
  → tcb_csrf cookie set (JS-readable, for CSRF double-submit)
  → redirect to /dashboard
```

Session cookie shared across all three bridges (same domain via nginx). `authMiddleware` checks:
1. `tcb_session` cookie → MongoDB lookup
2. `X-Auth-Validated` header → nginx auth_request passthrough
3. JWT token → fallback for dev/future agents

Sessions: 8hr TTL, MongoDB TTL index auto-cleanup.

## The Three Bridges

### leadBridge (:4000) — Lead Intake & Cadence

Receives leads from Facebook, TikTok, Instagram, direct mail vendors, and web forms. Runs an automated outreach cadence: texts, RVMs (ringless voicemail via Drop.co), and emails on a business-day schedule keyed to `caseAge`.

**Key processes:**
- **Cadence engine** — cron-driven tick that advances leads through outreach stages
- **PhoneBurner** — hot leads pushed to speed-to-lead dialer (Seat 1)
- **Connection checker** — polls RingCentral call log to detect answered calls
- **Status checker** — polls Logics CRM for case status changes
- **Social webhooks** — Facebook Messenger, Instagram DMs, TikTok leads
- **Deploy panel** — SSH-based build/deploy to EC2 instances

### clientBridge (:5000) — Dashboard & Client Marketing

Serves the React app and all API routes for the operations dashboard. Handles client marketing campaigns (email, text), list management, and the SMS Intelligence AI responder.

**Key tools (React):**
- **Messaging Hub** — merged inbox (SMS Intelligence), email campaigns, text campaigns, AI template studio
- **List managers** — Logics file upload, NCOA direct mail prep, period contacts, unified search
- **List scrubber** — phone/email validation with Real Validation + NeverBounce
- **Consent vault** — TCPA consent record search and compliance
- **Metrics** — placeholder for daily ops dashboard

### ringBridge (:6000) — Agent Monitoring & Call Intelligence

Monitors agent phone activity in real-time via RingCentral RingEX. Transcribes outbound calls with Whisper, scores lead quality with Claude, and sends daily vendor reports.

**Key processes:**
- **Presence webhooks** — RingCentral push notifications for agent status
- **State engine** — tracks agent availability, active calls, disposition
- **SSE broadcast** — real-time updates to React dashboard
- **Transcription pipeline** — call end → wait for recording → download → Whisper → Claude score
- **Daily report** — cron-driven email with scored call summaries + CSV

## AI Architecture

| What | Provider | Trigger | Approval |
|------|----------|---------|----------|
| SMS responses | Claude Sonnet | Inbound text webhook | Pending → approve/edit/cancel |
| Call scoring | Claude Sonnet | Call end webhook | Autonomous (read-only analysis) |
| Transcription | OpenAI Whisper | Call end webhook | Autonomous |
| Template generation | Claude Sonnet | User clicks button | User reviews before saving |
| Daily briefing | Claude Sonnet | Cron (planned) | Read-only email |

All AI calls go through `shared/services/aiService.js`:
- `claudeComplete()` — single-turn or multi-turn conversation
- `claudeJSON()` — structured JSON output with validation
- `whisperTranscribe()` — audio buffer to text

## State Management (React)

**One context:** `AuthProvider` (global, every route needs auth state)

**Custom hooks** (isolated, no providers):
| Hook | Purpose |
|------|---------|
| `useAuth` | Session check, logout |
| `useSms` | SMS conversations, filters, polling, approve/cancel |
| `useEmail` | Email campaign sending, stats |
| `useText` | Text campaign sending |
| `useClients` | Client enrichment, CRUD, review actions |
| `useList` | List upload, search, period contacts, NCOA |
| `useSchedule` | Dialer state (deprecated — was CallFire) |
| `useDailySchedule` | Daily queue management, pace settings |
| `useAdmin` | Consent vault search and stats |
| `useToast` | Toast notification subscriber |

**API:** Singleton axios instance (`utils/api.js`) with CSRF header injection and 401 interceptor.

**Notifications:** Pub/sub toast system (`utils/toast.js`) — no provider, any component can fire.

## External Services

| Service | Bridge | Purpose |
|---------|--------|---------|
| Logics CRM | All | Case management, billing, activities |
| RingCentral RingEX | ringBridge | Agent presence, call events, webhooks |
| CallRail | clientBridge | Call tracking, recordings, SMS relay |
| PhoneBurner | leadBridge | Speed-to-lead dialing, ARMOR spam protection |
| Drop.co | leadBridge | Ringless voicemail drops |
| SendGrid | All (via nodemailer) | Transactional + marketing email |
| Facebook/Instagram | leadBridge | Lead ads, Messenger, comment replies |
| TikTok | leadBridge | Lead webhooks, comment management |
| Real Validation | shared | Phone/email validation |
| NeverBounce | shared | Email verification |
| LexisNexis SFTP | clientBridge | Daily lien data downloads |
| Anthropic (Claude) | shared/aiService | SMS responses, call scoring, templates |
| OpenAI (Whisper) | shared/aiService | Call transcription |

## Running It

```bash
# Individual bridges
npm run leadbridge        # port 4000
npm run clientbridge      # port 5000
npm run ringbridge        # port 6000

# All three + React dev server
npm run dev

# Production (PM2)
npm run pm2:start         # starts all three via ecosystem.config.js
npm run pm2:stop
npm run pm2:restart
npm run pm2:logs

# React client only (dev mode, port 3000)
npm run client
npm run client:build
```

## Environment Variables

All in `.env` at project root. See the spec document for the full list. Key groups:
- `MONGO_URI`, `JWT_SECRET` — core
- `TAG_*`, `WYNN_*`, `AMITY_*` — per-brand config
- `RING_CENTRAL_*` — RingBridge telephony
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` — AI services
- `SENDGRID_*` — email transport
- `PB_*` — PhoneBurner
- `DROP_*` — RVM
- `CALL_RAIL_*` — call tracking
- `ALLOWED_EMAILS` — auth whitelist

## Deployment (EC2)

nginx terminates TLS and proxies to the three ports:

```nginx
# Auth check — clientBridge validates session
location = /auth-check {
    internal;
    proxy_pass http://127.0.0.1:5000/auth-check;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
}

# Strip spoofable header from client requests
proxy_set_header X-Auth-Validated "";

# LeadBridge
location /panel/ { proxy_pass http://127.0.0.1:4000/; }
location /fb/    { proxy_pass http://127.0.0.1:4000/fb/; }
location /tt/    { proxy_pass http://127.0.0.1:4000/tt/; }
location /sms/inbound { proxy_pass http://127.0.0.1:4000/sms/inbound; }
location /lead-contact { proxy_pass http://127.0.0.1:4000/lead-contact; }

# RingBridge
location /ringbridge/api/ { proxy_pass http://127.0.0.1:6000/api/; }
location /webhook/ex { proxy_pass http://127.0.0.1:6000/webhook/ex; }

# ClientBridge (default — serves React app)
location / {
    auth_request /auth-check;
    proxy_pass http://127.0.0.1:5000/;
}

# Public auth routes (no auth_request)
location /api/auth/ { proxy_pass http://127.0.0.1:5000/api/auth/; }
location /login { proxy_pass http://127.0.0.1:5000/login; }
```
