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

Default endpoint: `http://localhost:8080` (uses `process.env.PORT || 8080`).

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
- `PORT` default `8080`
- `NODE_ENV` controls startup mode
- `CORS_ORIGINS` comma-separated origin list (or `*`)
- `MAX_CONNECTIONS_PER_IP` default `20`
- `OFFLINE_MESSAGE_TTL_MS` default `604800000`

Startup mode behavior:

- `NODE_ENV=production`: always runs HTTP in container (Railway handles TLS termination)
- Non-production: attempts local `server.cert` + `server.key` HTTPS, otherwise falls back to HTTP

## Railway Deployment

1. Install Railway CLI:

```bash
brew install railway
```

2. Login to Railway:

```bash
railway login
```

3. Initialize project in server folder:

```bash
cd packages/server
railway init
```

4. Set required variables:

```bash
railway variables set DATABASE_URL=postgresql://...
railway variables set JWT_SECRET=your-strong-secret
railway variables set S3_ACCESS_KEY=your-access-key
railway variables set S3_SECRET_KEY=your-secret-key
railway variables set NODE_ENV=production
```

5. Deploy backend service:

```bash
npm run deploy -w @peers/server
```

6. Deploy production CI mode:

```bash
npm run deploy:prod -w @peers/server
```

Notes:

- Docker startup runs `npx prisma migrate deploy` before booting the server.
- WebSocket works over the same app endpoint.

## Production Direction

This service is intentionally lightweight for now. Planned evolution:

- Replace in-memory presence/queue/user state with Redis + DB-backed services
- Expand PostgreSQL persistence coverage for all runtime state paths
- Replace base64 file relay with signed upload URLs to object storage
- Keep the WS message contract stable while swapping internal storage adapters
