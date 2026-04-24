# Peers Engineering General Report
**Last updated: April 2026 — Release Candidate Review**

---

## Scope and Purpose

This document is the living engineering record of the Peers project. It captures:

- complete feature inventory (what exists and how it works)
- every significant problem encountered and how it was resolved
- the current state of the codebase heading into the first public release
- the marketing website status and integration plan
- recommended next features ranked by user impact

The report is maintained for:
- implementation handoff between development sessions
- planning and architecture review with collaborators
- external AI-assisted analysis (ChatGPT, Claude Code) to give reviewers complete context before suggesting implementations

---

## Project Overview

**Peers** is an open-access, real-time collaboration platform built for students, communities, and small teams. It requires no accounts, no passwords, and no installs — just a username and a browser. Core capabilities: direct peer messaging, P2P audio/video calls, group rooms with chat and multi-participant calls, and file sharing.

The codebase is a three-package npm workspace monorepo:

| Package | Framework | Role |
|---|---|---|
| `packages/client` | React 18 + Vite | Frontend SPA |
| `packages/server` | Node.js + Express + WebSocket | Signaling + REST API + file coordination |
| `packages/marketing` | Next.js 16 | Public-facing marketing site (new) |

---

## Current Architecture

### Monorepo Layout

```
web-rtc-app/
├── packages/
│   ├── client/          React + Vite SPA
│   ├── server/          Node signaling server
│   └── marketing/       Next.js marketing site (new landing page)
├── docker-compose.yml   Single-service Docker config
├── package.json         Workspace root with shared scripts
├── README.md
└── GENERAL_REPORT.md    (this file)
```

### Client Architecture (`packages/client/src`)

**App.jsx** is the root orchestrator: manages all application state (users, messages, rooms, call state, typing, reactions, file resolution) and provides it to the component tree via `AppContext`. This is intentional — keeping state high avoids prop drilling and makes debugging straightforward.

**Hooks layer:**

| Hook | Responsibility |
|---|---|
| `useWebSocket` | WebSocket lifecycle: connect, reconnect (5 attempts, exponential backoff), fallback URL rotation (localhost ↔ 127.0.0.1), heartbeat ping/pong, 45+ message type dispatching |
| `useWebRTC` | 1:1 call negotiation (offer/answer/ICE), media stream setup, video toggle, upgrade request |
| `useRoomWebRTC` | Multi-peer mesh negotiation for group calls, participant state, active speaker detection, end-call control |
| `useAudio` | Ringtones, dial tones, SMS notification sounds (5 audio variants) |

**Services:**

| Service | Responsibility |
|---|---|
| `storageService.js` | IndexedDB API — three object stores: `messages`, `files`, `room_messages`. Supports message saving, editing, reactions, delivery/read status tracking, conversation search, and local deletion |
| `serverConfig.js` | Environment-aware endpoint resolution: HTTPS/WSS on `localhost:8080` in dev, production Railway URLs from env, private IP detection |

**Components (19 files):**

| Component | Type |
|---|---|
| `ChatInterface.jsx` | Direct messaging UI — complete redesign |
| `RoomInterface.jsx` | Room chat + profile panel — complete redesign |
| `VideoInterface.jsx` | 1:1 call UI |
| `RoomCallInterface.jsx` | Group call UI |
| `Sidebar.jsx` | Navigation: peers, rooms, presence |
| `FilePreviewModal.jsx` | Single-file caption + send preview |
| `BatchPhotoPreviewModal.jsx` | Multi-photo caption + send preview (new) |
| `MediaViewerModal.jsx` | Full-screen photo/video viewer with navigation |
| `SavedFilesModal.jsx` | IndexedDB file browser |
| `InviteCenterView.jsx` | Invite link management |
| `EmojiPicker.jsx` | Emoji picker grid |
| `CallingOverlay.jsx` | Outgoing/incoming call overlay |
| `IncomingCallModal.jsx` | Incoming call alert |
| `CallEndedModal.jsx` | Post-call summary |
| `VideoUpgradeRequestModal.jsx` | Audio-to-video upgrade prompt |
| `LoginScreen.jsx` | Display-name based login |
| `PlaceholderView.jsx` | Empty state between selections |
| `MainContent.jsx` | Layout wrapper |
| `ToastContainer.jsx` | Toast notification system |

