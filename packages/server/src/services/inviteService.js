import { randomBytes } from "crypto";
import prisma from "../db/prisma.js";

const DEFAULT_INVITE_TTL_HOURS = 72;

function createServiceError(message, code = "INTERNAL_ERROR", cause = null) {
	const error = new Error(message);
	error.code = code;
	if (cause) {
		error.cause = cause;
	}
	return error;
}

function generateInviteCode(length = 6) {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
	const bytes = randomBytes(length);
	let code = "";
	for (let i = 0; i < length; i += 1) {
		code += alphabet[bytes[i] % alphabet.length];
	}
	return code;
}

async function generateUniqueInviteCode() {
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const code = generateInviteCode();
		const existing = await prisma.invite.findUnique({ where: { code } });
		if (!existing) {
			return code;
		}
	}

	throw createServiceError(
		"Failed to generate unique invite code",
		"INVITE_CODE_GENERATION_FAILED",
	);
}

export async function createInvite(roomId, createdBy) {
	if (!roomId || !createdBy) {
		throw createServiceError(
			"roomId and createdBy are required",
			"VALIDATION_ERROR",
		);
	}

	try {
		const [room, member] = await Promise.all([
			prisma.room.findUnique({ where: { id: roomId } }),
			prisma.roomMember.findUnique({
				where: {
					userId_roomId: {
						userId: createdBy,
						roomId,
					},
				},
			}),
		]);

		if (!room) {
			throw createServiceError("Room not found", "NOT_FOUND");
		}

		const canCreateInvite =
			(member &&
				member.status === "approved" &&
				(member.role === "owner" || member.role === "admin")) ||
			room.owner === createdBy;

		if (!canCreateInvite) {
			throw createServiceError(
				"Only room owners or admins can create invites",
				"FORBIDDEN",
			);
		}

		const code = await generateUniqueInviteCode();
		const expiresAt = new Date(
			Date.now() + DEFAULT_INVITE_TTL_HOURS * 60 * 60 * 1000,
		);

		const invite = await prisma.invite.create({
			data: {
				code,
				createdBy,
				roomId,
				expiresAt,
			},
			include: {
				room: true,
			},
		});

		return {
			inviteCode: invite.code,
			inviteUrl: `/join/${invite.code}`,
			expiresAt: invite.expiresAt,
			room: {
				id: invite.room.id,
				name: invite.room.name,
			},
		};
	} catch (error) {
		if (error?.code) {
			throw error;
		}
		throw createServiceError(
			"Failed to create invite",
			"INTERNAL_ERROR",
			error,
		);
	}
}

export async function getInvite(code) {
	if (!code) {
		throw createServiceError("Invite code is required", "VALIDATION_ERROR");
	}

	const invite = await prisma.invite.findUnique({
		where: { code },
		include: {
			room: true,
		},
	});

	if (!invite) {
		throw createServiceError("Invite not found", "NOT_FOUND");
	}

	if (invite.expiresAt && invite.expiresAt < new Date()) {
		throw createServiceError("Invite has expired", "INVITE_EXPIRED");
	}

	return {
		code: invite.code,
		roomId: invite.roomId,
		roomName: invite.room.name,
		createdBy: invite.createdBy,
		expiresAt: invite.expiresAt,
		createdAt: invite.createdAt,
		inviteUrl: `/join/${invite.code}`,
	};
}

export async function joinRoomWithInvite(code, userId) {
	if (!code || !userId) {
		throw createServiceError(
			"code and userId are required",
			"VALIDATION_ERROR",
		);
	}

	try {
		const [inviteInfo, user] = await Promise.all([
			getInvite(code),
			prisma.user.findUnique({ where: { id: userId } }),
		]);

		if (!user) {
			throw createServiceError("User not found", "NOT_FOUND");
		}

		const existingMember = await prisma.roomMember.findUnique({
			where: {
				userId_roomId: {
					userId,
					roomId: inviteInfo.roomId,
				},
			},
		});

		if (existingMember?.status === "approved") {
			throw createServiceError(
				"User is already a room member",
				"ALREADY_MEMBER",
			);
		}

		const membership = existingMember
			? await prisma.roomMember.update({
					where: { id: existingMember.id },
					data: {
						status: "approved",
						role: "member",
					},
				})
			: await prisma.roomMember.create({
					data: {
						userId,
						roomId: inviteInfo.roomId,
						status: "approved",
						role: "member",
					},
				});

		return {
			roomId: inviteInfo.roomId,
			roomName: inviteInfo.roomName,
			member: membership,
		};
	} catch (error) {
		if (error?.code) {
			throw error;
		}
		throw createServiceError(
			"Failed to join room with invite",
			"INTERNAL_ERROR",
			error,
		);
	}
}
