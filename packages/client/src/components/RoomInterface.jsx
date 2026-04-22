import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import {
	ArrowLeft,
	Users,
	Send,
	Paperclip,
	Download,
	Image as ImageIcon,
	PlusCircle,
	Check,
	CheckCheck,
	Clock,
	Phone,
	PhoneIncoming,
	RefreshCw,
	FileText,
	FileImage,
	FileVideo,
	AlertCircle,
	Link2,
	Reply,
	Trash2,
	X,
} from "lucide-react";
import clsx from "clsx";
import MediaViewerModal from "./MediaViewerModal";

export default function RoomInterface({ mode = "room" }) {
	const {
		rooms,
		allUsers,
		onlineUsers,
		selectedRoom,
		selectedRoomId,
		roomMessages,
		pendingRoomInvites,
		roomComposerDraft,
		isCreatingRoom,
		handleUpdateRoomComposer,
		handleCreateRoomFromComposer,
		handleRequestJoinRoom,
		handleRespondToRoomInvite,
		handleSendRoomMessage,
		handleSendRoomFileUpload,
		handleRetryRoomMessage,
		handleReactToRoomMessage,
		handleInviteUsersToRoom,
		resolveFileDownloadUrl,
		showToast,
		roomCallSession,
		roomCallIncomingByRoom,
		roomCallParticipantsByRoom,
		roomCallLastJoinedByRoom,
		handleStartRoomCall,
		handleJoinRoomCall,
		setCurrentView,
		deleteLocalRoomMessages,
	} = useApp();

	const [draftMessage, setDraftMessage] = useState("");
	const [replyTarget, setReplyTarget] = useState(null);
	const [isSelectionMode, setIsSelectionMode] = useState(false);
	const [selectedMessages, setSelectedMessages] = useState(new Set());
	const [ownerInviteSelection, setOwnerInviteSelection] = useState([]);
	const [viewingMedia, setViewingMedia] = useState(null);
	const [mediaLoadFailures, setMediaLoadFailures] = useState({});
	const [mediaUrlOverrides, setMediaUrlOverrides] = useState({});
	const [reactionPickerFor, setReactionPickerFor] = useState(null);
	const roomFileInputRef = useRef(null);
	const longPressTimerRef = useRef(null);
	const touchStartRef = useRef(null);
	const touchMovedRef = useRef(false);
	const otherMembersCount = Math.max(
		(selectedRoom?.members?.length || 1) - 1,
		0,
	);
	const MAX_FILE_SIZE = 10 * 1024 * 1024;
	const EMOJI_OPTIONS = ["👍", "❤️", "😂", "🔥"];
	const ALLOWED_FILE_ACCEPT = "image/*,video/*,application/pdf,text/*";

	const getRenderableFileUrl = useCallback(
		(message) => {
			if (!message) {
				return null;
			}

			return (
				mediaUrlOverrides[message.messageId] ||
				message.resolvedFileUrl ||
				message.fileUrl ||
				null
			);
		},
		[mediaUrlOverrides],
	);

	const isLikelyUnsupportedImage = useCallback((message) => {
		const normalizedType = String(message?.fileType || "").toLowerCase();
		const normalizedName = String(message?.fileName || "").toLowerCase();

		return (
			normalizedType.includes("heic") ||
			normalizedType.includes("heif") ||
			normalizedName.endsWith(".heic") ||
			normalizedName.endsWith(".heif")
		);
	}, []);

	const markMediaLoadFailed = useCallback((messageId) => {
		if (!messageId) {
			return;
		}

		setMediaLoadFailures((prev) => {
			if (prev[messageId]) {
				return prev;
			}

			return {
				...prev,
				[messageId]: true,
			};
		});
	}, []);

	const hasMediaLoadFailed = useCallback(
		(message) => Boolean(mediaLoadFailures[message?.messageId]),
		[mediaLoadFailures],
	);

	const resolveRoomMessageFileUrl = useCallback(
		async (message) => {
			if (!message) {
				return null;
			}

			const existingUrl = getRenderableFileUrl(message);
			if (message.fileId && resolveFileDownloadUrl) {
				const resolved = await resolveFileDownloadUrl({
					fileId: message.fileId,
					fileUrl: message.fileUrl || existingUrl,
				});

				if (resolved) {
					setMediaUrlOverrides((prev) => ({
						...prev,
						[message.messageId]: resolved,
					}));
					return resolved;
				}
			}

			return existingUrl;
		},
		[getRenderableFileUrl, resolveFileDownloadUrl],
	);

	const handleRedownloadRoomFile = useCallback(
		async (message) => {
			const resolvedUrl = await resolveRoomMessageFileUrl(message);
			if (!resolvedUrl) {
				showToast?.("File URL unavailable. Try again in a moment.", "info");
				return;
			}

			const link = document.createElement("a");
			const cacheBypass = `ts=${Date.now()}`;
			link.href = `${resolvedUrl}${resolvedUrl.includes("?") ? "&" : "?"}${cacheBypass}`;
			link.download = message.fileName || "file";
			link.click();
		},
		[resolveRoomMessageFileUrl, showToast],
	);

	const handleOpenRoomMedia = useCallback(
		async (message) => {
			if (!message) {
				return;
			}

			if (isLikelyUnsupportedImage(message)) {
				setViewingMedia({ ...message, isMissingMedia: true });
				return;
			}

			const resolvedUrl = await resolveRoomMessageFileUrl(message);
			if (!resolvedUrl) {
				setViewingMedia({ ...message, isMissingMedia: true });
				return;
			}

			setViewingMedia({
				...message,
				resolvedFileUrl: resolvedUrl,
				isMissingMedia: false,
			});
		},
		[isLikelyUnsupportedImage, resolveRoomMessageFileUrl],
	);

	const formatTime = (timestamp) => {
		try {
			return new Date(timestamp).toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			});
		} catch {
			return "";
		}
	};

	const detectLinks = (text) => {
		if (typeof text !== "string") {
			return [];
		}

		return text.match(/https?:\/\/[^\s]+/gi) || [];
	};

	const renderTextWithLinks = (text) => {
		if (typeof text !== "string") {
			return null;
		}

		const parts = text.split(/(https?:\/\/[^\s]+)/gi);
		return parts.map((part, index) => {
			if (/^https?:\/\//i.test(part)) {
				return (
					<a
						key={`${part}-${index}`}
						href={part}
						target="_blank"
						rel="noreferrer"
						className="underline decoration-dotted underline-offset-2 break-all text-cyan-200">
						{part}
					</a>
				);
			}

			return <span key={`${part}-${index}`}>{part}</span>;
		});
	};

	const renderLinkPreviewCard = (url) => {
		if (!url) {
			return null;
		}

		try {
			const parsed = new URL(url);
			const hostname = parsed.hostname.replace(/^www\./i, "");
			const pathPreview =
				parsed.pathname && parsed.pathname !== "/"
					? parsed.pathname
					: "Open link";

			return (
				<a
					href={url}
					target="_blank"
					rel="noreferrer"
					className="block rounded-xl border border-white/10 bg-black/20 px-3 py-2 hover:bg-black/30 transition-colors">
					<p className="text-[10px] uppercase tracking-wide text-cyan-200/90">
						{hostname}
					</p>
					<p className="text-xs text-white/85 truncate">{pathPreview}</p>
				</a>
			);
		} catch {
			return null;
		}
	};

	const buildReplySummary = (message) => {
		if (!message) {
			return "";
		}

		if (message.type === "file") {
			return message.caption || message.fileName || "File";
		}

		return message.message || "Message";
	};

	const isPdfFile = (message) =>
		String(message?.fileType || "").toLowerCase() === "application/pdf";

	const peerCandidates = useMemo(() => allUsers || [], [allUsers]);
	const roomInviteForSelected = pendingRoomInvites.find(
		(invite) => invite.roomId === selectedRoomId,
	);

	const selectedRoomMessages = selectedRoomId
		? roomMessages[selectedRoomId] || []
		: [];
	const roomMediaFiles = selectedRoomMessages.filter(
		(item) =>
			item.type === "file" &&
			(item.fileType?.startsWith("image/") ||
				item.fileType?.startsWith("video/")),
	);
	const viewingMediaIndex = viewingMedia
		? roomMediaFiles.findIndex(
				(item) => item.messageId === viewingMedia.messageId,
		  )
		: -1;
	const groupedRoomPhotoMessageIds = new Set();

	const isRoomPhotoMessage = useCallback((message) => {
		if (message?.type !== "file" || message?.isUploading) {
			return false;
		}

		return (
			message.fileKind === "photo" ||
			message.fileType?.startsWith("image/")
		);
	}, []);

	const isGroupableRoomPhotoMessage = useCallback(
		(message) => {
			if (!isRoomPhotoMessage(message)) {
				return false;
			}

			if (message?.caption || message?.replyTo?.summary) {
				return false;
			}

			if (
				Array.isArray(message?.reactions) &&
				message.reactions.length > 0
			) {
				return false;
			}

			if (message?.status === "pending" || message?.status === "failed") {
				return false;
			}

			return true;
		},
		[isRoomPhotoMessage],
	);

	const getRoomPhotoGroupForIndex = useCallback(
		(startIndex) => {
			const base = selectedRoomMessages[startIndex];
			if (!isGroupableRoomPhotoMessage(base)) {
				return [];
			}

			const sameSide = (item) => Boolean(item?.isMe) === Boolean(base?.isMe);
			const group = [base];
			let lastTimestamp = base?.timestamp || 0;

			for (
				let cursor = startIndex + 1;
				cursor < selectedRoomMessages.length;
				cursor += 1
			) {
				const candidate = selectedRoomMessages[cursor];
				if (!isGroupableRoomPhotoMessage(candidate) || !sameSide(candidate)) {
					break;
				}

				const candidateTimestamp = candidate?.timestamp || 0;
				if (Math.abs(candidateTimestamp - lastTimestamp) > 120000) {
					break;
				}

				group.push(candidate);
				lastTimestamp = candidateTimestamp;
			}

			return group;
		},
		[isGroupableRoomPhotoMessage, selectedRoomMessages],
	);

	useEffect(() => {
		setReplyTarget(null);
	}, [selectedRoomId]);

	const eligibleOwnerInvites = useMemo(() => {
		if (!selectedRoom || !selectedRoom.isOwner) {
			return [];
		}

		const pendingInvites = new Set(selectedRoom.pendingInvites || []);
		const members = new Set(selectedRoom.members || []);
		return peerCandidates.filter((user) => {
			const username = user.username;
			return !members.has(username) && !pendingInvites.has(username);
		});
	}, [peerCandidates, selectedRoom]);

	const toggleComposerUser = (username) => {
		const hasUser = roomComposerDraft.selectedUsers.includes(username);
		handleUpdateRoomComposer({
			selectedUsers: hasUser
				? roomComposerDraft.selectedUsers.filter((u) => u !== username)
				: [...roomComposerDraft.selectedUsers, username],
		});
	};

	const toggleOwnerInviteUser = (username) => {
		setOwnerInviteSelection((prev) =>
			prev.includes(username)
				? prev.filter((u) => u !== username)
				: [...prev, username],
		);
	};

	const sendRoomMessage = () => {
		if (!draftMessage.trim() || !selectedRoomId) {
			return;
		}
		handleSendRoomMessage(selectedRoomId, {
			text: draftMessage.trim(),
			replyTo: replyTarget
				? {
						messageId: replyTarget.messageId,
						from: replyTarget.from,
						type: replyTarget.type || "chat",
						summary: buildReplySummary(replyTarget),
					}
				: null,
		});
		setDraftMessage("");
		setReplyTarget(null);
	};

	const handleRoomFileSelect = async (event) => {
		const files = Array.from(event.target.files || []);
		if (!files.length || !selectedRoomId) {
			return;
		}

		const pendingText = draftMessage.trim();
		if (pendingText) {
			handleSendRoomMessage(selectedRoomId, {
				text: pendingText,
				replyTo: replyTarget
					? {
							messageId: replyTarget.messageId,
							from: replyTarget.from,
							type: replyTarget.type || "chat",
							summary: buildReplySummary(replyTarget),
					  }
					: null,
			});
			setDraftMessage("");
			setReplyTarget(null);
		}

		for (const file of files) {
			if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
				alert("File size must be 10MB or less.");
				continue;
			}

			const contentType = file.type || "application/octet-stream";
			const isAllowed =
				contentType.startsWith("image/") ||
				contentType.startsWith("video/") ||
				contentType.startsWith("text/") ||
				contentType === "application/pdf";

			if (!isAllowed) {
				alert("Only images, PDF, and text files are allowed.");
				continue;
			}

			await handleSendRoomFileUpload(selectedRoomId, {
				file,
				fileKind:
					contentType.startsWith("image/") ||
					contentType.startsWith("video/")
						? "photo"
						: "file",
				caption: "",
			});
		}

		event.target.value = "";
	};

	const getFileTypeIcon = (fileType) => {
		if (fileType?.startsWith("image/")) {
			return <FileImage className="w-3.5 h-3.5" />;
		}
		if (fileType?.startsWith("video/")) {
			return <FileVideo className="w-3.5 h-3.5" />;
		}
		return <FileText className="w-3.5 h-3.5" />;
	};

	const getRoomMessageStatusMeta = (message) => {
		const deliveredBy = Array.isArray(message.deliveredBy)
			? message.deliveredBy
			: [];
		const readBy = Array.isArray(message.readBy) ? message.readBy : [];

		const deliveredCount = new Set(
			deliveredBy.filter((participant) => participant !== message.from),
		).size;
		const readCount = new Set(
			readBy.filter((participant) => participant !== message.from),
		).size;

		const allDelivered =
			otherMembersCount > 0 && deliveredCount >= otherMembersCount;
		const allRead = otherMembersCount > 0 && readCount >= otherMembersCount;

		return {
			deliveredCount,
			readCount,
			allDelivered,
			allRead,
			hasPeers: otherMembersCount > 0,
		};
	};

	const getReactionSummary = (reactions = []) => {
		const grouped = reactions.reduce((acc, reaction) => {
			if (!acc[reaction.emoji]) {
				acc[reaction.emoji] = { emoji: reaction.emoji, count: 0 };
			}
			acc[reaction.emoji].count += 1;
			return acc;
		}, {});

		return Object.values(grouped);
	};

	const handleMessageLongPress = (messageId) => {
		setIsSelectionMode(true);
		setSelectedMessages(new Set([messageId]));
	};

	const handleMessageClick = (messageId) => {
		if (!isSelectionMode) {
			return;
		}

		setSelectedMessages((prev) => {
			const next = new Set(prev);
			if (next.has(messageId)) {
				next.delete(messageId);
			} else {
				next.add(messageId);
			}
			return next;
		});
	};

	const cancelSelection = () => {
		setIsSelectionMode(false);
		setSelectedMessages(new Set());
	};

	const deleteSelectedMessages = () => {
		const ids = Array.from(selectedMessages).filter(Boolean);
		if (!ids.length || !selectedRoomId) {
			return;
		}

		deleteLocalRoomMessages?.(selectedRoomId, ids);
		cancelSelection();
	};

	const replyToSingleSelected = () => {
		if (selectedMessages.size !== 1) {
			return;
		}

		const targetId = Array.from(selectedMessages)[0];
		const target = selectedRoomMessages.find(
			(message) => message.messageId === targetId,
		);
		if (!target) {
			return;
		}

		setReplyTarget(target);
		cancelSelection();
	};

	const handleBubbleTouchStart = (event, messageId) => {
		const touch = event.touches?.[0];
		if (!touch) {
			return;
		}

		touchStartRef.current = { x: touch.clientX, y: touch.clientY };
		touchMovedRef.current = false;
		longPressTimerRef.current = setTimeout(() => {
			handleMessageLongPress(messageId);
		}, 500);
	};

	const handleBubbleTouchMove = (event) => {
		if (!touchStartRef.current) {
			return;
		}

		const touch = event.touches?.[0];
		if (!touch) {
			return;
		}

		const deltaX = touch.clientX - touchStartRef.current.x;
		const deltaY = touch.clientY - touchStartRef.current.y;
		if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
			touchMovedRef.current = true;
			if (longPressTimerRef.current) {
				clearTimeout(longPressTimerRef.current);
				longPressTimerRef.current = null;
			}
		}
	};

	const handleBubbleTouchEnd = (event, message) => {
		if (longPressTimerRef.current) {
			clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = null;
		}

		if (!touchStartRef.current) {
			return;
		}

		const start = touchStartRef.current;
		touchStartRef.current = null;

		if (!touchMovedRef.current) {
			return;
		}

		const touch = event.changedTouches?.[0];
		if (!touch) {
			return;
		}

		const deltaX = touch.clientX - start.x;
		const deltaY = touch.clientY - start.y;
		if (deltaX > 65 && Math.abs(deltaY) < 40) {
			setReplyTarget(message);
		}
	};

	if (mode === "create") {
		return (
			<div className="flex-1 flex flex-col bg-black text-white">
				<div className="h-16 px-4 border-b border-white/10 flex items-center gap-3">
					<button
						onClick={() => setCurrentView("placeholder")}
						className="p-2 rounded-lg hover:bg-white/10 transition-colors">
						<ArrowLeft className="w-5 h-5" />
					</button>
					<div>
						<p className="text-xs uppercase tracking-[0.15em] text-cyan-400">
							Rooms
						</p>
						<h2 className="text-lg font-semibold">Create Room</h2>
					</div>
				</div>

				<div className="flex-1 overflow-y-auto p-4 space-y-4">
					<div className="rounded-xl border border-white/10 bg-white/5 p-4">
						<label className="text-sm text-gray-300">Room name</label>
						<input
							type="text"
							value={roomComposerDraft.name}
							onChange={(e) =>
								handleUpdateRoomComposer({ name: e.target.value })
							}
							placeholder="Design Sprint"
							className="mt-2 w-full h-11 px-3 rounded-lg bg-[#151515] border border-white/10 focus:border-cyan-400/60 outline-none"
						/>
					</div>

					<div className="rounded-xl border border-white/10 bg-white/5 p-4">
						<p className="text-sm text-gray-300 mb-3">Invite peers now</p>
						<div className="space-y-2 max-h-72 overflow-y-auto hide-scrollbar">
							{peerCandidates.length === 0 ? (
								<p className="text-sm text-gray-500">
									No peers available.
								</p>
							) : (
								peerCandidates.map((user) => {
									const checked =
										roomComposerDraft.selectedUsers.includes(
											user.username,
										);
									const isOnline = onlineUsers.includes(user.username);
									return (
										<button
											key={user.username}
											onClick={() =>
												toggleComposerUser(user.username)
											}
											className={clsx(
												"w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-colors",
												checked
													? "border-cyan-400/70 bg-cyan-500/10"
													: "border-white/10 hover:border-white/30",
											)}>
											<span className="text-sm">
												{user.username}
											</span>
											<span className="text-xs text-gray-400">
												{isOnline ? "Online" : "Offline"}
											</span>
										</button>
									);
								})
							)}
						</div>
					</div>
				</div>

				<div className="p-4 border-t border-white/10">
					<button
						onClick={handleCreateRoomFromComposer}
						disabled={isCreatingRoom}
						className="w-full h-11 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-70 disabled:cursor-not-allowed text-white font-semibold transition-colors flex items-center justify-center gap-2">
						{isCreatingRoom ? (
							<>
								<Clock className="w-4 h-4 animate-pulse" />
								Creating room...
							</>
						) : (
							<>
								<PlusCircle className="w-4 h-4" />
								Create Room
							</>
						)}
					</button>
				</div>
			</div>
		);
	}

	if (!selectedRoom) {
		return (
			<div className="flex-1 flex items-center justify-center bg-black text-gray-400">
				Select a room from the sidebar.
			</div>
		);
	}

	const isMember = selectedRoom.isMember;
	const hasInvite = selectedRoom.isInvited || Boolean(roomInviteForSelected);
	const isRoomCallActive = roomCallSession?.roomId === selectedRoom.roomId;
	const callParticipantsForRoom =
		roomCallParticipantsByRoom?.[selectedRoom.roomId] || [];
	const hasActiveRoomCall = callParticipantsForRoom.length > 0;
	const hasJoinedBefore = Boolean(
		roomCallLastJoinedByRoom?.[selectedRoom.roomId],
	);
	const incomingRoomCallBy = roomCallIncomingByRoom[selectedRoom.roomId];
	const showJoinAction = incomingRoomCallBy || hasActiveRoomCall;
	const primaryCallLabel = isRoomCallActive
		? "Open Call"
		: showJoinAction
			? hasJoinedBefore
				? "Rejoin Call"
				: "Join Call"
			: "Start Call";
	const PrimaryCallIcon = showJoinAction ? PhoneIncoming : Phone;

	return (
		<div className="flex-1 flex flex-col bg-black text-white">
			<div className="h-16 px-4 border-b border-white/10 flex items-center justify-between">
				<div>
					<p className="text-xs uppercase tracking-[0.15em] text-cyan-400">
						Room
					</p>
					<h2 className="text-lg font-semibold truncate">
						{selectedRoom.name}
					</h2>
				</div>
				<div className="text-right text-xs text-gray-400">
					<p>{selectedRoom.members.length} members</p>
					<p>
						{selectedRoom.owner === undefined
							? ""
							: `Owner: ${selectedRoom.owner}`}
					</p>
				</div>
				{isMember && (
					<div className="ml-3">
						{isRoomCallActive ? (
							<button
								onClick={() => setCurrentView("room-call")}
								className="h-9 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-medium">
								{primaryCallLabel}
							</button>
						) : showJoinAction ? (
							<button
								onClick={() => handleJoinRoomCall(selectedRoom.roomId)}
								className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium flex items-center gap-1.5 relative overflow-hidden animate-pulse">
								<PrimaryCallIcon className="w-3.5 h-3.5" />
								{primaryCallLabel}
							</button>
						) : (
							<button
								onClick={() => handleStartRoomCall(selectedRoom.roomId)}
								className="h-9 px-3 rounded-lg bg-cyan-600/25 hover:bg-cyan-600/35 text-cyan-100 text-xs font-medium flex items-center gap-1.5">
								<Phone className="w-3.5 h-3.5" />
								{primaryCallLabel}
							</button>
						)}
					</div>
				)}
			</div>

			{isMember && incomingRoomCallBy && !isRoomCallActive && (
				<div className="px-4 py-2 border-b border-emerald-500/20 bg-emerald-500/10 flex items-center justify-between gap-2 relative overflow-hidden">
					<span className="absolute inset-0 bg-emerald-400/10 animate-pulse" />
					<p className="text-xs text-emerald-100 truncate">
						{incomingRoomCallBy} is calling this room
					</p>
					<button
						onClick={() => handleJoinRoomCall(selectedRoom.roomId)}
						className="h-7 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-[11px] font-medium animate-bounce">
						Join
					</button>
				</div>
			)}

			{!isMember ? (
				<div className="flex-1 p-4 space-y-3">
					<div className="rounded-xl border border-white/10 bg-white/5 p-4">
						<p className="text-sm text-gray-300">
							You are not a member of this room yet.
						</p>
					</div>
					{hasInvite ? (
						<div className="flex items-center gap-2">
							<button
								onClick={() =>
									handleRespondToRoomInvite(selectedRoom.roomId, true)
								}
								className="h-10 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-sm font-medium">
								Accept Invite
							</button>
							<button
								onClick={() =>
									handleRespondToRoomInvite(selectedRoom.roomId, false)
								}
								className="h-10 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium">
								Decline
							</button>
						</div>
					) : (
						<button
							onClick={() => handleRequestJoinRoom(selectedRoom.roomId)}
							className="h-10 px-4 rounded-lg bg-cyan-600/25 hover:bg-cyan-600/35 text-cyan-100 text-sm font-medium">
							Request to Join
						</button>
					)}
				</div>
			) : (
				<>
					{isSelectionMode && (
						<div className="px-4 py-2 border-b border-white/10 bg-white/5 flex items-center justify-between">
							<div className="flex items-center gap-2">
								<button
									onClick={cancelSelection}
									className="p-1 rounded hover:bg-white/10">
									<X className="w-4 h-4" />
								</button>
								<span className="text-sm text-white/85">
									{selectedMessages.size} selected
								</span>
							</div>
							<div className="flex items-center gap-2">
								{selectedMessages.size === 1 && (
									<button
										onClick={replyToSingleSelected}
										className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-xs">
										<Reply className="w-3.5 h-3.5" /> Reply
									</button>
								)}
								<button
									onClick={deleteSelectedMessages}
									className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs">
									<Trash2 className="w-3.5 h-3.5" /> Delete
								</button>
							</div>
						</div>
					)}
					<div className="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_rgba(0,0,0,0)_45%)]">
						{selectedRoomMessages.length === 0 ? (
							<div className="text-sm text-gray-500">
								No room messages yet.
							</div>
						) : (
							selectedRoomMessages.map((item, index) => {
								if (
									item?.messageId &&
									groupedRoomPhotoMessageIds.has(item.messageId)
								) {
									return null;
								}

								const photoGroup = getRoomPhotoGroupForIndex(index);
								if (photoGroup.length > 1) {
									photoGroup.slice(1).forEach((groupedMessage) => {
										if (groupedMessage?.messageId) {
											groupedRoomPhotoMessageIds.add(
												groupedMessage.messageId,
											);
										}
									});

									const groupKey =
										item.messageId || `${index}-${photoGroup.length}`;
									const visiblePhotos = photoGroup.slice(0, 4);
									const hiddenCount = Math.max(
										0,
										photoGroup.length - visiblePhotos.length,
									);
									const statusSource =
										photoGroup[photoGroup.length - 1] || item;
									const statusMeta =
										getRoomMessageStatusMeta(statusSource);
									const tileLayoutClass =
										visiblePhotos.length === 2
											? "grid-cols-2"
											: "grid-cols-2";

									return (
										<div
											key={`room-photo-group-${groupKey}`}
											className={clsx(
												"group relative max-w-[22rem] px-1.5 py-1.5 rounded-2xl border shadow-sm",
												item.isMe
													? "ml-auto bg-cyan-600/80 border-cyan-400/25"
													: "mr-auto bg-white/10 border-white/10",
												isSelectionMode &&
													selectedMessages.has(item.messageId) &&
													"ring-2 ring-cyan-300/80",
											)}
											onClick={() => handleMessageClick(item.messageId)}
											onContextMenu={(event) => {
												event.preventDefault();
												setReplyTarget(item);
											}}
											onMouseDown={() => {
												longPressTimerRef.current = setTimeout(() => {
													handleMessageLongPress(item.messageId);
												}, 500);
											}}
											onMouseUp={() => {
												if (longPressTimerRef.current) {
													clearTimeout(longPressTimerRef.current);
													longPressTimerRef.current = null;
												}
											}}
											onMouseLeave={() => {
												if (longPressTimerRef.current) {
													clearTimeout(longPressTimerRef.current);
													longPressTimerRef.current = null;
												}
											}}
											onTouchStart={(event) =>
												handleBubbleTouchStart(event, item.messageId)
											}
											onTouchMove={handleBubbleTouchMove}
											onTouchEnd={(event) =>
												handleBubbleTouchEnd(event, item)
											}>
											<p className="text-[11px] text-white/70 mb-1 flex items-center gap-1.5 px-1">
												{item.from}
												<span className="opacity-70">
													{formatTime(statusSource.timestamp)}
												</span>
											</p>
											<div
												className={clsx(
													"grid gap-1 rounded-xl overflow-hidden bg-black/20",
													tileLayoutClass,
												)}>
												{visiblePhotos.map((photo, photoIndex) => {
													const isPrimaryTile =
														visiblePhotos.length === 3 && photoIndex === 0;
													const renderableUrl =
														getRenderableFileUrl(photo);
													const hasFailed = hasMediaLoadFailed(photo);
													const showOverlay =
														hiddenCount > 0 &&
														photoIndex === visiblePhotos.length - 1;

													return (
														<button
															key={
																photo.messageId ||
																`${groupKey}-${photoIndex}`
															}
															onClick={(event) => {
																event.stopPropagation();
																handleOpenRoomMedia(photo);
															}}
															onContextMenu={(event) =>
																event.preventDefault()
															}
															className={clsx(
																"relative bg-black/25",
																visiblePhotos.length === 1 &&
																	"min-h-[14rem]",
																visiblePhotos.length === 2 &&
																	"min-h-[7.5rem]",
																visiblePhotos.length >= 4 &&
																	"min-h-[6.5rem]",
																isPrimaryTile &&
																	"row-span-2 min-h-[14rem]",
															)}>
															{renderableUrl && !hasFailed ? (
																<img
																	src={renderableUrl}
																	alt={photo.fileName || "photo"}
																	className="w-full h-full object-contain bg-black/25"
																	onError={() =>
																		markMediaLoadFailed(photo.messageId)
																	}
																	onContextMenu={(event) =>
																		event.preventDefault()
																	}
																/>
															) : (
																<div className="w-full h-full flex items-center justify-center p-2">
																	<button
																		onClick={async (event) => {
																			event.stopPropagation();
																			await handleRedownloadRoomFile(photo);
																		}}
																		className="text-xs text-white px-3 py-1 rounded-full bg-black/60 hover:bg-black/75 transition-colors">
																		Redownload
																	</button>
																</div>
															)}
															{showOverlay && (
																<div className="absolute inset-0 bg-black/55 flex items-center justify-center text-white font-semibold text-2xl">
																	+{hiddenCount}
																</div>
															)}
														</button>
													);
												})}
											</div>
											<div className="mt-1.5 text-[11px] text-white/70 flex items-center justify-end gap-1.5 pr-1">
												{statusSource.isMe && (
													<>
														{statusSource.status === "pending" ? (
															<Clock className="w-3.5 h-3.5" />
														) : statusSource.status === "failed" ? (
															<AlertCircle className="w-3.5 h-3.5 text-red-400" />
														) : statusMeta.allRead ? (
															<CheckCheck className="w-3.5 h-3.5 text-sky-300" />
														) : statusMeta.allDelivered ? (
															<CheckCheck className="w-3.5 h-3.5" />
														) : (
															<Check className="w-3.5 h-3.5" />
														)}
														<span>
															{statusMeta.hasPeers
																? `${statusMeta.readCount}/${otherMembersCount} read`
																: "Sent"}
														</span>
													</>
												)}
												<button
													onClick={(event) => {
														event.stopPropagation();
														setReactionPickerFor(
															reactionPickerFor === item.messageId
																? null
																: item.messageId,
														);
													}}
													className="p-1 rounded-full bg-black/35 text-white/70 hover:text-white hover:bg-black/55 transition-colors"
													title="React">
													<ImageIcon className="w-3.5 h-3.5" />
												</button>
											</div>
											<button
												onClick={() => setReplyTarget(item)}
												className="absolute -bottom-3 -left-2 p-1.5 rounded-full bg-black/45 text-white/70 hover:text-white hover:bg-black/65 opacity-0 group-hover:opacity-100 transition-all"
												title="Reply">
												<Reply className="w-3.5 h-3.5" />
											</button>
											{reactionPickerFor === item.messageId && (
												<div className="absolute -bottom-14 right-0 flex gap-1 bg-black/85 rounded-full p-1 w-fit z-20">
													{EMOJI_OPTIONS.map((emoji) => (
														<button
															key={`${item.messageId}-${emoji}`}
															onClick={(event) => {
																event.stopPropagation();
																handleReactToRoomMessage(
																	selectedRoomId,
																	item.messageId,
																	emoji,
																);
																setReactionPickerFor(null);
															}}
															className="text-sm px-1.5 py-0.5 rounded-full hover:bg-white/10">
															{emoji}
														</button>
													))}
												</div>
											)}
										</div>
									);
								}

								const statusMeta = getRoomMessageStatusMeta(item);

								return (
									<div
										key={
											item.messageId || `${item.timestamp}-${index}`
										}
										className={clsx(
											"group relative max-w-[86%] px-3 py-2 rounded-2xl border shadow-sm",
											item.isMe
												? "ml-auto bg-cyan-600/80 border-cyan-400/25"
												: "mr-auto bg-white/10 border-white/10",
											isSelectionMode &&
												selectedMessages.has(item.messageId) &&
												"ring-2 ring-cyan-300/80",
										)}>
										<div
											onContextMenu={(event) => {
												event.preventDefault();
												setReplyTarget(item);
											}}
											onClick={() =>
												handleMessageClick(item.messageId)
											}
											onMouseDown={() => {
												longPressTimerRef.current = setTimeout(
													() => {
														handleMessageLongPress(
															item.messageId,
														);
													},
													500,
												);
											}}
											onMouseUp={() => {
												if (longPressTimerRef.current) {
													clearTimeout(longPressTimerRef.current);
													longPressTimerRef.current = null;
												}
											}}
											onMouseLeave={() => {
												if (longPressTimerRef.current) {
													clearTimeout(longPressTimerRef.current);
													longPressTimerRef.current = null;
												}
											}}
											onTouchStart={(event) =>
												handleBubbleTouchStart(
													event,
													item.messageId,
												)
											}
											onTouchMove={handleBubbleTouchMove}
											onTouchEnd={(event) =>
												handleBubbleTouchEnd(event, item)
											}>
											<p className="text-[11px] text-white/70 mb-1 flex items-center gap-1.5">
												{item.from}
												<span className="opacity-70">
													{formatTime(item.timestamp)}
												</span>
											</p>
											{item.type === "file" ? (
												<div className="space-y-2">
													{item.replyTo?.summary && (
														<div className="px-2.5 py-2 rounded-lg bg-black/20 border-l-2 border-cyan-300/70">
															<p className="text-[10px] uppercase tracking-wide text-cyan-200/90">
																Reply to{" "}
																{item.replyTo.from || "message"}
															</p>
															<p className="text-xs text-white/80 truncate">
																{item.replyTo.summary}
															</p>
														</div>
													)}
													<div className="text-sm break-words leading-relaxed">
														{item.caption
															? item.caption
															: item.fileName}
													</div>
													{item.fileType?.startsWith("image/") ? (
														getRenderableFileUrl(item) &&
														!hasMediaLoadFailed(item) &&
														!isLikelyUnsupportedImage(item) ? (
															<img
																src={getRenderableFileUrl(item)}
																alt={item.fileName}
																className="w-full max-w-[22rem] max-h-[24rem] rounded-xl border border-white/10 object-contain bg-black/20 cursor-pointer"
																onClick={() => handleOpenRoomMedia(item)}
																onContextMenu={(e) => e.preventDefault()}
																onError={() =>
																	markMediaLoadFailed(item.messageId)
																}
															/>
														) : (
															<div className="w-full max-w-[22rem] h-56 rounded-xl bg-black/25 border border-white/10 flex items-center justify-center">
																<button
																	onClick={async (e) => {
																		e.stopPropagation();
																		await handleRedownloadRoomFile(item);
																	}}
																	className="px-4 py-2 rounded-full bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors">
																	Redownload
																</button>
															</div>
														)
													) : item.fileType?.startsWith("video/") ? (
														getRenderableFileUrl(item) &&
														!hasMediaLoadFailed(item) ? (
															<video
																src={getRenderableFileUrl(item)}
																className="w-full max-w-[22rem] max-h-[24rem] rounded-xl border border-white/10 object-contain bg-black/20 cursor-pointer"
																onClick={() => handleOpenRoomMedia(item)}
																onContextMenu={(e) => e.preventDefault()}
																onError={() =>
																	markMediaLoadFailed(item.messageId)
																}
															/>
														) : (
															<div className="w-full max-w-[22rem] h-56 rounded-xl bg-black/25 border border-white/10 flex items-center justify-center">
																<button
																	onClick={async (e) => {
																		e.stopPropagation();
																		await handleRedownloadRoomFile(item);
																	}}
																	className="px-4 py-2 rounded-full bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors">
																	Redownload
																</button>
															</div>
														)
													) : isPdfFile(item) &&
													  getRenderableFileUrl(item) ? (
														<div className="rounded-xl overflow-hidden border border-white/10 bg-black/30">
															<iframe
																title={
																	item.fileName ||
																	"PDF preview"
																}
																src={`${getRenderableFileUrl(item)}#toolbar=0`}
																className="w-full h-52"
															/>
														</div>
													) : (
														<div className="flex items-center gap-2 text-xs text-white/70">
															{getFileTypeIcon(item.fileType)}
															<span>{item.fileName}</span>
														</div>
													)}
													<button
														onClick={async (e) => {
															e.stopPropagation();
															await handleRedownloadRoomFile(item);
														}}
														className="inline-flex items-center gap-1.5 text-xs underline hover:text-cyan-200 text-left">
														<Download className="w-3.5 h-3.5" />
														Download
													</button>
													{item.isUploading && (
														<div className="text-[11px] text-white/70">
															Uploading...{" "}
															{item.uploadProgress || 0}%
														</div>
													)}
												</div>
											) : (
												<div className="space-y-2">
													{item.replyTo?.summary && (
														<div className="px-2.5 py-2 rounded-lg bg-black/20 border-l-2 border-cyan-300/70">
															<p className="text-[10px] uppercase tracking-wide text-cyan-200/90">
																Reply to{" "}
																{item.replyTo.from || "message"}
															</p>
															<p className="text-xs text-white/80 truncate">
																{item.replyTo.summary}
															</p>
														</div>
													)}
													<p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
														{renderTextWithLinks(item.message)}
													</p>
													{detectLinks(item.message).length >
														0 && (
														<div className="space-y-2">
															<a
																href={
																	detectLinks(item.message)[0]
																}
																target="_blank"
																rel="noreferrer"
																className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-black/20">
																<Link2 className="w-3.5 h-3.5" />
																Open link
															</a>
															{renderLinkPreviewCard(
																detectLinks(item.message)[0],
															)}
														</div>
													)}
												</div>
											)}

											<button
												onClick={() => setReplyTarget(item)}
												className="absolute -bottom-3 -left-2 p-1.5 rounded-full bg-black/45 text-white/70 hover:text-white hover:bg-black/65 opacity-0 group-hover:opacity-100 transition-all"
												title="Reply">
												<Reply className="w-3.5 h-3.5" />
											</button>

											{Array.isArray(item.reactions) &&
												item.reactions.length > 0 && (
													<div className="absolute -bottom-3 left-8 flex flex-wrap gap-1 z-10">
														{getReactionSummary(item.reactions).map(
															(reactionItem) => (
																<span
																	key={`${item.messageId}-${reactionItem.emoji}`}
																	className="px-2 py-0.5 rounded-full bg-black/70 text-xs shadow border border-white/10">
																	{reactionItem.emoji} {reactionItem.count}
																</span>
															),
														)}
													</div>
												)}

											<button
												onClick={(event) => {
													event.stopPropagation();
													setReactionPickerFor(
														reactionPickerFor === item.messageId
															? null
															: item.messageId,
													);
												}}
												className="absolute -bottom-3 -left-12 p-1.5 rounded-full bg-black/45 text-white/70 hover:text-white hover:bg-black/65 opacity-0 group-hover:opacity-100 transition-all"
												title="React">
												<ImageIcon className="w-3.5 h-3.5" />
											</button>

											{reactionPickerFor === item.messageId && (
												<div className="absolute -bottom-14 left-0 flex gap-1 bg-black/85 rounded-full p-1 w-fit z-20">
													{EMOJI_OPTIONS.map((emoji) => (
														<button
															key={`${item.messageId}-${emoji}`}
															onClick={(event) => {
																event.stopPropagation();
																handleReactToRoomMessage(
																	selectedRoomId,
																	item.messageId,
																	emoji,
																);
																setReactionPickerFor(null);
															}}
															className="text-sm px-1.5 py-0.5 rounded-full hover:bg-white/10">
															{emoji}
														</button>
													))}
												</div>
											)}

											{item.isMe && (
												<div className="mt-1.5 text-[11px] text-white/70 flex items-center justify-end gap-1.5">
													{item.status === "pending" &&
													!item.isUploading ? (
														<Clock className="w-3.5 h-3.5" />
													) : item.status === "failed" ? (
														<AlertCircle className="w-3.5 h-3.5 text-red-400" />
													) : statusMeta.allRead ? (
														<CheckCheck className="w-3.5 h-3.5 text-sky-300" />
													) : statusMeta.allDelivered ? (
														<CheckCheck className="w-3.5 h-3.5" />
													) : (
														<Check className="w-3.5 h-3.5" />
													)}
													<span>
														{item.isUploading
															? `Uploading ${item.uploadProgress || 0}%`
															: item.status === "pending"
																? "Sending"
																: item.status === "failed"
																	? "Failed"
																	: statusMeta.hasPeers
																		? `${statusMeta.readCount}/${otherMembersCount} read`
																		: "Sent"}
													</span>
													{(item.status === "failed" ||
														item.status === "pending") &&
														!item.isUploading && (
															<button
																onClick={() =>
																	handleRetryRoomMessage(
																		selectedRoomId,
																		item,
																	)
																}
																className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/20 hover:bg-black/30">
																<RefreshCw className="w-3 h-3" />{" "}
																Retry
															</button>
														)}
												</div>
											)}
										</div>
									</div>
								);
							})
						)}

						{selectedRoom.isOwner && (
							<div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
								<p className="text-xs uppercase tracking-[0.15em] text-gray-400 mb-2">
									Invite more peers
								</p>
								<div className="space-y-1.5 max-h-44 overflow-y-auto hide-scrollbar">
									{eligibleOwnerInvites.length === 0 ? (
										<p className="text-sm text-gray-500">
											No eligible peers to invite.
										</p>
									) : (
										eligibleOwnerInvites.map((user) => (
											<button
												key={user.username}
												onClick={() =>
													toggleOwnerInviteUser(user.username)
												}
												className={clsx(
													"w-full text-left px-3 py-2 rounded-lg border text-sm",
													ownerInviteSelection.includes(
														user.username,
													)
														? "border-cyan-400/70 bg-cyan-500/10"
														: "border-white/10 hover:border-white/30",
												)}>
												{user.username}
											</button>
										))
									)}
								</div>
								{eligibleOwnerInvites.length > 0 && (
									<button
										onClick={() => {
											handleInviteUsersToRoom(
												selectedRoom.roomId,
												ownerInviteSelection,
											);
											setOwnerInviteSelection([]);
										}}
										disabled={ownerInviteSelection.length === 0}
										className="mt-3 h-10 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium">
										Send Join Requests
									</button>
								)}
							</div>
						)}
					</div>

					<div className="p-4 border-t border-white/10 flex items-center gap-2 relative">
						{replyTarget && (
							<div className="absolute bottom-16 left-4 right-4 p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="text-[10px] uppercase tracking-wide text-cyan-200">
										Replying to {replyTarget.from || "message"}
									</p>
									<p className="text-xs text-white/80 truncate">
										{buildReplySummary(replyTarget)}
									</p>
								</div>
								<button
									onClick={() => setReplyTarget(null)}
									className="text-xs px-2 py-1 rounded bg-black/20 hover:bg-black/30">
									Cancel
								</button>
							</div>
						)}
						<div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
							<Users className="w-4 h-4" />
						</div>
						<input
							ref={roomFileInputRef}
							type="file"
							accept={ALLOWED_FILE_ACCEPT}
							onChange={handleRoomFileSelect}
							multiple
							className="hidden"
						/>
						<button
							onClick={() => roomFileInputRef.current?.click()}
							className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/15 flex items-center justify-center"
							title="Attach file">
							<Paperclip className="w-4 h-4" />
						</button>
						<input
							type="text"
							value={draftMessage}
							onChange={(e) => setDraftMessage(e.target.value)}
							placeholder="Message room..."
							className="flex-1 h-10 px-3 rounded-lg bg-[#151515] border border-white/10 focus:border-cyan-400/60 outline-none"
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) sendRoomMessage();
							}}
						/>
						<button
							onClick={sendRoomMessage}
							className="w-10 h-10 rounded-lg bg-cyan-600 hover:bg-cyan-500 flex items-center justify-center">
							<Send className="w-4 h-4" />
						</button>
					</div>

					{viewingMedia && (
						<MediaViewerModal
							media={{
								...viewingMedia,
								isMissingMedia:
									hasMediaLoadFailed(viewingMedia) ||
									!getRenderableFileUrl(viewingMedia),
							}}
							onClose={() => setViewingMedia(null)}
							onRedownload={handleRedownloadRoomFile}
							mediaList={roomMediaFiles}
							currentIndex={viewingMediaIndex >= 0 ? viewingMediaIndex : 0}
							onNavigate={(index) => setViewingMedia(roomMediaFiles[index])}
						/>
					)}
				</>
			)}
		</div>
	);
}
