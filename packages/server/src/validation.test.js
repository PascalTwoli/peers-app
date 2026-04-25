import test from "node:test";
import assert from "node:assert/strict";
import {
	MAX_FILE_SIZE_BYTES,
	MAX_TEXT_LENGTH,
	createCorsOriginChecker,
	isTrustedLocalOrigin,
	parseAllowedOrigins,
	validateIncomingMessage,
} from "./validation.js";

test("parseAllowedOrigins returns defaults when env is empty", () => {
	const origins = parseAllowedOrigins("");
	assert.equal(origins.has("http://localhost:5173"), true);
	assert.equal(origins.has("https://localhost:5173"), true);
});

test("parseAllowedOrigins supports wildcard", () => {
	const origins = parseAllowedOrigins("*");
	assert.equal(origins, "*");
});

test("validateIncomingMessage accepts valid chat payload", () => {
	const result = validateIncomingMessage({
		type: "chat",
		to: "bob",
		text: "hello",
	});

	assert.equal(result.valid, true);
});

test("validateIncomingMessage rejects oversized chat", () => {
	const result = validateIncomingMessage({
		type: "chat",
		to: "bob",
		text: "x".repeat(MAX_TEXT_LENGTH + 1),
	});

	assert.equal(result.valid, false);
});

test("validateIncomingMessage accepts valid file payload", () => {
	const result = validateIncomingMessage({
		type: "file",
		to: "bob",
		fileName: "report.pdf",
		fileSize: 1024,
		fileUrl: "https://cdn.example.com/report.pdf",
	});

	assert.equal(result.valid, true);
});

test("validateIncomingMessage rejects oversized file payload", () => {
	const result = validateIncomingMessage({
		type: "file",
		to: "bob",
		fileName: "large.bin",
		fileSize: MAX_FILE_SIZE_BYTES + 1,
		fileUrl: "https://cdn.example.com/large.bin",
	});

	assert.equal(result.valid, false);
});

test("validateIncomingMessage accepts video upgrade request payload", () => {
	const result = validateIncomingMessage({
		type: "video_upgrade_request",
		to: "bob",
	});

	assert.equal(result.valid, true);
});

test("validateIncomingMessage rejects invalid video upgrade response", () => {
	const result = validateIncomingMessage({
		type: "video_upgrade_response",
		to: "bob",
		accepted: "yes",
	});

	assert.equal(result.valid, false);
});

test("validateIncomingMessage accepts direct typing payload", () => {
	const result = validateIncomingMessage({
		type: "typing",
		to: "bob",
	});

	assert.equal(result.valid, true);
});

test("validateIncomingMessage accepts room stop_typing payload", () => {
	const result = validateIncomingMessage({
		type: "stop_typing",
		roomId: "room-1",
	});

	assert.equal(result.valid, true);
});

test("validateIncomingMessage rejects typing without to or roomId", () => {
	const result = validateIncomingMessage({
		type: "typing",
	});

	assert.equal(result.valid, false);
});

test("validateIncomingMessage accepts typing with boolean isTyping", () => {
	const result = validateIncomingMessage({
		type: "typing",
		to: "bob",
		isTyping: false,
	});

	assert.equal(result.valid, true);
});

test("validateIncomingMessage rejects typing with non-boolean isTyping", () => {
	const result = validateIncomingMessage({
		type: "typing",
		to: "bob",
		isTyping: "no",
	});

	assert.equal(result.valid, false);
});

test("validateIncomingMessage accepts valid room message status", () => {
	const result = validateIncomingMessage({
		type: "room_message_status",
		to: "alice",
		roomId: "room-1",
		messageId: "room-msg-1",
		status: "read",
	});

	assert.equal(result.valid, true);
});

test("validateIncomingMessage rejects invalid room message status", () => {
	const result = validateIncomingMessage({
		type: "room_message_status",
		to: "alice",
		roomId: "room-1",
		messageId: "room-msg-1",
		status: "opened",
	});

	assert.equal(result.valid, false);
});

