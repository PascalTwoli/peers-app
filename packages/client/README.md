# @peers/client

React frontend for Peers app.

## Stack

- React 18
- Vite 6
- Tailwind CSS
- Lucide icons

## Run

```bash
npm run dev -w @peers/client
```

Vite runs on `https://localhost:5173`.

## Build

```bash
npm run build -w @peers/client
```

Output directory: `packages/client/dist`.

## Environment-Aware Backend Configuration

Server URL switching is centralized in [src/config/serverConfig.js](src/config/serverConfig.js):

- Development API: `https://localhost:8080`
- Development WebSocket: `wss://localhost:8080`
- Production API: `https://peers-server-prod-production.up.railway.app`
- Production WebSocket: `wss://peers-server-prod-production.up.railway.app`

The client automatically switches based on `import.meta.env.DEV`, so local development and Vercel production work without manual code edits.

## Core UI Areas

- `src/App.jsx`: app state orchestration and context provider
- `src/components/Sidebar.jsx`: peers list, unread badge, typing state
- `src/components/ChatInterface.jsx`: chat, files, selection/delete, typing sender
- `src/components/VideoInterface.jsx`: call controls, PiP, camera flip
- `src/hooks/useWebSocket.js`: signaling socket lifecycle
- `src/hooks/useWebRTC.js`: peer connection and media lifecycle
- `src/services/storageService.js`: IndexedDB persistence

## UX Notes

- Last used username is remembered and auto-filled on login.
- Incoming unread counts are shown as badges in sidebar.
- Typing indicator can replace online/offline status in sidebar.

## Near-Future Backend Migration Compatibility

Client already separates UI and data access enough to support backend persistence migration:

- Replace IndexedDB reads/writes with API-backed repositories
- Keep context contract stable for components
- Move large file payload handling to upload + URL-based messages
