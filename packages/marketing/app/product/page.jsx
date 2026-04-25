import ScreenshotCard from "@/components/ScreenshotCard";

const productStats = [
	{ label: "Unified Surfaces", value: "Chat + Calls + Rooms" },
	{ label: "Switch Time", value: "Under 2 seconds" },
	{ label: "Platforms", value: "Desktop + Mobile" },
];

const productDetails = [
	{
		eyebrow: "Collaboration Core",
		title: "Calls + Chat in One View",
		description:
			"Peers keeps room chat and live calls together so teams can make decisions quickly without hopping between tools.",
		image: "/screenshots/room-call-desktop.png",
		ratio: "aspect-[16/10]",
		points: [
			"Follow discussion while live call controls stay visible.",
			"Reduce context switching during fast-moving decisions.",
			"Keep room history and live presence in one place.",
		],
	},
	{
		eyebrow: "Mobile Experience",
		title: "Mobile-Ready Collaboration",
		description:
			"Whether commuting or in class, your room calls, controls, and chat stay smooth and touch-friendly on mobile.",
		image: "/screenshots/room-call-mobile.png",
		ratio: "aspect-[10/16]",
		points: [
			"Touch-friendly controls that stay reachable with one hand.",
			"Readable timelines and participant states on small screens.",
			"Reliable transitions between chat and call interactions.",
		],
	},
	{
		eyebrow: "Presence Layer",
		title: "Clear Presence and People View",
		description:
			"See who is online, available, and active so it is easy to start a chat or spin up a room instantly.",
		image: "/screenshots/peers-mobile.png",
		ratio: "aspect-[10/16]",
		points: [
			"Immediate visibility into availability before reaching out.",
			"Faster starts for direct messages and room conversations.",
			"Consistent identity and status cues across the workspace.",
		],
	},
	{
		eyebrow: "Messaging UX",
		title: "Social Messaging Experience",
		description:
			"Message threads are designed for natural conversation, reactions, and flowing updates with a modern UI feel.",
		image: "/screenshots/chat-desktop.png",
		ratio: "aspect-[16/10]",
		points: [
			"Natural conversation flow with readable message spacing.",
			"Quick reactions and feedback loops for active groups.",
			"A calmer interface that stays clear as channels grow.",
		],
	},
];

export default function ProductPage() {
	return (
		<div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
			<section className="rounded-[2rem] border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-[#0f172a]/70 to-blue-500/10 p-7 sm:p-9">
				<p className="text-xs uppercase tracking-[0.18em] text-cyan-200">
					Product
				</p>
				<h1 className="mt-3 max-w-4xl text-4xl font-semibold text-white sm:text-5xl">
					A focused collaboration product that keeps teams in flow
				</h1>
				<p className="mt-5 max-w-3xl text-slate-300">
					Peers combines chat, live calls, rooms, and presence into one
					cohesive experience so teams can decide faster and work with less
					friction.
				</p>

				<div className="mt-8 grid gap-3 sm:grid-cols-3">
					{productStats.map((stat) => (
						<div
							key={stat.label}
							className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
							<p className="text-xs uppercase tracking-[0.14em] text-slate-400">
								{stat.label}
							</p>
							<p className="mt-2 text-base font-semibold text-white">
								{stat.value}
							</p>
						</div>
					))}
				</div>
			</section>

			<div className="mt-10 space-y-8">
				{productDetails.map((item, index) => {
					const reverse = index % 2 === 1;

					return (
						<section
							key={item.title}
							className="grid gap-6 rounded-[2rem] border border-white/10 bg-[#0f172a]/55 p-5 md:grid-cols-12 md:p-7">
							<div
								className={[
									"md:col-span-7",
									reverse ? "md:order-2" : "md:order-1",
								].join(" ")}>
								<ScreenshotCard
									title={item.title}
									caption={`${item.eyebrow} view from the Peers interface`}
									src={item.image}
									ratio={item.ratio}
									desktopSlant={index === 0 ? "backward" : "side"}
								/>
							</div>

							<div
								className={[
									"flex flex-col justify-center rounded-2xl border border-white/10 bg-slate-900/55 p-6 md:col-span-5",
									reverse ? "md:order-1" : "md:order-2",
								].join(" ")}>
								<p className="text-xs uppercase tracking-[0.16em] text-cyan-200">
									{item.eyebrow}
								</p>
								<h2 className="mt-3 text-2xl font-semibold text-white">
									{item.title}
								</h2>
								<p className="mt-3 text-sm leading-relaxed text-slate-300">
									{item.description}
								</p>
								<ul className="mt-5 space-y-2 text-sm text-slate-300">
									{item.points.map((point) => (
										<li
											key={point}
											className="flex items-start gap-2">
											<span className="mt-1 inline-flex h-2 w-2 rounded-full bg-cyan-300/80" />
											<span>{point}</span>
										</li>
									))}
								</ul>
							</div>
						</section>
					);
				})}
			</div>

			<section className="mt-10 rounded-[2rem] border border-white/10 bg-slate-950/40 p-7 sm:p-9">
				<p className="text-xs uppercase tracking-[0.16em] text-cyan-200">
					Why This Product Model Works
				</p>
				<div className="mt-4 grid gap-6 md:grid-cols-3">
					<div>
						<h3 className="text-xl font-semibold text-white">
							Fewer Tool Jumps
						</h3>
						<p className="mt-2 text-sm text-slate-300">
							Rooms, chat, and calls are composed as one flow, reducing
							context switching and decision latency.
						</p>
					</div>
					<div>
						<h3 className="text-xl font-semibold text-white">
							Clear Presence
						</h3>
						<p className="mt-2 text-sm text-slate-300">
							People and availability are always close, making
							collaboration startups predictable for both small teams and
							communities.
						</p>
					</div>
					<div>
						<h3 className="text-xl font-semibold text-white">
							Mobile Included
						</h3>
						<p className="mt-2 text-sm text-slate-300">
							The product is intentionally responsive so collaboration
							quality stays consistent across desktop and mobile
							touchpoints.
						</p>
					</div>
				</div>
			</section>
		</div>
	);
}
