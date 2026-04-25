"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { APP_WORKSPACE_URL } from "../lib/config";

const navItems = [
	{ name: "Home", href: "/" },
	{ name: "Product", href: "/product" },
	{ name: "Use Cases", href: "/use-cases" },
	{ name: "About", href: "/about" },
];

function navClass(isActive) {
	return [
		"rounded-full px-4 py-2 text-sm transition",
		isActive
			? "bg-cyan-500/20 text-cyan-300"
			: "text-slate-300 hover:bg-slate-800/80 hover:text-white",
	].join(" ");
}

export default function Navbar() {
	const pathname = usePathname();
	const [open, setOpen] = useState(false);

	// On the home page, scroll to the CTA section first; everywhere else go direct
	const ctaHref = pathname === "/" ? "/#cta" : APP_WORKSPACE_URL;

	return (
		<header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4">
			<div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 rounded-2xl border border-white/15 bg-slate-950/35 px-4 py-3 shadow-[0_12px_36px_rgba(2,8,22,0.42)] backdrop-blur-xl sm:px-6">
				<Link href="/" className="group inline-flex items-center gap-2">
					<span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 text-sm font-semibold text-cyan-200 shadow-cyan">
						P
					</span>
					<span className="text-lg font-semibold tracking-wide text-white">
						Peers
					</span>
				</Link>

				<nav className="hidden items-center gap-2 md:flex">
					{navItems.map((item) => (
						<Link
							key={item.href}
							href={item.href}
							className={navClass(pathname === item.href)}>
							{item.name}
						</Link>
					))}
				</nav>

				<div className="hidden md:block">
					<Link
						href={ctaHref}
						className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:scale-[1.03] hover:bg-cyan-300">
						Open Workspace
					</Link>
				</div>

				<button
					type="button"
					onClick={() => setOpen((v) => !v)}
					className="rounded-xl border border-white/20 bg-slate-900/50 px-3 py-2 text-sm text-slate-200 md:hidden"
					aria-label="Toggle menu">
					Menu
				</button>
			</div>

			{open && (
				<div className="mx-auto mt-2 w-full max-w-6xl rounded-2xl border border-white/15 bg-slate-950/65 px-4 py-4 shadow-[0_12px_34px_rgba(2,8,22,0.5)] backdrop-blur-xl md:hidden">
					<div className="flex flex-col gap-2">
						{navItems.map((item) => (
							<Link
								key={item.href}
								href={item.href}
								className={navClass(pathname === item.href)}
								onClick={() => setOpen(false)}>
								{item.name}
							</Link>
						))}
						<Link
							href={ctaHref}
							className="mt-2 rounded-full bg-cyan-500 px-4 py-2 text-center text-sm font-semibold text-slate-950"
							onClick={() => setOpen(false)}>
							Open Workspace
						</Link>
					</div>
				</div>
			)}
		</header>
	);
}
