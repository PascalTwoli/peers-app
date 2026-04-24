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
import prisma from "./db/prisma.js";
import { saveMessage } from "./services/messageService.js";
import { ensureUserExists } from "./services/userService.js";
import {
	createCorsOriginChecker,
	parseAllowedOrigins,
	validateIncomingMessage,
} from "./validation.js";
import messageRoutes from "./routes/messages.js";
import fileRoutes from "./routes/files.js";
import roomsRouter from "./routes/rooms.js";
import inviteRoutes from "./routes/invites.js";
import { registerSession, revokeSession } from "./middleware/sessionStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8080);
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";
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

app.use("/api/messages", messageRoutes);
app.use("/api", fileRoutes);
app.use("/api", roomsRouter);
app.use("/api", inviteRoutes);

// Enable trust proxy so Express recognizes ngrok headers ++++++++
app.set("trust proxy", true);

let server;
let protocol = "http";

if (IS_PRODUCTION) {
	server = http.createServer(app);
	protocol = "http";
	console.log(
		"Running in production behind Railway TLS edge (HTTP inside container)",
	);
} else {
	// In local development, prefer HTTPS when local certs are available.
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
			console.log(
				`Running HTTPS server with local certificates on port ${PORT}`,
			);
		} else {
			server = http.createServer(app);
			protocol = "http";
			console.log("Certificates not found, running HTTP server locally");
		}
	} catch (e) {
		console.log(
			"HTTPS setup failed, running HTTP server locally:",
			e.message,
		);
		server = http.createServer(app);
		protocol = "http";
	}
}

const wss = new WebSocketServer({ server });

// Store active connections: socket → username
const activeConnections = new Map();
// Store online users: username → socket
const onlineUsers = new Map();

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
	file: { max: 20, windowMs: 60_000 },
	typing: { max: 180, windowMs: 60_000 },
	stop_typing: { max: 180, windowMs: 60_000 },
	signal: { max: 400, windowMs: 60_000 },
	create_room: { max: 20, windowMs: 60_000 },
	join_room_request: { max: 50, windowMs: 60_000 },
	approve_room_request: { max: 50, windowMs: 60_000 },
	room_invite_users: { max: 80, windowMs: 60_000 },
	room_invite_response: { max: 80, windowMs: 60_000 },
	room_chat: { max: 200, windowMs: 60_000 },
	room_file: { max: 120, windowMs: 60_000 },
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
	return onlineUsers.get(username) || null;
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

function cleanupExpiredInviteLinks() {
	const now = Date.now();
	for (const [code, invite] of inviteLinks.entries()) {
		if (!invite || invite.expiresAt <= now) {
			inviteLinks.delete(code);
		}
	}
}

setInterval(cleanupExpiredQueueMessages, 60_000).unref();
setInterval(cleanupRateLimitEntries, 60_000).unref();
setInterval(cleanupExpiredInviteLinks, 60_000).unref();

async function startupHydration() {
	try {
		// Restore known usernames so offline message queuing works immediately
		const users = await prisma.user.findMany({ select: { username: true } });
		for (const { username } of users) {
			registeredUsers.add(username);
		}
		console.log(`✅ Hydrated ${users.length} registered users from DB`);

		// Restore rooms with their approved members
		const dbRooms = await prisma.room.findMany({
			include: {
				members: {
					where: { status: "approved" },
					include: { user: { select: { username: true } } },
				},
			},
		});

		for (const dbRoom of dbRooms) {
			const memberUsernames = dbRoom.members
				.map((m) => m.user?.username)
				.filter(Boolean);

			rooms.set(dbRoom.roomId, {
				name: dbRoom.name,
				owner: dbRoom.owner,
				members: new Set([dbRoom.owner, ...memberUsernames]),
				pendingRequests: new Set(),
				pendingInvites: new Set(),
			});
		}
		console.log(`✅ Hydrated ${dbRooms.length} rooms from DB`);
	} catch (err) {
		console.error("⚠️  Startup hydration failed (non-fatal):", err.message);
	}
}

function broadcast(msg) {
	const data = JSON.stringify(msg);
	wss.clients.forEach((client) => {
		if (client.readyState === client.OPEN) {
			client.send(data);
		}
	});
}

function broadcastPresenceUpdate(username, status, excludeSocket = null) {
	const payload = JSON.stringify({
		type: "presence_update",
		username,
		status,
	});

	for (const socket of onlineUsers.values()) {
		if (socket === excludeSocket) {
			continue;
		}

		if (socket.readyState === socket.OPEN) {
			socket.send(payload);
		}
	}
}

// Get list of online usernames
function getOnlineUsers() {
	return Array.from(onlineUsers.keys());
}

// Get list of all registered users with their online status
function getAllUsersWithStatus() {
	const onlineUsernames = new Set(getOnlineUsers());
	return Array.from(registeredUsers).map((username) => ({
		username,
		isOnline: onlineUsernames.has(username),
	}));
}

