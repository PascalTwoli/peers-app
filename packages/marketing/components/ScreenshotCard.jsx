"use client";

import { useEffect, useMemo, useState } from "react";

export default function ScreenshotCard({
	title,
	caption,
	src,
	ratio = "aspect-video",
	desktopSlant = "side",
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
	const isMobileShot = useMemo(
		() =>
			ratio.includes("10/16") ||
			/mobile|portrait|phone/i.test(`${title || ""} ${src || ""}`),
		[ratio, title, src],
	);

	const showPlaceholder = useMemo(
		() => !src || hasError || !activeSrc,
		[src, hasError, activeSrc],
	);
	const desktopShellClass = useMemo(() => {
		if (desktopSlant === "backward") {
			return "w-full rounded-[0.8rem] border border-white/10 bg-[#020712] p-1.5 md:origin-center md:transition-transform md:duration-500 md:[transform:perspective(1200px)_rotateY(23deg)_rotateX(2deg)_scale(1.08)] md:group-hover:[transform:perspective(1200px)_rotateY(17deg)_rotateX(1deg)_scale(1.1)]";
		}

		if (desktopSlant === "none") {
			return "w-full rounded-[0.8rem] border border-white/10 bg-[#020712] p-1.5";
		}

		return "w-full rounded-[0.8rem] border border-white/10 bg-[#020712] p-1.5";
	}, [desktopSlant]);

	const desktopInnerClass = useMemo(() => {
		if (desktopSlant === "backward") {
			return "md:transition-transform md:duration-500";
		}

		if (desktopSlant === "none") {
			return "";
		}

		return "md:origin-center md:-rotate-[1.3deg] md:scale-[1.03] md:transition-transform md:duration-500 md:group-hover:rotate-0 md:group-hover:scale-[1.05]";
	}, [desktopSlant]);

	return (
		<div className="group rounded-3xl border border-line bg-panel/90 p-3 transition duration-300 hover:-translate-y-1 hover:border-cyan-400/60 hover:shadow-cyan">
			<div
				className={`${ratio} relative overflow-hidden rounded-2xl border border-line bg-slate-900/80 p-2`}>
				{!showPlaceholder && (
					<div className="flex h-full w-full items-center justify-center rounded-xl bg-[#020916]/90">
						<div
							className={[
								"h-full",
								isMobileShot
									? "mx-auto aspect-[10/16] h-full w-auto max-w-[82%] min-w-[210px] rounded-[1rem] border border-white/10 bg-[#020712] p-1.5 sm:min-w-[230px] md:origin-center md:rotate-[1.8deg] md:scale-[1.01] md:transition-transform md:duration-500 md:group-hover:rotate-[0.6deg] md:group-hover:scale-[1.035]"
									: desktopShellClass,
							].join(" ")}>
							<div
								className={[
									"h-full w-full overflow-hidden rounded-[0.75rem]",
									isMobileShot ? "" : desktopInnerClass,
								].join(" ")}>
								<img
									src={activeSrc}
									alt={`${title} screenshot`}
									className={[
										"h-full w-full transition duration-500",
										isMobileShot
											? "object-contain rounded-[0.75rem] bg-[#020712] group-hover:scale-[1.016]"
											: "object-cover object-center rounded-[0.75rem] md:group-hover:scale-[1.04]",
									].join(" ")}
									onError={() => {
										if (currentIndex < candidates.length - 1) {
											setCurrentIndex((idx) => idx + 1);
											return;
										}
										setHasError(true);
									}}
								/>
							</div>
						</div>
					</div>
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
