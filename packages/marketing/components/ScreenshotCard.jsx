"use client";

import { useEffect, useMemo, useState } from "react";

export default function ScreenshotCard({
	title,
	caption,
	src,
	ratio = "aspect-video",
}) {
	const candidates = useMemo(() => {
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
	}, [src]);

	const [currentIndex, setCurrentIndex] = useState(0);
	const [hasError, setHasError] = useState(false);

	useEffect(() => {
		setCurrentIndex(0);
		setHasError(false);
	}, [src]);

	const activeSrc = candidates[currentIndex] || "";

	const showPlaceholder = useMemo(
		() => !src || hasError || !activeSrc,
		[src, hasError, activeSrc],
	);

	return (
		<div className="group rounded-3xl border border-line bg-panel/90 p-3 transition duration-300 hover:-translate-y-1 hover:border-cyan-400/60 hover:shadow-cyan">
			<div
				className={`${ratio} relative overflow-hidden rounded-2xl border border-line bg-slate-900/80`}>
				{!showPlaceholder && (
					<img
						src={activeSrc}
						alt={`${title} screenshot`}
						className="h-full w-full object-cover"
						onError={() => {
							if (currentIndex < candidates.length - 1) {
								setCurrentIndex((idx) => idx + 1);
								return;
							}
							setHasError(true);
						}}
					/>
				)}

				{showPlaceholder && (
					<div className="flex h-full items-center justify-center bg-gradient-to-br from-cyan-500/10 via-slate-900 to-blue-500/10 p-6 text-center text-sm text-slate-400">
						Screenshot placeholder
					</div>
				)}
			</div>
			<div className="px-1 pb-1 pt-3">
				<h3 className="text-base font-semibold text-white">{title}</h3>
				<p className="mt-1 text-sm text-slate-400">{caption}</p>
			</div>
		</div>
	);
}