async function getApprovedRoomMemberUsernames(roomId) {
	if (!roomId) {
		return [];
	}

	try {
		const memberships = await prisma.roomMember.findMany({
			where: {
				roomId,
				status: "approved",
			},
			include: {
				user: {
					select: {
						username: true,
					},
				},
			},
		});

		return memberships
			.map((membership) => membership.user?.username)
			.filter(Boolean);
	} catch {
		return [];
	}
}

async function handleTypingEvent(ws, data) {
	const from = activeConnections.get(ws);
	if (!from) {
		return;
	}

	const eventType =
		data.type === "stop_typing" || data.isTyping === false
			? "stop_typing"
			: "typing";

	if (data.roomId) {
		const room = rooms.get(data.roomId);
		let targetMembers = [];

		if (room?.members instanceof Set && room.members.size > 0) {
			if (!room.members.has(from)) {
				return;
			}
			targetMembers = Array.from(room.members);
		} else {
			const approvedMembers = await getApprovedRoomMemberUsernames(
				data.roomId,
			);
			if (!approvedMembers.includes(from)) {
				return;
			}
			targetMembers = approvedMembers;
		}

		for (const member of targetMembers) {
			if (member === from) {
				continue;
			}

			const targetSocket = getSocketByUsername(member);
			if (targetSocket && targetSocket.readyState === targetSocket.OPEN) {
				targetSocket.send(
					JSON.stringify({
						type: eventType,
						from,
						roomId: data.roomId,
					}),
				);
			}
		}
		return;
	}

	const targetSocket = getSocketByUsername(data.to);
	if (!targetSocket || targetSocket.readyState !== targetSocket.OPEN) {
		return;
	}

	targetSocket.send(
		JSON.stringify({
			type: eventType,
			from,
		}),
	);
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
					await handleUserJoined(ws, data.username);
					sendRoomListToUser(ws, data.username);
					break;

				case "offer":
				case "answer":
				case "reject":
				case "ice":
				case "hangup":
				case "video-toggle":
				case "video_upgrade_request":
				case "video_upgrade_response":
				case "delivered":
				case "read":
				case "delete-message":
				case "edit_message":
				case "reaction":
					// Forward real-time messages to the target user (only if online)
					await forwardToUser(data, ws, false);
					break;

				case "typing":
				case "stop_typing":
					await handleTypingEvent(ws, data);
					break;

				case "chat":
				case "file":
					// Forward messages - queue if user is offline
					await forwardToUser(data, ws, true);
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

					if (invite.expiresAt <= Date.now()) {
						inviteLinks.delete(data.code);
						ws.send(
							JSON.stringify({
								type: "error",
								message: "Invite code is expired",
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
					const roomName = data.roomName.trim() || "Untitled Room";
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
						name: roomName,
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

					// Persist room + owner membership to DB (non-blocking)
					prisma.user.findUnique({ where: { username: from } })
						.then((ownerUser) => {
							if (!ownerUser) return;
							return prisma.room.create({
								data: {
									roomId,
									name: roomName,
									owner: from,
									members: {
										create: {
											userId: ownerUser.id,
											role: "owner",
											status: "approved",
										},
									},
								},
							});
						})
						.catch((err) =>
							console.error("Failed to persist room to DB:", err.message),
						);

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

						// Persist approved membership to DB (non-blocking)
						Promise.all([
							prisma.user.findUnique({ where: { username: data.username } }),
							prisma.room.findUnique({ where: { roomId: data.roomId } }),
						])
							.then(([approvedUser, dbRoom]) => {
								if (!approvedUser || !dbRoom) return;
								return prisma.roomMember.upsert({
									where: {
										userId_roomId: {
											userId: approvedUser.id,
											roomId: dbRoom.id,
										},
									},
									create: {
										userId: approvedUser.id,
										roomId: dbRoom.id,
										role: "member",
										status: "approved",
									},
									update: { status: "approved" },
								});
							})
							.catch((err) =>
								console.error(
									"Failed to persist room approval to DB:",
									err.message,
								),
							);
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

						// Persist accepted membership to DB (non-blocking)
						Promise.all([
							prisma.user.findUnique({ where: { username: from } }),
							prisma.room.findUnique({ where: { roomId: data.roomId } }),
						])
							.then(([invitedUser, dbRoom]) => {
								if (!invitedUser || !dbRoom) return;
								return prisma.roomMember.upsert({
									where: {
										userId_roomId: {
											userId: invitedUser.id,
											roomId: dbRoom.id,
										},
									},
									create: {
										userId: invitedUser.id,
										roomId: dbRoom.id,
										role: "member",
										status: "approved",
									},
									update: { status: "approved" },
								});
							})
							.catch((err) =>
								console.error(
									"Failed to persist room invite acceptance to DB:",
									err.message,
								),
							);
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
						replyTo: data.replyTo || null,
						messageId,
						timestamp:
							typeof data.timestamp === "number"
								? data.timestamp
								: Date.now(),
					};

					await saveMessage({
						messageId: payload.messageId,
						from,
						to: null,
						roomId: payload.roomId,
						text: payload.message,
						fileUrl: null,
						fileName: null,
						timestamp: payload.timestamp,
					});

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

				case "room_file": {
					const from = activeConnections.get(ws);
					const room = rooms.get(data.roomId);
					if (!from || !room || !room.members.has(from)) break;

					const messageId =
						typeof data.messageId === "string" && data.messageId.trim()
							? data.messageId
							: randomUUID();

					const payload = {
						type: "room_file",
						roomId: data.roomId,
						from,
						fileName: data.fileName,
						fileType: data.fileType,
						fileKind: data.fileKind || "file",
						fileSize: data.fileSize,
						fileId: data.fileId || null,
						fileUrl: data.fileUrl,
						caption: data.caption || "",
						replyTo: data.replyTo || null,
						messageId,
						timestamp:
							typeof data.timestamp === "number"
								? data.timestamp
								: Date.now(),
					};

					await saveMessage({
						messageId: payload.messageId,
						from,
						to: null,
						roomId: payload.roomId,
						text: payload.caption || null,
						fileUrl: payload.fileUrl,
						fileName: payload.fileName,
						timestamp: payload.timestamp,
					});

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

				case "room_typing":
				case "room_stop_typing": {
					const from = activeConnections.get(ws);
					const room = rooms.get(data.roomId);
					if (!from || !room || !room.members.has(from)) break;

					const payload = {
						type: data.type,
						roomId: data.roomId,
						from,
					};

					for (const member of room.members) {
						if (member === from) continue;
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

				case "room_reaction": {
					const from = activeConnections.get(ws);
					const room = rooms.get(data.roomId);
					if (!from || !room || !room.members.has(from)) break;

					const payload = {
						type: "room_reaction",
						roomId: data.roomId,
						messageId: data.messageId,
						emoji: data.emoji,
						from,
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

	ws.on("close", async () => {
		const user_name = activeConnections.get(ws) || "Unknown";
		const ip = socketIps.get(ws);
		activeConnections.delete(ws);
		if (onlineUsers.get(user_name) === ws) {
			onlineUsers.delete(user_name);
		}
		const sessionId = socketSessions.get(ws);
		if (sessionId) {
			revokeSession(sessionId);
		}
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
		if (user_name !== "Unknown") {
			try {
				await prisma.user.update({
					where: { username: user_name },
					data: { lastSeen: new Date() },
				});
			} catch {}
			broadcastPresenceUpdate(user_name, "offline", ws);
		}

		const onlineUsernames = getOnlineUsers();
		console.log(`🔴 User Disconnected: ${user_name}`);
		console.log(`Online users now: ${onlineUsernames.join(", ") || "none"}`);

		// Broadcast updated user list with status
		broadcast({
			type: "onlineUsers",
			users: onlineUsernames,
		});
		broadcast({
			type: "allUsers",
			users: getAllUsersWithStatus(),
		});
	});
});

// Forward message to target user, optionally queue if offline
async function forwardToUser(data, ws, shouldQueue = false) {
	const targetUserWs = getSocketByUsername(data.to);

	const from = activeConnections.get(ws);
	console.log("Forwarding", data.type, "to", data.to, "from", from);

	const payload = buildPayload(data, ws);

	if (payload.type === "chat" || payload.type === "file") {
		await saveMessage({
			messageId: payload.messageId,
			from,
			to: data.to || null,
			roomId: data.roomId || null,
			text:
				payload.type === "file"
					? payload.caption || null
					: payload.text || null,
			fileUrl: data.fileUrl || null,
			fileName: payload.fileName || null,
			timestamp: payload.timestamp || Date.now(),
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
				replyTo: data.replyTo || null,
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
		case "file":
			return {
				type: "file",
				fileName: data.fileName,
				fileType: data.fileType,
				fileKind: data.fileKind || "file",
				fileSize: data.fileSize,
				fileId: data.fileId || null,
				fileUrl: data.fileUrl,
				caption: data.caption || "",
				messageId: data.messageId,
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

async function handleUserJoined(ws, username) {
	console.log(`User joined: ${username}`);

	await ensureUserExists(username);

	// Associate this socket's session token with the username
	const sessionId = socketSessions.get(ws);
	if (sessionId) {
		registerSession(sessionId, username);
	}

	// Register the user (persistent)
	registeredUsers.add(username);

	// Check if this username already exists with a different socket (reconnection)
	for (const [existingWs, existingUsername] of activeConnections.entries()) {
		if (existingUsername === username && existingWs !== ws) {
			console.log(`Removing stale connection for: ${username}`);
			activeConnections.delete(existingWs);
			if (onlineUsers.get(username) === existingWs) {
				onlineUsers.delete(username);
			}
		}
	}

	activeConnections.set(ws, username);
	onlineUsers.set(username, ws);
	broadcastPresenceUpdate(username, "online", ws);

	const onlineUsernames = getOnlineUsers();
	console.log(`Online users now: ${onlineUsernames.join(", ")}`);
	console.log(`Registered users: ${Array.from(registeredUsers).join(", ")}`);

	// Send online users list
	broadcast({
		type: "onlineUsers",
		users: onlineUsernames,
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
		res.json({
			name: "peers-server",
			status: "ok",
			message:
				"Backend is running. Client build is not deployed on this service.",
			health: "/api/health",
		});
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

	// Hydrate in-memory state from DB after the server is up
	startupHydration();

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
