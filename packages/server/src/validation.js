export const MAX_TEXT_LENGTH = 5000;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const DEFAULT_ALLOWED_ORIGINS = [
	"http://localhost:5173",
	"https://localhost:5173",
	"http://127.0.0.1:5173",
	"https://127.0.0.1:5173",
];

export function parseAllowedOrigins(originsEnv) {
	if (!originsEnv || !originsEnv.trim()) {
		return new Set(DEFAULT_ALLOWED_ORIGINS);
	}

	const trimmed = originsEnv.trim();
	if (trimmed === "*") {
		return "*";
	}

	const values = trimmed
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);

	return new Set(values.length ? values : DEFAULT_ALLOWED_ORIGINS);
}

export function createCorsOriginChecker(allowedOrigins) {
	if (allowedOrigins === "*") {
		return (_origin, callback) => callback(null, true);
	}

	return (origin, callback) => {
		// Allow non-browser clients and same-device tools with no Origin header.
		if (!origin) {
			callback(null, true);
			return;
		}

		if (allowedOrigins.has(origin)) {
			callback(null, true);
			return;
		}

		if (isTrustedLocalOrigin(origin)) {
			callback(null, true);
			return;
		}

		callback(new Error("Origin not allowed by CORS"), false);
	};
}

function isPrivateIpv4(hostname) {
	const parts = hostname.split(".").map((part) => Number(part));
	if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
		return false;
	}

	return (
		parts[0] === 10 ||
		(parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
		(parts[0] === 192 && parts[1] === 168) ||
		(parts[0] === 169 && parts[1] === 254)
	);
}

function isLocalHostname(hostname) {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "0.0.0.0" ||
		hostname === "::1" ||
		hostname.endsWith(".local")
	);
}

export function isTrustedLocalOrigin(origin) {
	try {
		const parsedOrigin = new URL(origin);
		const hostname = parsedOrigin.hostname;
		return isLocalHostname(hostname) || isPrivateIpv4(hostname);
	} catch {
		return false;
	}
}

function isValidUsername(value) {
	return (
		typeof value === "string" &&
		value.trim().length >= 2 &&
		value.trim().length <= 32
	);
}

function isNonEmptyString(value) {
	return typeof value === "string" && value.trim().length > 0;
}

