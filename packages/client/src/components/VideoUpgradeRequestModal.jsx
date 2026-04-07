import { useApp } from "../context/AppContext";
import { Video, PhoneOff } from "lucide-react";

export default function VideoUpgradeRequestModal() {
	const {
		incomingVideoUpgradeRequest,
		handleAcceptVideoUpgrade,
		handleDeclineVideoUpgrade,
	} = useApp();

	if (!incomingVideoUpgradeRequest) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
			<div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#151515] p-5 shadow-2xl">
				<div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-200">
					<Video className="h-6 w-6" />
				</div>
				<h3 className="text-center text-lg font-semibold">Enable Video?</h3>
				<p className="mt-2 text-center text-sm text-gray-300">
					{incomingVideoUpgradeRequest.from} wants to turn this audio call
					into a video call.
				</p>
				<div className="mt-5 grid grid-cols-2 gap-3">
					<button
						onClick={handleDeclineVideoUpgrade}
						className="h-10 rounded-lg bg-white/10 text-sm font-medium text-gray-100 transition-colors hover:bg-white/20">
						Not now
					</button>
					<button
						onClick={handleAcceptVideoUpgrade}
						className="h-10 rounded-lg bg-cyan-600 text-sm font-medium text-white transition-colors hover:bg-cyan-500">
						Accept
					</button>
				</div>
				<div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-gray-500">
					<PhoneOff className="h-3.5 w-3.5" />
					<span>You can decline and stay on audio.</span>
				</div>
			</div>
		</div>
	);
}
