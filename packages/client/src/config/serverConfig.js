const PROD_HTTP_BASE_URL =
	"https://peers-server-prod-production.up.railway.app";
const PROD_WS_BASE_URL = "wss://peers-server-prod-production.up.railway.app";

function getDevHost() {
	if (typeof window === "undefined") {
		return "localhost";
	}

	const hostname = window.location.hostname || "localhost";

	if (hostname === "::1" || hostname === "0.0.0.0") {
		return "127.0.0.1";
	}

	return hostname;
}

function isPrivateIpv4(hostname) {
	const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!match) {
		return false;
	}

	const octets = match.slice(1).map(Number);
	if (octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
		return false;
	}

	return (
		octets[0] === 10 ||
		(octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
		(octets[0] === 192 && octets[1] === 168)
	);
}

function shouldUseLocalEndpoints() {
	if (typeof window === "undefined") {
		return import.meta.env.DEV;
	}

	const hostname = window.location.hostname || "";
	if (import.meta.env.DEV) {
		return true;
	}

	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "0.0.0.0" ||
		hostname === "::1" ||
		isPrivateIpv4(hostname)
	);
}

function getDevApiBaseUrl() {
	if (typeof window !== "undefined" && import.meta.env.DEV) {
		const { port } = window.location;
		if (port === "5173") {
			// Use Vite proxy in development to avoid direct cert trust issues.
			return "";
		}
	}

	return `https://${getDevHost()}:8080`;
}

function getDevWebSocketUrl() {
	if (typeof window !== "undefined" && import.meta.env.DEV) {
		const { protocol, hostname, port } = window.location;
		if (port === "5173") {
			const wsProtocol = protocol === "https:" ? "wss" : "ws";
			return `${wsProtocol}://${hostname}:5173/ws`;
		}
	}

	return `wss://${getDevHost()}:8080`;
}

export function getApiBaseUrl() {
	return shouldUseLocalEndpoints() ? getDevApiBaseUrl() : PROD_HTTP_BASE_URL;
}

export function getWebSocketUrl() {
	return shouldUseLocalEndpoints() ? getDevWebSocketUrl() : PROD_WS_BASE_URL;
}

export function apiUrl(pathname) {
	const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
	const baseUrl = getApiBaseUrl();
	if (!baseUrl) {
		return normalizedPath;
	}

	return `${baseUrl}${normalizedPath}`;
}
