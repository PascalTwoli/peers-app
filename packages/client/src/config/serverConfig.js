const DEV_HTTP_BASE_URL = "https://localhost:8080";
const DEV_WS_BASE_URL = "wss://localhost:8080";
const PROD_HTTP_BASE_URL =
	"https://peers-server-prod-production.up.railway.app";
const PROD_WS_BASE_URL = "wss://peers-server-prod-production.up.railway.app";

export function getApiBaseUrl() {
	return import.meta.env.DEV ? DEV_HTTP_BASE_URL : PROD_HTTP_BASE_URL;
}

export function getWebSocketUrl() {
	return import.meta.env.DEV ? DEV_WS_BASE_URL : PROD_WS_BASE_URL;
}

export function apiUrl(pathname) {
	const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
	return `${getApiBaseUrl()}${normalizedPath}`;
}
