import prisma from "../db/prisma.js";
import { getUsernameForSession } from "./sessionStore.js";

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

	// Primary: validate via session token (in-memory, forgery-resistant)
	const sessionToken = normalizeUsername(req.headers["x-session-token"]);
	if (sessionToken) {
		const sessionUsername = getUsernameForSession(sessionToken);
		if (sessionUsername) {
			// Token is live and registered — enforce strict match
			if (sessionUsername === username) {
				req.authenticatedUser = { username };
				next();
				return;
			}
			// Token belongs to a different user → active impersonation attempt
			res.status(401).json({ error: "Authentication required" });
			return;
		}
		// Token not in Map (stale after server restart, or startup race window)
		// Fall through to DB lookup below
	}

	// Fallback: DB lookup — covers the startup race (file URLs resolved before
	// WebSocket connects and registers the new session token)
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
