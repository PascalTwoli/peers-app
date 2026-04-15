import Link from "next/link";

export default function Footer() {
	return (
		<footer className="border-t border-line/90 bg-panel/80">
			<div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2">
				<div>
					<div className="inline-flex items-center gap-2">
						<span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 text-sm font-semibold text-cyan-200">
							P
						</span>
						<span className="text-lg font-semibold text-white">
							Peers
						</span>
					</div>
					<p className="mt-3 max-w-md text-sm text-slate-400">
						A social workspace for student groups, communities, friends,
						and teams that want to chat, call, and collaborate in real
						time.
					</p>
				</div>

				<div className="grid grid-cols-2 gap-6 text-sm">
					<div>
						<p className="mb-3 text-slate-200">Explore</p>
						<div className="space-y-2 text-slate-400">
							<Link
								href="/product"
								className="block hover:text-cyan-200">
								Product
							</Link>
							<Link
								href="/use-cases"
								className="block hover:text-cyan-200">
								Use Cases
							</Link>
							<Link href="/about" className="block hover:text-cyan-200">
								About
							</Link>
						</div>
					</div>
					<div>
						<p className="mb-3 text-slate-200">Action</p>
						<div className="space-y-2 text-slate-400">
							<Link href="/#cta" className="block hover:text-cyan-200">
								Try Peers
							</Link>
							<Link
								href="/#preview"
								className="block hover:text-cyan-200">
								See Screens
							</Link>
						</div>
					</div>
				</div>
			</div>
			<div className="border-t border-line/70 px-4 py-4 text-center text-xs text-slate-500">
				© {new Date().getFullYear()} Peers. Built for social collaboration.
			</div>
		</footer>
	);
}
