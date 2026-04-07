import { useEffect, useMemo, useRef, useState } from "react";
import {
	ArrowLeft,
	Check,
	CheckCheck,
	Clock,
	Mic,
	MicOff,
	PhoneOff,
	Pin,
	ScreenShare,
	ScreenShareOff,
	SlidersHorizontal,
	Users,
	Video,
	VideoOff,
	MessageSquare,
	LayoutGrid,
	Monitor,
	PanelsTopLeft,
	X,
} from "lucide-react";
import clsx from "clsx";
import { useApp } from "../context/AppContext";

function getAvatarColor(name) {
	const hash = Array.from(name || "").reduce(
		(acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0,
		0,
	);
	const hue = Math.abs(hash) % 360;
	return `linear-gradient(135deg, hsl(${hue}, 72%, 48%), hsl(${(hue + 40) % 360}, 68%, 42%))`;
}

function getInitials(name) {
	if (!name) return "??";
	return name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.substring(0, 2);
}

function VideoSurface({ stream, isSelf, forceAvatar }) {
	const videoRef = useRef(null);

	useEffect(() => {
		if (!videoRef.current) {
			return;
		}
		videoRef.current.srcObject = stream || null;
	}, [stream]);

	const hasVideoTrack = Boolean(stream?.getVideoTracks?.().length);
	const showAvatar = forceAvatar || !hasVideoTrack;

	if (showAvatar) {
		return null;
	}

	return (
		<video
			ref={videoRef}
			autoPlay
			playsInline
			muted={isSelf}
			className="absolute inset-0 w-full h-full object-cover"
			style={isSelf ? { transform: "scaleX(-1)" } : undefined}
		/>
	);
}

function ParticipantTile({
	name,
	stream,
	isSelf,
	isFocused,
	isSpeaking,
	mediaState,
	onPin,
	isPinned,
	size = "small",
}) {
	const avatarOnly = Boolean(mediaState?.isVideoOff);

	return (
		<div
			className={clsx(
				"relative overflow-hidden rounded-2xl border bg-white/5",
				isFocused
					? "border-cyan-300/50 shadow-[0_0_0_1px_rgba(56,189,248,0.4)]"
					: "border-white/10",
				isSpeaking && "ring-2 ring-emerald-400/75",
				size === "large"
					? "min-h-[18rem] lg:min-h-[24rem]"
					: "min-h-32 lg:min-h-40",
			)}>
			<VideoSurface stream={stream} isSelf={isSelf} forceAvatar={avatarOnly} />

			<div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

			{(avatarOnly || !stream?.getVideoTracks?.().length) && (
				<div className="absolute inset-0 flex items-center justify-center">
					<div
						className="w-16 h-16 rounded-full text-white font-bold flex items-center justify-center shadow-lg"
						style={{ background: getAvatarColor(name) }}>
						{getInitials(name)}
					</div>
				</div>
			)}

			<div className="absolute top-2 left-2 flex items-center gap-1.5">
				<span className="px-2 py-1 rounded-md bg-black/50 text-xs font-medium">
					{isSelf ? "You" : name}
				</span>
				{isSpeaking && (
					<span className="px-2 py-1 rounded-md bg-emerald-500/70 text-[11px] font-semibold">
						Talking
					</span>
				)}
			</div>

			<div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/50 rounded-md px-1.5 py-1">
				{mediaState?.isMuted ? (
					<MicOff className="w-3.5 h-3.5 text-amber-300" />
				) : (
					<Mic className="w-3.5 h-3.5 text-emerald-300" />
				)}
				{mediaState?.isVideoOff ? (
					<VideoOff className="w-3.5 h-3.5 text-amber-300" />
				) : (
					<Video className="w-3.5 h-3.5 text-emerald-300" />
				)}
				{mediaState?.isScreenSharing && (
					<ScreenShare className="w-3.5 h-3.5 text-cyan-300" />
				)}
			</div>

			<button
				onClick={onPin}
				className={clsx(
					"absolute bottom-2 right-2 h-8 px-2 rounded-md text-xs flex items-center gap-1",
					isPinned
						? "bg-cyan-500 text-black"
						: "bg-black/55 hover:bg-black/70 text-white",
				)}>
				<Pin className="w-3 h-3" />
				{isPinned ? "Pinned" : "Pin"}
			</button>
		</div>
	);
}

function RoomChatPanel({
	roomThread,
	chatDraft,
	setChatDraft,
	sendRoomMessage,
	getMessageStatusMeta,
	onClose,
	compact = false,
}) {
	const listRef = useRef(null);

	useEffect(() => {
		const container = listRef.current;
		if (!container) {
			return;
		}
		container.scrollTop = container.scrollHeight;
	}, [roomThread.length]);

	return (
		<>
			<div className="h-11 px-3 border-b border-white/10 flex items-center justify-between text-xs">
				<span className="font-medium">Room Chat</span>
				{onClose && (
					<button
						onClick={onClose}
						className="h-7 w-7 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center">
						<X className="w-3.5 h-3.5" />
					</button>
				)}
			</div>

			<div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2">
				{roomThread.length === 0 ? (
					<p className="text-xs text-gray-400">No messages yet.</p>
				) : (
					roomThread.map((item, index) => {
						const statusMeta = getMessageStatusMeta(item);
						return (
							<div
								key={item.messageId || `${item.timestamp}-${index}`}
								className={clsx(
									"px-2.5 py-2 rounded-xl border text-xs",
									item.isMe
										? "ml-6 bg-cyan-600/75 border-cyan-400/30"
										: "mr-6 bg-white/10 border-white/10",
								)}>
								<p className="text-[10px] opacity-75 mb-1">{item.from}</p>
								<p className="leading-relaxed whitespace-pre-wrap break-words">
									{item.message}
								</p>
								{item.isMe && (
									<div className="mt-1 flex items-center justify-end gap-1 opacity-85">
										{item.status === "pending" ? (
											<Clock className="w-3 h-3" />
										) : statusMeta.allRead ? (
											<CheckCheck className="w-3 h-3 text-sky-300" />
										) : statusMeta.allDelivered ? (
											<CheckCheck className="w-3 h-3" />
										) : (
											<Check className="w-3 h-3" />
										)}
										<span>{statusMeta.readCount} read</span>
									</div>
								)}
							</div>
						);
					})
				)}
			</div>

			<div className="p-3 border-t border-white/10 flex items-center gap-2">
				<input
					type="text"
					value={chatDraft}
					onChange={(e) => setChatDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							sendRoomMessage();
						}
					}}
					placeholder="Chat while in call..."
					className={clsx(
						"flex-1 h-10 px-3 rounded-lg bg-black/45 border border-white/15 outline-none focus:border-cyan-400/60",
						compact && "text-sm",
					)}
				/>
				<button
					onClick={sendRoomMessage}
					className="h-10 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-sm">
					Send
				</button>
			</div>
		</>
	);
}

