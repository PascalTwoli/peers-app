import mongoose from "mongoose";

const RoomSchema = new mongoose.Schema(
	{
		roomId: { type: String, unique: true, required: true },
		name: { type: String, required: true },
		owner: { type: String, required: true },
		members: { type: [String], default: [] },
		pendingRequests: { type: [String], default: [] },
		createdAt: { type: Date, default: Date.now },
	},
	{ versionKey: false },
);

const Room = mongoose.models.Room || mongoose.model("Room", RoomSchema);

export default Room;
