import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION;
const bucket = process.env.AWS_BUCKET_NAME;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

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

function buildPublicFileUrl(key) {
	const encodedKey = key
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

export async function generateUploadUrl(filename, fileType) {
	if (!hasAwsConfig || !s3Client) {
		throw new Error(
			"S3 is not configured. Missing AWS environment variables.",
		);
	}

	const safeFilename = sanitizeFilename(filename);
	const objectKey = `uploads/${Date.now()}-${randomUUID()}-${safeFilename}`;
	const contentType = fileType || "application/octet-stream";

	const command = new PutObjectCommand({
		Bucket: bucket,
		Key: objectKey,
		ContentType: contentType,
	});

	const uploadUrl = await getSignedUrl(s3Client, command, {
		expiresIn: 60 * 15,
	});

	return {
		uploadUrl,
		fileUrl: buildPublicFileUrl(objectKey),
	};
}

export default generateUploadUrl;
