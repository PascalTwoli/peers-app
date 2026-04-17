import Link from "next/link";

const segmentStats = [
	{ label: "Primary Audiences", value: "Students · Communities · Small Teams" },
	{ label: "Core Motions", value: "Chat · Rooms · Calls" },
	{ label: "Best For", value: "Fast-moving group collaboration" },
];

const segments = [
	{
		title: "Students",
		eyebrow: "Academic Collaboration",
		description:
			"Keep coursework, group projects, and exam prep organized in one place without spreading context across multiple tools.",
		highlight: "Study rooms, revision calls, and assignment channels",
		points: [
			"Create a room for every subject, project, or study sprint.",
			"Jump from text to video for revision and deadline crunch sessions.",
			"Share files and keep everyone aligned in one place.",
		],
	},
	{
		title: "Online Communities",
		eyebrow: "Community Operations",
		description:
			"Run active spaces where members can discuss, host events, and get real-time support while keeping conversation quality high.",
		highlight: "Event rooms, onboarding spaces, and live support threads",
		points: [
			"Host social rooms for events, discussion circles, and interest channels.",
			"Make onboarding easier with persistent spaces and live support calls.",
			"Keep engagement high with real-time presence and instant conversations.",
		],
	},
	{
		title: "Small Teams",
		eyebrow: "Lean Team Execution",
		description:
			"Move quickly with lightweight coordination that supports planning, rapid decisions, and short feedback loops.",
		highlight: "Standups, async updates, and fast decision rooms",
		points: [
			"Coordinate lightweight projects without heavy enterprise overhead.",
			"Use room calls for standups, reviews, and quick alignment.",
			"Centralize communication so context is never lost.",
		],
	},
];

const scenarioRows = [
	{
		title: "Exam Week Sprint",
		audience: "Students",
		copy: "Create one revision room, pin resources, and rotate quick call sessions as deadlines get closer.",
	},
	{
		title: "Community Launch Event",
		audience: "Online Communities",
		copy: "Coordinate moderators, host a live room, and keep post-event discussion flowing in persistent channels.",
	},
	{
		title: "Product Iteration Cycle",
		audience: "Small Teams",
		copy: "Run standups, collect async updates, and jump into short alignment calls when blockers appear.",
	},
];

