import { Router } from "express";
import {
	generateUploadUrl,
	generateDownloadUrl,
} from "../services/s3Service.js";
import { MAX_FILE_SIZE_BYTES } from "../validation.js";
import { requireAuthenticatedUser } from "../middleware/requireAuthenticatedUser.js";

const router = Router();

const ALLOWED_UPLOAD_MIME_PREFIXES = ["image/", "text/"];
const ALLOWED_UPLOAD_MIME_TYPES = new Set(["application/pdf"]);

function isAllowedUploadMimeType(fileType) {
	if (!fileType || typeof fileType !== "string") {
		return false;
	}

	if (ALLOWED_UPLOAD_MIME_TYPES.has(fileType)) {
		return true;
	}

	return ALLOWED_UPLOAD_MIME_PREFIXES.some((prefix) =>
		fileType.startsWith(prefix),
	);
}

router.post("/upload-url", requireAuthenticatedUser, async (req, res) => {
	const { filename, fileType, fileSize } = req.body || {};
	const uploader = req.authenticatedUser?.username;

	if (!filename || typeof filename !== "string") {
		res.status(400).json({ error: "filename is required" });
		return;
	}

	if (typeof fileSize !== "number" || Number.isNaN(fileSize)) {
		res.status(400).json({ error: "fileSize is required" });
		return;
	}

	if (fileSize <= 0 || fileSize > MAX_FILE_SIZE_BYTES) {
		res.status(400).json({
			error: `fileSize must be between 1 and ${MAX_FILE_SIZE_BYTES} bytes`,
		});
		return;
	}

	if (!isAllowedUploadMimeType(fileType)) {
		res.status(400).json({
			error: "Unsupported file type. Only images, PDF, and text files are allowed.",
		});
		return;
	}

	try {
		const result = await generateUploadUrl({
			filename,
			fileType,
			fileSize,
			uploader,
		});
		res.json(result);
	} catch (error) {
		console.error("Failed to generate S3 upload URL:", error);
		res.status(500).json({ error: "Failed to generate upload URL" });
	}
});

router.post("/download-url", requireAuthenticatedUser, async (req, res) => {
	const { fileId, fileUrl } = req.body || {};

	if (!fileId && !fileUrl) {
		res.status(400).json({ error: "fileId or fileUrl is required" });
		return;
	}

	try {
		const result = await generateDownloadUrl({ fileId, fileUrl });
		res.json(result);
	} catch (error) {
		console.error("Failed to generate S3 download URL:", error);
		res.status(500).json({ error: "Failed to generate download URL" });
	}
});

export default router;
