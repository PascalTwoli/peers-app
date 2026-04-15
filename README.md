# Peers App

Peers is a real-time WebRTC chat/call app with an open, no-account login model (display-name based), built as an npm workspace monorepo.

## Product Direction

The app now has two routing layers:

- Entry routes: landing, home, and workspace access
- In-app workspace routes: chat, call, rooms, room calls, and invite center

This makes navigation browser-history friendly and sets up cleaner architecture for a future mobile app.

## Workspace Layout

```
web-rtc-app/
├── packages/
│   ├── client/          # React + Vite frontend
│   └── server/          # Express + WebSocket signaling backend
├── package.json
└── README.md
```

## Packages

- Frontend guide: [packages/client/README.md](packages/client/README.md)
- Backend guide: [packages/server/README.md](packages/server/README.md)

## Route Map

Top-level routes:

- `/` landing page
- `/home` product home page
- `/app/*` workspace shell with feature routes
- `/join/:code` invite deep-link entry

Workspace feature routes:

- `/app` placeholder/default view
- `/app/chat/:username` direct chat
- `/app/call/:username` 1:1 call view
- `/app/rooms/new` room creation flow
- `/app/rooms/:roomId` room chat + details
- `/app/rooms/:roomId/call` room call view
- `/app/invites` invite center

## Quick Start

### Prerequisites

- Node.js 18+
- npm 7+

### Install

```bash
npm install
```

### Run in Development

```bash
# both workspaces in dev mode
npm run dev

# run separately
npm run dev:server
npm run dev:client
```

### Build + Run (single server serving built client)

```bash
npm run build
npm run start
```

### Tests

```bash
npm test
```

## Features

- WebRTC audio and video calls
- Realtime chat with delivery/read states
- Offline queueing for chat/file messages
- File message support with local save modal
- Sidebar unread badges and typing indicators
- Browser notifications + audio alerts
- Room system with owner/invite/request workflows
- Room calls with participant media-state badges and active speaker
- End room call for everyone (owner/starter authorization)
- Mobile-first call/chat layout patterns
- Route-based navigation for core workspace operations

## Known Gaps

- WebRTC behavior can still vary by browser/device (especially mobile screen share support and permissions UX).
- Mesh topology for room calls can degrade as participant count grows; SFU migration is recommended for scale.
- Some runtime state is still in-memory and should move to Redis/DB-backed services for full horizontal scale.
- Authentication is intentionally not present; this is open-access by design.

## Blank Page Troubleshooting

If the browser shows a blank page after restarting backend:

1. Ensure the protocol is correct: use `https://localhost:4430` when certificates are enabled.
2. If serving from backend static files, build client first:
   - `npm run build`
3. Or run Vite separately and open client dev URL:
   - `npm run dev:client` then open `https://localhost:5173`
4. If port 4430 is busy, stop existing process before starting a new server.

## Routing Troubleshooting

If the UI seems out of sync with URL routes:

1. Start from `/app` and navigate from sidebar or in-view controls.
2. Ensure client build is current (`npm run build` in `packages/client`).
3. For invite paths, keep format `/join/<code>`.
4. If browser history has stale state, hard refresh once and retry.

## Open-But-Safe Model

Peers intentionally has no account system. Safety is handled with backend controls:

- CORS origin allow-list (configurable)
- Input/payload validation for chat and files
- File size ceiling for realtime transfer
- Per-IP connection caps
- Per-IP message rate limits
- Offline queue TTL and cleanup

## Environment Variables (Server)

- `HOST` default `0.0.0.0`
- `PORT` default `8080` (Railway sets this automatically in production)
- `NODE_ENV` set to `production` on hosted deployments
- `CORS_ORIGINS` default localhost allow-list, comma separated (`*` allowed for fully open)
- `MAX_CONNECTIONS_PER_IP` default `20`
- `OFFLINE_MESSAGE_TTL_MS` default `604800000` (7 days)

Server startup mode:

- Production (`NODE_ENV=production`): runs HTTP inside container behind Railway TLS edge
- Local development: attempts local HTTPS via `server.cert`/`server.key`, falls back to HTTP

## Client Environment Switching

Client server endpoints are configured in [packages/client/src/config/serverConfig.js](packages/client/src/config/serverConfig.js):

- Development API base: `https://localhost:8080`
- Development WebSocket: `wss://localhost:8080`
- Production API base: `https://peers-server-prod-production.up.railway.app`
- Production WebSocket: `wss://peers-server-prod-production.up.railway.app`

The client switches automatically using `import.meta.env.DEV` (works locally and on Vercel without manual edits).

## Forward Architecture Plan

Current storage is browser IndexedDB + in-memory server queue. The code is being kept compatible with migration to:

- Persistent backend DB (MongoDB/Postgres) for users/messages/state
- Redis for presence, rate-limit counters, and offline queueing
- Object storage (e.g., S3/Azure Blob) for file payloads instead of base64 relay

This future move can be done behind service adapters without changing most UI components.

## Mobile + Hosting Recommendations (Short)

- Mobile app direction:
   - Keep shared domain logic in a common package (`packages/shared`) for message/call/room models.
   - Implement native client with React Native + Expo for fastest parity and OTA updates.
   - Keep WebSocket protocol stable and versioned to support web + mobile simultaneously.
   - Add push notifications (FCM/APNs) for call and room invite wake-up events.

- Production hosting:
   - Frontend: Vercel/Netlify/Azure Static Web Apps.
   - Signaling API/WebSocket: Railway or Azure Container Apps for long-lived connections.
   - TURN: Managed coturn deployment (required for NAT/firewall reliability).
   - Storage: Postgres + Redis + object storage (S3/Azure Blob).

For a full implementation-level report, see [GENERAL_REPORT.md](GENERAL_REPORT.md).
