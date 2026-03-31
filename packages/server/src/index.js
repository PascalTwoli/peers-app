import fs from "fs";
import https from "https";
import http from "http";
import express from "express";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import cors from "cors";
import {
	createCorsOriginChecker,
	parseAllowedOrigins,
	validateIncomingMessage,
} from "./validation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 4430;
const USE_HTTP = process.env.USE_HTTP === "true";
const CORS_ORIGINS = parseAllowedOrigins(process.env.CORS_ORIGINS);
const MAX_CONNECTIONS_PER_IP = Number(process.env.MAX_CONNECTIONS_PER_IP || 20);
const OFFLINE_MESSAGE_TTL_MS = Number(
	process.env.OFFLINE_MESSAGE_TTL_MS || 7 * 24 * 60 * 60 * 1000,
);

const app = express();

app.use(
	cors({
		origin: createCorsOriginChecker(CORS_ORIGINS),
		methods: ["GET", "POST", "OPTIONS"],
	}),
);
app.use(express.json());

// Serve static client files in production
const clientDistPath = path.join(__dirname, "..", "..", "client", "dist");
const hasClientBuild = fs.existsSync(clientDistPath);
if (hasClientBuild) {
	console.log("Serving static files from:", clientDistPath);
	app.use(express.static(clientDistPath));
}

// Health check endpoint
app.get("/api/health", (req, res) => {
	res.json({ status: "ok", timestamp: Date.now() });
});

app.get("/api/invite/:code", (req, res) => {
	const code = req.params.code;
	const invite = inviteLinks.get(code);
	if (!invite) {
		res.status(404).json({ error: "Invite not found" });
		return;
	}

	res.json({ code, username: invite.owner });
});

// Enable trust proxy so Express recognizes ngrok headers ++++++++
app.set("trust proxy", true);

let server;
let protocol = "http";

// Try HTTPS first (needed for WebRTC on network), fall back to HTTP
if (!USE_HTTP) {
	try {
		const certPath = path.join(__dirname, "..", "..", "..", "server.cert");
		const keyPath = path.join(__dirname, "..", "..", "..", "server.key");

		if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
			const serverOptions = {
				key: fs.readFileSync(keyPath),
				cert: fs.readFileSync(certPath),
			};
			server = https.createServer(serverOptions, app);
			protocol = "https";
		} else {
			throw new Error("Certificates not found");
		}
	} catch (e) {
		console.log("HTTPS not available:", e.message);
		console.log("Falling back to HTTP (WebRTC will only work on localhost)");
		server = http.createServer(app);
		protocol = "http";
	}
} else {
	server = http.createServer(app);
	protocol = "http";
}

const wss = new WebSocketServer({ server });

// Store active connections: socket → username
const activeConnections = new Map();

// Store all registered users (persistent - survives disconnections)
// In production, this would be a database
const registeredUsers = new Set();

// Message queue for offline users: username → [messages]
const messageQueue = new Map();
const socketSessions = new Map();
const socketIps = new Map();
const connectionCountByIp = new Map();
const rateLimitStore = new Map();
const inviteLinks = new Map();
const rooms = new Map();

const RATE_LIMITS = {
	join: { max: 20, windowMs: 60_000 },
	chat: { max: 100, windowMs: 60_000 },
	"file-message": { max: 20, windowMs: 60_000 },
	file_chunk: { max: 500, windowMs: 60_000 },
	typing: { max: 180, windowMs: 60_000 },
	signal: { max: 400, windowMs: 60_000 },
	create_room: { max: 20, windowMs: 60_000 },
	join_room_request: { max: 50, windowMs: 60_000 },
	approve_room_request: { max: 50, windowMs: 60_000 },
	room_invite_users: { max: 80, windowMs: 60_000 },
	room_invite_response: { max: 80, windowMs: 60_000 },
	room_chat: { max: 200, windowMs: 60_000 },
	create_invite: { max: 50, windowMs: 60_000 },
	invite_join: { max: 50, windowMs: 60_000 },
};

