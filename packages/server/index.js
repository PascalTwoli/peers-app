import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function loadLocalEnvFile() {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	const envPath = path.join(__dirname, ".env");

	if (!fs.existsSync(envPath)) {
		return;
	}

	const raw = fs.readFileSync(envPath, "utf8");
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		const equalsIndex = trimmed.indexOf("=");
		if (equalsIndex <= 0) {
			continue;
		}

		const key = trimmed.slice(0, equalsIndex).trim();
		let value = trimmed.slice(equalsIndex + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		if (!(key in process.env)) {
			process.env[key] = value;
		}
	}
}

loadLocalEnvFile();

await import("./src/index.js");
