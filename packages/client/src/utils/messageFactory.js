export function createMessageId(prefix = "msg") {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return `${prefix}-${crypto.randomUUID()}`;
	}

	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function createCallLog(callLogType, options = {}) {
	return {
		type: "call-log",
		callLogType,
		duration: options.duration ?? null,
		messageId: createMessageId("call"),
		timestamp: options.timestamp ?? Date.now(),
		isMe: options.isMe ?? false,
	};
}

export function createTextMessage(to, text) {
	return {
		type: "chat",
		to,
		text,
		messageId: createMessageId("msg"),
		timestamp: Date.now(),
	};
}

export function createFileMessage(to, file) {
	return {
		type: "file",
		to,
		fileName: file.fileName,
		fileType: file.fileType,
		fileKind: file.fileKind || "file",
		fileSize: file.fileSize,
		fileUrl: file.fileUrl || null,
		fileData: file.fileData || null,
		caption: file.caption || "",
		messageId: file.messageId || createMessageId("file"),
		timestamp: file.timestamp || Date.now(),
	};
}
