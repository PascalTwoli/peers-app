import prisma from "../db/prisma.js";

function normalizeUsername(value) {
	if (typeof value !== "string") {
		return "";
	}

	return value.trim();
}

export async function requireAuthenticatedUser(req, res, next) {
	const headerUsername = normalizeUsername(req.headers["x-user-name"]);
	const bodyUsername = normalizeUsername(req.body?.username);
	const username = headerUsername || bodyUsername;

	if (!username) {
		res.status(401).json({ error: "Authentication required" });
		return;
	}

	try {
		const user = await prisma.user.findUnique({ where: { username } });
		if (!user) {
			res.status(401).json({ error: "Authentication required" });
			return;
		}

		req.authenticatedUser = user;
		next();
	} catch (error) {
		console.error("Failed to authenticate upload request:", error);
		res.status(500).json({ error: "Failed to authenticate request" });
	}
}

export default requireAuthenticatedUser;
