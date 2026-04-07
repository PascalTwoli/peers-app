import { randomUUID } from "crypto";
import prisma from "../db/prisma.js";

function toDate(timestamp) {
	if (timestamp instanceof Date && !Number.isNaN(timestamp.getTime())) {
		return timestamp;
	}

	if (typeof timestamp === "number" || typeof timestamp === "string") {
		const parsed = new Date(timestamp);
		if (!Number.isNaN(parsed.getTime())) {
			return parsed;
		}
	}

	return new Date();
}

export async function saveMessage(payload) {
	if (!payload || !payload.from) {
		return null;
	}

	const messageId = payload.messageId || randomUUID();

	try {
		return await prisma.message.upsert({
			where: { messageId },
			update: {},
			create: {
				messageId,
				from: payload.from,
				to: payload.to || null,
				roomId: payload.roomId || null,
				text: payload.text || null,
				fileUrl: payload.fileUrl || null,
				fileName: payload.fileName || null,
				timestamp: toDate(payload.timestamp),
			},
		});
	} catch (error) {
		console.error("Failed to persist message in PostgreSQL:", error);
		return null;
	}
}

export default saveMessage;
