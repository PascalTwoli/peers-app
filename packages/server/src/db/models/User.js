import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
	{
		username: { type: String, unique: true, required: true },
		createdAt: { type: Date, default: Date.now },
		lastSeen: { type: Date, default: Date.now },
	},
	{ versionKey: false },
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);

export default User;
