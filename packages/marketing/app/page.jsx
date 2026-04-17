"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ScreenshotShowcase from "@/components/ScreenshotShowcase";

const features = [
	{
		title: "Smart Chat",
		icon: "chat",
		copy: "Stay in sync with fast messaging, reactions, and search that keeps context close.",
	},
	{
		title: "Team Rooms",
		icon: "users",
		copy: "Organize conversations by purpose with lightweight rooms for every idea and project.",
	},
	{
		title: "Live Calls",
		icon: "call",
		copy: "Switch from text to voice or video instantly with room-level calling built in.",
	},
	{
		title: "File Sharing",
		icon: "share",
		copy: "Share screenshots, docs, and updates directly in chat without breaking momentum.",
	},
	{
		title: "Real-time Presence",
		icon: "pulse",
		copy: "Know who is online and available so teams can collaborate at the perfect moment.",
	},
];

function FeatureIcon({ icon }) {
	if (icon === "users") {
		return (
			<svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
				<path
					d="M16 19v-1a3 3 0 0 0-3-3h-2a3 3 0 0 0-3 3v1M18 9a2 2 0 1 1 0 4M6 9a2 2 0 1 0 0 4M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.8"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);
	}

	if (icon === "call") {
		return (
			<svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
				<path
					d="M15.6 15.3c-.9.9-2.2 1.3-3.4.8-1.4-.6-2.8-1.8-4-3.1-1.3-1.3-2.5-2.7-3.1-4-.5-1.2-.1-2.5.8-3.4l1.2-1.2a1.6 1.6 0 0 1 2.4.2l1.5 2.1a1.6 1.6 0 0 1-.1 2l-.9 1a13.5 13.5 0 0 0 4.3 4.3l1-.9a1.6 1.6 0 0 1 2-.1l2.1 1.5a1.6 1.6 0 0 1 .2 2.4l-1.2 1.2z"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.7"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);
	}

	if (icon === "share") {
		return (
			<svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
				<path
					d="M9 12l6-4M9 12l6 4M9 12a2.5 2.5 0 1 1-2.5-2.5A2.5 2.5 0 0 1 9 12zm10-4a2.5 2.5 0 1 1-2.5-2.5A2.5 2.5 0 0 1 19 8zm0 8a2.5 2.5 0 1 1-2.5-2.5A2.5 2.5 0 0 1 19 16z"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.7"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);
	}

	if (icon === "pulse") {
		return (
			<svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
				<path
					d="M3 12h4l2.2-4 3.2 8 2.3-4H21"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.8"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);
	}

	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
			<path
				d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v6A2.5 2.5 0 0 1 16.5 16h-5.4l-3.6 3v-3H7.5A2.5 2.5 0 0 1 5 13.5v-6z"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

const previewScreens = [
	{
		title: "Room Call Dashboard",
		navLabel: "Rooms",
		caption: "Desktop call layout with chat panel and active participants.",
		src: "/screenshots/room-call-desktop.png",
	},
	{
		title: "Room Call on Mobile",
		navLabel: "Mobile",
		kind: "mobile",
		caption:
			"Responsive mobile experience for calls, controls, and participant tiles.",
		src: "/screenshots/room-call-mobile.png",
	},
	{
		title: "1:1 Audio Call",
		navLabel: "Audio",
		caption:
			"Focused audio call mode for fast check-ins and voice-first conversations.",
		src: "/screenshots/audio-call-desktop.png",
	},
	{
		title: "Direct Messaging",
		navLabel: "Chat",
		caption:
			"Friendly message timeline built for casual social and team conversations.",
		src: "/screenshots/chat-desktop.png",
	},
	{
		title: "Direct Messaging on Mobile",
		navLabel: "DM Mobile",
		kind: "mobile",
		caption:
			"Optimized mobile chat with large touch targets and clear reading flow.",
		src: "/screenshots/chat-mobile.png",
	},
	{
		title: "Peers Directory",
		navLabel: "People",
		kind: "mobile",
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

const audienceGroups = [
	{ icon: "ST", label: "Students" },
	{ icon: "CL", label: "Classmates" },
	{ icon: "CM", label: "Online Communities" },
	{ icon: "SG", label: "Study Groups" },
	{ icon: "FR", label: "Friend Circles" },
	{ icon: "EC", label: "Event Clubs" },
	{ icon: "TM", label: "Small Teams" },
	{ icon: "CR", label: "Creators" },
	{ icon: "NM", label: "Nonprofits" },
];

export default function HomePage() {
	const [heroProgress, setHeroProgress] = useState(0);
	const targetProgressRef = useRef(0);
	const animationFrameRef = useRef(0);

	const animateToTarget = () => {
		setHeroProgress((current) => {
			const target = targetProgressRef.current;
			const next = current + (target - current) * 0.14;

			if (Math.abs(target - next) < 0.0015) {
				animationFrameRef.current = 0;
				return target;
			}

			animationFrameRef.current =
				window.requestAnimationFrame(animateToTarget);
			return next;
		});
	};

	useEffect(() => {
		const updateTarget = () => {
			const viewportHeight = Math.max(window.innerHeight, 1);
			const transitionDistance = viewportHeight * 1.08;
			const next = Math.min(window.scrollY / transitionDistance, 1);
			targetProgressRef.current = next;

			if (!animationFrameRef.current) {
				animationFrameRef.current =
					window.requestAnimationFrame(animateToTarget);
			}
		};

		const onScroll = () => {
			updateTarget();
		};

		updateTarget();
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onScroll);

		return () => {
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onScroll);
			if (animationFrameRef.current) {
				window.cancelAnimationFrame(animationFrameRef.current);
				animationFrameRef.current = 0;
			}
		};
	}, []);

	const heroStyle = useMemo(() => {
		const eased = 1 - (1 - heroProgress) ** 2.15;
		const opacity = 1 - eased;
		const scale = 1 - eased * 0.2;
		const y = eased * 34;
		const saturation = 1 - eased * 0.16;
		const brightness = 1 - eased * 0.26;
		const pointerEvents = heroProgress > 0.88 ? "none" : "auto";

		return {
			opacity,
			transform: `translate3d(0, ${y}px, 0) scale(${scale})`,
			filter: `saturate(${saturation}) brightness(${brightness})`,
			pointerEvents,
		};
	}, [heroProgress]);

	return (
		<div className="home-scroll-stack">
			<section
				className="hero-stage hero-box-shell grid-lines"
				style={heroStyle}>
				<div className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-20 sm:px-6 md:grid-cols-[1.2fr_0.8fr] md:items-end md:pb-24 md:pt-28">
					<div>
						<p className="mb-5 inline-flex w-fit items-center rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-200">
							Social Workspace for Real-Time Collaboration
						</p>
						<h1 className="max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl md:text-6xl">
							Peers - Chat, call, and collaborate in one social
							workspace.
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

					<div className="soft-glass rounded-2xl border border-white/10 p-4 md:p-5">
						<p className="text-xs uppercase tracking-[0.18em] text-slate-400">
							Live workspace snapshot
						</p>
						<div className="mt-4 rounded-xl border border-white/10 bg-[#0d1426] p-4">
							<div className="flex items-center justify-between text-xs text-slate-400">
								<span>Active rooms</span>
								<span className="font-semibold text-slate-200">12</span>
							</div>
							<div className="mt-2 h-2 w-full rounded-full bg-white/10">
								<div className="h-2 w-3/4 rounded-full bg-gradient-to-r from-blue-400 to-emerald-400" />
							</div>
							<div className="divider-x my-4" />
							<div className="space-y-2 text-sm text-slate-300">
								<p># design-reviews · 9 online</p>
								<p># growth-planning · 7 online</p>
								<p># sprint-room · call live</p>
							</div>
						</div>
					</div>
				</div>
			</section>

			<div className="hero-stage-spacer" aria-hidden="true" />

			<section
				id="preview"
				className="preview-stage mx-auto w-full max-w-5xl px-4 pb-4 pt-16 sm:px-6">
				<div className="mb-8 flex items-end justify-between gap-4">
					<div>
						<p className="text-xs uppercase tracking-[0.18em] text-cyan-300">
							Product Preview
						</p>
						<h2 className="mt-2 text-3xl font-semibold text-white">
							A clean product story, one screen at a time
						</h2>
					</div>
					<Link
						href="/product"
						className="text-sm text-cyan-300 hover:text-cyan-200">
						See full product view
					</Link>
				</div>
				<ScreenshotShowcase
					items={previewScreens}
					audienceGroups={audienceGroups}
				/>
			</section>

			<section className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
				<div className="pb-6">
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
								className="feature-card rounded-3xl border border-white/10 bg-slate-900/45 p-5">
								<span className="feature-icon-wrap" aria-hidden="true">
									<FeatureIcon icon={feature.icon} />
								</span>
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
				className="overlap-section mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
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

			<section className="overlap-section border-y border-white/10 bg-[#0d1426]/55">
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
				className="cta-sink-section mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:pb-20 md:pt-14">
				<div className="cta-sink-card rounded-t-[2rem] rounded-b-none border border-cyan-400/30 border-b-0 bg-gradient-to-r from-cyan-500/15 to-blue-500/15 p-8 text-center sm:p-10">
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
