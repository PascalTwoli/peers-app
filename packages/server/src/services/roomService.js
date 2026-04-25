import prisma from "../db/prisma.js";
import { randomUUID } from "crypto";

function createServiceError(message, cause, code = "INTERNAL_ERROR") {
	const error = new Error(message);
	error.code = code;
	if (cause) {
		error.cause = cause;
	}
	return error;
}

export async function createRoom(ownerId, name) {
	if (!ownerId || !name?.trim()) {
		throw createServiceError(
			"ownerId and name are required",
			null,
			"VALIDATION_ERROR",
		);
	}

	try {
		const owner = await prisma.user.findUnique({ where: { id: ownerId } });
		if (!owner) {
			throw createServiceError("Owner user not found", null, "NOT_FOUND");
		}

		return await prisma.$transaction(async (tx) => {
			const room = await tx.room.create({
				data: {
					name: name.trim(),
					owner: ownerId,
					roomId: randomUUID(),
				},
			});

			await tx.roomMember.create({
				data: {
					userId: ownerId,
					roomId: room.id,
					role: "owner",
					status: "approved",
				},
			});

			return room;
		});
	} catch (error) {
		if (
			error instanceof Error &&
			(error.code === "NOT_FOUND" || error.code === "VALIDATION_ERROR")
		) {
			throw error;
		}
		throw createServiceError("Failed to create room", error);
	}
}

export async function requestJoinRoom(userId, roomId) {
	if (!userId || !roomId) {
		throw createServiceError(
			"userId and roomId are required",
			null,
			"VALIDATION_ERROR",
		);
	}

	try {
		const [user, room] = await Promise.all([
			prisma.user.findUnique({ where: { id: userId } }),
			prisma.room.findUnique({ where: { id: roomId } }),
		]);

		if (!user) {
			throw createServiceError("User not found", null, "NOT_FOUND");
		}
		if (!room) {
			throw createServiceError("Room not found", null, "NOT_FOUND");
		}

		const existing = await prisma.roomMember.findUnique({
			where: {
				userId_roomId: {
					userId,
					roomId,
				},
			},
		});

		if (existing) {
			return existing;
		}

		return await prisma.roomMember.create({
			data: {
				userId,
				roomId,
				role: "member",
				status: "pending",
			},
		});
	} catch (error) {
		if (
			error instanceof Error &&
			(error.code === "NOT_FOUND" || error.code === "VALIDATION_ERROR")
		) {
			throw error;
		}
		throw createServiceError("Failed to request room join", error);
	}
}

export async function approveJoinRequest(roomMemberId) {
	if (!roomMemberId) {
		throw createServiceError(
			"roomMemberId is required",
			null,
			"VALIDATION_ERROR",
		);
	}

	try {
		return await prisma.roomMember.update({
			where: { id: roomMemberId },
			data: { status: "approved" },
		});
	} catch (error) {
		throw createServiceError("Failed to approve join request", error);
	}
}

export async function getRoomMembers(roomId) {
	if (!roomId) {
		throw createServiceError("roomId is required", null, "VALIDATION_ERROR");
	}

	try {
		return await prisma.roomMember.findMany({
			where: {
				roomId,
				status: "approved",
			},
			include: {
				user: true,
			},
			orderBy: {
				createdAt: "asc",
			},
		});
	} catch (error) {
		throw createServiceError("Failed to fetch room members", error);
	}
}

export async function getJoinRequests(roomId) {
	if (!roomId) {
		throw createServiceError("roomId is required", null, "VALIDATION_ERROR");
	}

	try {
		return await prisma.roomMember.findMany({
			where: {
				roomId,
				status: "pending",
			},
			include: {
				user: true,
			},
			orderBy: {
				createdAt: "asc",
			},
		});
	} catch (error) {
		throw createServiceError("Failed to fetch join requests", error);
	}
}

export async function isUserInRoom(userId, roomId) {
	if (!userId || !roomId) {
		return false;
	}

	try {
		const member = await prisma.roomMember.findUnique({
			where: {
				userId_roomId: {
					userId,
					roomId,
				},
			},
		});

		return Boolean(member && member.status === "approved");
	} catch (error) {
		throw createServiceError("Failed to check room membership", error);
	}
}

export async function canAccessRoom(userId, roomId) {
	try {
		const member = await prisma.roomMember.findUnique({
			where: {
				userId_roomId: {
					userId,
					roomId,
				},
			},
		});

		return Boolean(member && member.status === "approved");
	} catch (error) {
		throw createServiceError("Failed to validate room access", error);
	}
}
