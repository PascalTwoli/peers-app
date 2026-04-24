import Link from "next/link";
import { APP_WORKSPACE_URL } from "../../lib/config";

const principles = [
	{
		title: "Context First",
		copy: "Rooms, chat, calls, and people stay connected so teams can decide without losing the thread.",
	},
	{
		title: "Human Tempo",
		copy: "Built for real conversations and quick alignment, not heavy process or enterprise complexity.",
	},
	{
		title: "Community Native",
		copy: "Designed for student groups, communities, and small teams that collaborate with a social rhythm.",
	},
	{
		title: "Cross-Device Clarity",
		copy: "The same collaboration quality carries from desktop sessions to mobile catch-ups.",
	},
];

const timeline = [
	{
		stage: "Why We Started",
		detail:
			"We saw groups jump between tools for chat, calls, and coordination, losing context at every handoff.",
	},
	{
		stage: "What We Built",
		detail:
			"Peers unifies rooms, messages, calls, and presence into one collaboration layer that feels immediate.",
	},
	{
		stage: "Where We Are Going",
		detail:
			"We are refining richer room experiences, smarter presence, and smoother real-time collaboration across platforms.",
	},
];

export default function AboutPage() {
	return (
		<div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
			<section className="grid gap-10 md:grid-cols-[1.05fr_0.95fr] md:items-start">
				<div>
					<p className="text-xs uppercase tracking-[0.18em] text-cyan-200">
						About Peers
					</p>
					<h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
						A quieter, more human way to collaborate in real time
					</h1>
				</div>

				<div className="space-y-5 text-[0.98rem] leading-8 text-slate-300/90">
					<p>
						Peers started with a simple belief: people collaborate best when
						communication feels natural. Most tools split chat, calls, rooms,
						and context into disconnected workflows.
					</p>
					<p>
						We built Peers to bring those moments together into one social
						workspace where groups can create rooms, invite people, jump into
						live calls, and keep momentum without switching apps.
					</p>
				</div>
			</section>

			<section className="mt-12 border-t border-white/10 pt-10">
				<div className="mb-6 flex items-end justify-between gap-4">
					<div>
						<p className="text-xs uppercase tracking-[0.16em] text-cyan-200">
							Design Principles
						</p>
						<h2 className="mt-2 text-3xl font-semibold text-white">
							How We Make Product Decisions
						</h2>
					</div>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					{principles.map((item) => (
						<article
							key={item.title}
							className="rounded-2xl border border-white/10 bg-slate-900/55 p-6 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/45 hover:shadow-cyan">
							<h3 className="text-xl font-medium text-white">{item.title}</h3>
							<p className="mt-3 text-[0.95rem] leading-7 text-slate-300/90">
								{item.copy}
							</p>
						</article>
					))}
				</div>
			</section>

			<section className="mt-12 grid gap-8 rounded-[2rem] border border-white/10 bg-[#0f172a]/50 p-7 sm:p-9 md:grid-cols-[0.9fr_1.1fr]">
				<div>
					<p className="text-xs uppercase tracking-[0.16em] text-cyan-200">
						Journey
					</p>
					<h2 className="mt-2 text-3xl font-semibold text-white">
						From Friction to Flow
					</h2>
					<p className="mt-4 text-[0.96rem] leading-7 text-slate-300/90">
						Every release is guided by one goal: make real-time teamwork feel
						effortless for communities and small teams.
					</p>
				</div>

				<div className="space-y-4">
					{timeline.map((item, idx) => (
						<div
							key={item.stage}
							className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
							<p className="text-xs uppercase tracking-[0.12em] text-cyan-200/90">
								0{idx + 1} · {item.stage}
							</p>
							<p className="mt-2 text-[0.95rem] leading-7 text-slate-300/90">
								{item.detail}
							</p>
						</div>
					))}
				</div>
			</section>

			<section className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-8">
				<p className="max-w-2xl text-[0.95rem] leading-7 text-slate-300/90">
					Peers is evolving into the go-to social workspace for collaborative
					communities with richer rooms, smarter presence, and frictionless
					real-time experiences.
				</p>
				<div className="flex flex-wrap gap-3">
					<Link
						href={APP_WORKSPACE_URL}
						className="rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.03] hover:bg-cyan-300">
						Open Workspace
					</Link>
					<Link
						href="/product"
						className="rounded-full border border-line bg-panel px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/70 hover:text-cyan-100">
						Explore Product
					</Link>
				</div>
			</section>
		</div>
	);
}