### Server Architecture (`packages/server/src`)

`index.js` (≈1,700 lines) is the core. It runs an Express HTTP server and a `ws` WebSocket server on the same port.

**In-memory state maps (all reset on restart — known limitation):**
- `activeConnections`: WebSocket → username
- `onlineUsers`: username → WebSocket
- `offlineMessageQueue`: username → message[]  (7-day TTL, cleaned every 60s)
- `sessions`: token → username
- `rooms`: roomId → { name, owner, members, pendingInvites, callState }
- `inviteLinks`: code → { createdBy, roomId, expiresAt }
- `rateLimiters`: per-IP counters (17 configurable policies)

**WebSocket message types handled (42 total):**

Presence: `join`, `welcome`, `onlineUsers`, `allUsers`, `ping`/`pong`

Direct chat: `chat`, `typing`, `stop_typing`, `edit_message`, `reaction`, `delivered`, `read`, `delete-message`, `message-queued`, `file`, `offer`, `answer`, `ice`, `hangup`, `reject`, `video-toggle`, `video_upgrade_request`, `video_upgrade_response`

Rooms: `room_list`, `room_created`, `room_chat`, `room_file`, `room_typing`, `room_stop_typing`, `room_reaction`, `room_message_status`, `room_invite`, `room_invite_result`, `room_join_request`

Room calls: `room_call_started`, `room_call_participants`, `room_call_ended`, `room_media_state`, `room_webrtc_offer`, `room_webrtc_answer`, `room_webrtc_ice`

Invites: `create_invite`, `invite_created`, `invite_target`

**REST API endpoints:**
- `POST /api/messages/` — save and retrieve message history
- `POST /api/files/presign` — generate S3 presigned upload URL
- `GET /api/files/:fileId` — resolve download URL
- `POST /api/rooms/` — create room
- `POST /api/rooms/:id/join` — request membership
- `POST /api/invites/` — create invite link
- `GET /api/invites/:code` — validate and consume invite

**Middleware:**
- `sessionStore.js` — in-memory token → username session map
- `requireAuthenticatedUser.js` — guards REST routes

**Database (Prisma + PostgreSQL):**

```
User           { username, createdAt, lastSeen }
Message        { from, to, roomId, text, fileUrl, edited, timestamp, reactions[] }
File           { uploader, fileName, fileType, fileSize, storageKey, fileUrl }
Reaction       { emoji, username, messageId } [unique: messageId+username+emoji]
Room           { roomId, name, owner, members[], invites[] }
RoomMember     { userId, roomId, role, status } [unique: userId+roomId]
Invite         { code, createdBy, roomId, expiresAt }
```

**Environment variables required:**

```env
# Server
DATABASE_URL=           # Postgres (Neon/Railway)
PORT=3000
NODE_ENV=production
CORS_ORIGINS=           # comma-separated, e.g. https://peers.app

# AWS S3
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_BUCKET_NAME=

# Tuning (optional)
MAX_CONNECTIONS_PER_IP=20
OFFLINE_MESSAGE_TTL_MS=604800000   # 7 days
```

---

## Routing

### Application Routes

| Path | View |
|---|---|
| `/` | Landing page |
| `/home` | Home (post-login) |
| `/app` | Workspace placeholder |
| `/app/chat/:username` | Direct message chat |
| `/app/call/:username` | 1:1 call |
| `/app/rooms/create` | New room form |
| `/app/rooms/:roomId` | Room chat |
| `/app/rooms/:roomId/call` | Room call |
| `/app/invites` | Invite center |
| `/join/:code` | Invite deep link |

URL routing enables browser back/forward navigation, deep-linking, and will map cleanly to a React Native navigation stack when mobile is built.

---

## Feature Inventory

### Direct Messaging

- Text messages with delivery states: `pending → sent → delivered → read`
- Typing indicators with 3-second auto-stop and 2-second keepalive interval
- Message reactions (👍 ❤️ 😂 🔥) — per-message emoji picker
- Message editing (own messages only)
- Message deletion: "Delete for me" (local only) or "Delete for everyone" (server-broadcast)
- Swipe-right-to-reply (mobile touch gesture)
- Right-click context menu: Reply, React, Edit (own messages)
- Offline message queue: server holds messages for offline peers for 7 days
- Message search: local IndexedDB search with highlight on match
- Smart scroll: auto-scrolls to bottom only when near bottom or own message sent; scroll-to-bottom button appears when scrolled up
- Whitespace-preserving messages: multi-line input renders exactly as typed

