const segments = [
	{
		title: "Students",
		points: [
			"Create a room for every subject, project, or study sprint.",
			"Jump from text to video for revision and deadline crunch sessions.",
			"Share files and keep everyone aligned in one place.",
		],
	},
	{
		title: "Online Communities",
		points: [
			"Host social rooms for events, discussion circles, and interest channels.",
			"Make onboarding easier with persistent spaces and live support calls.",
			"Keep engagement high with real-time presence and instant conversations.",
		],
	},
	{
		title: "Small Teams",
		points: [
			"Coordinate lightweight projects without heavy enterprise overhead.",
			"Use room calls for standups, reviews, and quick alignment.",
			"Centralize communication so context is never lost.",
		],
	},
];

export default function UseCasesPage() {
	return (
		<div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
			<p className="text-xs uppercase tracking-[0.18em] text-cyan-300">
				Use Cases
			</p>
			<h1 className="mt-2 max-w-3xl text-4xl font-semibold text-white sm:text-5xl">
				Built for people who collaborate in real life
			</h1>
			<p className="mt-5 max-w-3xl text-slate-300">
				Peers adapts to social and team dynamics, whether you are studying,
				building a community, or shipping with a small crew.
			</p>

			<div className="mt-10 grid gap-5 md:grid-cols-3">
				{segments.map((segment) => (
					<section
						key={segment.title}
						className="rounded-[1.75rem] border border-line bg-panel/75 p-6 transition hover:-translate-y-1 hover:border-cyan-400/60 hover:shadow-cyan">
						<h2 className="text-2xl font-semibold text-white">
							{segment.title}
						</h2>
						<ul className="mt-4 space-y-3 text-sm text-slate-300">
							{segment.points.map((point) => (
								<li
									key={point}
									className="rounded-2xl border border-line bg-slate-900/60 px-3 py-2">
									{point}
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</div>
	);
}
