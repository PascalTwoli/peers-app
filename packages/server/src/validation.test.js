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
		type: "file-message",
		to: "bob",
		fileName: "report.pdf",
		fileSize: 1024,
		fileData: "data:application/pdf;base64,AAAA",
	});

	assert.equal(result.valid, true);
});

test("validateIncomingMessage rejects oversized file payload", () => {
	const result = validateIncomingMessage({
		type: "file-message",
		to: "bob",
		fileName: "large.bin",
		fileSize: MAX_FILE_SIZE_BYTES + 1,
		fileData: "data:application/octet-stream;base64,AAAA",
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
