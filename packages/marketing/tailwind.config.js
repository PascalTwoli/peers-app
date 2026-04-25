/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
	theme: {
		extend: {
			colors: {
				ink: "#05070C",
				panel: "#0B0F16",
				line: "#1E2738",
				electric: "#00D2FF",
				ocean: "#1D9BF0",
				glow: "#66E7FF",
			},
			borderRadius: {
				"2xl": "1rem",
				"3xl": "1.5rem",
			},
			boxShadow: {
				cyan: "0 0 0 1px rgba(0, 210, 255, 0.25), 0 18px 40px rgba(0, 210, 255, 0.18)",
			},
			backgroundImage: {
				"hero-grid":
					"radial-gradient(circle at 0 0, rgba(0, 210, 255, 0.18), transparent 40%), radial-gradient(circle at 100% 0, rgba(29, 155, 240, 0.18), transparent 45%)",
			},
			animation: {
				float: "float 7s ease-in-out infinite",
				fadeup: "fadeup 700ms ease both",
			},
			keyframes: {
				float: {
					"0%, 100%": { transform: "translateY(0px)" },
					"50%": { transform: "translateY(-8px)" },
				},
				fadeup: {
					from: { opacity: "0", transform: "translateY(10px)" },
					to: { opacity: "1", transform: "translateY(0)" },
				},
			},
		},
	},
	plugins: [],
};