export function validateIncomingMessage(data) {
	if (!data || typeof data !== "object" || typeof data.type !== "string") {
		return { valid: false, message: "Invalid message envelope" };
	}

	if (data.type === "join") {
		return isValidUsername(data.username)
			? { valid: true }
			: { valid: false, message: "Invalid username" };
	}

	if (data.type === "ping") {
		return { valid: true };
	}

	if (data.type === "create_invite" || data.type === "list_rooms") {
		return { valid: true };
	}

	if (data.type === "invite_join") {
		if (!isNonEmptyString(data.code)) {
			return { valid: false, message: "Invite code is required" };
		}
		return { valid: true };
	}

	if (data.type === "create_room") {
		if (!isNonEmptyString(data.roomName)) {
			return { valid: false, message: "roomName is required" };
		}

		if (
			data.invitedUsers !== undefined &&
			(!Array.isArray(data.invitedUsers) ||
				data.invitedUsers.some((user) => !isNonEmptyString(user)))
		) {
			return {
				valid: false,
				message: "invitedUsers must be an array of usernames",
			};
		}

		return { valid: true };
	}

	if (data.type === "room_invite_users") {
		if (!isNonEmptyString(data.roomId)) {
			return { valid: false, message: "roomId is required" };
		}

		if (
			!Array.isArray(data.usernames) ||
			data.usernames.length === 0 ||
			data.usernames.some((user) => !isNonEmptyString(user))
		) {
			return {
				valid: false,
				message: "usernames must be a non-empty username array",
			};
		}

		return { valid: true };
	}

	if (data.type === "room_invite_response") {
		if (!isNonEmptyString(data.roomId)) {
			return { valid: false, message: "roomId is required" };
		}

		if (typeof data.accept !== "boolean") {
			return { valid: false, message: "accept must be boolean" };
		}

		return { valid: true };
	}

	if (data.type === "join_room_request") {
		if (!isNonEmptyString(data.roomId)) {
			return { valid: false, message: "roomId is required" };
		}
		return { valid: true };
	}

	if (data.type === "approve_room_request") {
		if (!isNonEmptyString(data.roomId) || !isNonEmptyString(data.username)) {
			return {
				valid: false,
				message: "roomId and username are required",
			};
		}
		return { valid: true };
	}

	if (data.type === "room_chat") {
		if (!isNonEmptyString(data.roomId) || !isNonEmptyString(data.message)) {
			return {
				valid: false,
				message: "roomId and message are required",
			};
		}
		return { valid: true };
	}

	if (!isNonEmptyString(data.to)) {
		return { valid: false, message: "Missing or invalid target user" };
	}

	if (data.type === "chat") {
		if (!isNonEmptyString(data.text)) {
			return { valid: false, message: "Message text is required" };
		}

		if (data.text.length > MAX_TEXT_LENGTH) {
			return {
				valid: false,
				message: `Message exceeds max length (${MAX_TEXT_LENGTH})`,
			};
		}
	}

	if (data.type === "file-message") {
		if (!isNonEmptyString(data.fileName)) {
			return { valid: false, message: "File name is required" };
		}

		if (!isNonEmptyString(data.fileData)) {
			return { valid: false, message: "File payload is required" };
		}

		if (
			data.fileKind !== undefined &&
			data.fileKind !== "photo" &&
			data.fileKind !== "file"
		) {
			return { valid: false, message: "Invalid file kind" };
		}

		if (typeof data.fileSize !== "number" || Number.isNaN(data.fileSize)) {
			return { valid: false, message: "Invalid file size" };
		}

		if (data.fileSize <= 0 || data.fileSize > MAX_FILE_SIZE_BYTES) {
			return {
				valid: false,
				message: `File size must be between 1 byte and ${MAX_FILE_SIZE_BYTES} bytes`,
			};
		}

		// Guard against malformed payloads that declare a small size but carry huge base64 data.
		const maxEncodedLength = Math.ceil((MAX_FILE_SIZE_BYTES * 4) / 3) + 1024;
		if (data.fileData.length > maxEncodedLength) {
			return { valid: false, message: "File payload exceeds allowed limit" };
		}
	}

	if (data.type === "file_chunk") {
		if (!isNonEmptyString(data.messageId)) {
			return { valid: false, message: "Chunk messageId is required" };
		}

		if (!isNonEmptyString(data.fileName)) {
			return { valid: false, message: "Chunk fileName is required" };
		}

		if (!Number.isInteger(data.totalChunks) || data.totalChunks <= 0) {
			return { valid: false, message: "Invalid totalChunks" };
		}

		if (
			!Number.isInteger(data.chunkIndex) ||
			data.chunkIndex < 0 ||
			data.chunkIndex >= data.totalChunks
		) {
			return { valid: false, message: "Invalid chunkIndex" };
		}

		if (!isNonEmptyString(data.chunkData)) {
			return { valid: false, message: "Chunk data is required" };
		}
	}

	if (data.type === "edit_message") {
		if (!isNonEmptyString(data.messageId)) {
			return { valid: false, message: "messageId is required" };
		}

		if (!isNonEmptyString(data.newText)) {
			return { valid: false, message: "newText is required" };
		}

		if (data.newText.length > MAX_TEXT_LENGTH) {
			return {
				valid: false,
				message: `Edited text exceeds max length (${MAX_TEXT_LENGTH})`,
			};
		}
	}

	if (data.type === "reaction") {
		if (!isNonEmptyString(data.messageId)) {
			return { valid: false, message: "messageId is required" };
		}

		if (!isNonEmptyString(data.emoji) || data.emoji.length > 8) {
			return { valid: false, message: "Invalid emoji" };
		}
	}

	return { valid: true };
}