test("validateIncomingMessage accepts room_call_start payload", () => {
	const result = validateIncomingMessage({
		type: "room_call_start",
		roomId: "room-1",
	});

	assert.equal(result.valid, true);
});

test("validateIncomingMessage rejects room call payload without roomId", () => {
	const result = validateIncomingMessage({
		type: "room_call_join",
		roomId: "",
	});

	assert.equal(result.valid, false);
});

test("validateIncomingMessage accepts room_call_end payload", () => {
	const result = validateIncomingMessage({
		type: "room_call_end",
		roomId: "room-1",
	});

	assert.equal(result.valid, true);
});

test("validateIncomingMessage accepts room_webrtc_offer payload", () => {
	const result = validateIncomingMessage({
		type: "room_webrtc_offer",
		to: "bob",
		roomId: "room-1",
		offer: { type: "offer", sdp: "v=0" },
	});

	assert.equal(result.valid, true);
});

test("validateIncomingMessage rejects room_webrtc_ice without candidate", () => {
	const result = validateIncomingMessage({
		type: "room_webrtc_ice",
		to: "bob",
		roomId: "room-1",
	});

	assert.equal(result.valid, false);
});

test("validateIncomingMessage accepts room_media_state payload", () => {
	const result = validateIncomingMessage({
		type: "room_media_state",
		roomId: "room-1",
		isMuted: false,
		isVideoOff: true,
		isScreenSharing: false,
	});

	assert.equal(result.valid, true);
});

test("validateIncomingMessage rejects invalid room_media_state payload", () => {
	const result = validateIncomingMessage({
		type: "room_media_state",
		roomId: "room-1",
		isMuted: "no",
		isVideoOff: true,
		isScreenSharing: false,
	});

	assert.equal(result.valid, false);
});

test("validateIncomingMessage accepts valid room_file payload", () => {
	const result = validateIncomingMessage({
		type: "room_file",
		roomId: "room-1",
		fileName: "notes.txt",
		fileUrl: "https://cdn.example.com/notes.txt",
		fileSize: 1024,
		fileType: "text/plain",
	});

	assert.equal(result.valid, true);
});

test("validateIncomingMessage rejects invalid room_file payload", () => {
	const result = validateIncomingMessage({
		type: "room_file",
		roomId: "room-1",
		fileName: "notes.txt",
		fileUrl: "https://cdn.example.com/notes.txt",
		fileSize: MAX_FILE_SIZE_BYTES + 1,
	});

	assert.equal(result.valid, false);
});

test("validateIncomingMessage accepts valid room_reaction payload", () => {
	const result = validateIncomingMessage({
		type: "room_reaction",
		roomId: "room-1",
		messageId: "msg-1",
		emoji: ":thumbsup:",
	});

	assert.equal(result.valid, true);
});

test("validateIncomingMessage rejects invalid room_reaction payload", () => {
	const result = validateIncomingMessage({
		type: "room_reaction",
		roomId: "room-1",
		messageId: "",
		emoji: "",
	});

	assert.equal(result.valid, false);
});

test("isTrustedLocalOrigin accepts private network origins", () => {
	assert.equal(isTrustedLocalOrigin("https://172.20.10.3:4430"), true);
	assert.equal(isTrustedLocalOrigin("https://192.168.1.10:4430"), true);
	assert.equal(isTrustedLocalOrigin("https://localhost:5173"), true);
});

test("isTrustedLocalOrigin rejects unknown public origin", () => {
	assert.equal(isTrustedLocalOrigin("https://example.com"), false);
});

test("createCorsOriginChecker allows trusted local origins", () => {
	const checker = createCorsOriginChecker(new Set(["https://localhost:5173"]));
	checker("https://172.20.10.3:4430", (error, allowed) => {
		assert.equal(Boolean(error), false);
		assert.equal(allowed, true);
	});
});