### File Sharing (Direct)

- File attachment menu: Photos, File, Emoji, Saved Files
- Single file: FilePreviewModal with caption input and Photo/File kind toggle before sending
- Multiple photos: BatchPhotoPreviewModal — thumbnail grid + caption field before sending (new)
- Photo grouping: consecutive same-sender photos within 2 minutes displayed in a responsive mosaic grid (1–4 photos); HEIC/HEIF files excluded from groups
- Grouped photo layouts by photo count and orientation:
  - 2 portrait: side-by-side grid
  - 2 landscape: stacked rows
  - 3 portrait: 5fr:4fr column split with first spanning 2 rows
  - 4+: 2×2 grid
- Auto-retry on photo load failure: up to 3 automatic retries (2s, 5s, 10s delays) before showing manual Retry button
- Single image viewer: full-width in-bubble with click-to-open MediaViewerModal
- Video messages: inline player thumbnail with play overlay; click to open viewer
- File cards for all other types (PDF, text, docs): filename + type + size + Open (new tab) + Download buttons
- HEIC/HEIF detection: shown as file attachment card, not broken image

### Direct Calls (1:1)

- Audio-only and video calls
- Incoming call modal with ringtone
- Accept, decline (sends reject signal), hangup
- In-call audio/video/mic toggle
- Video upgrade request from audio call
- Call logs (completed, missed, declined) visible in chat thread
- Call duration tracking

### Rooms

- Create a room with a name and invite initial members
- Invite peers to an existing room (owner only)
- Join request + owner approval workflow
- Room invite link system (7-day expiry)
- Room chat: text messages with sender name labels, reactions, typing indicators, reply-to, `X/Y read` delivery status
- Room file sharing: photos and file attachments via S3 presigned upload
- Room profile panel: opens on clicking the room name. Shows members list with roles (crown for owner), online status badges, invite peers (owner), room settings (owner). Slides in from right on desktop; full-screen overlay on mobile
- Context menu on room messages: Reply, React (emoji picker)

### Room Calls

- Start a call (any member), join an existing call, rejoin after leaving
- Incoming call banner in room header
- Multi-participant mesh WebRTC negotiation
- Participant tile grid with name badges
- Media state badges per participant: mic muted, camera off, screen sharing
- Active speaker detection (border highlight)
- End call for everyone (starter or room owner only)
- Room call accessible from room header button or `/app/rooms/:roomId/call` route

### Presence

- Online/offline status shown for all known peers in sidebar and chat header
- Real-time presence updates broadcast on join/disconnect
- Room member online indicators in room profile panel

### Invites

- Generate a shareable invite link (7-day TTL)
- `/join/:code` deep link entry routes new users directly into the invite flow
- Invite center view for managing generated links

---

## Problems Encountered and How They Were Resolved

### P1: Room interface was not scrollable (critical)

**Problem:** After the room UI redesign, the message area could not scroll and the message input was inaccessible below the viewport.

**Root cause:** The parent `<div>` wrapping the messages area did not establish a proper flex shrink context. A flex child without `min-h-0` cannot shrink below its content height, so the scroll container grew to fit all content and never activated scroll.

