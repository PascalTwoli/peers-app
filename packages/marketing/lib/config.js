// Central config — all app URLs come from here so changing the env var
// updates every CTA across the marketing site automatically.

export const APP_URL =
	process.env.NEXT_PUBLIC_APP_URL || "https://peers-app.vercel.app";

export const APP_WORKSPACE_URL = `${APP_URL}/app`;

// Invite deep-links live on the app domain, not the marketing domain
export function appInviteUrl(code) {
	return `${APP_URL}/join/${code}`;
}
