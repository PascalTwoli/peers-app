import { Router } from "express";
import prisma from "../db/prisma.js";

const router = Router();

router.get("/", async (req, res) => {
	const { userA, userB } = req.query;
	const parsedLimit = Number.parseInt(req.query.limit, 10);
	const limit = Number.isFinite(parsedLimit)
		? Math.min(Math.max(parsedLimit, 1), 200)
		: 50;

	if (!userA || !userB) {
		res.status(400).json({ error: "userA and userB are required" });
		return;
	}

	try {
		const newestFirst = await prisma.message.findMany({
			where: {
				OR: [
					{ from: String(userA), to: String(userB) },
					{ from: String(userB), to: String(userA) },
				],
			},
			orderBy: {
				timestamp: "desc",
			},
			take: limit,
		});

		res.json({ messages: newestFirst.reverse() });
	} catch (error) {
		console.error("Failed to fetch message history from PostgreSQL:", error);
		res.status(500).json({ error: "Failed to fetch messages" });
	}
});

export default router;
