import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://localhost:4430";

	return {
		plugins: [react(), basicSsl()],
		server: {
			port: 5173,
			host: true, // Expose to network
			https: true, // Enable HTTPS for camera/mic access on network
			proxy: {
				"/api": {
					target: apiProxyTarget,
					changeOrigin: true,
				},
			},
		},
		build: {
			outDir: "dist",
			sourcemap: true,
		},
	};
});
