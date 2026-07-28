import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import App from "./App";

const MARKETING_URL =
	import.meta.env.VITE_MARKETING_URL || "https://peers-web.vercel.app";

// Sends the browser to the marketing site and renders nothing while navigating.
function MarketingRedirect() {
	useEffect(() => {
		// In development mode, redirect to /app instead of marketing site
		if (import.meta.env.DEV) {
			window.location.replace("/app");
		} else {
			window.location.replace(MARKETING_URL);
		}
	}, []);
	return null;
}

export default function AppRouter() {
	return (
		<Routes>
			{/* Public-facing landing — lives on the marketing site */}
			<Route path="/" element={<MarketingRedirect />} />

			{/* Workspace */}
			<Route path="/app/*" element={<App />} />

			{/* Invite deep-links — must stay on the app domain */}
			<Route path="/join/:code" element={<App />} />

			{/* Any other path falls into the workspace */}
			<Route path="*" element={<Navigate to="/app" replace />} />
		</Routes>
	);
}
