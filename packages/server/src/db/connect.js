import mongoose from "mongoose";

const DEFAULT_MONGO_URI = "mongodb://localhost:27017/peers";
let hasConnectedOnce = false;

export async function connectDB() {
	const mongoUri = process.env.MONGO_URI || DEFAULT_MONGO_URI;

	if (mongoose.connection.readyState === 1) {
		return true;
	}

	try {
		await mongoose.connect(mongoUri, {
			serverSelectionTimeoutMS: 5000,
		});
		hasConnectedOnce = true;
		console.log(`MongoDB connected: ${mongoUri}`);
		return true;
	} catch (error) {
		const level = hasConnectedOnce ? "error" : "warn";
		console[level](
			`MongoDB unavailable. Continuing without durable persistence. ${error.message}`,
		);
		return false;
	}
}

export function isDBConnected() {
	return mongoose.connection.readyState === 1;
}
