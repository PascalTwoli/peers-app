// In-memory map of sessionToken → username.
// Populated when a user sends "join" over WebSocket, cleaned up on disconnect.
export const sessionToUsername = new Map();

export function registerSession(token, username) {
	sessionToUsername.set(token, username);
}

export function revokeSession(token) {
	sessionToUsername.delete(token);
}

export function getUsernameForSession(token) {
	return sessionToUsername.get(token) ?? null;
}