function SegmentIcon({ title }) {
	if (title === "Students") {
		return (
			<svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
				<path
					d="M3 8.5L12 4l9 4.5-9 4.5-9-4.5zm4 3.8v3.3c0 1.1 2.2 2 5 2s5-.9 5-2v-3.3"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.7"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);
	}

	if (title === "Online Communities") {
		return (
			<svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
				<path
					d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 2a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19v-1a4 4 0 0 1 4-4h2M13 19v-1a4 4 0 0 1 4-4h1"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.7"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);
	}

	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
			<path
				d="M4 12h16M4 7h10M4 17h8m8-3v5m0 0l-2.5-2.5M20 19l2.5-2.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export default function UseCasesPage() {
	return (
		<div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
			<section className="rounded-[2rem] border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-[#0f172a]/70 to-blue-500/10 p-7 sm:p-9">
				<p className="text-xs uppercase tracking-[0.18em] text-cyan-200">
					Use Cases
				</p>
				<h1 className="mt-3 max-w-4xl text-4xl font-semibold text-white sm:text-5xl">
					Built for how real groups coordinate, decide, and move
				</h1>
				<p className="mt-5 max-w-3xl text-slate-300">
					Peers adapts to different collaboration styles, from study circles and
					community spaces to fast-moving small teams.
				</p>

				<div className="mt-8 grid gap-3 sm:grid-cols-3">
					{segmentStats.map((stat) => (
						<div
							key={stat.label}
							className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
							<p className="text-xs uppercase tracking-[0.14em] text-slate-400">
								{stat.label}
							</p>
							<p className="mt-2 text-[0.98rem] font-medium leading-relaxed text-slate-100">
								{stat.value}
							</p>
						</div>
					))}
				</div>
			</section>

			<div className="mt-10 grid gap-5 md:grid-cols-3">
				{segments.map((segment, index) => {
					const segmentSlantClass =
						index === 0
							? "md:origin-center md:[transform:perspective(1100px)_rotateY(8deg)_rotateX(1deg)_translateY(8px)_scale(1.015)] md:hover:[transform:perspective(1100px)_rotateY(4deg)_rotateX(0.3deg)_translateY(2px)_scale(1.025)]"
							: index === 1
								? "md:origin-center md:[transform:perspective(1100px)_rotateY(-11deg)_rotateX(1.5deg)_translateY(10px)_scale(1.02)] md:hover:[transform:perspective(1100px)_rotateY(-6deg)_rotateX(0.8deg)_translateY(2px)_scale(1.03)]"
								: "md:origin-center md:[transform:perspective(1100px)_rotateY(-8deg)_rotateX(1deg)_translateY(8px)_scale(1.015)] md:hover:[transform:perspective(1100px)_rotateY(-4deg)_rotateX(0.3deg)_translateY(2px)_scale(1.025)]";

					return (
					<section
						key={segment.title}
						className={[
							"rounded-[1.75rem] border border-white/10 bg-[#0f172a]/60 p-6 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/50 hover:shadow-cyan",
							segmentSlantClass,
						].join(" ")}>
						<div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-500/10 text-cyan-200">
							<SegmentIcon title={segment.title} />
						</div>
						<p className="text-xs uppercase tracking-[0.14em] text-cyan-200">
							{segment.eyebrow}
						</p>
						<h2 className="mt-2 text-2xl font-medium text-white">
							{segment.title}
						</h2>
						<p className="mt-4 text-[0.95rem] leading-7 text-slate-300/90">
							{segment.description}
						</p>
						<p className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2.5 text-[0.76rem] font-medium tracking-[0.08em] text-cyan-100/95">
							{segment.highlight}
						</p>
						<ul className="mt-5 space-y-3 text-[0.94rem] text-slate-300/90">
							{segment.points.map((point) => (
								<li
									key={point}
									className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-3 leading-6">
									{point}
								</li>
							))}
						</ul>
					</section>
					);
				})}
			</div>

			<section className="mt-10 rounded-[2rem] border border-white/10 bg-slate-950/40 p-7 sm:p-9">
				<p className="text-xs uppercase tracking-[0.16em] text-cyan-200">
					Real Scenarios
				</p>
				<div className="mt-4 grid gap-4 md:grid-cols-3">
					{scenarioRows.map((scenario, index) => {
						const scenarioSlantClass =
							index === 0
								? "md:origin-center md:[transform:perspective(1100px)_rotateY(9deg)_rotateX(1deg)_translateY(8px)_scale(1.015)] md:hover:[transform:perspective(1100px)_rotateY(5deg)_rotateX(0.4deg)_translateY(2px)_scale(1.025)]"
								: index === 1
									? "md:origin-center md:[transform:perspective(1100px)_rotateY(-7deg)_rotateX(0.8deg)_translateY(8px)_scale(1.015)] md:hover:[transform:perspective(1100px)_rotateY(-3deg)_rotateX(0.2deg)_translateY(2px)_scale(1.025)]"
									: "md:origin-center md:[transform:perspective(1100px)_rotateY(7deg)_rotateX(0.8deg)_translateY(8px)_scale(1.015)] md:hover:[transform:perspective(1100px)_rotateY(3deg)_rotateX(0.2deg)_translateY(2px)_scale(1.025)]";

						return (
						<article
							key={scenario.title}
							className={[
								"rounded-2xl border border-white/10 bg-slate-900/55 p-5",
								scenarioSlantClass,
							].join(" ")}>
							<p className="text-xs uppercase tracking-[0.14em] text-slate-400">
								{scenario.audience}
							</p>
							<h3 className="mt-2 text-xl font-medium text-white">
								{scenario.title}
							</h3>
							<p className="mt-3 text-[0.95rem] leading-7 text-slate-300/90">
								{scenario.copy}
							</p>
						</article>
						);
					})}
				</div>

				<div className="mt-7 flex flex-wrap gap-3">
					<Link
						href="https://peers-app.vercel.app/app"
						className="rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.03] hover:bg-cyan-300">
						Open Workspace
					</Link>
					<Link
						href="/product"
						className="rounded-full border border-line bg-panel px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/70 hover:text-cyan-100">
						See Product Details
					</Link>
				</div>
			</section>
		</div>
	);
}
