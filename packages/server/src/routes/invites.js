import { Router } from "express";
import {
	createInvite,
	getInvite,
	joinRoomWithInvite,
} from "../services/inviteService.js";

const router = Router();

function mapServiceError(error) {
	switch (error?.code) {
		case "VALIDATION_ERROR":
			return 400;
		case "NOT_FOUND":
			return 404;
		case "INVITE_EXPIRED":
			return 410;
		case "ALREADY_MEMBER":
			return 409;
		case "FORBIDDEN":
			return 403;
		default:
			return 500;
	}
}

router.post("/invites/create", async (req, res) => {
	const { roomId, createdBy } = req.body || {};

	if (!roomId || !createdBy) {
		res.status(400).json({ error: "roomId and createdBy are required" });
		return;
	}

	try {
		const invite = await createInvite(roomId, createdBy);
		res.status(201).json(invite);
	} catch (error) {
		res.status(mapServiceError(error)).json({
			error:
				error instanceof Error ? error.message : "Failed to create invite",
		});
	}
});

async function handleGetInvite(req, res) {
	const { code } = req.params;

	try {
		const invite = await getInvite(code);
		res.json(invite);
	} catch (error) {
		res.status(mapServiceError(error)).json({
			error:
				error instanceof Error ? error.message : "Failed to fetch invite",
		});
	}
}

router.get("/invites/:code", handleGetInvite);
router.get("/invite/:code", handleGetInvite);

router.post("/invites/join", async (req, res) => {
	const { code, userId } = req.body || {};

	if (!code || !userId) {
		res.status(400).json({ error: "code and userId are required" });
		return;
	}

	try {
		const result = await joinRoomWithInvite(code, userId);
		res.status(201).json(result);
	} catch (error) {
		res.status(mapServiceError(error)).json({
			error:
				error instanceof Error
					? error.message
					: "Failed to join room with invite",
		});
	}
});

export default router;
