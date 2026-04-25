import { ArrowRight, Compass, DoorOpen, Smartphone } from "lucide-react";

export default function HomePage({ onOpenWorkspace }) {
	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_85%_10%,_rgba(56,189,248,0.18),_transparent_30%),#0b0b0b] text-white">
			<div className="max-w-5xl mx-auto px-5 py-10 sm:py-14">
				<div className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
					<p className="text-xs uppercase tracking-[0.18em] text-cyan-300">
						Workspace Home
					</p>
					<h1 className="mt-3 text-3xl sm:text-4xl font-extrabold">
						Navigate your communication stack
					</h1>
					<p className="mt-3 text-gray-300 max-w-2xl">
						This home layer prepares the app for web and mobile navigation
						flows. Use it as a central launcher before opening the live
						workspace.
					</p>

					<div className="mt-7 grid sm:grid-cols-3 gap-3">
						<div className="rounded-2xl border border-white/10 bg-black/30 p-4">
							<Compass className="w-5 h-5 text-cyan-300" />
							<p className="mt-2 font-semibold text-sm">Explore</p>
							<p className="text-xs text-gray-400 mt-1">
								Route-ready structure for pages and modules.
							</p>
						</div>
						<div className="rounded-2xl border border-white/10 bg-black/30 p-4">
							<Smartphone className="w-5 h-5 text-emerald-300" />
							<p className="mt-2 font-semibold text-sm">Mobile First</p>
							<p className="text-xs text-gray-400 mt-1">
								Cleaner transitions for future native-like UX.
							</p>
						</div>
						<div className="rounded-2xl border border-white/10 bg-black/30 p-4">
							<DoorOpen className="w-5 h-5 text-violet-300" />
							<p className="mt-2 font-semibold text-sm">Workspace</p>
							<p className="text-xs text-gray-400 mt-1">
								Jump into peers, rooms and calls instantly.
							</p>
						</div>
					</div>

					<button
						onClick={onOpenWorkspace}
						className="mt-8 h-12 px-5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold flex items-center gap-2">
						Open Workspace
						<ArrowRight className="w-4 h-4" />
					</button>
				</div>
			</div>
		</div>
	);
}