export default function RoomCallInterface() {
	const {
		username,
		selectedRoom,
		roomCallSession,
		roomMediaStateByUser,
		roomActiveSpeaker,
		roomLocalStream,
		roomRemoteStreams,
		roomMessages,
		handleSendRoomMessage,
		roomIsMuted,
		roomIsVideoOff,
		roomIsScreenSharing,
		toggleRoomMute,
		toggleRoomVideo,
		toggleRoomScreenShare,
		handleEndRoomCallForEveryone,
		handleLeaveRoomCall,
		setCurrentView,
	} = useApp();

	const [layoutMode, setLayoutMode] = useState("focus");
	const [showChatPanel, setShowChatPanel] = useState(true);
	const [showMobileChat, setShowMobileChat] = useState(false);
	const [chatWidthPercent, setChatWidthPercent] = useState(32);
	const [gridDensity, setGridDensity] = useState("comfortable");
	const [pinnedParticipant, setPinnedParticipant] = useState(null);
	const [chatDraft, setChatDraft] = useState("");
	const canUseScreenShare = useMemo(
		() => Boolean(navigator.mediaDevices?.getDisplayMedia),
		[],
	);

	const roomId = roomCallSession?.roomId || selectedRoom?.roomId;
	const canEndCallForEveryone =
		selectedRoom?.owner === username ||
		roomCallSession?.participants?.[0] === username;
	const participants = useMemo(() => {
		const sessionParticipants = Array.isArray(roomCallSession?.participants)
			? roomCallSession.participants
			: [];
		const streamParticipants = Object.keys(roomRemoteStreams || {});
		const all = Array.from(
			new Set([username, ...sessionParticipants, ...streamParticipants]),
		).filter(Boolean);
		return [username, ...all.filter((name) => name !== username)];
	}, [roomCallSession?.participants, roomRemoteStreams, username]);

	const participantsWithState = useMemo(
		() =>
			participants.map((name) => ({
				name,
				stream: name === username ? roomLocalStream : roomRemoteStreams?.[name],
				mediaState:
					roomMediaStateByUser?.[name] ||
					(name === username
						? {
								isMuted: roomIsMuted,
								isVideoOff: roomIsVideoOff,
								isScreenSharing: roomIsScreenSharing,
							}
						: {
								isMuted: false,
								isVideoOff: false,
								isScreenSharing: false,
							}),
			})),
		[
			participants,
			roomRemoteStreams,
			username,
			roomLocalStream,
			roomMediaStateByUser,
			roomIsMuted,
			roomIsVideoOff,
			roomIsScreenSharing,
		],
	);

	const sharingParticipant = useMemo(() => {
		const sharing = participantsWithState.find((participant) => participant.mediaState?.isScreenSharing);
		return sharing?.name || null;
	}, [participantsWithState]);

	const focusParticipant =
		pinnedParticipant && participants.includes(pinnedParticipant)
			? pinnedParticipant
			: sharingParticipant || roomActiveSpeaker || participants[0] || username;

	const focusedParticipantData = participantsWithState.find((participant) => participant.name === focusParticipant);
	const remainingParticipants = participantsWithState.filter((participant) => participant.name !== focusParticipant);

	const roomThread = roomId ? roomMessages?.[roomId] || [] : [];
	const otherMembersCount = Math.max((participants.length || 1) - 1, 0);

	const gridColumnsClass =
		gridDensity === "compact"
			? "grid-cols-2 lg:grid-cols-4"
			: gridDensity === "spacious"
				? "grid-cols-1 lg:grid-cols-2"
				: "grid-cols-2 lg:grid-cols-3";

	const sendRoomMessage = () => {
		const text = chatDraft.trim();
		if (!text || !roomId) {
			return;
		}
		handleSendRoomMessage(roomId, text);
		setChatDraft("");
	};

	const getMessageStatusMeta = (message) => {
		const deliveredBy = Array.isArray(message.deliveredBy) ? message.deliveredBy : [];
		const readBy = Array.isArray(message.readBy) ? message.readBy : [];
		const deliveredCount = new Set(deliveredBy.filter((participant) => participant !== message.from)).size;
		const readCount = new Set(readBy.filter((participant) => participant !== message.from)).size;
		const allDelivered = otherMembersCount > 0 && deliveredCount >= otherMembersCount;
		const allRead = otherMembersCount > 0 && readCount >= otherMembersCount;
		return { allDelivered, allRead, readCount };
	};

	if (!roomCallSession?.joined) {
		return (
			<div className="flex-1 flex items-center justify-center bg-black text-gray-300">
				<div className="text-center">
					<p className="text-lg font-medium">Room call is not active for you</p>
					<button
						onClick={() => setCurrentView("room")}
						className="mt-3 h-10 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-sm">
						Back to Room
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col bg-black text-white overflow-hidden">
			<div className="h-16 px-3 md:px-4 border-b border-white/10 flex items-center justify-between gap-2">
				<div className="min-w-0 pr-1">
					<p className="text-xs uppercase tracking-[0.15em] text-cyan-400 flex items-center gap-1.5">
						<Users className="w-3.5 h-3.5" />
						Room Call
					</p>
					<h2 className="text-sm md:text-lg font-semibold truncate">
						{selectedRoom?.name || "Room"}
					</h2>
				</div>

				<div className="flex items-center gap-1.5 md:gap-2 text-xs shrink-0">
					<button
						onClick={() => setShowMobileChat(true)}
						className="h-8 px-2.5 rounded-md bg-white/10 hover:bg-white/20 lg:hidden"
						title="Open call chat">
						<MessageSquare className="w-3.5 h-3.5" />
					</button>

					<button
						onClick={() => setShowChatPanel((prev) => !prev)}
						className={clsx(
							"hidden lg:flex h-8 px-2.5 rounded-md",
							showChatPanel
								? "bg-cyan-500 text-black"
								: "bg-white/10 hover:bg-white/20",
						)}
						title="Toggle side chat">
						<MessageSquare className="w-3.5 h-3.5" />
					</button>

					<button
						onClick={() => setCurrentView("room")}
						className="h-8 px-3 rounded-md bg-white/10 hover:bg-white/20 flex items-center gap-1.5"
						title="Open full room chat">
						<ArrowLeft className="w-3.5 h-3.5" />
						<span className="hidden sm:inline">Room</span>
					</button>
				</div>
			</div>

			<div className="px-3 md:px-4 py-2 border-b border-white/10 flex items-center justify-between gap-3 text-xs text-gray-300">
				<div className="flex items-center gap-2 min-w-0">
					<SlidersHorizontal className="w-3.5 h-3.5" />
					<span>{participants.length} in call</span>
					<span className="text-gray-500 hidden sm:inline">|</span>
					<span className="truncate hidden sm:inline">
						Speaker: {roomActiveSpeaker || "No dominant speaker"}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<label className="text-gray-400 hidden lg:inline">Density</label>
					<select
						value={gridDensity}
						onChange={(e) => setGridDensity(e.target.value)}
						className="h-8 px-2 rounded-md bg-white/10 border border-white/15 text-xs outline-none">
						<option value="compact">Compact</option>
						<option value="comfortable">Comfortable</option>
						<option value="spacious">Spacious</option>
					</select>
				</div>
			</div>

			<div className="px-3 md:px-4 py-2 border-b border-white/10 overflow-x-auto hide-scrollbar">
				<div className="flex items-center gap-2 min-w-max">
					<button
						onClick={() => setLayoutMode("focus")}
						className={clsx(
							"h-8 px-3 rounded-full text-xs font-medium flex items-center gap-1.5",
							layoutMode === "focus"
								? "bg-cyan-500 text-black"
								: "bg-white/10 hover:bg-white/20",
						)}>
						<Monitor className="w-3.5 h-3.5" />
						Focus
					</button>
					<button
						onClick={() => setLayoutMode("grid")}
						className={clsx(
							"h-8 px-3 rounded-full text-xs font-medium flex items-center gap-1.5",
							layoutMode === "grid"
								? "bg-cyan-500 text-black"
								: "bg-white/10 hover:bg-white/20",
						)}>
						<LayoutGrid className="w-3.5 h-3.5" />
						Grid
					</button>
					<button
						onClick={() => setLayoutMode("theater")}
						className={clsx(
							"h-8 px-3 rounded-full text-xs font-medium flex items-center gap-1.5",
							layoutMode === "theater"
								? "bg-cyan-500 text-black"
								: "bg-white/10 hover:bg-white/20",
						)}>
						<PanelsTopLeft className="w-3.5 h-3.5" />
						Theater
					</button>
				</div>
			</div>

			<div
				className={clsx("flex-1 min-h-0", showChatPanel && "lg:grid")}
				style={{
					gridTemplateColumns:
						showChatPanel
							? `minmax(0,1fr) minmax(320px, ${chatWidthPercent}%)`
							: "minmax(0,1fr)",
				}}>
				<div className="min-h-0 p-3 lg:p-4 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_rgba(0,0,0,0)_45%)]">
					{layoutMode === "grid" ? (
						<div
							className={clsx(
								"grid gap-3 h-full overflow-y-auto pr-1",
								gridColumnsClass,
							)}>
							{participantsWithState.map((participant) => (
								<ParticipantTile
									key={participant.name}
									name={participant.name}
									stream={participant.stream}
									isSelf={participant.name === username}
									isFocused={participant.name === focusParticipant}
									isSpeaking={roomActiveSpeaker === participant.name}
									mediaState={participant.mediaState}
									onPin={() => setPinnedParticipant((prev) => (prev === participant.name ? null : participant.name))}
									isPinned={pinnedParticipant === participant.name}
								/>
							))}
						</div>
					) : (
						<div className={clsx("h-full", layoutMode === "theater" ? "grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3" : "grid grid-rows-[minmax(0,1fr)_auto] gap-3")}>
							<ParticipantTile
								name={focusedParticipantData?.name || username}
								stream={focusedParticipantData?.stream}
								isSelf={(focusedParticipantData?.name || username) === username}
								isFocused
								isSpeaking={roomActiveSpeaker === (focusedParticipantData?.name || username)}
								mediaState={focusedParticipantData?.mediaState}
								onPin={() =>
									setPinnedParticipant((prev) =>
										prev === (focusedParticipantData?.name || username)
											? null
											: focusedParticipantData?.name || username,
									)
								}
								isPinned={pinnedParticipant === (focusedParticipantData?.name || username)}
								size="large"
							/>

							<div
								className={clsx(
									"min-h-[9rem]",
									layoutMode === "theater"
										? "grid grid-cols-1 auto-rows-fr gap-3 overflow-y-auto pr-1"
										: "flex lg:grid lg:grid-cols-4 gap-3 overflow-x-auto lg:overflow-y-auto lg:pr-1",
								)}>
								{remainingParticipants.map((participant) => (
									<div
										key={participant.name}
										className="min-w-[11rem] lg:min-w-0 flex-1">
										<ParticipantTile
											name={participant.name}
											stream={participant.stream}
											isSelf={participant.name === username}
											isFocused={false}
											isSpeaking={roomActiveSpeaker === participant.name}
											mediaState={participant.mediaState}
											onPin={() =>
												setPinnedParticipant((prev) =>
													prev === participant.name
														? null
														: participant.name,
												)
											}
											isPinned={pinnedParticipant === participant.name}
										/>
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				{showChatPanel && (
					<aside className="hidden lg:flex border-l border-white/10 bg-white/[0.03] min-h-0 flex-col">
						<div className="h-11 px-3 border-b border-white/10 flex items-center justify-between text-xs">
							<span className="font-medium">Room Chat</span>
							<div className="flex items-center gap-2">
								<input
									type="range"
									min={24}
									max={45}
									value={chatWidthPercent}
									onChange={(e) =>
										setChatWidthPercent(Number(e.target.value))
									}
									className="w-24"
									title="Resize chat panel"
								/>
								<button
									onClick={() => setShowChatPanel(false)}
									className="h-7 px-2 rounded bg-white/10 hover:bg-white/20">
									Hide
								</button>
							</div>
						</div>

						<RoomChatPanel
							roomThread={roomThread}
							chatDraft={chatDraft}
							setChatDraft={setChatDraft}
							sendRoomMessage={sendRoomMessage}
							getMessageStatusMeta={getMessageStatusMeta}
						/>
					</aside>
				)}
			</div>

			<div className="px-3 md:px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] border-t border-white/10 bg-black/80 backdrop-blur-sm">
				<div className="grid grid-cols-4 gap-2 md:flex md:flex-wrap md:items-center md:justify-center md:gap-3">
				<button
					onClick={toggleRoomMute}
					className={clsx(
						"h-12 md:h-10 px-2 md:px-4 rounded-2xl md:rounded-full text-[11px] md:text-sm font-medium flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2",
						roomIsMuted
							? "bg-white text-black"
							: "bg-white/10 hover:bg-white/20",
					)}>
					{roomIsMuted ? (
						<MicOff className="w-4 h-4" />
					) : (
						<Mic className="w-4 h-4" />
					)}
					<span>{roomIsMuted ? "Unmute" : "Mute"}</span>
				</button>
				<button
					onClick={toggleRoomVideo}
					className={clsx(
						"h-12 md:h-10 px-2 md:px-4 rounded-2xl md:rounded-full text-[11px] md:text-sm font-medium flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2",
						roomIsVideoOff
							? "bg-white text-black"
							: "bg-white/10 hover:bg-white/20",
					)}>
					{roomIsVideoOff ? (
						<VideoOff className="w-4 h-4" />
					) : (
						<Video className="w-4 h-4" />
					)}
					<span>{roomIsVideoOff ? "Cam On" : "Cam Off"}</span>
				</button>
				<button
					onClick={toggleRoomScreenShare}
					disabled={!canUseScreenShare && !roomIsScreenSharing}
					className={clsx(
						"h-12 md:h-10 px-2 md:px-4 rounded-2xl md:rounded-full text-[11px] md:text-sm font-medium flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2",
						roomIsScreenSharing
							? "bg-cyan-500 text-black"
							: "bg-white/10 hover:bg-white/20",
						!canUseScreenShare &&
							!roomIsScreenSharing &&
							"opacity-45 cursor-not-allowed",
					)}>
					{roomIsScreenSharing ? (
						<ScreenShareOff className="w-4 h-4" />
					) : (
						<ScreenShare className="w-4 h-4" />
					)}
					<span>
						{roomIsScreenSharing
							? "Stop"
							: canUseScreenShare
								? "Share"
								: "No Share"}
					</span>
				</button>
				<button
					onClick={handleLeaveRoomCall}
					className="h-12 md:h-11 px-2 md:px-5 rounded-2xl md:rounded-full bg-red-500 hover:bg-red-600 text-white text-[11px] md:text-sm font-semibold flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 shadow-lg shadow-red-500/30">
					<PhoneOff className="w-4 h-4" />
					<span>Leave</span>
				</button>
				{canEndCallForEveryone && (
					<button
						onClick={() => handleEndRoomCallForEveryone(roomId)}
						className="col-span-4 md:col-span-1 h-10 md:h-11 px-4 rounded-2xl md:rounded-full bg-rose-600/90 hover:bg-rose-600 text-white text-xs md:text-sm font-semibold flex items-center justify-center gap-2">
						<PhoneOff className="w-4 h-4" />
						End For Everyone
					</button>
				)}
				</div>
			</div>

			{showMobileChat && (
				<div className="lg:hidden absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-end">
					<div className="w-full h-[72%] rounded-t-2xl border-t border-white/10 bg-[#0c0c0c] flex flex-col">
						<RoomChatPanel
							roomThread={roomThread}
							chatDraft={chatDraft}
							setChatDraft={setChatDraft}
							sendRoomMessage={sendRoomMessage}
							getMessageStatusMeta={getMessageStatusMeta}
							onClose={() => setShowMobileChat(false)}
							compact
						/>
					</div>
				</div>
			)}
		</div>
	);
}
