"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function buildCandidates(src) {
	if (!src) return [];

	const extMatch = src.match(/\.(png|jpe?g|webp)$/i);
	if (extMatch) {
		const provided =
			extMatch[1].toLowerCase() === "jpg"
				? "jpeg"
				: extMatch[1].toLowerCase();
		const base = src.replace(/\.(png|jpe?g|webp)$/i, "");
		const allExt = ["png", "jpeg", "webp"];
		return [
			`${base}.${provided}`,
			...allExt
				.filter((ext) => ext !== provided)
				.map((ext) => `${base}.${ext}`),
		];
	}

	return ["png", "jpeg", "webp"].map((ext) => `${src}.${ext}`);
}

export default function ScreenshotShowcase({ items, audienceGroups = [] }) {
	if (!items?.length) return null;

	const intervalMs = 5200;
	const [active, setActive] = useState(0);
	const [imgIndex, setImgIndex] = useState(0);
	const [imgFailed, setImgFailed] = useState(false);
	const [direction, setDirection] = useState("next");
	const [isPaused, setIsPaused] = useState(false);
	const marqueeTrackRef = useRef(null);
	const marqueeGroupRef = useRef(null);

	const activeItem = items[active];
	const candidates = useMemo(
		() => buildCandidates(activeItem?.src || ""),
		[activeItem?.src],
	);

	useEffect(() => {
		setImgIndex(0);
		setImgFailed(false);
	}, [activeItem?.src]);

	useEffect(() => {
		if (isPaused || items.length <= 1) return;

		const timer = window.setInterval(() => {
			setDirection("next");
			setActive((current) => (current + 1) % items.length);
		}, intervalMs);

		return () => window.clearInterval(timer);
	}, [isPaused, items.length, intervalMs]);

	useEffect(() => {
		if (items.length <= 1) return;

		function handleKey(event) {
			if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;

			event.preventDefault();
			if (event.key === "ArrowRight") {
				setDirection("next");
				setActive((current) => (current + 1) % items.length);
				return;
			}

			setDirection("prev");
			setActive((current) => (current - 1 + items.length) % items.length);
		}

		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [items.length]);

	useEffect(() => {
		if (!audienceGroups.length) return;

		const track = marqueeTrackRef.current;
		const group = marqueeGroupRef.current;
		if (!track || !group) return;

		let rafId = 0;
		let lastTs = 0;
		let offset = 0;
		let groupWidth = 0;
		const speedPxPerSecond = 38;
		const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		let reducedMotion = mediaQuery.matches;

		const applyOffset = () => {
			track.style.transform = `translate3d(${-offset}px, 0, 0)`;
		};

		const measure = () => {
			groupWidth = group.getBoundingClientRect().width;
			if (groupWidth <= 0) return;
			offset = ((offset % groupWidth) + groupWidth) % groupWidth;
			applyOffset();
		};

		const step = (ts) => {
			if (!lastTs) lastTs = ts;
			const dt = (ts - lastTs) / 1000;
			lastTs = ts;

			if (!reducedMotion && groupWidth > 0) {
				offset += speedPxPerSecond * dt;
				if (offset >= groupWidth) offset -= groupWidth;
				applyOffset();
			}

			rafId = window.requestAnimationFrame(step);
		};

		const resizeObserver = new ResizeObserver(measure);
		resizeObserver.observe(group);

		const onResize = () => measure();
		const onMotionChange = (event) => {
			reducedMotion = event.matches;
			lastTs = 0;
		};

		window.addEventListener("resize", onResize);
		mediaQuery.addEventListener("change", onMotionChange);

		measure();
		rafId = window.requestAnimationFrame(step);

		return () => {
			if (rafId) window.cancelAnimationFrame(rafId);
			window.removeEventListener("resize", onResize);
			mediaQuery.removeEventListener("change", onMotionChange);
			resizeObserver.disconnect();
			if (track) track.style.transform = "translate3d(0, 0, 0)";
		};
	}, [audienceGroups]);

	const activeSrc = candidates[imgIndex] || "";
	const showPlaceholder = !activeItem?.src || imgFailed || !activeSrc;
	const marqueeItems = useMemo(
		() => [...audienceGroups, ...audienceGroups],
		[audienceGroups],
	);
	const isMobileShot = Boolean(
		activeItem?.kind === "mobile" ||
		/mobile|portrait|phone/i.test(
			`${activeItem?.title || ""} ${activeItem?.navLabel || ""} ${activeItem?.src || ""}`,
		),
	);

	return (
		<div
			className="showcase-wrap"
			onMouseEnter={() => setIsPaused(true)}
			onMouseLeave={() => setIsPaused(false)}
			onFocusCapture={() => setIsPaused(true)}
			onBlurCapture={() => setIsPaused(false)}>
			<div className="showcase-frame">
				<div className="showcase-screen relative overflow-hidden">
					<div
						key={activeItem.title}
						className={[
							"animate-screenshot-in screenshot-layer",
							direction === "next"
								? "animate-slide-next"
								: "animate-slide-prev",
						].join(" ")}>
						<div className="screenshot-stage">
							{!showPlaceholder && !isMobileShot && (
								<img
									src={activeSrc}
									alt={`${activeItem.title} screenshot`}
									className="desktop-shot-image"
									onError={() => {
										if (imgIndex < candidates.length - 1) {
											setImgIndex((idx) => idx + 1);
											return;
										}
										setImgFailed(true);
									}}
								/>
							)}

							{!showPlaceholder && isMobileShot && (
								<div className="mobile-shot-shell">
									<img
										src={activeSrc}
										alt={`${activeItem.title} screenshot`}
										className="mobile-shot-image"
										onError={() => {
											if (imgIndex < candidates.length - 1) {
												setImgIndex((idx) => idx + 1);
												return;
											}
											setImgFailed(true);
										}}
									/>
								</div>
							)}

							{showPlaceholder && (
								<div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-500/10 via-slate-900 to-blue-500/10 p-6 text-center text-sm text-slate-400">
									Screenshot placeholder
								</div>
							)}
						</div>
					</div>
				</div>
			</div>

			<div className="showcase-lower-band audience-band-edge bg-[#010617] px-4 pb-7 pt-5 sm:px-6">
				<div className="flex justify-center">
					<div className="inline-flex flex-wrap items-center justify-center gap-1 rounded-full border border-white/15 bg-[#030713]/90 p-1.5">
						{items.map((item, idx) => {
							const selected = idx === active;
							return (
								<button
									key={item.title}
									type="button"
									onClick={() => {
										if (idx === active) return;
										setDirection(idx > active ? "next" : "prev");
										setActive(idx);
									}}
									className={[
										"rounded-full px-4 py-2 text-sm transition",
										selected
											? "border border-white/25 bg-white/10 text-slate-100"
											: "text-slate-300 hover:bg-slate-800/80 hover:text-white",
									].join(" ")}
									aria-label={`Show ${item.title}`}>
									{item.navLabel}
								</button>
							);
						})}
					</div>
				</div>

				<div className="mx-auto mt-5 max-w-3xl text-center">
					<h3 className="text-xl font-semibold text-white">
						{activeItem.title}
					</h3>
					<p className="mt-2 text-sm text-slate-400">
						{activeItem.caption}
					</p>
				</div>

				{audienceGroups.length > 0 && (
					<div className="showcase-audience mt-8 pt-2">
						<div className="audience-marquee-viewport mt-2">
							<div
								className="audience-marquee-track"
								ref={marqueeTrackRef}>
								<div
									className="audience-marquee-group"
									ref={marqueeGroupRef}>
									{marqueeItems.map((group, idx) => (
										<span
											key={`group-a-${group.label}-${idx}`}
											className="audience-logo">
											<span
												className="audience-logo-icon"
												aria-hidden="true">
												{group.icon ||
													group.label.slice(0, 2).toUpperCase()}
											</span>
											{group.label}
										</span>
									))}
								</div>
								<div
									className="audience-marquee-group"
									aria-hidden="true">
									{marqueeItems.map((group, idx) => (
										<span
											key={`group-b-${group.label}-${idx}`}
											className="audience-logo">
											<span
												className="audience-logo-icon"
												aria-hidden="true">
												{group.icon ||
													group.label.slice(0, 2).toUpperCase()}
											</span>
											{group.label}
										</span>
									))}
								</div>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
