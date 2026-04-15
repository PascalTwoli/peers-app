export default function AboutPage() {
	return (
		<div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 md:py-20">
			<p className="text-xs uppercase tracking-[0.18em] text-cyan-300">
				About Peers
			</p>
			<h1 className="mt-2 text-4xl font-semibold text-white sm:text-5xl">
				A social-first vision for collaboration
			</h1>

			<div className="mt-8 space-y-5 text-slate-300">
				<p>
					Peers started with a simple belief: people collaborate best when
					communication feels natural. Most tools split chat, calls, rooms,
					and context into disconnected workflows.
				</p>
				<p>
					We built Peers to bring those experiences together into one
					modern social workspace. You can create rooms, invite people,
					jump into live calls, and keep momentum without changing apps.
				</p>
				<p>
					Our focus is friendly, fast, and flexible collaboration for
					student groups, communities, friend circles, and small teams.
					Every release pushes toward one goal: making real-time teamwork
					feel effortless and human.
				</p>
			</div>

			<div className="mt-10 rounded-[2rem] border border-cyan-400/30 bg-gradient-to-r from-cyan-500/15 to-blue-500/15 p-8">
				<h2 className="text-2xl font-semibold text-white">
					Where we are headed
				</h2>
				<p className="mt-3 text-sm leading-relaxed text-slate-200">
					We are evolving Peers into the go-to social workspace for
					collaborative communities: richer rooms, smarter presence, and
					frictionless real-time experiences across desktop and mobile.
				</p>
			</div>
		</div>
	);
}
