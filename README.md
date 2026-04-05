# Peers App

Peers is a real-time WebRTC chat/call app with an open, no-account login model (display-name based), built as an npm workspace monorepo.

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

## Blank Page Troubleshooting

If the browser shows a blank page after restarting backend:

1. Ensure the protocol is correct: use `https://localhost:4430` when certificates are enabled.
2. If serving from backend static files, build client first:
   - `npm run build`
3. Or run Vite separately and open client dev URL:
   - `npm run dev:client` then open `https://localhost:5173`
4. If port 4430 is busy, stop existing process before starting a new server.

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
- `PORT` default `4430`
- `USE_HTTP` default `false`
- `CORS_ORIGINS` default localhost allow-list, comma separated (`*` allowed for fully open)
- `MAX_CONNECTIONS_PER_IP` default `20`
- `OFFLINE_MESSAGE_TTL_MS` default `604800000` (7 days)

## Forward Architecture Plan

Current storage is browser IndexedDB + in-memory server queue. The code is being kept compatible with migration to:

- Persistent backend DB (MongoDB/Postgres) for users/messages/state
- Redis for presence, rate-limit counters, and offline queueing
- Object storage (e.g., S3/Azure Blob) for file payloads instead of base64 relay

This future move can be done behind service adapters without changing most UI components.
