import { ArrowRight, MessageCircleMore, Phone, Users } from "lucide-react";

export default function LandingPage({ onEnterApp, onGoHome }) {
	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_10%_20%,_rgba(34,211,238,0.2),_transparent_35%),radial-gradient(circle_at_90%_15%,_rgba(16,185,129,0.16),_transparent_30%),#090909] text-white">
			<div className="max-w-6xl mx-auto px-5 py-10 sm:py-16">
				<header className="flex items-center justify-between mb-10">
					<div className="text-lg font-bold tracking-wide">Peers</div>
					<button
						onClick={onGoHome}
						className="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-sm">
						Home
					</button>
				</header>

				<section className="grid lg:grid-cols-2 gap-8 items-center">
					<div>
						<p className="text-xs uppercase tracking-[0.18em] text-cyan-300">
							Mobile-first Messaging + Calls
						</p>
						<h1 className="mt-3 text-4xl sm:text-5xl font-extrabold leading-tight">
							Rooms, calls and files in one fast workspace.
						</h1>
						<p className="mt-4 text-gray-300 max-w-xl">
							Start direct chats, create rooms, and jump into real-time
							calls with adaptive layouts built for mobile and desktop.
						</p>

						<div className="mt-7 flex flex-wrap gap-3">
							<button
								onClick={onEnterApp}
								className="h-12 px-5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold flex items-center gap-2">
								Open Workspace
								<ArrowRight className="w-4 h-4" />
							</button>
							<button
								onClick={onGoHome}
								className="h-12 px-5 rounded-xl bg-white/10 hover:bg-white/20 font-medium">
								Explore Home
							</button>
						</div>
					</div>

					<div className="grid sm:grid-cols-3 gap-3">
						<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
							<MessageCircleMore className="w-5 h-5 text-cyan-300" />
							<p className="mt-3 text-sm font-semibold">Smart Chat</p>
							<p className="text-xs text-gray-400 mt-1">
								Typing, statuses, reactions and fast syncing.
							</p>
						</div>
						<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
							<Phone className="w-5 h-5 text-emerald-300" />
							<p className="mt-3 text-sm font-semibold">Live Calls</p>
							<p className="text-xs text-gray-400 mt-1">
								Room calls with dynamic speaker and share layouts.
							</p>
						</div>
						<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
							<Users className="w-5 h-5 text-violet-300" />
							<p className="mt-3 text-sm font-semibold">Team Rooms</p>
							<p className="text-xs text-gray-400 mt-1">
								Create, invite and collaborate instantly.
							</p>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
