# @peers/server

Express + WebSocket signaling backend for Peers app.

## Run

```bash
npm run dev -w @peers/server
```

or

```bash
npm run start -w @peers/server
```

Default endpoint: `https://localhost:4430` (falls back to HTTP if certs are missing and `USE_HTTP` behavior allows).

## Tests

```bash
npm run test -w @peers/server
```

## What It Does

- WebSocket signaling relay for call and chat events
- Online user presence broadcasting
- Registered username tracking (no accounts)
- Offline message queueing for absent users
- Static serving of built client in production mode

## Open-But-Safe Protections

- CORS allow-list with configurable origins
- Payload validation for chat and file messages
- File size and encoded payload checks
- Per-IP connection cap
- Per-IP message type rate limiting
- Offline queue TTL cleanup
- Anonymous server-generated session ID per connection

## Important Environment Variables

- `HOST` default `0.0.0.0`
- `PORT` default `4430`
- `USE_HTTP` default `false`
- `CORS_ORIGINS` comma-separated origin list (or `*`)
- `MAX_CONNECTIONS_PER_IP` default `20`
- `OFFLINE_MESSAGE_TTL_MS` default `604800000`

## Production Direction

This service is intentionally lightweight for now. Planned evolution:

- Replace in-memory presence/queue/user state with Redis + DB-backed services
- Persist users/messages to MongoDB or another DB
- Replace base64 file relay with signed upload URLs to object storage
- Keep the WS message contract stable while swapping internal storage adapters