**Fix:** Wrapped the member content area in `<div className="flex-1 flex flex-col min-h-0">` and used the `absolute inset-0 overflow-y-auto` scroll pattern (identical to ChatInterface's working scroll) for the inner messages container.

---

### P2: Room typing indicator never fired

**Problem:** Typing indicators were fully implemented server-side and in App.jsx but never appeared in room chat.

**Root cause:** In `useWebSocket.js`, the callback ref is updated every render via a `useEffect` that reassigns `callbacksRef.current`. The `onRoomTyping` callback was present in the *initial* `useRef({...})` but was accidentally omitted from the *update* effect's object literal. After the first re-render, `callbacksRef.current.onRoomTyping` became `undefined` and all subsequent `room_typing` messages were silently dropped.

**Fix:** Added `onRoomTyping` to the update effect's object literal in `useWebSocket.js` between `onRoomFile` and `onRoomReaction`.

---

### P3: Photo "Retry" button triggered a browser download instead of in-chat reload

**Problem:** When a grouped photo failed to load, clicking Retry opened a file download dialog instead of re-attempting to render the image in the chat.

**Root cause:** The Retry button was wired to `handleRedownloadFile` / `handleRedownloadRoomFile`, which creates an `<a>` element and calls `.click()` to trigger a download — correct for the download action but wrong for in-chat image retry.

**Fix:** Created dedicated `handleRetryPhoto` (DM) and `handleRetryRoomPhoto` (room) callbacks that call `clearMediaLoadFailed` + `resolveMessageFileUrl` to update `mediaUrlOverrides` state, causing the `<img>` to re-render with a potentially fresh URL without triggering a download.

---

### P4: Auto-retry not implemented — users had to manually click Retry every time

**Problem:** Any transient network failure on image load immediately showed "Retry" to the user, requiring manual intervention for what are often self-resolving issues.

**Fix:** Added `mediaAutoRetryCountRef` (per-component) and `handlePhotoLoadError` / `handleRoomPhotoLoadError` callbacks. On every `onError` event:
1. If auto-retry count < 3: increment count, schedule retry after `[2000, 5000, 10000][count]`ms, resolve a fresh URL, append `?_r=<timestamp>` cache buster to force re-render
2. If count ≥ 3: call `markMediaLoadFailed` — only now does the "Retry" button appear
Manual "Retry" resets the count to 0 so auto-retry can run again.

---

### P5: Grouped photos had broken/collapsed layout

**Problem:** In both DM and room chats, grouped photo grids collapsed to near-zero width on mobile and desktop.

**Root cause (DM):** The photo group outer `<div>` lacked `w-full`. In a flex column, a child without an explicit width shrinks to its content width. Since the inner CSS grid had no parent width to anchor to, it computed zero width.

**Fix (DM):** Added `w-full` to the outer group div alongside `max-w-[min(32rem,70vw)]`.

**Root cause (Room):** The room photo group used `max-w-[min(22rem,70vw)]` — 10rem narrower than DM's `32rem`. No `w-full` was missing but the width was wrong.

**Fix (Room):** Changed to `max-w-[min(32rem,70vw)]` and fixed the 3-portrait column ratio from `grid-cols-[3fr_2fr]` to `grid-cols-[5fr_4fr]` to match DM.

---

### P6: HEIC/HEIF files appeared in grouped photo grids as broken images

**Problem:** `.heic` and `.heif` files (iOS native format) cannot be rendered by any browser's `<img>` tag. When included in a photo batch, they appeared as broken thumbnails inside the mosaic grid.

**Fix:** `isGroupableRoomPhotoMessage` was updated to call `isLikelyUnsupportedImage` (already implemented in the DM side's `isGroupablePhotoMessage`). HEIC files are now excluded from all photo groups and rendered as file attachment cards instead.

---

### P7: Right-clicking a room message triggered reply instead of a context menu

**Problem:** The `onContextMenu` handler on room message bubbles directly called `setReplyTarget`, launching a reply immediately with no options for other actions.

**Fix:** Replaced `setReplyTarget` with `setContextMenu({ x, y, message })`. A context menu popup (Reply + React emoji row) now renders at the cursor position. Click-outside handler dismisses it. Same pattern already existed in DM chat.

---

### P8: Reaction double-toggle — reactor could not see own reaction

**Problem:** After reacting to a room message, the reaction would optimistically appear (applied locally by `handleReactToRoomMessage`) and then immediately disappear. Other members could see the reaction correctly.

**Root cause:** The server broadcasts `room_reaction` back to *all* members including the sender. `handleReactToRoomMessage` applies the reaction optimistically, then `onRoomReaction` fires a second time for the sender, toggling the reaction off.

**Fix:** Added `if (data.from === username) return;` at the top of the `onRoomReaction` handler in App.jsx. Own reactions are applied only once optimistically; the server echo is discarded.

---

### P9: Multi-photo selection sent immediately without caption step (DM + Room)

**Problem:** Selecting multiple photos in DM sent them all immediately with empty captions. In rooms, even single file selections sent immediately without any preview or caption.

**Fix (DM):** Multi-photo selection now stores files in `pendingBatchFiles` state and opens `BatchPhotoPreviewModal` instead of calling `sendFilesBatch` immediately.

**Fix (Room):** `handleRoomFileSelect` now routes:
- Single file → `FilePreviewModal` (preview + caption + kind toggle)
- Multiple files → `BatchPhotoPreviewModal` (thumbnail grid + caption)

New `BatchPhotoPreviewModal` component: shows a grid of image thumbnails (or file names for non-images), a textarea for caption (Shift+Enter for newlines, Enter to send), and a Send button. Generates and revokes object URLs cleanly.

---

### P10: Multi-line messages forced to single line

**Problem:** A message typed across multiple lines displayed as a single line in the bubble.

**Root cause (DM):** The text render `<div>` did not have `whitespace-pre-wrap`.

**Fix (DM):** Added `style={{ whiteSpace: "pre-wrap" }}` to the text render div.

**Room:** Already had `whitespace-pre-wrap` on the `<p>` tag; no change needed.

---

### P11: No way to open/preview non-image files (PDFs, text, docs)

**Problem:** PDFs had a tiny inline iframe (h-52 ≈ 200px) with no affordance to open a full preview. Generic files had only a Download button. Users had no way to open PDFs in the browser's native viewer.

**Fix:** Replaced the inline iframe and old generic file card with a unified file card design across both DM and room chats:
- Paperclip icon + file name + type + size
- **Open** button: resolves the file URL and calls `window.open(url, "_blank")`, opening in the browser's native viewer (PDF, text, etc.)
- **Download** button: triggers the existing download flow

---

### P12: Existing call CTA state labels were ambiguous

**Problem:** Room call button labels didn't clearly communicate whether the user was starting, joining, rejoining, or returning to an active call.

**Fix:** Introduced `roomCallLastJoinedByRoom` state map to track whether a user has previously joined each room's call. Button label logic:
- If in active call view → "Open Call"
- If call active and user hasn't joined → "Join Call"
- If call active and user has joined before → "Rejoin Call"
- Otherwise → "Start Call"

---

### P13: Mic/camera stability regressions in room calls

**Problem:** Toggling mic/camera repeatedly or switching between screen share and camera caused track loss and inconsistent remote media.

**Root cause:** Fragile sender replacement handling and stale closure references in screen-share stop callbacks.

**Fix:** `replaceTrack` pattern reinforced throughout `useRoomWebRTC`; explicit screen-share stop flow introduced; stale callback behavior mitigated by `useRef` for current-state capture.

---

### P14: WebSocket URL fallback was not implemented

**Problem:** On some dev setups, `localhost` and `127.0.0.1` resolve differently. When the primary WebSocket URL failed, no retry with the alternate hostname was attempted.

**Fix:** Added `getWsCandidateUrls(primaryUrl)` in `useWebSocket.js`. On connection close, the hook first cycles through candidate URLs (localhost → 127.0.0.1 or vice versa) before entering the exponential-backoff reconnect loop.

---

## What Works Well Today

- Full direct messaging: text, files, photos, videos, reactions, typing, delivery/read states, editing, deletion, reply-to, search
- 1:1 audio/video calls with controls, upgrade, and call logs
- Room creation, invite, join-request/approval, and room profile panel
- Room chat: messages, reactions, typing indicators, file/photo sharing, reply-to, delivery status
- Group room calls with mesh WebRTC, media state, active speaker, end-for-everyone
- In-app URL routing (browser back/forward, deep links)
- Invite link system (7-day TTL, `/join/:code` entry)
- S3-backed file uploads for room files
- IndexedDB local persistence for DM history, saved files
- Offline message queue (7-day server-side hold)
- Toast notification system
- Mobile-responsive layouts across all screens
- WebSocket reconnection with hostname fallback and exponential backoff
- Heartbeat ping/pong with 10s pong timeout

---

## Marketing Website (`packages/marketing`)

### What Was Built

A complete, polished multi-page Next.js 16 marketing site was created to serve as the new public landing page for Peers. It replaces the in-app landing page currently at `/`.

**Pages:**

| Route | Content |
|---|---|
| `/` | Hero, feature showcase: real-time chat, rooms, calls, file sharing, presence indicators |
| `/about` | Company mission, founding story, design principles |
| `/product` | Feature deep-dives with UI screenshots (desktop room calls, file sharing, mobile layouts) |
| `/use-cases` | Three target segments: students, communities, small teams — each with tailored feature highlights |

**Tech stack:**
- Next.js 16 (App Router)
- Tailwind CSS
- Vercel-ready (zero-config deployment)
- Self-contained — no dependency on the app's server or client

### Integration Plan

The marketing site should be hosted separately and linked to the app.

**Recommended approach: Vercel + custom domain**

```
peersapp.io       → marketing site (Vercel, packages/marketing)
app.peersapp.io   → React SPA (Vercel static, packages/client/dist)
api.peersapp.io   → Node server (Railway)
```

Steps to deploy:

1. **Marketing site on Vercel:**
   - Import the monorepo into Vercel
   - Set the root directory to `packages/marketing`
   - Framework preset: Next.js
   - Assign custom domain (e.g. `peersapp.io`)
   - Add `NEXT_PUBLIC_APP_URL=https://app.peersapp.io` env var for CTA links

2. **Client SPA on Vercel (separate project):**
   - Root directory: `packages/client`
   - Build command: `npm run build`
   - Output: `dist`
   - Assign subdomain (e.g. `app.peersapp.io`)
   - Set `VITE_API_URL=https://api.peersapp.io`

3. **Link the two:**
   - All "Get Started" and "Open App" CTAs in marketing point to `https://app.peersapp.io`
   - The in-app `/` route can redirect to the marketing site or show a thin in-app landing
   - The `/join/:code` invite deep link must remain on `app.peersapp.io` (not marketing)

4. **DNS:**
   - `peersapp.io` → Vercel (marketing)
   - `app.peersapp.io` → Vercel (client)
   - `api.peersapp.io` → Railway (server)

---

## Current Deployment Stack

| Layer | Service |
|---|---|
| Frontend (app) | Vercel (static SPA) |
| Backend (signaling + API) | Railway (WebSocket-capable, auto TLS) |
| Database | PostgreSQL — Neon or Railway Postgres |
| File storage | AWS S3 (presigned upload/download) |
| Frontend (marketing) | Vercel (Next.js) — to be deployed |
| TURN server | Not yet deployed — NAT reliability gap |
| Cache / ephemeral state | Not yet (in-memory on server) — Redis gap |

**Docker support:** `docker-compose.yml` exists at root. Builds `packages/server` and mounts `packages/client/dist` as static assets. Suitable for self-hosted deployments.

---

## Known Gaps Heading Into Release

### Critical

- **No TURN server**: WebRTC P2P calls will fail for users behind strict NAT/firewalls (corporate networks, university networks, some mobile carriers). Deploy coturn or use a managed TURN provider (Metered, Twilio, Cloudflare Calls) before production launch.
- **In-memory server state**: Rooms, sessions, online users, and rate-limit counters reset on every server restart. On Railway this happens on every deploy. Must migrate to Redis before stable production use.

### Important

- **DM history not server-persisted**: Message history lives only in the user's browser IndexedDB. Switching browsers or clearing storage loses history. Server persistence (already exists for room messages) should be added for DM as well.
- **No identity model**: Username is unclaimed — anyone can join as any name. Fine for early beta, but needs a lightweight token/auth layer before public launch to prevent impersonation.
- **Mesh WebRTC scales to ~4–6 participants**: Beyond that, CPU and bandwidth degrade. SFU migration (LiveKit, mediasoup) is the path forward for larger rooms.

### Nice to Have

- No push notifications: Mobile users miss incoming calls. FCM/APNs needed for mobile app.
- No message persistence search server-side: search works locally from IndexedDB but doesn't survive history loss.
- Screen share on mobile browsers varies significantly by browser/OS.

---

## Recommended Next Features (Ranked by User Impact)

### 1. TURN Server Integration (Pre-Launch, Highest Priority)

Without TURN, calls fail silently for a meaningful percentage of users. This is a launch blocker.

- Deploy a managed TURN service (Metered is free tier, Twilio or Cloudflare for production volume)
- Add ICE server config to `useWebRTC` and `useRoomWebRTC`: `{ urls: "turn:...", username, credential }`
- Test behind strict NAT to confirm calls succeed

---

### 2. Message Notifications (In-Browser + Mobile Push)

Users miss messages when the tab is not focused.

- Web: Use `Notification API` (already have toast system; extend to system notifications with permission)
- Mobile (future): FCM integration when React Native app ships

---

### 3. Authentication: Lightweight Token System

Even a simple flow protects usernames and unlocks DM history sync.

- Option A (simplest): Username + PIN → server issues a signed JWT → persisted in localStorage
- Option B: Magic link via email → eliminates passwords
- Benefit: Enables server-side DM history, protects usernames, allows "sign in on another device"

---

### 4. Server-Persisted DM History

Currently DM history lives in IndexedDB only. If a user clears storage or opens a new browser they lose all history.

- Server already persists room messages via Prisma; extend the same `Message` model for DMs
- REST endpoint: `GET /api/messages/:peerUsername?limit=50&before=<timestamp>` for pagination
- Client hydrates IndexedDB from server on first chat open per peer per session

---

### 5. Redis for Presence and Rate Limiting

Eliminates the server-restart state loss problem and enables horizontal scaling.

- Migrate `onlineUsers`, `rooms`, `offlineMessageQueue`, `rateLimiters` from in-memory Maps to Redis hashes/sorted sets
- Use Redis pub/sub for cross-instance WebSocket message fanout (needed when running >1 server instance)

---

### 6. Read Receipts in Rooms ("Seen by X")

Room messages have `X/Y read` status but no visual "seen by" detail.

- Add a tooltip/popover on the read status badge showing which members have read the message
- `readBy[]` already tracked server-side

---

### 7. Message Threads / Replies Improvement

Reply-to is implemented but shows only a summary snippet. A threaded view would improve context for long conversations.

---

### 8. Saved / Starred Messages

Allow users to star important messages for later retrieval. Partial infrastructure exists via `SavedFilesModal` for files; extend to all message types.

---

### 9. React Native Mobile App

Share protocol and domain logic with the web app. Priority order: chat + presence → room chat → calls.

---

### 10. SFU Migration for Room Calls

Mesh topology is bounded at ~6 participants. LiveKit (open source, self-hostable) is the recommended SFU with good WebRTC browser support.

---

## Collaboration Notes (Claude Code + ChatGPT)

This project uses both Claude Code (implementation sessions, code generation, bug investigation) and ChatGPT (architecture review, prompt refinement, feature planning). 

For effective handoff between AI systems, share this document as context. Key prompts that have worked well:

- "Here is the engineering report for Peers. We want to implement [feature]. What are the edge cases we should handle?"
- "We have this bug in [component]. Here is the surrounding code. What is the likely root cause?"
- "We are about to release. What production-readiness checklist items are most important given this architecture?"
- "Given mesh WebRTC and this server architecture, what is the lowest-risk migration path to SFU for room calls?"

When starting a new Claude Code session on this codebase, paste this report and the relevant file paths before describing the task. It prevents re-derivation of context that is already known.

---

## Validation Status

| Check | Status |
|---|---|
| Client Vite production build | ✅ Passing |
| Server starts without error | ✅ Passing |
| WebSocket message handling | ✅ All 42 types handled |
| Room typing indicator | ✅ Fixed (callback ref bug) |
| Photo auto-retry | ✅ Implemented (3 attempts) |
| Grouped photo layout | ✅ Fixed (DM + Room) |
| Multi-photo caption flow | ✅ Implemented (DM + Room) |
| File open/preview | ✅ Implemented (Open + Download) |
| HEIC exclusion from groups | ✅ Implemented |
| Whitespace-preserving messages | ✅ Fixed |
| Reaction double-toggle | ✅ Fixed |
| Marketing site build | ✅ Next.js build passes |
| TURN server | ❌ Not deployed |
| Redis state persistence | ❌ Not implemented |
| Server-side DM history | ❌ Not implemented |

---

## Summary

Peers is a fully functional real-time collaboration platform ready for a beta release. The core product — direct messaging, 1:1 calls, group rooms with chat and multi-participant video — is working end-to-end with solid UX including photo grouping, file previews, typing indicators, delivery tracking, reactions, and room management.

The largest risks heading into public launch are TURN server absence (silent call failures behind NAT) and in-memory server state (lost on restart). Both are solvable in days and should precede any marketing-driven traffic spike.

The marketing site is ready to deploy to Vercel on a custom domain with CTAs linking to the app. This separation keeps the marketing site fast and independently deployable while keeping the app on its own subdomain.

The codebase is well-structured for the next phase: auth, server-persisted history, and eventually an SFU migration and mobile app.
