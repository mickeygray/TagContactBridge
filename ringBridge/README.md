# RingBridge — EX↔CX Unified Agent Platform

Lives inside TagContactBridge. Shares `.env` and `node_modules`, runs on its own port.

## Structure

```
TagContactBridge/
├── server.js                ← existing, port 4000
├── .env                     ← shared — RingBridge reads RING_CENTRAL_* from here
├── package.json             ← add @ringcentral/sdk if not already there
├── services/
│   ├── ringCentralService.js  ← existing RingOut service
│   └── ...
│
├── ringBridge/              ← this folder
│   ├── server.js            ← own Express app, port 3000
│   ├── config/env.js        ← maps parent env vars
│   ├── models/              ← Mongoose models (own DB: ringbridge)
│   ├── services/            ← RC auth, webhook manager
│   ├── engine/              ← state machine
│   ├── routes/              ← webhook receiver, API, widget
│   ├── public/              ← dashboard HTML
│   └── utils/               ← logger
```

## Setup

### 1. Drop the folder in

Copy the `ringBridge/` folder into your TagContactBridge root.

### 2. Add env vars to your existing .env

RingBridge already reads your existing `RING_CENTRAL_*` vars.
Just add these new ones:

```env
# ─── RingBridge (add to bottom of existing .env) ───
RINGBRIDGE_PORT=3000
RINGBRIDGE_MONGO_URI=mongodb://localhost:27017/ringbridge
RINGBRIDGE_WEBHOOK_SECRET=your-secret-here
RINGBRIDGE_JWT_SECRET=your-widget-jwt-secret
```

### 3. Install dependency (if needed)

`@ringcentral/sdk` is probably already in your node_modules from the
RingOut integration. If not:

```bash
npm install @ringcentral/sdk
```

The other deps (express, mongoose, jsonwebtoken, dotenv) are already
in TagContactBridge.

### 4. Start it

```bash
# From TagContactBridge root:
node ringBridge/server.js

# Or add to PM2:
pm2 start ringBridge/server.js --name ringbridge
pm2 save
```

### 5. Open the dashboard

http://localhost:3000

## Add to your existing .env

```env
# ─── RingBridge ───────────────────────────────────
RINGBRIDGE_PORT=3000
RINGBRIDGE_MONGO_URI=mongodb://localhost:27017/ringbridge
RINGBRIDGE_WEBHOOK_SECRET=pick-a-secret
RINGBRIDGE_JWT_SECRET=pick-another-secret
# CX (add when live)
# CX_ACCOUNT_ID=
# CX_BASE_URL=https://ringcx.ringcentral.com
```

## Offline Mode

Works without RC credentials — dashboard, API, agent management
all functional. Add test agents, simulate state changes via the
override endpoint. Useful for testing before webhooks are wired.

## Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Dashboard UI |
| `GET /api/health` | Health check |
| `GET /api/events` | SSE stream (real-time) |
| `GET /api/admin/agents` | List agents |
| `POST /api/admin/agents` | Add agent |
| `GET /api/admin/extensions` | Discover RC extension IDs |
| `POST /webhook/ex` | RingEX webhook receiver |
