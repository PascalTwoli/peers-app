import ScreenshotCard from "@/components/ScreenshotCard";

const productDetails = [
	{
		title: "Calls + Chat in One View",
		description:
			"Peers keeps room chat and live calls together so teams can make decisions quickly without hopping between tools.",
		image: "/screenshots/room-call-desktop.png",
	},
	{
		title: "Mobile-Ready Collaboration",
		description:
			"Whether commuting or in class, your room calls, controls, and chat stay smooth and touch-friendly on mobile.",
		image: "/screenshots/room-call-mobile.png",
	},
	{
		title: "Clear Presence and People View",
		description:
			"See who is online, available, and active so it is easy to start a chat or spin up a room instantly.",
		image: "/screenshots/peers-mobile.png",
	},
	{
		title: "Social Messaging Experience",
		description:
			"Message threads are designed for natural conversation, reactions, and flowing updates with a modern UI feel.",
		image: "/screenshots/chat-desktop.png",
	},
];

export default function ProductPage() {
	return (
		<div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
			<p className="text-xs uppercase tracking-[0.18em] text-cyan-300">
				Product
			</p>
			<h1 className="mt-2 max-w-3xl text-4xl font-semibold text-white sm:text-5xl">
				The collaboration engine inside Peers
			</h1>
			<p className="mt-5 max-w-3xl text-slate-300">
				Explore how Peers combines rooms, chat, calls, and real-time
				presence into a single social workspace experience.
			</p>

			<div className="mt-10 space-y-8">
				{productDetails.map((item) => (
					<section
						key={item.title}
						className="grid gap-6 rounded-[2rem] border border-line bg-panel/70 p-5 md:grid-cols-[1.2fr_1fr] md:p-7">
						<ScreenshotCard
							title={item.title}
							caption="Screenshot slot: replace with final polished UI image"
							src={item.image}
							ratio="aspect-[16/10]"
						/>
						<div className="flex flex-col justify-center rounded-3xl border border-line bg-slate-900/70 p-6">
							<h2 className="text-2xl font-semibold text-white">
								{item.title}
							</h2>
							<p className="mt-3 text-sm leading-relaxed text-slate-300">
								{item.description}
							</p>
						</div>
					</section>
				))}
			</div>
		</div>
	);
}
