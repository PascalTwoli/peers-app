# Peers Engineering General Report

## Scope and Purpose

This document summarizes the current engineering status of the Peers project:

- what has been implemented
- what broke and why
- what has been stabilized
- what still needs work
- recommendations for product, architecture, mobile strategy, and hosting

The report is intended for:

- implementation handoff
- planning and architecture review
- external AI/system analysis (including ChatGPT follow-up suggestions)

## Current Architecture

### Monorepo Layout

- `packages/client`: React + Vite frontend
- `packages/server`: Node WebSocket signaling + validation
- Root workspace scripts orchestrate build/test/dev

### Client Layering

- `App.jsx` orchestrates app state and event handling
- Context provider shares operations with feature components
- Feature components include chat, 1:1 call, room, room call, invite center, sidebar, and overlays
- WebRTC is split into hooks:
   - `useWebRTC` for direct peer call
   - `useRoomWebRTC` for room-call media mesh

### Signaling and State Flow

- WebSocket events carry chat, file, delivery/read status, invite, room lifecycle, and room-call signaling
- Room-call control and WebRTC signaling are server-relayed
- Local persistence currently relies on browser storage mechanisms for user-facing continuity

## Routing: What Changed

Routing now exists at two levels.

### Top-Level

- `/` landing
- `/home` home
- `/app/*` workspace
- `/join/:code` invite deep link

### Workspace Operation Routing

The app now synchronizes major operations to URL paths:

- `/app` placeholder
- `/app/chat/:username`
- `/app/call/:username`
- `/app/rooms/new`
- `/app/rooms/:roomId`
- `/app/rooms/:roomId/call`
- `/app/invites`

### Why This Matters

- browser back/forward now tracks feature transitions
- deep-linking is possible for operation entry points
- state-to-route architecture now aligns better with future mobile navigation concepts (stack/tabs)

## Issues Encountered and Resolutions

### 1) Call Action Semantics Were Misleading

Problem:

- room call CTA states were ambiguous
- users did not always know whether they were starting, joining, rejoining, or opening

Resolution:

- room participant and join history maps were introduced in client state
- CTA labeling was updated to reflect true action context

### 2) Incoming Room Call Alerts Lacked Attention Priority

Problem:

- incoming room call signals did not stand out enough visually

Resolution:

- stronger visual alert treatment and animation cues were added in room UI

### 3) Mic/Camera/Share Stability Regressions

Problem:

- repeated toggles and share transitions caused inconsistent local/remote media behavior
- user-reported symptoms included mic loss and camera failures

Root causes identified:

- fragile sender/track handling
- stale closure behavior in screen-share stop callback path

Resolutions implemented:

- sender replacement approach was reinforced (`replaceTrack` pattern)
- explicit screen-share stop flow was introduced
- stale callback behavior was mitigated by current-state refs
- camera/share transitions were refactored to avoid invalid restart paths

### 4) Room Call End-for-Everyone Control Missing

Problem:

- owner/starter could not reliably end room call globally

Resolution:

- server added room-call end signaling path with authorization
- server tracks room call starter and validates end permissions
- client added action and state cleanup flow

### 5) In-Call Overflow and Chat Dynamics

Problem:

- participant tile overflow and in-call chat behavior felt constrained on mobile/high counts

Resolution:

- scroll behavior and in-call chat auto-scroll updates were applied
- mobile-first layout enhancements improved usability

## What Works Well Today

- direct chat with message states and local persistence
- direct calls with upgrade and call controls
- room creation/invite/join-request flows
- room call lifecycle start/join/leave/end
- room call media-state indicators and active speaker
- entry routing and in-app operation routing
- build and validation pipeline currently passing for modified paths

## What Is Still Not Perfect

### Media Reliability Across Device Matrix

- mobile browser differences remain a practical constraint
- screen share support and permission behavior vary by browser and OS
- some edge reconnection cases still need broader field validation

### Scalability Model for Room Calls

- current room media approach is peer mesh style
- quality and CPU/network behavior degrades with participant growth
- this is expected at scale without SFU

### Product/Platform Gaps

- no account/auth identity model
- no backend durable data architecture yet for long-term production needs
- observability, analytics, and QoS telemetry are minimal

## Detailed Feature Inventory

### Messaging

- direct peer messaging
- file message transfer and save support
- delivery and read tracking
- typing indicators
- local history persistence
- reaction and edit flows

### Calls (1:1)