function randomCode(length = 6) {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
	let code = "";
	for (let i = 0; i < length; i++) {
		code += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return code;
}

function generateInviteCode() {
	let code = randomCode();
	while (inviteLinks.has(code)) {
		code = randomCode();
	}
	return code;
}

function getSocketByUsername(username) {
	return Array.from(activeConnections.entries()).find(
		([, activeUsername]) => activeUsername === username,
	)?.[0];
}

function serializeRooms(forUser) {
	return Array.from(rooms.entries()).map(([roomId, room]) => ({
		roomId,
		name: room.name,
		owner: room.owner,
		members: Array.from(room.members),
		pendingRequests: Array.from(room.pendingRequests),
		pendingInvites: Array.from(room.pendingInvites || []),
		isOwner: room.owner === forUser,
		isMember: room.members.has(forUser),
		isInvited: room.pendingInvites?.has(forUser) || false,
	}));
}

function sendRoomInvite(roomId, room, targetUsername) {
	const targetSocket = getSocketByUsername(targetUsername);
	if (!targetSocket || targetSocket.readyState !== targetSocket.OPEN) {
		return;
	}

	targetSocket.send(
		JSON.stringify({
			type: "room_invite",
			roomId,
			roomName: room.name,
			owner: room.owner,
			timestamp: Date.now(),
		}),
	);
}

function sendRoomListToUser(ws, username) {
	if (!ws || ws.readyState !== ws.OPEN) {
		return;
	}

	ws.send(
		JSON.stringify({
			type: "room_list",
			rooms: serializeRooms(username),
		}),
	);
}

function broadcastRoomLists() {
	for (const [socket, username] of activeConnections.entries()) {
		sendRoomListToUser(socket, username);
	}
}

function windowLocationForInvite() {
	return `${protocol}://localhost:${PORT}`;
}

function getClientIp(req) {
	const forwardedHeader = req.headers["x-forwarded-for"];
	const forwarded = Array.isArray(forwardedHeader)
		? forwardedHeader[0]
		: forwardedHeader;
	if (typeof forwarded === "string" && forwarded.length > 0) {
		return forwarded.split(",")[0].trim();
	}

	return req.socket?.remoteAddress || "unknown";
}

function incrementConnectionCount(ip) {
	const nextCount = (connectionCountByIp.get(ip) || 0) + 1;
	connectionCountByIp.set(ip, nextCount);
	return nextCount;
}

function decrementConnectionCount(ip) {
	const nextCount = Math.max((connectionCountByIp.get(ip) || 1) - 1, 0);
	if (nextCount === 0) {
		connectionCountByIp.delete(ip);
		return;
	}
	connectionCountByIp.set(ip, nextCount);
}

function getRateLimitKey(ip, type) {
	const rateType = ["offer", "answer", "ice", "hangup", "reject"].includes(
		type,
	)
		? "signal"
		: type;
	return `${ip}:${rateType}`;
}

function isRateLimited(ip, type) {
	const rateType = ["offer", "answer", "ice", "hangup", "reject"].includes(
		type,
	)
		? "signal"
		: type;
	const policy = RATE_LIMITS[rateType];
	if (!policy) {
		return false;
	}

	const key = getRateLimitKey(ip, type);
	const now = Date.now();
	const existing = rateLimitStore.get(key);

	if (!existing || now > existing.resetAt) {
		rateLimitStore.set(key, { count: 1, resetAt: now + policy.windowMs });
		return false;
	}

	if (existing.count >= policy.max) {
		return true;
	}

	existing.count++;
	return false;
}

function cleanupExpiredQueueMessages() {
	const now = Date.now();
	for (const [username, queued] of messageQueue.entries()) {
		const filtered = queued.filter(
			(entry) => now - entry.queuedAt <= OFFLINE_MESSAGE_TTL_MS,
		);

		if (filtered.length === 0) {
			messageQueue.delete(username);
		} else if (filtered.length !== queued.length) {
			messageQueue.set(username, filtered);
		}
	}
}

function cleanupRateLimitEntries() {
	const now = Date.now();
	for (const [key, value] of rateLimitStore.entries()) {
		if (now > value.resetAt) {
			rateLimitStore.delete(key);
		}
	}
}

setInterval(cleanupExpiredQueueMessages, 60_000).unref();
setInterval(cleanupRateLimitEntries, 60_000).unref();

function broadcast(msg) {
	const data = JSON.stringify(msg);
	wss.clients.forEach((client) => {
		if (client.readyState === client.OPEN) {
			client.send(data);
		}
	});
}

// Get list of online usernames
function getOnlineUsers() {
	return Array.from(new Set(activeConnections.values()));
}

// Get list of all registered users with their online status
function getAllUsersWithStatus() {
	const onlineUsers = getOnlineUsers();
	return Array.from(registeredUsers).map((username) => ({
		username,
		isOnline: onlineUsers.includes(username),
	}));
}

// Queue a message for an offline user
function queueMessage(username, message) {
	if (!messageQueue.has(username)) {
		messageQueue.set(username, []);
	}
	messageQueue.get(username).push({ payload: message, queuedAt: Date.now() });
	console.log(`📬 Queued message for offline user: ${username}`);
}

// Deliver queued messages to a user who just came online
function deliverQueuedMessages(ws, username) {
	const queue = messageQueue.get(username);
	if (queue && queue.length > 0) {
		const validEntries = queue.filter(
			(entry) => Date.now() - entry.queuedAt <= OFFLINE_MESSAGE_TTL_MS,
		);
		console.log(
			`📨 Delivering ${validEntries.length} queued messages to ${username}`,
		);
		validEntries.forEach((entry) => {
			ws.send(JSON.stringify(entry.payload));
		});
		messageQueue.delete(username);
	}
}

wss.on("connection", (ws, req) => {
	const clientIp = getClientIp(req);
	if (incrementConnectionCount(clientIp) > MAX_CONNECTIONS_PER_IP) {
		decrementConnectionCount(clientIp);
		ws.close(1013, "Too many connections from this network");
		return;
	}

	socketIps.set(ws, clientIp);
	socketSessions.set(ws, randomUUID());

	console.log("🟢 New WebSocket Client Connected");
	console.log(`Total clients: ${wss.clients.size}`);

	ws.send(
		JSON.stringify({
			type: "welcome",
			message: "Welcome to the signaling server",
			sessionId: socketSessions.get(ws),
		}),
	);

	ws.on("message", (msg) => {
		try {
			const data = JSON.parse(msg);
			console.log("Received Message:", data);

			const ip = socketIps.get(ws) || "unknown";
			if (isRateLimited(ip, data.type)) {
				ws.send(
					JSON.stringify({
						type: "error",
						message: "Rate limit exceeded. Please slow down.",
					}),
				);
				return;
			}

			const validation = validateIncomingMessage(data);
			if (!validation.valid) {
				ws.send(
					JSON.stringify({
						type: "error",
						message: validation.message || "Invalid message",
					}),
				);
				return;
			}

			switch (data.type) {
				case "join":
					handleUserJoined(ws, data.username);
					sendRoomListToUser(ws, data.username);
					break;

				case "offer":
				case "answer":
				case "reject":
				case "ice":
				case "hangup":
				case "typing":
				case "video-toggle":
				case "delivered":
				case "read":
				case "delete-message":
				case "edit_message":
				case "reaction":
					// Forward real-time messages to the target user (only if online)
					forwardToUser(data, ws, false);
					break;

				case "chat":
				case "file-message":
				case "file_chunk":
					// Forward messages - queue if user is offline
					forwardToUser(data, ws, true);
					break;

				case "ping":
					ws.send(JSON.stringify({ type: "pong" }));
					break;

				case "create_invite": {
					const from = activeConnections.get(ws);
					if (!from) break;

					const code = generateInviteCode();
					inviteLinks.set(code, { owner: from, createdAt: Date.now() });
					ws.send(
						JSON.stringify({
							type: "invite_created",
							code,
							link: `${windowLocationForInvite()}/join/${code}`,
						}),
					);
					break;
				}

				case "invite_join": {
					const from = activeConnections.get(ws);
					const invite = inviteLinks.get(data.code);
					if (!from || !invite) {
						ws.send(
							JSON.stringify({
								type: "error",
								message: "Invite code is invalid",
							}),
						);
						break;
					}

					ws.send(
						JSON.stringify({
							type: "invite_target",
							targetUser: invite.owner,
						}),
					);

					const ownerSocket = getSocketByUsername(invite.owner);
					if (ownerSocket && ownerSocket.readyState === ownerSocket.OPEN) {
						ownerSocket.send(
							JSON.stringify({
								type: "invite_target",
								targetUser: from,
							}),
						);
					}
					break;
				}

				case "create_room": {
					const from = activeConnections.get(ws);
					if (!from || typeof data.roomName !== "string") break;

					const roomId = randomUUID();
					const invitedUsers = Array.isArray(data.invitedUsers)
						? Array.from(
								new Set(
									data.invitedUsers
										.map((user) => user.trim())
										.filter(Boolean),
								),
							)
						: [];
					rooms.set(roomId, {
						name: data.roomName.trim() || "Untitled Room",
						owner: from,
						members: new Set([from]),
						pendingRequests: new Set(),
						pendingInvites: new Set(),
					});

					const room = rooms.get(roomId);
					for (const invitedUser of invitedUsers) {
						if (
							invitedUser === from ||
							room.members.has(invitedUser) ||
							room.pendingInvites.has(invitedUser)
						) {
							continue;
						}

						room.pendingInvites.add(invitedUser);
						sendRoomInvite(roomId, room, invitedUser);
					}

					ws.send(
						JSON.stringify({
							type: "room_created",
							roomId,
							roomName: room.name,
						}),
					);
					broadcastRoomLists();
					break;
				}

				case "list_rooms": {
					const from = activeConnections.get(ws);
					if (!from) break;
					sendRoomListToUser(ws, from);
					break;
				}

				case "join_room_request": {
					const from = activeConnections.get(ws);
					const room = rooms.get(data.roomId);
					if (!from || !room || room.members.has(from)) break;

					room.pendingRequests.add(from);
					const ownerSocket = getSocketByUsername(room.owner);
					if (ownerSocket && ownerSocket.readyState === ownerSocket.OPEN) {
						ownerSocket.send(
							JSON.stringify({
								type: "room_join_request",
								roomId: data.roomId,
								username: from,
							}),
						);
					}
					broadcastRoomLists();
					break;
				}

				case "approve_room_request": {
					const from = activeConnections.get(ws);
					const room = rooms.get(data.roomId);
					if (!from || !room || room.owner !== from) break;

					if (room.pendingRequests.has(data.username)) {
						room.pendingRequests.delete(data.username);
						room.members.add(data.username);
					}
					broadcastRoomLists();
					break;
				}

				case "room_invite_users": {
					const from = activeConnections.get(ws);
					const room = rooms.get(data.roomId);
					if (!from || !room || room.owner !== from) break;

					for (const targetUser of data.usernames) {
						const normalized = targetUser.trim();
						if (
							!normalized ||
							normalized === from ||
							room.members.has(normalized) ||
							room.pendingInvites.has(normalized)
						) {
							continue;
						}

						room.pendingInvites.add(normalized);
						sendRoomInvite(data.roomId, room, normalized);
					}

					broadcastRoomLists();
					break;
				}

				case "room_invite_response": {
					const from = activeConnections.get(ws);
					const room = rooms.get(data.roomId);
					if (!from || !room || !room.pendingInvites.has(from)) break;

					room.pendingInvites.delete(from);
					if (data.accept) {
						room.members.add(from);
					}

					const ownerSocket = getSocketByUsername(room.owner);
					if (ownerSocket && ownerSocket.readyState === ownerSocket.OPEN) {
						ownerSocket.send(
							JSON.stringify({
								type: "room_invite_result",
								roomId: data.roomId,
								username: from,
								accepted: Boolean(data.accept),
							}),
						);
					}

					broadcastRoomLists();
					break;
				}

				case "room_chat": {
					const from = activeConnections.get(ws);
					const room = rooms.get(data.roomId);
					if (!from || !room || !room.members.has(from)) break;
					const messageId =
						typeof data.messageId === "string" && data.messageId.trim()
							? data.messageId
							: randomUUID();

					const payload = {
						type: "room_chat",
						roomId: data.roomId,
						from,
						message: data.message,
						messageId,
						timestamp:
							typeof data.timestamp === "number"
								? data.timestamp
								: Date.now(),
					};

					for (const member of room.members) {
						const memberSocket = getSocketByUsername(member);
						if (
							memberSocket &&
							memberSocket.readyState === memberSocket.OPEN
						) {
							memberSocket.send(JSON.stringify(payload));
						}
					}
					break;
				}

				default:
					console.log("Unknown message type:", data.type);
					break;
			}
		} catch (e) {
			console.error("Invalid Message", e);
			ws.send(
				JSON.stringify({
					type: "error",
					message: "Invalid message format",
				}),
			);
		}
	});

	ws.on("close", () => {
		const user_name = activeConnections.get(ws) || "Unknown";
		const ip = socketIps.get(ws);
		activeConnections.delete(ws);
		socketSessions.delete(ws);
		socketIps.delete(ws);
		if (ip) {
			decrementConnectionCount(ip);
		}
		const onlineUsers = getOnlineUsers();
		console.log(`🔴 User Disconnected: ${user_name}`);
		console.log(`Online users now: ${onlineUsers.join(", ") || "none"}`);

		// Broadcast updated user list with status
		broadcast({
			type: "onlineUsers",
			users: onlineUsers,
		});
		broadcast({
			type: "allUsers",
			users: getAllUsersWithStatus(),
		});
	});
});

// Forward message to target user, optionally queue if offline
function forwardToUser(data, ws, shouldQueue = false) {
	const targetUserWs = Array.from(activeConnections.entries()).find(
		([, username]) => username === data.to,
	)?.[0];

	const from = activeConnections.get(ws);
	console.log("Forwarding", data.type, "to", data.to, "from", from);

	const payload = buildPayload(data, ws);

	if (targetUserWs && targetUserWs.readyState === targetUserWs.OPEN) {
		targetUserWs.send(JSON.stringify(payload));
	} else if (shouldQueue && registeredUsers.has(data.to)) {
		// User is offline but registered - queue the message
		queueMessage(data.to, payload);
		// Notify sender that message was queued (will be delivered when user comes online)
		ws.send(
			JSON.stringify({
				type: "message-queued",
				messageId: data.messageId,
				to: data.to,
			}),
		);
	}
}

function buildPayload(data, ws) {
	const from = activeConnections.get(ws);

	switch (data.type) {
		case "offer":
			console.log(
				"Forwarding offer from",
				from,
				"to",
				data.to,
				"type:",
				data.callType,
			);
			return {
				type: "offer",
				offer: data.offer,
				from,
				callType: data.callType,
			};
		case "answer":
			return { type: "answer", answer: data.answer, from };
		case "ice":
			return { type: "ice", ice: data.ice, from };
		case "hangup":
			return { type: "hangup", from };
		case "chat":
			return {
				type: "chat",
				text: data.text,
				from,
				messageId: data.messageId || null,
				timestamp: data.timestamp || Date.now(),
			};
		case "video-toggle":
			return { type: "video-toggle", enabled: data.enabled, from };
		case "file-message":
			return {
				type: "file-message",
				fileName: data.fileName,
				fileType: data.fileType,
				fileKind: data.fileKind || "file",
				fileSize: data.fileSize,
				fileData: data.fileData,
				caption: data.caption || "",
				messageId: data.messageId,
				timestamp: data.timestamp || Date.now(),
				from,
			};
		case "file_chunk":
			return {
				type: "file_chunk",
				messageId: data.messageId,
				fileName: data.fileName,
				fileType: data.fileType,
				fileKind: data.fileKind || "file",
				caption: data.caption || "",
				totalChunks: data.totalChunks,
				chunkIndex: data.chunkIndex,
				chunkData: data.chunkData,
				timestamp: data.timestamp || Date.now(),
				from,
			};
		case "typing":
			return { type: "typing", isTyping: data.isTyping, from };
		case "delivered":
			return { type: "delivered", messageId: data.messageId, from };
		case "read":
			return { type: "read", messageId: data.messageId, from };
		case "delete-message":
			return { type: "delete-message", messageId: data.messageId, from };
		case "edit_message":
			return {
				type: "edit_message",
				messageId: data.messageId,
				newText: data.newText,
				editedAt: Date.now(),
				from,
			};
		case "reaction":
			return {
				type: "reaction",
				messageId: data.messageId,
				emoji: data.emoji,
				from,
				timestamp: Date.now(),
			};
		case "reject":
		default:
			return { type: "reject", from };
	}
}

function handleUserJoined(ws, username) {
	console.log(`User joined: ${username}`);

	// Register the user (persistent)
	registeredUsers.add(username);

	// Check if this username already exists with a different socket (reconnection)
	for (const [existingWs, existingUsername] of activeConnections.entries()) {
		if (existingUsername === username && existingWs !== ws) {
			console.log(`Removing stale connection for: ${username}`);
			activeConnections.delete(existingWs);
		}
	}

	activeConnections.set(ws, username);

	const onlineUsers = getOnlineUsers();
	console.log(`Online users now: ${onlineUsers.join(", ")}`);
	console.log(`Registered users: ${Array.from(registeredUsers).join(", ")}`);

	// Send online users list
	broadcast({
		type: "onlineUsers",
		users: onlineUsers,
	});

	// Send all users with status
	broadcast({
		type: "allUsers",
		users: getAllUsersWithStatus(),
	});

	// Deliver any queued messages to this user
	deliverQueuedMessages(ws, username);
}

// Fallback route - serve index.html for SPA client-side routing
app.use((req, res, next) => {
	if (req.method !== "GET" || req.path.startsWith("/api")) {
		return next();
	}
	const indexPath = path.join(clientDistPath, "index.html");
	if (fs.existsSync(indexPath)) {
		res.sendFile(indexPath);
	} else {
		res.status(503).send(
			"Client build not found. Run npm run build -w @peers/client or start the Vite dev server.",
		);
	}
});

server.listen(PORT, HOST, () => {
	console.log(
		`${protocol.toUpperCase()} server running at ${protocol}://${HOST}:${PORT}`,
	);
	console.log(`WebSocket signaling server running`);
	if (hasClientBuild) {
		console.log(`Client app being served from this server`);
	} else {
		console.log(
			"Client build missing. Build client with `npm run build -w @peers/client` or run `npm run dev:client`.",
		);
	}

	// Log network addresses
	import("os").then((os) => {
		const networkInterfaces = os.networkInterfaces();
		for (const interfaceDetails of Object.values(networkInterfaces)) {
			for (const details of interfaceDetails) {
				if (details.family === "IPv4" && !details.internal) {
					console.log(
						`Access the server at: ${protocol}://${details.address}:${PORT}`,
					);
				}
			}
		}
	});
});
