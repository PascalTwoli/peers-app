import fs from "fs";
import https from "https";
import http from "http";
import express from "express";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import os from "os";
import cors from "cors";
import { connectDB, isDBConnected } from "./db/connect.js";
import Message from "./db/models/Message.js";
import Room from "./db/models/Room.js";
import Invite from "./db/models/Invite.js";
import User from "./db/models/User.js";
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
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
		if (!isDBConnected()) {
			res.status(404).json({ error: "Invite not found" });
			return;
		}

		Invite.findOne({ code, expiresAt: { $gt: new Date() } })
			.then((dbInvite) => {
				if (!dbInvite) {
					res.status(404).json({ error: "Invite not found" });
					return;
				}

				res.json({ code, username: dbInvite.createdBy });
			})
			.catch((error) => {
				console.error("Failed to load invite from MongoDB:", error);
				res.status(404).json({ error: "Invite not found" });
			});
		return;
	}

	res.json({ code, username: invite.owner });
});

app.get("/api/messages", async (req, res) => {
	const { userA, userB } = req.query;
	const parsedLimit = Number.parseInt(req.query.limit, 10);
	const limit = Number.isFinite(parsedLimit)
		? Math.min(Math.max(parsedLimit, 1), 200)
		: 50;

	if (!userA || !userB) {
		res.status(400).json({ error: "userA and userB are required" });
		return;
	}

	if (!isDBConnected()) {
		res.status(503).json({ error: "MongoDB is unavailable" });
		return;
	}

	try {
		const messages = await Message.find({
			$or: [
				{ from: userA, to: userB },
				{ from: userB, to: userA },
			],
		})
			.sort({ timestamp: -1 })
			.limit(limit)
			.lean();

		res.json({ messages });
	} catch (error) {
		console.error("Failed to fetch message history:", error);
		res.status(500).json({ error: "Failed to fetch messages" });
	}
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
const socketInviteOrigins = new Map();
const connectionCountByIp = new Map();
const rateLimitStore = new Map();
const inviteLinks = new Map();
const rooms = new Map();
const roomCalls = new Map();
const roomCallStarters = new Map();

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
	room_call_start: { max: 30, windowMs: 60_000 },
	room_call_join: { max: 60, windowMs: 60_000 },
	room_call_leave: { max: 80, windowMs: 60_000 },
	room_call_end: { max: 30, windowMs: 60_000 },
	room_media_state: { max: 600, windowMs: 60_000 },
	room_webrtc_offer: { max: 400, windowMs: 60_000 },
	room_webrtc_answer: { max: 400, windowMs: 60_000 },
	room_webrtc_ice: { max: 1200, windowMs: 60_000 },
	create_invite: { max: 50, windowMs: 60_000 },
	invite_join: { max: 50, windowMs: 60_000 },
};

function persistDirectMessage(payload) {
	if (!isDBConnected()) {
		return;
	}

	const document = {
		messageId: payload.messageId || randomUUID(),
		from: payload.from,
		to: payload.to,
		text: payload.text || "",
		fileName: payload.fileName || null,
		fileUrl: payload.fileUrl || null,
		timestamp: payload.timestamp || Date.now(),
		edited: false,
		reactions: [],
	};

	Message.updateOne(
		{ messageId: document.messageId },
		{ $setOnInsert: document },
		{ upsert: true },
	).catch((error) => {
		console.error("Failed to persist direct message:", error);
	});
}

function persistRoomMessage(payload) {
	if (!isDBConnected()) {
		return;
	}

	const document = {
		messageId: payload.messageId || randomUUID(),
		from: payload.from,
		to: null,
		roomId: payload.roomId,
		text: payload.message || "",
		fileName: null,
		fileUrl: null,
		timestamp: payload.timestamp || Date.now(),
		edited: false,
		reactions: [],
	};

	Message.updateOne(
		{ messageId: document.messageId },
		{ $setOnInsert: document },
		{ upsert: true },
	).catch((error) => {
		console.error("Failed to persist room message:", error);
	});
}

function persistRoomState(roomId, room, createdAt) {
	if (!isDBConnected() || !roomId || !room) {
		return;
	}

	Room.updateOne(
		{ roomId },
		{
			$set: {
				name: room.name,
				owner: room.owner,
				members: Array.from(room.members || []),
				pendingRequests: Array.from(room.pendingRequests || []),
			},
			$setOnInsert: {
				createdAt: createdAt || new Date(),
			},
		},
		{ upsert: true },
	).catch((error) => {
		console.error("Failed to persist room state:", error);
	});
}

function persistInviteLink(code, createdBy, targetRoom = null, expiresAt) {
	if (!isDBConnected()) {
		return;
	}

	Invite.updateOne(
		{ code },
		{
			$set: {
				createdBy,
				targetRoom,
				expiresAt,
			},
		},
		{ upsert: true },
	).catch((error) => {
		console.error("Failed to persist invite:", error);
	});
}

async function findInviteByCode(code) {
	if (!isDBConnected()) {
		return null;
	}

	try {
		return await Invite.findOne({
			code,
			expiresAt: { $gt: new Date() },
		}).lean();
	} catch (error) {
		console.error("Failed to lookup invite:", error);
		return null;
	}
}

function upsertUserPresence(username) {
	if (!isDBConnected() || !username) {
		return;
	}

	User.updateOne(
		{ username },
		{
			$set: { lastSeen: new Date() },
			$setOnInsert: { createdAt: new Date() },
		},
		{ upsert: true },
	).catch((error) => {
		console.error("Failed to persist user presence:", error);
	});
}

async function hydrateDurableState() {
	if (!isDBConnected()) {
		return;
	}

	try {
		const [users, dbRooms, dbInvites] = await Promise.all([
			User.find({}, { username: 1, _id: 0 }).lean(),
			Room.find({}).lean(),
			Invite.find({ expiresAt: { $gt: new Date() } }).lean(),
		]);

		for (const user of users) {
			if (user.username) {
				registeredUsers.add(user.username);
			}
		}

		for (const room of dbRooms) {
			rooms.set(room.roomId, {
				name: room.name,
				owner: room.owner,
				members: new Set(room.members || []),
				pendingRequests: new Set(room.pendingRequests || []),
				pendingInvites: new Set(),
			});
		}

		for (const invite of dbInvites) {
			inviteLinks.set(invite.code, {
				owner: invite.createdBy,
				createdAt: invite.expiresAt
					? new Date(invite.expiresAt).getTime() - INVITE_TTL_MS
					: Date.now(),
				expiresAt: invite.expiresAt
					? new Date(invite.expiresAt).getTime()
					: Date.now() + INVITE_TTL_MS,
				targetRoom: invite.targetRoom || null,
			});
		}

		console.log(
			`Hydrated durable state: ${users.length} users, ${dbRooms.length} rooms, ${dbInvites.length} invites`,
		);
	} catch (error) {
		console.error("Failed to hydrate durable state:", error);
	}
}

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

function broadcastRoomCallParticipants(roomId) {
	const room = rooms.get(roomId);
	const participants = Array.from(roomCalls.get(roomId) || []);
	if (!room) {
		return;
	}

	for (const member of room.members) {
		const memberSocket = getSocketByUsername(member);
		if (memberSocket && memberSocket.readyState === memberSocket.OPEN) {
			memberSocket.send(
				JSON.stringify({
					type: "room_call_participants",
					roomId,
					participants,
				}),
			);
		}
	}
}

function endRoomCall(roomId) {
	const room = rooms.get(roomId);
	if (!room) {
		roomCalls.delete(roomId);
		roomCallStarters.delete(roomId);
		return;
	}

	roomCalls.delete(roomId);
	roomCallStarters.delete(roomId);
	for (const member of room.members) {
		const memberSocket = getSocketByUsername(member);
		if (memberSocket && memberSocket.readyState === memberSocket.OPEN) {
			memberSocket.send(
				JSON.stringify({
					type: "room_call_ended",
					roomId,
				}),
			);
		}
	}
}

function getLocalNetworkHost() {
	const interfaces = os.networkInterfaces();
	for (const detailsList of Object.values(interfaces)) {
		for (const details of detailsList || []) {
			if (details.family === "IPv4" && !details.internal) {
				return details.address;
			}
		}
	}

	return "localhost";
}

function isLoopbackHost(hostname) {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "::1" ||
		hostname === "0.0.0.0" ||
		hostname === "::"
	);
}

