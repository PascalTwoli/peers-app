import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import prisma from "../db/prisma.js";
import { MAX_FILE_SIZE_BYTES } from "../validation.js";

function normalizeAwsRegion(rawRegion) {
	const value = String(rawRegion || "").trim();
	if (!value) {
		return "";
	}

	const directMatch = value.match(/^[a-z]{2}-[a-z0-9-]+-\d$/i);
	if (directMatch) {
		return directMatch[0].toLowerCase();
	}

	const embeddedMatch = value.match(/[a-z]{2}-[a-z0-9-]+-\d/i);
	if (embeddedMatch) {
		return embeddedMatch[0].toLowerCase();
	}

	return value.toLowerCase();
}

const region = normalizeAwsRegion(process.env.AWS_REGION);
const bucket = String(process.env.AWS_BUCKET_NAME || "").trim();
const accessKeyId = String(
	process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID || "",
).trim();
const secretAccessKey = String(
	process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
).trim();

const hasAwsConfig =
	Boolean(region) &&
	Boolean(bucket) &&
	Boolean(accessKeyId) &&
	Boolean(secretAccessKey);

const s3Client = hasAwsConfig
	? new S3Client({
			region,
			credentials: {
				accessKeyId,
				secretAccessKey,
			},
		})
	: null;

function sanitizeFilename(filename) {
	return String(filename || "file")
		.trim()
		.replace(/[^a-zA-Z0-9._-]/g, "_")
		.slice(0, 120);
}

function normalizeContentType(fileType) {
	if (!fileType || typeof fileType !== "string") {
		return "application/octet-stream";
	}

	return fileType;
}

function buildPublicFileUrl(key) {
	const encodedKey = key
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

function parseStorageKeyFromFileUrl(fileUrl) {
	if (!fileUrl || typeof fileUrl !== "string") {
		return "";
	}

	try {
		const parsed = new URL(fileUrl);
		const host = parsed.hostname.toLowerCase();
		const bucketHost = `${bucket}.s3.`.toLowerCase();
		if (!host.startsWith(bucketHost) || !host.endsWith("amazonaws.com")) {
			return "";
		}

		return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
	} catch {
		return "";
	}
}

export async function generateUploadUrl({
	filename,
	fileType,
	fileSize,
	uploader,
}) {
	if (!hasAwsConfig || !s3Client) {
		throw new Error(
			"S3 is not configured. Missing or invalid AWS environment variables.",
		);
	}

	if (!uploader) {
		throw new Error("Authenticated uploader is required");
	}

	if (
		typeof fileSize !== "number" ||
		Number.isNaN(fileSize) ||
		fileSize <= 0 ||
		fileSize > MAX_FILE_SIZE_BYTES
	) {
		throw new Error("Invalid file size");
	}

	const safeFilename = sanitizeFilename(filename);
	const objectKey = `uploads/${Date.now()}-${randomUUID()}-${safeFilename}`;
	const contentType = normalizeContentType(fileType);

	const command = new PutObjectCommand({
		Bucket: bucket,
		Key: objectKey,
		ContentType: contentType,
		ContentLength: fileSize,
	});

	const uploadUrl = await getSignedUrl(s3Client, command, {
		expiresIn: 60,
	});
	const fileUrl = buildPublicFileUrl(objectKey);

	const metadata = await prisma.file.create({
		data: {
			uploader,
			fileName: safeFilename,
			fileType: contentType,
			fileSize,
			storageKey: objectKey,
			fileUrl,
		},
	});

	return {
		uploadUrl,
		fileUrl,
		fileId: metadata.id,
	};
}

export async function generateDownloadUrl({ fileId, fileUrl }) {
	if (!hasAwsConfig || !s3Client) {
		throw new Error(
			"S3 is not configured. Missing or invalid AWS environment variables.",
		);
	}

	let storageKey = "";

	if (fileId && typeof fileId === "string") {
		const metadata = await prisma.file.findUnique({
			where: { id: fileId },
			select: { storageKey: true },
		});
		storageKey = metadata?.storageKey || "";
	}

	if (!storageKey && fileUrl) {
		storageKey = parseStorageKeyFromFileUrl(fileUrl);
	}

	if (!storageKey) {
		throw new Error("Unable to resolve storage key for file");
	}

	const command = new GetObjectCommand({
		Bucket: bucket,
		Key: storageKey,
	});

	const downloadUrl = await getSignedUrl(s3Client, command, {
		expiresIn: 300,
	});

	return {
		downloadUrl,
		fileId: fileId || null,
		fileUrl: fileUrl || buildPublicFileUrl(storageKey),
	};
}

export default generateUploadUrl;
