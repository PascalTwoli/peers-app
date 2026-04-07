import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import App from "./App";
import LandingPage from "./pages/LandingPage";
import HomePage from "./pages/HomePage";

export default function AppRouter() {
	const navigate = useNavigate();

	return (
		<Routes>
			<Route
				path="/"
				element={
					<LandingPage
						onEnterApp={() => navigate("/app")}
						onGoHome={() => navigate("/home")}
					/>
				}
			/>
			<Route
				path="/home"
				element={<HomePage onOpenWorkspace={() => navigate("/app")} />}
			/>
			<Route path="/app/*" element={<App />} />
			<Route path="/join/:code" element={<App />} />
			<Route path="*" element={<Navigate to="/" replace />} />
		</Routes>
	);
}
