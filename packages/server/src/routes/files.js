import { Router } from "express";
import { generateUploadUrl } from "../services/s3Service.js";

const router = Router();

router.post("/upload-url", async (req, res) => {
	const { filename, fileType } = req.body || {};

	if (!filename || typeof filename !== "string") {
		res.status(400).json({ error: "filename is required" });
		return;
	}

	try {
		const result = await generateUploadUrl(filename, fileType);
		res.json(result);
	} catch (error) {
		console.error("Failed to generate S3 upload URL:", error);
		res.status(500).json({ error: "Failed to generate upload URL" });
	}
});

export default router;
