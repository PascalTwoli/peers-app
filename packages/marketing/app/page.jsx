import Link from "next/link";
import ScreenshotCard from "@/components/ScreenshotCard";

const features = [
	{
		title: "Smart Chat",
		copy: "Stay in sync with fast messaging, reactions, and search that keeps context close.",
	},
	{
		title: "Team Rooms",
		copy: "Organize conversations by purpose with lightweight rooms for every idea and project.",
	},
	{
		title: "Live Calls",
		copy: "Switch from text to voice or video instantly with room-level calling built in.",
	},
	{
		title: "File Sharing",
		copy: "Share screenshots, docs, and updates directly in chat without breaking momentum.",
	},
	{
		title: "Real-time Presence",
		copy: "Know who is online and available so teams can collaborate at the perfect moment.",
	},
];

const previewScreens = [
	{
		title: "Room Call Dashboard",
		caption: "Desktop call layout with chat panel and active participants.",
		src: "/screenshots/room-call-desktop.png",
	},
	{
		title: "Room Call on Mobile",
		caption:
			"Responsive mobile experience for calls, controls, and participant tiles.",
		src: "/screenshots/room-call-mobile.png",
	},
	{
		title: "1:1 Audio Call",
		caption:
			"Focused audio call mode for fast check-ins and voice-first conversations.",
		src: "/screenshots/audio-call-desktop.png",
	},
	{
		title: "Direct Messaging",
		caption:
			"Friendly message timeline built for casual social and team conversations.",
		src: "/screenshots/chat-desktop.png",
	},
	{
		title: "Direct Messaging on Mobile",
		caption:
			"Optimized mobile chat with large touch targets and clear reading flow.",
		src: "/screenshots/chat-mobile.png",
	},
	{
		title: "Peers Directory",
		caption: "Instantly browse peers and presence across your workspace.",
		src: "/screenshots/peers-mobile.png",
	},
];

const useCases = [
	{
		title: "Students",
		body: "Run study groups, assignment channels, and exam prep calls in one shared workspace.",
	},
	{
		title: "Communities",
		body: "Create social hubs where members can drop into rooms, share updates, and host events.",
	},
	{
		title: "Small Teams",
		body: "Move projects quickly with lightweight collaboration that blends chat and live calls.",
	},
];

export default function HomePage() {
	return (
		<div>
			<section className="grid-lines border-b border-line">
				<div className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-16 pt-20 sm:px-6 md:pb-24 md:pt-28">
					<p className="mb-5 inline-flex w-fit items-center rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-200">
						Social Workspace for Real-Time Collaboration
					</p>
					<h1 className="max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl md:text-6xl">
						Peers — Chat, call, and collaborate in one social workspace.
					</h1>
					<p className="mt-6 max-w-2xl text-base text-slate-300 sm:text-lg">
						Peers helps student groups, online communities, friend
						circles, and small teams move together with real-time chat,
						room calls, and presence-aware collaboration.
					</p>
					<div className="mt-9 flex flex-wrap gap-3">
						<Link
							href="#cta"
							className="rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.03] hover:bg-cyan-300">
							Open Workspace
						</Link>
						<Link
							href="#how"
							className="rounded-full border border-line bg-panel px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/70 hover:text-cyan-100">
							Learn More
						</Link>
					</div>
				</div>
			</section>

			<section
				id="preview"
				className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
				<div className="mb-8 flex items-end justify-between gap-4">
					<div>
						<p className="text-xs uppercase tracking-[0.18em] text-cyan-300">
							Product Preview
						</p>
						<h2 className="mt-2 text-3xl font-semibold text-white">
							Screens that feel alive
						</h2>
					</div>
					<Link
						href="/product"
						className="text-sm text-cyan-300 hover:text-cyan-200">
						See full product view
					</Link>
				</div>
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{previewScreens.map((screen) => (
						<ScreenshotCard
							key={screen.title}
							title={screen.title}
							caption={screen.caption}
							src={screen.src}
						/>
					))}
				</div>
			</section>

			<section className="border-y border-line bg-panel/55">
				<div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
					<p className="text-xs uppercase tracking-[0.18em] text-cyan-300">
						Features
					</p>
					<h2 className="mt-2 text-3xl font-semibold text-white">
						Built for social collaboration
					</h2>
					<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{features.map((feature) => (
							<article
								key={feature.title}
								className="rounded-3xl border border-line bg-slate-900/65 p-5 transition duration-300 hover:-translate-y-1 hover:border-cyan-400/60 hover:shadow-cyan">
								<h3 className="text-lg font-semibold text-white">
									{feature.title}
								</h3>
								<p className="mt-2 text-sm leading-relaxed text-slate-400">
									{feature.copy}
								</p>
							</article>
						))}
					</div>
				</div>
			</section>

			<section
				id="how"
				className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
				<p className="text-xs uppercase tracking-[0.18em] text-cyan-300">
					How It Works
				</p>
				<h2 className="mt-2 text-3xl font-semibold text-white">
					From room setup to real-time flow
				</h2>
				<div className="mt-8 grid gap-4 md:grid-cols-3">
					{[
						"Create a room",
						"Invite peers",
						"Chat, call and collaborate",
					].map((step, index) => (
						<div
							key={step}
							className="rounded-3xl border border-line bg-panel p-6">
							<p className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/20 text-sm font-semibold text-cyan-200">
								{index + 1}
							</p>
							<h3 className="text-lg font-semibold text-white">
								{step}
							</h3>
						</div>
					))}
				</div>
			</section>

			<section className="border-y border-line bg-panel/55">
				<div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
					<p className="text-xs uppercase tracking-[0.18em] text-cyan-300">
						Use Cases
					</p>
					<h2 className="mt-2 text-3xl font-semibold text-white">
						Made for groups that move together
					</h2>
					<div className="mt-8 grid gap-4 md:grid-cols-3">
						{useCases.map((item) => (
							<article
								key={item.title}
								className="rounded-3xl border border-line bg-slate-900/65 p-6">
								<h3 className="text-xl font-semibold text-white">
									{item.title}
								</h3>
								<p className="mt-3 text-sm text-slate-400">
									{item.body}
								</p>
							</article>
						))}
					</div>
				</div>
			</section>

			<section
				id="cta"
				className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-20">
				<div className="rounded-[2rem] border border-cyan-400/30 bg-gradient-to-r from-cyan-500/15 to-blue-500/15 p-8 text-center sm:p-10">
					<h2 className="text-3xl font-semibold text-white">
						Ready to build your social workspace?
					</h2>
					<p className="mx-auto mt-3 max-w-xl text-sm text-slate-300 sm:text-base">
						Launch Peers and bring your chats, rooms, and calls into one
						modern place where collaboration feels effortless.
					</p>
					<div className="mt-7 flex flex-wrap items-center justify-center gap-3">
						<Link
							href="https://peers-app.vercel.app/app"
							className="rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.03] hover:bg-cyan-300">
							Open Workspace
						</Link>
						<Link
							href="/product"
							className="rounded-full border border-line bg-panel px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/70 hover:text-cyan-100">
							Learn More
						</Link>
					</div>
				</div>
			</section>
		</div>
	);
}