function getInviteOriginFromRequest(req) {
	const hostHeader = req?.headers?.host;
	if (!hostHeader) {
		return null;
	}

	try {
		const parsed = new URL(`${protocol}://${hostHeader}`);
		const port = parsed.port || String(PORT);
		if (isLoopbackHost(parsed.hostname)) {
			return `${protocol}://${getLocalNetworkHost()}:${port}`;
		}

		return `${protocol}://${parsed.host}`;
	} catch {
		return null;
	}
}

function windowLocationForInvite(ws) {
	if (process.env.INVITE_BASE_URL) {
		return process.env.INVITE_BASE_URL;
	}

	if (ws && socketInviteOrigins.has(ws)) {
		return socketInviteOrigins.get(ws);
	}

	const host =
		HOST === "0.0.0.0" || HOST === "::" ? getLocalNetworkHost() : HOST;

	return `${protocol}://${host}:${PORT}`;
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
	const inviteOrigin = getInviteOriginFromRequest(req);
	if (inviteOrigin) {
		socketInviteOrigins.set(ws, inviteOrigin);
	}

	console.log("🟢 New WebSocket Client Connected");
	console.log(`Total clients: ${wss.clients.size}`);

	ws.send(
		JSON.stringify({
			type: "welcome",
			message: "Welcome to the signaling server",
			sessionId: socketSessions.get(ws),
		}),
	);

	ws.on("message", async (msg) => {
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
				case "video_upgrade_request":
				case "video_upgrade_response":
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
					const now = Date.now();
					const expiresAt = now + INVITE_TTL_MS;
					inviteLinks.set(code, {
						owner: from,
						createdAt: now,
						expiresAt,
						targetRoom: null,
					});
					persistInviteLink(code, from, null, new Date(expiresAt));
					ws.send(
						JSON.stringify({
							type: "invite_created",
							code,
							link: `${windowLocationForInvite(ws)}/join/${code}`,
						}),
					);
					break;
				}

				case "invite_join": {
					const from = activeConnections.get(ws);
					let invite = inviteLinks.get(data.code);
					if (!invite) {
						const dbInvite = await findInviteByCode(data.code);
						if (dbInvite) {
							invite = {
								owner: dbInvite.createdBy,
								createdAt:
									new Date(dbInvite.expiresAt).getTime() -
									INVITE_TTL_MS,
								expiresAt: new Date(dbInvite.expiresAt).getTime(),
								targetRoom: dbInvite.targetRoom || null,
							};
							inviteLinks.set(data.code, invite);
						}
					}
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
					persistRoomState(roomId, rooms.get(roomId), new Date());

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
					persistRoomState(data.roomId, room);
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

					persistRoomState(data.roomId, room);

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
					persistRoomState(data.roomId, room);

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
					persistRoomMessage(payload);

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

				case "room_call_start": {
					const from = activeConnections.get(ws);
					const room = rooms.get(data.roomId);
					if (!from || !room || !room.members.has(from)) break;

					if (!roomCalls.has(data.roomId)) {
						roomCalls.set(data.roomId, new Set([from]));
						roomCallStarters.set(data.roomId, from);
					}

					for (const member of room.members) {
						if (member === from) {
							continue;
						}
						const memberSocket = getSocketByUsername(member);
						if (
							memberSocket &&
							memberSocket.readyState === memberSocket.OPEN
						) {
							memberSocket.send(
								JSON.stringify({
									type: "room_call_started",
									roomId: data.roomId,
									startedBy: from,
									timestamp: Date.now(),
								}),
							);
						}
					}

					broadcastRoomCallParticipants(data.roomId);
					break;
				}

				case "room_call_end": {
					const from = activeConnections.get(ws);
					const room = rooms.get(data.roomId);
					const participants = roomCalls.get(data.roomId);
					const starter = roomCallStarters.get(data.roomId);

					if (!from || !room || !participants) break;

					const isOwner = room.owner === from;
					const isStarter = starter === from;
					if (!isOwner && !isStarter) {
						break;
					}

					endRoomCall(data.roomId);
					break;
				}

				case "room_call_join": {
					const from = activeConnections.get(ws);
					const room = rooms.get(data.roomId);
					if (!from || !room || !room.members.has(from)) break;
					if (!roomCalls.has(data.roomId)) {
						roomCalls.set(data.roomId, new Set());
					}

					roomCalls.get(data.roomId).add(from);
					broadcastRoomCallParticipants(data.roomId);
					break;
				}

				case "room_call_leave": {
					const from = activeConnections.get(ws);
					const room = rooms.get(data.roomId);
					const participants = roomCalls.get(data.roomId);
					if (!from || !room || !participants) break;

					participants.delete(from);
					if (participants.size === 0) {
						endRoomCall(data.roomId);
					} else {
						broadcastRoomCallParticipants(data.roomId);
					}
					break;
				}

				case "room_media_state": {
					const from = activeConnections.get(ws);
					const room = rooms.get(data.roomId);
					const participants = roomCalls.get(data.roomId);
					if (!from || !room || !participants || !participants.has(from)) {
						break;
					}

					const payload = {
						type: "room_media_state",
						roomId: data.roomId,
						from,
						isMuted: data.isMuted,
						isVideoOff: data.isVideoOff,
						isScreenSharing: data.isScreenSharing,
						timestamp: Date.now(),
					};

					for (const participant of participants) {
						if (participant === from) {
							continue;
						}
						const targetSocket = getSocketByUsername(participant);
						if (
							targetSocket &&
							targetSocket.readyState === targetSocket.OPEN
						) {
							targetSocket.send(JSON.stringify(payload));
						}
					}

					break;
				}

				case "room_webrtc_offer":
				case "room_webrtc_answer":
				case "room_webrtc_ice": {
					const from = activeConnections.get(ws);
					const room = rooms.get(data.roomId);
					if (!from || !room || !room.members.has(from)) break;
					if (!room.members.has(data.to)) break;

					const targetSocket = getSocketByUsername(data.to);
					if (
						!targetSocket ||
						targetSocket.readyState !== targetSocket.OPEN
					) {
						break;
					}

					targetSocket.send(
						JSON.stringify({
							type: data.type,
							roomId: data.roomId,
							from,
							offer: data.offer,
							answer: data.answer,
							ice: data.ice,
						}),
					);
					break;
				}

				case "room_message_status": {
					const from = activeConnections.get(ws);
					const room = rooms.get(data.roomId);
					if (!from || !room || !room.members.has(from)) break;
					if (!room.members.has(data.to)) break;

					const payload = {
						type: "room_message_status",
						roomId: data.roomId,
						messageId: data.messageId,
						status: data.status,
						from,
						timestamp: Date.now(),
					};

					const targetSocket = getSocketByUsername(data.to);
					if (
						targetSocket &&
						targetSocket.readyState === targetSocket.OPEN
					) {
						targetSocket.send(JSON.stringify(payload));
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
		socketInviteOrigins.delete(ws);

		for (const [roomId, participants] of roomCalls.entries()) {
			if (!participants.has(user_name)) {
				continue;
			}

			participants.delete(user_name);
			if (participants.size === 0) {
				endRoomCall(roomId);
			} else {
				broadcastRoomCallParticipants(roomId);
			}
		}
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

	if (payload.type === "chat") {
		persistDirectMessage(payload);
	} else if (payload.type === "file-message") {
		persistDirectMessage({
			...payload,
			text: payload.caption || "",
			fileUrl: null,
		});
	}

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
				isUpgrade: Boolean(data.isUpgrade),
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
		case "video_upgrade_request":
			return { type: "video_upgrade_request", from };
		case "video_upgrade_response":
			return {
				type: "video_upgrade_response",
				accepted: Boolean(data.accepted),
				from,
			};
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
	upsertUserPresence(username);

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

	connectDB()
		.then((connected) => {
			if (!connected) {
				return;
			}

			hydrateDurableState();
		})
		.catch((error) => {
			console.warn("MongoDB startup connection failed:", error.message);
		});
});
