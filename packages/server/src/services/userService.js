import prisma from "../db/prisma.js";

export async function ensureUserExists(username) {
	if (!username) {
		return null;
	}

	try {
		const existingUser = await prisma.user.findUnique({
			where: { username },
		});

		if (!existingUser) {
			return await prisma.user.create({
				data: {
					username,
					createdAt: new Date(),
					lastSeen: new Date(),
				},
			});
		}

		return await prisma.user.update({
			where: { username },
			data: {
				lastSeen: new Date(),
			},
		});
	} catch (error) {
		console.error("Failed to ensure user exists in PostgreSQL:", error);
		return null;
	}
}

export async function updateLastSeen(username) {
	if (!username) {
		return null;
	}

	try {
		return await prisma.user.update({
			where: { username },
			data: {
				lastSeen: new Date(),
			},
		});
	} catch (error) {
		console.error("Failed to update user lastSeen in PostgreSQL:", error);
		return null;
	}
}