- audio/video calling
- call start, answer, reject, hangup
- upgrade request flow to video
- call log generation patterns
- call overlays and notifications

### Rooms

- room creation
- invite acceptance/decline
- join request and owner approval workflow
- room chat state and statuses

### Room Calls

- room call start/join/leave
- room call end for everyone
- room media state propagation (mute/video/share)
- active speaker indication
- room-call UI with mobile-oriented behavior

### Navigation

- landing + home + workspace entry
- in-app route synchronization for core operations
- invite deep-link entry path

## Mobile App Recommendations

### Recommended Approach

Use React Native with Expo for fastest delivery and shared team velocity.

Why:

- modern deployment workflow and OTA updates
- strong push notification integration patterns
- quick parity with existing React knowledge

### Shared Code Strategy

Create shared packages for non-UI logic:

- `packages/shared-protocol`: WebSocket event schema/types
- `packages/shared-domain`: message/room/call domain utilities
- `packages/shared-validation`: payload validation shared by clients and server where possible

This reduces drift between web and mobile behavior.

### RTC Strategy for Mobile

- keep WebRTC wrappers isolated behind service interfaces
- plan migration to SFU architecture for multi-party reliability
- include TURN from day one for NAT/firewall resilience

### Mobile UX Strategy

- map current in-app routes to mobile navigation stacks/tabs
- avoid feature-specific state hidden in isolated components
- centralize call state for background/foreground lifecycle correctness

### Notifications and Presence

- push channel required for call and invite wake-up
- support silent push + deep-link routing into call/invite context

## Hosting Recommendations

### Baseline Production Stack

- Web frontend: Vercel, Netlify, or Azure Static Web Apps
- Signaling/WebSocket backend: Railway or Azure Container Apps
- TURN server: managed coturn deployment
- Database: Postgres
- Cache/ephemeral state: Redis
- Files: S3 or Azure Blob

### Suggested Azure-First Stack

- Static Web Apps for frontend
- Container Apps for signaling service
- Azure Database for PostgreSQL
- Azure Cache for Redis
- Azure Blob Storage for file payloads
- Azure Front Door for global edge routing and TLS
- Azure Monitor + App Insights for telemetry

### Deployment and Reliability

- CI/CD via GitHub Actions
- environment-specific configuration per stage (dev/staging/prod)
- health checks and readiness probes for WebSocket service
- structured logs + correlation IDs for signaling events

## Security and Compliance Recommendations

- add authenticated identity and session model for non-demo deployments
- tighten origin policy and transport security defaults
- move large file payload flow from websocket base64 to object storage signed upload/download
- enforce schema validation at all ingress paths
- add abuse controls and moderation hooks if exposed publicly

## Next-Step Implementation Plan

1. Stabilization Sprint

- execute structured media test matrix by browser/device/network
- close known regressions in room media transitions
- add retry and diagnostics for permission and track failures

2. Platform Sprint

- introduce Postgres + Redis + object storage adapters
- define durable room/message/call metadata schemas
- add migrations and repository layer

3. Scale Sprint

- design and implement SFU integration path for room calls
- benchmark participant thresholds and network behavior
- introduce adaptive video and policy controls per network quality

4. Mobile Sprint

- create Expo app shell
- implement shared protocol/domain package usage
- deliver chat + presence + room flows first, then calls

5. Reliability Sprint

- add monitoring dashboards
- add synthetic call/chat tests in staging
- add chaos/resilience scenarios for websocket disconnect/reconnect

## Validation Snapshot

Recent validated checks after latest changes:

- client production build: passing
- server test suite: passing

Note: Build/test pass is necessary but not sufficient for RTC quality. Device-level and network-level verification remains required.

## Suggested Questions for External AI Review

Use this list when requesting additional recommendations from ChatGPT or other advisors:

1. What is the best phased migration from mesh WebRTC to SFU for this architecture?
2. Which TURN deployment model gives best cost/reliability tradeoff for moderate scale?
3. How should we design mobile push + deep-link call wake-up for minimal missed calls?
4. What telemetry schema should be added for call quality and signaling fault triage?
5. Which auth strategy best fits open-invite collaboration while preventing abuse?

## Summary

The project has moved from single-view state navigation toward route-driven operation navigation and has closed several major UX/signaling gaps. Core product capability is strong, but production-grade RTC reliability and scalable architecture still require focused follow-up. The mobile plan is feasible and should prioritize shared protocol/domain code and early infrastructure hardening.
