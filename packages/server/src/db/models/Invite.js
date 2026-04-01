import mongoose from "mongoose";

const InviteSchema = new mongoose.Schema(
	{
		code: { type: String, unique: true, required: true },
		createdBy: { type: String, required: true },
		targetRoom: { type: String, default: null },
		expiresAt: { type: Date, required: true },
	},
	{ versionKey: false },
);

const Invite = mongoose.models.Invite || mongoose.model("Invite", InviteSchema);

export default Invite;
