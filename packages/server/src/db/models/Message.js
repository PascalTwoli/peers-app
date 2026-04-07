import mongoose from "mongoose";

const ReactionSchema = new mongoose.Schema(
	{
		emoji: { type: String, required: true },
		user: { type: String, required: true },
	},
	{ _id: false },
);

const MessageSchema = new mongoose.Schema(
	{
		messageId: { type: String, unique: true, required: true },
		from: { type: String, required: true },
		to: { type: String, default: null },
		roomId: { type: String, default: null },
		text: { type: String, default: "" },
		fileUrl: { type: String, default: null },
		fileName: { type: String, default: null },
		reactions: { type: [ReactionSchema], default: [] },
		edited: { type: Boolean, default: false },
		timestamp: { type: Number, required: true },
	},
	{ versionKey: false },
);

MessageSchema.index({ timestamp: -1 });

const Message =
	mongoose.models.Message || mongoose.model("Message", MessageSchema);

export default Message;
