import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";

export default function BatchPhotoPreviewModal({ files, fileKind = "photo", onSend, onClose }) {
	const [caption, setCaption] = useState("");
	const [previews, setPreviews] = useState([]);
	const captionRef = useRef(null);

	useEffect(() => {
		if (!files?.length) return;
		const urls = files.map((f) => ({
			url: URL.createObjectURL(f),
			name: f.name,
			isImage: f.type.startsWith("image/"),
		}));
		setPreviews(urls);
		return () => urls.forEach((u) => URL.revokeObjectURL(u.url));
	}, [files]);

	useEffect(() => {
		captionRef.current?.focus();
	}, []);

	if (!files?.length) return null;

	const handleSend = () => {
		onSend(files, caption.trim(), fileKind);
		onClose();
	};

	return (
		<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm">
			<div className="bg-[#1e1e1e] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg mx-0 sm:mx-4 overflow-hidden shadow-2xl border border-white/10 flex flex-col max-h-[90vh]">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
					<span className="font-semibold">
						{files.length} {files.length === 1 ? "photo" : "photos"} selected
					</span>
					<button
						onClick={onClose}
						className="p-2 rounded-full hover:bg-white/10 transition-colors">
						<X className="w-5 h-5" />
					</button>
				</div>

				{/* Thumbnail grid */}
				<div className="flex-1 overflow-y-auto p-3">
					<div
						className={
							previews.length === 1
								? "flex justify-center"
								: "grid grid-cols-3 gap-2"
						}>
						{previews.map((p, i) => (
							<div
								key={i}
								className={
									previews.length === 1
										? "w-full max-h-[50vh] rounded-xl overflow-hidden bg-black/30"
										: "aspect-square rounded-xl overflow-hidden bg-black/30"
								}>
								{p.isImage ? (
									<img
										src={p.url}
										alt={p.name}
										className="w-full h-full object-cover"
									/>
								) : (
									<div className="w-full h-full flex items-center justify-center p-2">
										<p className="text-xs text-white/60 text-center truncate">
											{p.name}
										</p>
									</div>
								)}
							</div>
						))}
					</div>
				</div>

				{/* Caption + send */}
				<div className="px-4 pb-4 pt-2 border-t border-white/10 flex-shrink-0">
					<div className="flex items-end gap-2">
						<textarea
							ref={captionRef}
							value={caption}
							onChange={(e) => {
								setCaption(e.target.value);
								e.target.style.height = "auto";
								e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px";
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									handleSend();
								}
							}}
							placeholder="Add a caption…"
							rows={1}
							className="flex-1 py-2.5 px-3 bg-surface-light rounded-2xl text-white outline-none text-sm resize-none overflow-y-auto max-h-24 border border-white/10 focus:border-primary/50 transition-colors"
							style={{ lineHeight: "1.5" }}
						/>
						<button
							onClick={handleSend}
							className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover rounded-full font-semibold transition-colors text-sm">
							<Send className="w-4 h-4" />
							Send
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
