import { Router } from "express";
import {
	approveJoinRequest,
	createRoom,
	getJoinRequests,
	getRoomMembers,
	requestJoinRoom,
} from "../services/roomService.js";

const router = Router();

function mapServiceError(error) {
	if (error?.code === "VALIDATION_ERROR") {
		return 400;
	}

	if (error?.code === "NOT_FOUND") {
		return 404;
	}

	return 500;
}

router.post("/rooms/create", async (req, res) => {
	const { ownerId, name } = req.body || {};

	if (!ownerId || typeof ownerId !== "string" || !name?.trim()) {
		res.status(400).json({ error: "ownerId and name are required" });
		return;
	}

	try {
		const room = await createRoom(ownerId, name);
		res.status(201).json({ room });
	} catch (error) {
		res.status(mapServiceError(error)).json({
			error:
				error instanceof Error ? error.message : "Failed to create room",
		});
	}
});

router.post("/rooms/join-request", async (req, res) => {
	const { userId, roomId } = req.body || {};

	if (!userId || !roomId) {
		res.status(400).json({ error: "userId and roomId are required" });
		return;
	}

	try {
		const request = await requestJoinRoom(userId, roomId);
		res.status(201).json({ request });
	} catch (error) {
		res.status(mapServiceError(error)).json({
			error:
				error instanceof Error
					? error.message
					: "Failed to request room join",
		});
	}
});

router.post("/rooms/approve", async (req, res) => {
	const { roomMemberId } = req.body || {};

	if (!roomMemberId || typeof roomMemberId !== "string") {
		res.status(400).json({ error: "roomMemberId is required" });
		return;
	}

	try {
		const member = await approveJoinRequest(roomMemberId);
		res.json({ member });
	} catch (error) {
		res.status(mapServiceError(error)).json({
			error:
				error instanceof Error
					? error.message
					: "Failed to approve join request",
		});
	}
});

router.get("/rooms/:roomId/members", async (req, res) => {
	const { roomId } = req.params;

	try {
		const members = await getRoomMembers(roomId);
		res.json({ members });
	} catch (error) {
		res.status(mapServiceError(error)).json({
			error:
				error instanceof Error ? error.message : "Failed to fetch members",
		});
	}
});

router.get("/rooms/:roomId/requests", async (req, res) => {
	const { roomId } = req.params;

	try {
		const requests = await getJoinRequests(roomId);
		res.json({ requests });
	} catch (error) {
		res.status(mapServiceError(error)).json({
			error:
				error instanceof Error
					? error.message
					: "Failed to fetch join requests",
		});
	}
});

export default router;
