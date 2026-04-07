import { Copy, QrCode, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useApp } from "../context/AppContext";

export default function InviteCenterView() {
	const { lastInviteLink, handleCreateInviteLink, showToast } = useApp();

	const copyInviteLink = async () => {
		if (!lastInviteLink) {
			showToast("Generate an invite link first", "info");
			return;
		}

		try {
			await navigator.clipboard.writeText(lastInviteLink);
			showToast("Invite link copied", "success");
		} catch {
			showToast("Could not copy invite link", "danger");
		}
	};

	return (
		<section className="flex-1 overflow-y-auto p-4 md:p-8 bg-gradient-to-b from-[#0b1220] to-[#0d1526]">
			<div className="mx-auto w-full max-w-4xl">
				<div className="rounded-2xl border border-cyan-400/25 bg-[#0f172a]/70 p-5 md:p-7 shadow-xl">
					<div className="flex items-center gap-3">
						<div className="h-10 w-10 rounded-xl bg-cyan-500/20 text-cyan-200 flex items-center justify-center">
							<QrCode className="h-5 w-5" />
						</div>
						<div>
							<p className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">
								Invite Center
							</p>
							<h2 className="text-xl md:text-2xl font-semibold">
								Scan To Join On Phone
							</h2>
						</div>
					</div>

					<p className="mt-4 text-sm text-gray-300 max-w-2xl">
						Generate an invite, scan it from another device on the same
						Wi-Fi, and it opens this app directly.
					</p>

					<div className="mt-5 flex flex-wrap gap-3">
						<button
							onClick={handleCreateInviteLink}
							className="h-10 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium flex items-center gap-2">
							<RefreshCw className="h-4 w-4" />
							Generate New Invite
						</button>
						<button
							onClick={copyInviteLink}
							className="h-10 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium flex items-center gap-2">
							<Copy className="h-4 w-4" />
							Copy Link
						</button>
					</div>
				</div>

				<div className="mt-5 rounded-2xl border border-white/10 bg-[#111827]/80 p-4 md:p-8 grid md:grid-cols-[auto,1fr] gap-6 items-center">
					<div className="mx-auto rounded-2xl bg-white p-3 md:p-4 shadow-xl">
						<QRCodeSVG
							value={lastInviteLink || "https://example.invalid/invite"}
							size={220}
							bgColor="#ffffff"
							fgColor="#0b1220"
							level="M"
							includeMargin
						/>
					</div>
					<div className="min-w-0">
						<p className="text-xs uppercase tracking-[0.18em] text-gray-400">
							Invite Link
						</p>
						<p className="mt-2 break-all text-sm text-gray-200">
							{lastInviteLink ||
								"Generate a link to render a scannable QR code."}
						</p>
						<p className="mt-4 text-sm text-gray-400">
							Tip: keep this view open while testing from mobile devices.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
