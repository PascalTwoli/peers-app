import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import {
	ArrowLeft,
	Users,
	Send,
	Paperclip,
	Download,
	ExternalLink,
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
	ChevronDown,
	Info,
	Settings,
	UserPlus,
	Crown,
	Smile,
	Plus,
	Play,
} from "lucide-react";
import clsx from "clsx";
import MediaViewerModal from "./MediaViewerModal";
import FilePreviewModal from "./FilePreviewModal";
import BatchPhotoPreviewModal from "./BatchPhotoPreviewModal";
import EmojiPicker from "./EmojiPicker";

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
		roomTypingUsers,
		sendRoomTypingStatus,
		username,
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
	const [imageOrientations, setImageOrientations] = useState({});
	const [showRoomPanel, setShowRoomPanel] = useState(false);
	const [showAttachMenu, setShowAttachMenu] = useState(false);
	const [showEmoji, setShowEmoji] = useState(false);
	const [showScrollButton, setShowScrollButton] = useState(false);
	const [roomFileInputMode, setRoomFileInputMode] = useState("file");
	const [contextMenu, setContextMenu] = useState(null);
	const [selectedRoomFile, setSelectedRoomFile] = useState(null);
	const [showRoomFilePreview, setShowRoomFilePreview] = useState(false);
	const [pendingRoomBatchFiles, setPendingRoomBatchFiles] = useState(null);
	const [showRoomBatchPreview, setShowRoomBatchPreview] = useState(false);

	const messagesEndRef = useRef(null);
	const scrollContainerRef = useRef(null);
	const isAtBottomRef = useRef(true);
	const roomFileInputRef = useRef(null);
	const attachMenuRef = useRef(null);
	const contextMenuRef = useRef(null);
	const textareaRef = useRef(null);
	const longPressTimerRef = useRef(null);
	const touchStartRef = useRef(null);
	const touchMovedRef = useRef(false);
	const typingTimeoutRef = useRef(null);
	const typingIntervalRef = useRef(null);
	const isTypingRef = useRef(false);
	const mediaAutoRetryCountRef = useRef({});

	const otherMembersCount = Math.max(
		(selectedRoom?.members?.length || 1) - 1,
		0,
	);
	const MAX_FILE_SIZE = 10 * 1024 * 1024;
	const EMOJI_OPTIONS = ["👍", "❤️", "😂", "🔥"];
	const ALLOWED_FILE_ACCEPT = "image/*,video/*,application/pdf,text/*";

	const formatFileSize = (bytes) => {
		if (!bytes) return "";
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1048576).toFixed(1)} MB`;
	};

	const getRenderableFileUrl = useCallback(
		(message) => {
			if (!message) return null;
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
		if (!messageId) return;
		setMediaLoadFailures((prev) => {
			if (prev[messageId]) return prev;
			return { ...prev, [messageId]: true };
		});
	}, []);

	const clearMediaLoadFailed = useCallback((messageId) => {
		if (!messageId) return;
		setMediaLoadFailures((prev) => {
			if (!prev[messageId]) return prev;
			const next = { ...prev };
			delete next[messageId];
			return next;
		});
	}, []);

	const hasMediaLoadFailed = useCallback(
		(message) => Boolean(mediaLoadFailures[message?.messageId]),
		[mediaLoadFailures],
	);

	const resolveRoomMessageFileUrl = useCallback(
		async (message) => {
			if (!message) return null;
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
			if (message?.messageId) clearMediaLoadFailed(message.messageId);
			const resolvedUrl = await resolveRoomMessageFileUrl(message);
			if (!resolvedUrl) {
				showToast?.("File URL unavailable. Try again in a moment.", "info");
				return;
			}
			const link = document.createElement("a");
			link.href = resolvedUrl;
			link.download = message.fileName || "file";
			link.click();
		},
		[clearMediaLoadFailed, resolveRoomMessageFileUrl, showToast],
	);

	// Retries loading a photo in-chat without triggering a download
	const handleRetryRoomPhoto = useCallback(
		async (photo) => {
			if (photo?.messageId) {
				clearMediaLoadFailed(photo.messageId);
				mediaAutoRetryCountRef.current[photo.messageId] = 0;
			}
			await resolveRoomMessageFileUrl(photo);
		},
		[clearMediaLoadFailed, resolveRoomMessageFileUrl],
	);

	// Auto-retry on onError before showing the manual Retry button
	const handleRoomPhotoLoadError = useCallback(
		(message) => {
			const id = message?.messageId;
			if (!id) return;
			const count = mediaAutoRetryCountRef.current[id] || 0;
			if (count >= 3) {
				markMediaLoadFailed(id);
				return;
			}
			mediaAutoRetryCountRef.current[id] = count + 1;
			const delay = [2000, 5000, 10000][count];
			setTimeout(async () => {
				const freshUrl = await resolveRoomMessageFileUrl(message);
				if (freshUrl) {
					const ts = Date.now();
					const busted = freshUrl.includes("?")
						? `${freshUrl}&_r=${ts}`
						: `${freshUrl}?_r=${ts}`;
					setMediaUrlOverrides((prev) => ({ ...prev, [id]: busted }));
				} else {
					markMediaLoadFailed(id);
				}
			}, delay);
		},
		[markMediaLoadFailed, resolveRoomMessageFileUrl],
	);

	const handleOpenRoomMedia = useCallback(
		async (message) => {
			if (!message) return;
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

	const scrollToBottom = useCallback((behavior = "smooth") => {
		messagesEndRef.current?.scrollIntoView({ behavior });
	}, []);

	const handleScrollContainer = useCallback(() => {
		const el = scrollContainerRef.current;
		if (!el) return;
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
		isAtBottomRef.current = atBottom;
		setShowScrollButton(!atBottom);
	}, []);

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
		if (typeof text !== "string") return [];
		return text.match(/https?:\/\/[^\s]+/gi) || [];
	};

	const renderTextWithLinks = (text) => {
		if (typeof text !== "string") return null;
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
		if (!url) return null;
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
		if (!message) return "";
		if (message.type === "file")
			return message.caption || message.fileName || "File";
		return message.message || "Message";
	};

	const isPdfFile = (message) =>
		String(message?.fileType || "").toLowerCase() === "application/pdf";

	const getFileTypeIcon = (fileType) => {
		if (fileType?.startsWith("image/"))
			return <FileImage className="w-3.5 h-3.5" />;
		if (fileType?.startsWith("video/"))
			return <FileVideo className="w-3.5 h-3.5" />;
		return <FileText className="w-3.5 h-3.5" />;
	};

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
		if (message?.type !== "file" || message?.isUploading) return false;
		return (
			message.fileKind === "photo" || message.fileType?.startsWith("image/")
		);
	}, []);

	const isGroupableRoomPhotoMessage = useCallback(
		(message) => {
			if (!isRoomPhotoMessage(message)) return false;
			if (isLikelyUnsupportedImage(message)) return false;
			if (message?.caption || message?.replyTo?.summary) return false;
			if (
				Array.isArray(message?.reactions) &&
				message.reactions.length > 0
			)
				return false;
			if (message?.status === "pending" || message?.status === "failed")
				return false;
			return true;
		},
		[isRoomPhotoMessage],
	);

	const getRoomPhotoGroupForIndex = useCallback(
		(startIndex) => {
			const base = selectedRoomMessages[startIndex];
			if (!isGroupableRoomPhotoMessage(base)) return [];
			const sameSide = (item) =>
				Boolean(item?.isMe) === Boolean(base?.isMe);
			const group = [base];
			let lastTimestamp = base?.timestamp || 0;
			for (
				let cursor = startIndex + 1;
				cursor < selectedRoomMessages.length;
				cursor += 1
			) {
				const candidate = selectedRoomMessages[cursor];
				if (
					!isGroupableRoomPhotoMessage(candidate) ||
					!sameSide(candidate)
				)
					break;
				const candidateTimestamp = candidate?.timestamp || 0;
				if (Math.abs(candidateTimestamp - lastTimestamp) > 120000) break;
				group.push(candidate);
				lastTimestamp = candidateTimestamp;
			}
			return group;
		},
		[isGroupableRoomPhotoMessage, selectedRoomMessages],
	);

	const getRoomMessageStatusMeta = (message) => {
		const deliveredBy = Array.isArray(message.deliveredBy)
			? message.deliveredBy
			: [];
		const readBy = Array.isArray(message.readBy) ? message.readBy : [];
		const deliveredCount = new Set(
			deliveredBy.filter((p) => p !== message.from),
		).size;
		const readCount = new Set(
			readBy.filter((p) => p !== message.from),
		).size;
		const allDelivered =
			otherMembersCount > 0 && deliveredCount >= otherMembersCount;
		const allRead =
			otherMembersCount > 0 && readCount >= otherMembersCount;
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
			if (!acc[reaction.emoji])
				acc[reaction.emoji] = { emoji: reaction.emoji, count: 0 };
			acc[reaction.emoji].count += 1;
			return acc;
		}, {});
		return Object.values(grouped);
	};

	useEffect(() => {
		const lastMsg = selectedRoomMessages[selectedRoomMessages.length - 1];
		if (isAtBottomRef.current || lastMsg?.isMe) scrollToBottom("smooth");
	}, [selectedRoomMessages, scrollToBottom]);

	useEffect(() => {
		setReplyTarget(null);
		setShowRoomPanel(false);
	}, [selectedRoomId]);

	useEffect(() => {
		const handleClickOutside = (e) => {
			if (
				showAttachMenu &&
				attachMenuRef.current &&
				!attachMenuRef.current.contains(e.target)
			) {
				setShowAttachMenu(false);
			}
			if (
				contextMenu &&
				contextMenuRef.current &&
				!contextMenuRef.current.contains(e.target)
			) {
				setContextMenu(null);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [showAttachMenu, contextMenu]);

	// Cleanup room typing on unmount / room change
	useEffect(() => {
		return () => {
			if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
			if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
			if (isTypingRef.current && selectedRoomId) {
				sendRoomTypingStatus(selectedRoomId, false);
			}
		};
	}, [selectedRoomId, sendRoomTypingStatus]);

	const eligibleOwnerInvites = useMemo(() => {
		if (!selectedRoom || !selectedRoom.isOwner) return [];
		const pendingInvites = new Set(selectedRoom.pendingInvites || []);
		const members = new Set(selectedRoom.members || []);
		return peerCandidates.filter((user) => {
			const uname = user.username;
			return !members.has(uname) && !pendingInvites.has(uname);
		});
	}, [peerCandidates, selectedRoom]);

	const toggleComposerUser = (uname) => {
		const hasUser = roomComposerDraft.selectedUsers.includes(uname);
		handleUpdateRoomComposer({
			selectedUsers: hasUser
				? roomComposerDraft.selectedUsers.filter((u) => u !== uname)
				: [...roomComposerDraft.selectedUsers, uname],
		});
	};

	const toggleOwnerInviteUser = (uname) => {
		setOwnerInviteSelection((prev) =>
			prev.includes(uname)
				? prev.filter((u) => u !== uname)
				: [...prev, uname],
		);
	};

	const handleRoomInputChange = useCallback(
		(e) => {
			const value = e.target.value;
			setDraftMessage(value);
			e.target.style.height = "auto";
			e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px";

			if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

			if (value && selectedRoomId) {
				if (!isTypingRef.current) {
					isTypingRef.current = true;
					sendRoomTypingStatus(selectedRoomId, true);
					if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
					typingIntervalRef.current = setInterval(() => {
						if (isTypingRef.current) sendRoomTypingStatus(selectedRoomId, true);
					}, 2000);
				}
				typingTimeoutRef.current = setTimeout(() => {
					isTypingRef.current = false;
					sendRoomTypingStatus(selectedRoomId, false);
					if (typingIntervalRef.current) {
						clearInterval(typingIntervalRef.current);
						typingIntervalRef.current = null;
					}
				}, 3000);
			} else if (!value && isTypingRef.current && selectedRoomId) {
				isTypingRef.current = false;
				sendRoomTypingStatus(selectedRoomId, false);
				if (typingIntervalRef.current) {
					clearInterval(typingIntervalRef.current);
					typingIntervalRef.current = null;
				}
			}
		},
		[selectedRoomId, sendRoomTypingStatus],
	);

	const sendRoomMessage = () => {
		if (!draftMessage.trim() || !selectedRoomId) return;
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
		if (textareaRef.current) textareaRef.current.style.height = "auto";
		if (isTypingRef.current) {
			isTypingRef.current = false;
			sendRoomTypingStatus(selectedRoomId, false);
			if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
			if (typingIntervalRef.current) {
				clearInterval(typingIntervalRef.current);
				typingIntervalRef.current = null;
			}
		}
	};

	const handleRoomFileSelect = (event) => {
		const files = Array.from(event.target.files || []);
		if (!files.length || !selectedRoomId) return;
		event.target.value = "";

		const valid = files.filter((file) => {
			if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
				alert("File size must be 10MB or less.");
				return false;
			}
			const ct = file.type || "application/octet-stream";
			const allowed =
				ct.startsWith("image/") ||
				ct.startsWith("video/") ||
				ct.startsWith("text/") ||
				ct === "application/pdf";
			if (!allowed) {
				alert("Only images, videos, PDF, and text files are allowed.");
				return false;
			}
			return true;
		});

		if (!valid.length) return;

		if (valid.length === 1) {
			setSelectedRoomFile(valid[0]);
			setShowRoomFilePreview(true);
		} else {
			// Multiple files — always open batch preview with caption step
			const fileKind = roomFileInputMode === "photo" ? "photo" : "file";
			setPendingRoomBatchFiles({ files: valid, fileKind });
			setShowRoomBatchPreview(true);
		}
	};

	const handleSendRoomFileWithCaption = async (file, caption, fileKind) => {
		if (!file || !selectedRoomId) return;
		try {
			await handleSendRoomFileUpload(selectedRoomId, {
				file,
				fileKind: fileKind || "file",
				caption: caption || "",
			});
		} catch (err) {
			console.error("Error sending room file:", err);
			alert("Failed to send file. Please try again.");
		}
		setSelectedRoomFile(null);
		setShowRoomFilePreview(false);
	};

	const handleSendRoomBatch = async (files, caption, fileKind) => {
		if (!files?.length || !selectedRoomId) return;
		for (const file of files) {
			await handleSendRoomFileUpload(selectedRoomId, {
				file,
				fileKind: fileKind || "photo",
				caption: caption || "",
			});
		}
	};

	const handleEmojiSelect = (emoji) => {
		setDraftMessage((prev) => prev + emoji);
		setShowEmoji(false);
		textareaRef.current?.focus();
	};

	const handleMessageLongPress = (messageId) => {
		setIsSelectionMode(true);
		setSelectedMessages(new Set([messageId]));
	};

	const handleMessageClick = (messageId) => {
		if (!isSelectionMode) return;
		setSelectedMessages((prev) => {
			const next = new Set(prev);
			if (next.has(messageId)) next.delete(messageId);
			else next.add(messageId);
			return next;
		});
	};

	const cancelSelection = () => {
		setIsSelectionMode(false);
		setSelectedMessages(new Set());
	};

	const deleteSelectedMessages = () => {
		const ids = Array.from(selectedMessages).filter(Boolean);
		if (!ids.length || !selectedRoomId) return;
		deleteLocalRoomMessages?.(selectedRoomId, ids);
		cancelSelection();
	};

	const replyToSingleSelected = () => {
		if (selectedMessages.size !== 1) return;
		const targetId = Array.from(selectedMessages)[0];
		const target = selectedRoomMessages.find(
			(message) => message.messageId === targetId,
		);
		if (!target) return;
		setReplyTarget(target);
		cancelSelection();
	};

	const handleBubbleTouchStart = (event, messageId) => {
		const touch = event.touches?.[0];
		if (!touch) return;
		touchStartRef.current = { x: touch.clientX, y: touch.clientY };
		touchMovedRef.current = false;
		longPressTimerRef.current = setTimeout(() => {
			handleMessageLongPress(messageId);
		}, 500);
	};

	const handleBubbleTouchMove = (event) => {
		if (!touchStartRef.current) return;
		const touch = event.touches?.[0];
		if (!touch) return;
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
		if (!touchStartRef.current) return;
		const start = touchStartRef.current;
		touchStartRef.current = null;
		if (!touchMovedRef.current) return;
		const touch = event.changedTouches?.[0];
		if (!touch) return;
		const deltaX = touch.clientX - start.x;
		const deltaY = touch.clientY - start.y;
		if (deltaX > 65 && Math.abs(deltaY) < 40) setReplyTarget(message);
	};

	// ── Create mode ──────────────────────────────────────────────────────────
	if (mode === "create") {
		return (
			<div className="flex-1 flex flex-col bg-black text-white">
				<div className="h-16 px-4 border-b border-white/[0.08] flex items-center gap-3 bg-[#1e1e1e]/80 backdrop-blur-xl flex-shrink-0">
					<button
						onClick={() => setCurrentView("placeholder")}
						className="p-1 -ml-1 hover:bg-white/10 rounded-full transition-colors">
						<ArrowLeft className="w-6 h-6" />
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
								<p className="text-sm text-gray-500">No peers available.</p>
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
											<span className="text-sm">{user.username}</span>
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
	const hasInvite =
		selectedRoom.isInvited || Boolean(roomInviteForSelected);
	const isRoomCallActive =
		roomCallSession?.roomId === selectedRoom.roomId;
	const callParticipantsForRoom =
		roomCallParticipantsByRoom?.[selectedRoom.roomId] || [];
	const hasActiveRoomCall = callParticipantsForRoom.length > 0;
	const hasJoinedBefore = Boolean(
		roomCallLastJoinedByRoom?.[selectedRoom.roomId],
	);
	const incomingRoomCallBy =
		roomCallIncomingByRoom[selectedRoom.roomId];
	const showJoinAction = incomingRoomCallBy || hasActiveRoomCall;
	const primaryCallLabel = isRoomCallActive
		? "Open Call"
		: showJoinAction
			? hasJoinedBefore
				? "Rejoin Call"
				: "Join Call"
			: "Start Call";
	const PrimaryCallIcon = showJoinAction ? PhoneIncoming : Phone;
	const roomInitial = selectedRoom.name?.[0]?.toUpperCase() || "#";

	return (
		<div className="flex-1 flex flex-row bg-black text-white overflow-hidden">
			{/* ── Main chat column ─────────────────────────────────────── */}
			<div className="flex-1 flex flex-col min-w-0 overflow-hidden">

				{/* Header */}
				{isSelectionMode ? (
					<div className="h-16 px-4 border-b border-white/[0.08] flex items-center justify-between bg-[#1e1e1e]/80 backdrop-blur-xl flex-shrink-0">
						<div className="flex items-center gap-3">
							<button
								onClick={cancelSelection}
								className="p-1 -ml-1 hover:bg-white/10 rounded-full transition-colors">
								<X className="w-6 h-6" />
							</button>
							<span className="font-semibold">
								{selectedMessages.size} selected
							</span>
						</div>
						<div className="flex items-center gap-2">
							{selectedMessages.size === 1 && (
								<button
									onClick={replyToSingleSelected}
									className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm">
									<Reply className="w-3.5 h-3.5" /> Reply
								</button>
							)}
							<button
								onClick={deleteSelectedMessages}
								className="p-2.5 rounded-full hover:bg-red-500/20 text-red-400 transition-colors">
								<Trash2 className="w-5 h-5" />
							</button>
						</div>
					</div>
				) : (
					<div className="h-16 px-4 border-b border-white/[0.08] flex items-center justify-between bg-[#1e1e1e]/80 backdrop-blur-xl flex-shrink-0">
						<div className="flex items-center gap-3 flex-1 min-w-0">
							<button
								onClick={() => setCurrentView("placeholder")}
								className="p-1 -ml-1 hover:bg-white/10 rounded-full transition-colors">
								<ArrowLeft className="w-6 h-6" />
							</button>

							<button
								onClick={() => setShowRoomPanel((v) => !v)}
								className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity text-left">
								<div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500/70 to-blue-600/70 flex items-center justify-center font-bold text-sm flex-shrink-0 select-none">
									{roomInitial}
								</div>
								<div className="flex flex-col min-w-0">
									<h3 className="font-semibold truncate">
										{selectedRoom.name}
									</h3>
									<span className="text-xs text-gray-400">
										{selectedRoom.members.length} members
									</span>
								</div>
							</button>
						</div>

						<div className="flex items-center gap-1 flex-shrink-0">
							{isMember && (
								isRoomCallActive ? (
									<button
										onClick={() => setCurrentView("room-call")}
										className="h-9 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-medium transition-colors">
										{primaryCallLabel}
									</button>
								) : showJoinAction ? (
									<button
										onClick={() =>
											handleJoinRoomCall(selectedRoom.roomId)
										}
										className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium flex items-center gap-1.5 animate-pulse transition-colors">
										<PrimaryCallIcon className="w-3.5 h-3.5" />
										{primaryCallLabel}
									</button>
								) : (
									<button
										onClick={() =>
											handleStartRoomCall(selectedRoom.roomId)
										}
										className="p-2.5 rounded-full hover:bg-white/10 transition-all duration-200 hover:scale-105 active:scale-95"
										title="Start Call">
										<Phone className="w-5 h-5" />
									</button>
								)
							)}
							<button
								onClick={() => setShowRoomPanel((v) => !v)}
								className={clsx(
									"p-2.5 rounded-full hover:bg-white/10 transition-colors",
									showRoomPanel && "bg-white/10",
								)}
								title="Room info">
								<Info className="w-5 h-5" />
							</button>
						</div>
					</div>
				)}

				{/* Incoming call banner */}
				{isMember && incomingRoomCallBy && !isRoomCallActive && (
					<div className="px-4 py-2 border-b border-emerald-500/20 bg-emerald-500/10 flex items-center justify-between gap-2 relative overflow-hidden flex-shrink-0">
						<span className="absolute inset-0 bg-emerald-400/10 animate-pulse" />
						<p className="text-xs text-emerald-100 truncate">
							{incomingRoomCallBy} is calling this room
						</p>
						<button
							onClick={() =>
								handleJoinRoomCall(selectedRoom.roomId)
							}
							className="h-7 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-[11px] font-medium animate-bounce">
							Join
						</button>
					</div>
				)}

				{/* Non-member state */}
				{!isMember ? (
					<div className="flex-1 overflow-y-auto p-4 space-y-3">
						<div className="rounded-xl border border-white/10 bg-white/5 p-4">
							<p className="text-sm text-gray-300">
								You are not a member of this room yet.
							</p>
						</div>
						{hasInvite ? (
							<div className="flex items-center gap-2">
								<button
									onClick={() =>
										handleRespondToRoomInvite(
											selectedRoom.roomId,
											true,
										)
									}
									className="h-10 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-sm font-medium">
									Accept Invite
								</button>
								<button
									onClick={() =>
										handleRespondToRoomInvite(
											selectedRoom.roomId,
											false,
										)
									}
									className="h-10 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium">
									Decline
								</button>
							</div>
						) : (
							<button
								onClick={() =>
									handleRequestJoinRoom(selectedRoom.roomId)
								}
								className="h-10 px-4 rounded-lg bg-cyan-600/25 hover:bg-cyan-600/35 text-cyan-100 text-sm font-medium">
								Request to Join
							</button>
						)}
					</div>
				) : (
					/* Member view */
					<div className="flex-1 flex flex-col min-h-0">
						{/* Messages area */}
						<div className="flex-1 relative">
							<div
								ref={scrollContainerRef}
								onScroll={handleScrollContainer}
								className="absolute inset-0 overflow-y-auto p-4 flex flex-col gap-3 hide-scrollbar bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_rgba(0,0,0,0)_45%)]">

								{selectedRoomMessages.length === 0 ? (
									<div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 py-16">
										<div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center">
											<Users className="w-7 h-7 text-cyan-400/60" />
										</div>
										<div className="text-center">
											<p className="font-medium text-white/70">
												No messages yet
											</p>
											<p className="text-sm mt-1">
												Send a message to the room
											</p>
										</div>
									</div>
								) : (
									selectedRoomMessages.map((item, index) => {
										if (
											item?.messageId &&
											groupedRoomPhotoMessageIds.has(
												item.messageId,
											)
										) {
											return null;
										}

										const photoGroup =
											getRoomPhotoGroupForIndex(index);
										if (photoGroup.length > 1) {
											photoGroup
												.slice(1)
												.forEach((groupedMessage) => {
													if (groupedMessage?.messageId) {
														groupedRoomPhotoMessageIds.add(
															groupedMessage.messageId,
														);
													}
												});

											const groupKey =
												item.messageId ||
												`${index}-${photoGroup.length}`;
											const visiblePhotos = photoGroup.slice(
												0,
												4,
											);
											const hiddenCount = Math.max(
												0,
												photoGroup.length -
													visiblePhotos.length,
											);
											const statusSource =
												photoGroup[photoGroup.length - 1] ||
												item;
											const statusMeta =
												getRoomMessageStatusMeta(statusSource);
											const count = visiblePhotos.length;
											const landscapeCount = visiblePhotos.filter(
												(p) =>
													imageOrientations[p.messageId] ===
													"landscape",
											).length;
											const isLandscapeGroup =
												landscapeCount >=
													Math.ceil(count / 2) &&
												landscapeCount > 0;

											return (
												<div
													key={`room-photo-group-${groupKey}`}
													className={clsx(
														"group relative w-full max-w-[min(32rem,70vw)] p-1 rounded-xl",
														item.isMe
															? "self-end bg-primary rounded-br-sm"
															: "self-start bg-surface-light rounded-bl-sm",
														isSelectionMode &&
															selectedMessages.has(
																item.messageId,
															) &&
															"ring-2 ring-cyan-300/80 scale-[0.98]",
													)}
													onClick={() =>
														handleMessageClick(item.messageId)
													}
													onContextMenu={(event) => {
														event.preventDefault();
														setContextMenu({
															x: event.clientX,
															y: event.clientY,
															message: item,
														});
													}}
													onMouseDown={() => {
														longPressTimerRef.current = setTimeout(
															() =>
																handleMessageLongPress(
																	item.messageId,
																),
															500,
														);
													}}
													onMouseUp={() => {
														if (longPressTimerRef.current) {
															clearTimeout(
																longPressTimerRef.current,
															);
															longPressTimerRef.current = null;
														}
													}}
													onMouseLeave={() => {
														if (longPressTimerRef.current) {
															clearTimeout(
																longPressTimerRef.current,
															);
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
													{!item.isMe && (
														<p className="text-[11px] font-medium text-cyan-300/80 mb-1 px-0.5">
															{item.from}
														</p>
													)}
													<div
														className={clsx(
															"rounded-lg overflow-hidden",
															count === 2 &&
																!isLandscapeGroup &&
																"grid grid-cols-2 gap-1 h-[min(32rem,70vw)]",
															count === 2 &&
																isLandscapeGroup &&
																"grid grid-rows-2 gap-1 h-[min(32rem,70vw)]",
															count === 3 &&
																!isLandscapeGroup &&
																"grid grid-cols-[5fr_4fr] grid-rows-2 gap-1 h-[min(32rem,70vw)]",
															count === 3 &&
																isLandscapeGroup &&
																"grid grid-cols-2 grid-rows-2 gap-1 h-[min(32rem,70vw)]",
															count >= 4 &&
																"grid grid-cols-2 gap-1 h-[min(32rem,70vw)]",
														)}>
														{visiblePhotos.map(
															(photo, photoIndex) => {
																const renderableUrl =
																	getRenderableFileUrl(photo);
																const hasFailed =
																	hasMediaLoadFailed(photo);
																const showOverlay =
																	hiddenCount > 0 &&
																	photoIndex ===
																		visiblePhotos.length - 1;

																return (
																	<button
																		key={
																			photo.messageId ||
																			`${groupKey}-${photoIndex}`
																		}
																		onClick={(event) => {
																			event.stopPropagation();
																			handleOpenRoomMedia(
																				photo,
																			);
																		}}
																		onContextMenu={(event) =>
																			event.preventDefault()
																		}
																		className={clsx(
																			"relative overflow-hidden bg-black/30 rounded-lg",
																			count === 3 &&
																				!isLandscapeGroup &&
																				photoIndex === 0 &&
																				"row-span-2",
																			count === 3 &&
																				isLandscapeGroup &&
																				photoIndex === 0 &&
																				"col-span-2",
																		)}>
																		{renderableUrl &&
																		!hasFailed ? (
																			<img
																				src={renderableUrl}
																				alt={
																					photo.fileName ||
																					"photo"
																				}
																				className="absolute inset-0 w-full h-full object-cover"
																				onLoad={(e) => {
																					const {
																						naturalWidth,
																						naturalHeight,
																					} = e.target;
																					setImageOrientations(
																						(prev) => ({
																							...prev,
																							[photo.messageId]:
																								naturalWidth >=
																								naturalHeight
																									? "landscape"
																									: "portrait",
																						}),
																					);
																				}}
																				onError={() => handleRoomPhotoLoadError(photo)}
																				onContextMenu={(
																					event,
																				) =>
																					event.preventDefault()
																				}
																			/>
																		) : (
																			<div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/30">
																				<AlertCircle className="w-5 h-5 text-gray-500" />
																				<button
																					onClick={async (
																						event,
																					) => {
																						event.stopPropagation();
																						await handleRetryRoomPhoto(
																							photo,
																						);
																					}}
																					className="text-xs text-white/70 px-2.5 py-1 rounded-full bg-black/60 hover:bg-black/75 transition-colors">
																					Retry
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
															},
														)}
													</div>
													<div className="mt-1 text-[11px] text-white/60 flex items-center justify-end gap-1.5 pr-0.5">
														<span>
															{formatTime(
																statusSource.timestamp,
															)}
														</span>
														{statusSource.isMe && (
															<>
																{statusSource.status ===
																"pending" ? (
																	<Clock className="w-3.5 h-3.5" />
																) : statusSource.status ===
																  "failed" ? (
																	<AlertCircle className="w-3.5 h-3.5 text-red-400" />
																) : statusMeta.allRead ? (
																	<CheckCheck className="w-3.5 h-3.5 text-sky-300" />
																) : statusMeta.allDelivered ? (
																	<CheckCheck className="w-3.5 h-3.5" />
																) : (
																	<Check className="w-3.5 h-3.5" />
																)}
																{statusMeta.hasPeers && (
																	<span>
																		{statusMeta.readCount}/
																		{otherMembersCount} read
																	</span>
																)}
															</>
														)}
														<button
															onClick={(event) => {
																event.stopPropagation();
																setReactionPickerFor(
																	reactionPickerFor ===
																		item.messageId
																		? null
																		: item.messageId,
																);
															}}
															className="p-1 rounded-full bg-black/35 text-white/70 hover:text-white hover:bg-black/55 transition-colors"
															title="React">
															<Smile className="w-3.5 h-3.5" />
														</button>
													</div>
													{/* Reactions display for photo groups */}
													{Array.isArray(item.reactions) &&
														item.reactions.length > 0 && (
															<div className="flex flex-wrap gap-1 mt-1 px-0.5">
																{getReactionSummary(item.reactions).map(
																	(r) => (
																		<span
																			key={`${item.messageId}-${r.emoji}`}
																			className="px-2 py-0.5 rounded-full bg-black/70 text-xs shadow border border-white/10">
																			{r.emoji} {r.count}
																		</span>
																	),
																)}
															</div>
														)}
													<button
														onClick={() =>
															setReplyTarget(item)
														}
														className="absolute -bottom-3 -left-2 p-1.5 rounded-full bg-black/45 text-white/70 hover:text-white hover:bg-black/65 opacity-0 group-hover:opacity-100 transition-all"
														title="Reply">
														<Reply className="w-3.5 h-3.5" />
													</button>
													{reactionPickerFor ===
														item.messageId && (
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
																		setReactionPickerFor(
																			null,
																		);
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

										// ── Single message bubble ─────────────
										const statusMeta =
											getRoomMessageStatusMeta(item);
										const isVisualMedia =
											item.type === "file" &&
											(item.fileKind === "photo" ||
												item.fileType?.startsWith("image/") ||
												item.fileType?.startsWith("video/"));

										return (
											<div
												key={
													item.messageId ||
													`${item.timestamp}-${index}`
												}
												className={clsx(
													"group max-w-[85%] rounded-xl text-[15px] leading-relaxed relative break-words cursor-pointer transition-all duration-200 animate-message-in",
													isVisualMedia
														? "p-1 overflow-visible"
														: "px-4 py-2.5",
													item.isMe
														? "self-end bg-primary text-white rounded-br-sm hover:brightness-110"
														: "self-start bg-surface-light text-white rounded-bl-sm hover:bg-[#3a3a3a]",
													isSelectionMode &&
														selectedMessages.has(
															item.messageId,
														) &&
														"ring-2 ring-cyan-400/70 scale-[0.98]",
												)}
												style={{
													wordBreak: "break-word",
													overflowWrap: "anywhere",
												}}
												onClick={() =>
													handleMessageClick(item.messageId)
												}
												onContextMenu={(event) => {
													event.preventDefault();
													setContextMenu({
														x: event.clientX,
														y: event.clientY,
														message: item,
													});
												}}
												onMouseDown={() => {
													longPressTimerRef.current = setTimeout(
														() =>
															handleMessageLongPress(
																item.messageId,
															),
														500,
													);
												}}
												onMouseUp={() => {
													if (longPressTimerRef.current) {
														clearTimeout(
															longPressTimerRef.current,
														);
														longPressTimerRef.current = null;
													}
												}}
												onMouseLeave={() => {
													if (longPressTimerRef.current) {
														clearTimeout(
															longPressTimerRef.current,
														);
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

												{/* Sender name for others' messages */}
												{!item.isMe && !isVisualMedia && (
													<p className="text-[11px] font-medium text-cyan-300/80 mb-0.5">
														{item.from}
													</p>
												)}
												{!item.isMe && isVisualMedia && (
													<p className="text-[11px] font-medium text-cyan-300/80 mb-1 px-0.5">
														{item.from}
													</p>
												)}

												{item.type === "file" ? (
													<div className={clsx("flex flex-col gap-2", !isVisualMedia && "")}>
														{item.replyTo?.summary && (
															<div className="px-2.5 py-2 rounded-lg bg-black/20 border-l-2 border-cyan-300/70">
																<p className="text-[10px] uppercase tracking-wide text-cyan-200/90">
																	Reply to{" "}
																	{item.replyTo.from ||
																		"message"}
																</p>
																<p className="text-xs text-white/80 truncate">
																	{item.replyTo.summary}
																</p>
															</div>
														)}
														{item.isUploading ? (
															<div className="p-3 bg-black/20 rounded-xl">
																<p className="text-sm font-medium truncate">
																	{item.fileName}
																</p>
																<div className="mt-2 h-2 w-full rounded-full bg-white/20 overflow-hidden">
																	<div
																		className="h-full bg-cyan-400 transition-all duration-150"
																		style={{
																			width: `${item.uploadProgress || 0}%`,
																		}}
																	/>
																</div>
																<p className="text-xs text-white/70 mt-1">
																	{item.uploadProgress || 0}%
																	uploading
																</p>
															</div>
														) : item.fileType?.startsWith(
																"image/",
															) ? (
															getRenderableFileUrl(item) &&
															!hasMediaLoadFailed(item) &&
															!isLikelyUnsupportedImage(
																item,
															) ? (
																<img
																	src={getRenderableFileUrl(
																		item,
																	)}
																	alt={item.fileName}
																	className="w-full max-w-[min(30rem,70vw)] max-h-[32rem] rounded-lg cursor-pointer hover:opacity-90 transition-opacity object-contain bg-black/20"
																	onClick={() =>
																		handleOpenRoomMedia(item)
																	}
																	onContextMenu={(e) =>
																		e.preventDefault()
																	}
																	onError={() => handleRoomPhotoLoadError(item)}
																/>
															) : (
																<div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-black/25 border border-white/10 max-w-[min(22rem,70vw)]">
																	<div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
																		<ImageIcon className="w-4 h-4 text-white/40" />
																	</div>
																	<div className="flex-1 min-w-0">
																		<p className="text-sm font-medium truncate text-white/90">
																			{item.fileName}
																		</p>
																		<p className="text-xs text-white/50">
																			{item.fileType
																				?.split("/")[1]
																				?.toUpperCase() ||
																				"IMAGE"}
																			{item.fileSize
																				? ` · ${formatFileSize(item.fileSize)}`
																				: ""}
																			{" · Can't preview"}
																		</p>
																	</div>
																	<button
																		onClick={async (e) => {
																			e.stopPropagation();
																			await handleRedownloadRoomFile(
																				item,
																			);
																		}}
																		className="flex-shrink-0 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
																		title="Download">
																		<Download className="w-4 h-4 text-white/70" />
																	</button>
																</div>
															)
														) : item.fileType?.startsWith(
																"video/",
															) ? (
															getRenderableFileUrl(item) &&
															!hasMediaLoadFailed(item) ? (
																<div
																	className="relative cursor-pointer group/video"
																	onClick={() =>
																		handleOpenRoomMedia(item)
																	}
																	onContextMenu={(e) =>
																		e.preventDefault()
																	}>
																	<video
																		src={getRenderableFileUrl(
																			item,
																		)}
																		className="w-full max-w-[min(22rem,70vw)] max-h-[24rem] rounded-lg object-contain bg-black/20"
																		onError={() => handleRoomPhotoLoadError(item)}
																	/>
																	<div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl group-hover/video:bg-black/50 transition-colors">
																		<div className="w-14 h-14 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center group-hover/video:scale-110 transition-transform">
																			<Play
																				className="w-7 h-7 ml-1"
																				fill="white"
																			/>
																		</div>
																	</div>
																</div>
															) : (
																<div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-black/25 border border-white/10 max-w-[min(22rem,70vw)]">
																	<div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
																		<Play
																			className="w-4 h-4 text-white/40"
																			fill="currentColor"
																		/>
																	</div>
																	<div className="flex-1 min-w-0">
																		<p className="text-sm font-medium truncate text-white/90">
																			{item.fileName}
																		</p>
																		<p className="text-xs text-white/50">
																			{item.fileType
																				?.split("/")[1]
																				?.toUpperCase() ||
																				"VIDEO"}
																			{item.fileSize
																				? ` · ${formatFileSize(item.fileSize)}`
																				: ""}
																			{" · Can't preview"}
																		</p>
																	</div>
																	<button
																		onClick={async (e) => {
																			e.stopPropagation();
																			await handleRedownloadRoomFile(
																				item,
																			);
																		}}
																		className="flex-shrink-0 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
																		title="Download">
																		<Download className="w-4 h-4 text-white/70" />
																	</button>
																</div>
															)
														) : (
															<div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-black/25 border border-white/10 max-w-[min(24rem,80vw)]">
																<div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
																	<Paperclip className="w-4 h-4 text-white/60" />
																</div>
																<div className="flex-1 min-w-0">
																	<p className="text-sm font-medium truncate text-white/90">
																		{item.fileName}
																	</p>
																	<p className="text-xs text-white/50">
																		{item.fileType?.split('/').pop()?.toUpperCase() || 'FILE'}
																		{item.fileSize ? ` · ${formatFileSize(item.fileSize)}` : ''}
																	</p>
																</div>
																<div className="flex items-center gap-1 flex-shrink-0">
																	{getRenderableFileUrl(item) && (
																		<button
																			onClick={async (e) => {
																			e.stopPropagation();
																			const url = await resolveRoomMessageFileUrl(item);
																			if (url) window.open(url, "_blank");
																		}}
																		className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
																		title="Open">
																		<ExternalLink className="w-4 h-4 text-white/70" />
																		</button>
																	)}
																	<button
																		onClick={async (e) => {
																		e.stopPropagation();
																		await handleRedownloadRoomFile(item);
																	}}
																	className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
																	title="Download">
																	<Download className="w-4 h-4 text-white/70" />
																</button>
																</div>
															</div>
														)}
														{item.caption && (
															<p className="text-sm px-1">
																{item.caption}
															</p>
														)}
													</div>
												) : (
													<div className="space-y-2">
														{item.replyTo?.summary && (
															<div className="px-2.5 py-2 rounded-lg bg-black/20 border-l-2 border-cyan-300/70">
																<p className="text-[10px] uppercase tracking-wide text-cyan-200/90">
																	Reply to{" "}
																	{item.replyTo.from ||
																		"message"}
																</p>
																<p className="text-xs text-white/80 truncate">
																	{item.replyTo.summary}
																</p>
															</div>
														)}
														<p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
															{renderTextWithLinks(
																item.message,
															)}
														</p>
														{detectLinks(item.message).length >
															0 && (
															<div className="space-y-2">
																<a
																	href={
																		detectLinks(
																			item.message,
																		)[0]
																	}
																	target="_blank"
																	rel="noreferrer"
																	className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-black/20">
																	<Link2 className="w-3.5 h-3.5" />
																	Open link
																</a>
																{renderLinkPreviewCard(
																	detectLinks(
																		item.message,
																	)[0],
																)}
															</div>
														)}
													</div>
												)}

												{/* Timestamp + status */}
												<div className="flex items-center justify-end gap-1 mt-1">
													<span className="text-[10px] text-white/60">
														{formatTime(item.timestamp)}
													</span>
													{item.isMe && (
														<span className="flex items-center ml-1">
															{item.status === "pending" &&
															!item.isUploading ? (
																<Clock className="w-3.5 h-3.5 text-gray-300" />
															) : item.status === "failed" ? (
																<AlertCircle className="w-3.5 h-3.5 text-red-400" />
															) : statusMeta.allRead ? (
																<CheckCheck className="w-3.5 h-3.5 text-sky-300" />
															) : statusMeta.allDelivered ? (
																<CheckCheck className="w-3.5 h-3.5" />
															) : (
																<Check className="w-3.5 h-3.5" />
															)}
														</span>
													)}
													{item.isMe &&
														statusMeta.hasPeers && (
															<span className="text-[10px] text-white/60 ml-0.5">
																{statusMeta.readCount}/
																{otherMembersCount} read
															</span>
														)}
													{item.isMe &&
														(item.status === "failed" ||
															item.status === "pending") &&
														!item.isUploading && (
															<button
																onClick={(e) => {
																	e.stopPropagation();
																	handleRetryRoomMessage(
																		selectedRoomId,
																		item,
																	);
																}}
																className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-black/20 hover:bg-black/30">
																<RefreshCw className="w-3 h-3" />{" "}
																Retry
															</button>
														)}
												</div>

												{/* Reactions display */}
												{Array.isArray(item.reactions) &&
													item.reactions.length > 0 && (
														<div className="absolute -bottom-3 left-3 flex flex-wrap gap-1 z-10">
															{getReactionSummary(
																item.reactions,
															).map((reactionItem) => (
																<span
																	key={`${item.messageId}-${reactionItem.emoji}`}
																	className="px-2 py-0.5 rounded-full bg-black/70 text-xs shadow-lg border border-white/10">
																	{reactionItem.emoji}{" "}
																	{reactionItem.count}
																</span>
															))}
														</div>
													)}

												{/* Reaction hover button */}
												<button
													onClick={(event) => {
														event.stopPropagation();
														setReactionPickerFor(
															reactionPickerFor ===
																item.messageId
																? null
																: item.messageId,
														);
													}}
													className="absolute -bottom-3 -left-2 p-1.5 rounded-full bg-black/45 text-white/70 hover:text-white hover:bg-black/65 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
													title="React">
													<Smile className="w-3.5 h-3.5" />
												</button>

												{/* Reply hover button */}
												<button
													onClick={(e) => {
														e.stopPropagation();
														setReplyTarget(item);
													}}
													className="absolute -bottom-3 -left-10 p-1.5 rounded-full bg-black/45 text-white/70 hover:text-white hover:bg-black/65 opacity-0 group-hover:opacity-100 transition-all"
													title="Reply">
													<Reply className="w-3.5 h-3.5" />
												</button>

												{/* Reaction picker */}
												{reactionPickerFor ===
													item.messageId && (
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
											</div>
										);
									})
								)}

								{/* Typing indicator */}
								{(() => {
									const typers = Object.keys(
										roomTypingUsers?.[selectedRoomId] || {},
									);
									if (!typers.length) return null;
									const label =
										typers.length === 1
											? `${typers[0]} is typing…`
											: typers.length === 2
												? `${typers[0]} and ${typers[1]} are typing…`
												: "Several people are typing…";
									return (
										<div className="self-start flex items-center gap-2 px-4 py-2.5 bg-surface-light rounded-xl rounded-bl-sm max-w-[80%]">
											<div className="flex gap-1">
												<span
													className="w-2 h-2 bg-gray-400 rounded-full animate-typing-dot"
													style={{ animationDelay: "0ms" }}
												/>
												<span
													className="w-2 h-2 bg-gray-400 rounded-full animate-typing-dot"
													style={{ animationDelay: "150ms" }}
												/>
												<span
													className="w-2 h-2 bg-gray-400 rounded-full animate-typing-dot"
													style={{ animationDelay: "300ms" }}
												/>
											</div>
											<span className="text-xs text-gray-400">
												{label}
											</span>
										</div>
									);
								})()}

								<div ref={messagesEndRef} />
							</div>

							{/* Scroll-to-bottom button */}
							{showScrollButton && (
								<button
									onClick={() => scrollToBottom()}
									className="absolute bottom-4 right-4 z-10 w-9 h-9 rounded-full bg-[#1f1f1f] hover:bg-[#2a2a2a] border border-white/10 shadow-lg flex items-center justify-center transition-all">
									<ChevronDown className="w-5 h-5 text-white/70" />
								</button>
							)}
						</div>

						{/* ── Input area ───────────────────────────────────── */}
						<div className="p-3 border-t border-[#333] bg-surface flex items-end gap-2 relative flex-shrink-0">
							{/* Attachment menu */}
							<div
								className="relative flex-shrink-0"
								ref={attachMenuRef}>
								<button
									onClick={() => setShowAttachMenu((v) => !v)}
									className={clsx(
										"p-2.5 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] hover:opacity-80 transition-all duration-200",
										showAttachMenu && "rotate-45",
									)}
									title="Attachments">
									<Plus className="w-5 h-5" />
								</button>

								{showAttachMenu && (
									<div className="absolute bottom-14 left-0 flex flex-col gap-1.5 bg-[#252525] p-2.5 rounded-2xl shadow-2xl border border-white/10 z-50 min-w-[140px]">
										<button
											onClick={() => {
												setShowEmoji((v) => !v);
												setShowAttachMenu(false);
											}}
											className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-left">
											<div className="p-2 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500">
												<Smile className="w-4 h-4" />
											</div>
											<span className="text-sm font-medium">
												Emoji
											</span>
										</button>
										<button
											onClick={() => {
												setRoomFileInputMode("photo");
												setTimeout(
													() => roomFileInputRef.current?.click(),
													0,
												);
												setShowAttachMenu(false);
											}}
											className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-left">
											<div className="p-2 rounded-full bg-gradient-to-br from-pink-400 to-rose-600">
												<ImageIcon className="w-4 h-4" />
											</div>
											<span className="text-sm font-medium">
												Photos
											</span>
										</button>
										<button
											onClick={() => {
												setRoomFileInputMode("file");
												setTimeout(
													() => roomFileInputRef.current?.click(),
													0,
												);
												setShowAttachMenu(false);
											}}
											className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-left">
											<div className="p-2 rounded-full bg-gradient-to-br from-blue-400 to-blue-600">
												<Paperclip className="w-4 h-4" />
											</div>
											<span className="text-sm font-medium">
												File
											</span>
										</button>
									</div>
								)}
							</div>

							<input
								ref={roomFileInputRef}
								type="file"
								accept={
									roomFileInputMode === "photo"
										? "image/*,video/*"
										: ALLOWED_FILE_ACCEPT
								}
								onChange={handleRoomFileSelect}
								multiple
								className="hidden"
							/>

							{showEmoji && (
								<div className="z-50">
									<EmojiPicker
										onSelect={handleEmojiSelect}
										onClose={() => setShowEmoji(false)}
									/>
								</div>
							)}

							{/* Reply banner */}
							{replyTarget && (
								<div className="absolute bottom-20 left-4 right-4 p-2.5 rounded-xl bg-surface-light border border-white/10 flex items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="text-[10px] uppercase tracking-wide text-cyan-200">
											Replying to{" "}
											{replyTarget.from || "message"}
										</p>
										<p className="text-xs text-white/80 truncate">
											{buildReplySummary(replyTarget)}
										</p>
									</div>
									<button
										onClick={() => setReplyTarget(null)}
										className="p-1 rounded hover:bg-white/10 transition-colors"
										title="Cancel reply">
										<X className="w-3.5 h-3.5" />
									</button>
								</div>
							)}

							<textarea
								ref={textareaRef}
								value={draftMessage}
								onChange={handleRoomInputChange}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										sendRoomMessage();
									}
								}}
								placeholder="Message room..."
								autoComplete="off"
								spellCheck={false}
								rows={1}
								className="flex-1 min-w-0 py-3 px-4 bg-surface-light rounded-3xl text-white outline-none text-base resize-none overflow-y-auto max-h-32"
								style={{ lineHeight: "1.5" }}
							/>

							<button
								onClick={sendRoomMessage}
								disabled={!draftMessage.trim()}
								className="p-2.5 rounded-full bg-primary hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
								<Send className="w-5 h-5" />
							</button>
						</div>

						{/* Context menu */}
						{contextMenu && (
							<div
								ref={contextMenuRef}
								className="fixed z-[70] min-w-[160px] rounded-xl border border-white/10 bg-[#1f1f1f] p-1.5 shadow-2xl"
								style={{
									left: contextMenu.x,
									top: contextMenu.y,
								}}>
								<button
									onClick={() => {
										setReplyTarget(contextMenu.message);
										setContextMenu(null);
									}}
									className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm">
									Reply
								</button>
								<div className="px-2 py-1 text-[11px] text-gray-400">
									React
								</div>
								<div className="flex gap-1 px-2 pb-2">
									{EMOJI_OPTIONS.map((emoji) => (
										<button
											key={`ctx-${emoji}`}
											onClick={() => {
												handleReactToRoomMessage(
													selectedRoomId,
													contextMenu.message.messageId,
													emoji,
												);
												setContextMenu(null);
											}}
											className="px-2 py-1 rounded-full hover:bg-white/10 text-sm">
											{emoji}
										</button>
									))}
								</div>
							</div>
						)}

						{/* Single-file preview modal */}
						{showRoomFilePreview && selectedRoomFile && (
							<FilePreviewModal
								file={selectedRoomFile}
								initialFileKind={
									selectedRoomFile.type.startsWith("image/") ||
									selectedRoomFile.type.startsWith("video/")
										? "photo"
										: "file"
								}
								onSend={handleSendRoomFileWithCaption}
								onClose={() => {
									setShowRoomFilePreview(false);
									setSelectedRoomFile(null);
								}}
							/>
						)}

						{/* Multi-photo caption modal */}
						{showRoomBatchPreview && pendingRoomBatchFiles && (
							<BatchPhotoPreviewModal
								files={pendingRoomBatchFiles.files}
								fileKind={pendingRoomBatchFiles.fileKind}
								onSend={(files, caption, fileKind) => {
									handleSendRoomBatch(files, caption, fileKind).catch((err) =>
										console.error("Batch send failed:", err),
									);
								}}
								onClose={() => {
									setShowRoomBatchPreview(false);
									setPendingRoomBatchFiles(null);
								}}
							/>
						)}

						{/* Media viewer modal */}
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
								currentIndex={
									viewingMediaIndex >= 0 ? viewingMediaIndex : 0
								}
								onNavigate={(index) =>
									setViewingMedia(roomMediaFiles[index])
								}
							/>
						)}
					</div>
				)}
			</div>

			{/* ── Room Profile Panel ────────────────────────────────────── */}
			{showRoomPanel && isMember && (
				<>
					{/* Mobile backdrop */}
					<div
						className="fixed inset-0 bg-black/60 z-40 md:hidden"
						onClick={() => setShowRoomPanel(false)}
					/>

					{/* Panel */}
					<div className="fixed inset-y-0 right-0 w-full sm:w-80 z-50 md:relative md:inset-auto md:w-72 md:z-auto flex flex-col bg-[#0e0e0e] border-l border-white/10">
						{/* Panel header */}
						<div className="h-16 px-4 border-b border-white/[0.08] flex items-center justify-between flex-shrink-0 bg-[#1e1e1e]/80 backdrop-blur-xl">
							<h3 className="font-semibold">Room Info</h3>
							<button
								onClick={() => setShowRoomPanel(false)}
								className="p-2 rounded-full hover:bg-white/10 transition-colors">
								<X className="w-5 h-5" />
							</button>
						</div>

						{/* Panel content */}
						<div className="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-5">
							{/* Room identity */}
							<div className="text-center py-4">
								<div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/70 to-blue-600/70 mx-auto flex items-center justify-center text-2xl font-bold mb-3 select-none">
									{roomInitial}
								</div>
								<h2 className="text-lg font-semibold">
									{selectedRoom.name}
								</h2>
								<p className="text-sm text-gray-400 mt-0.5">
									{selectedRoom.members.length} members ·{" "}
									{selectedRoom.owner
										? `Owner: ${selectedRoom.owner}`
										: ""}
								</p>
							</div>

							{/* Members list */}
							<div>
								<p className="text-xs uppercase tracking-[0.15em] text-gray-500 mb-2">
									Members
								</p>
								<div className="space-y-1">
									{selectedRoom.members.map((member) => (
										<div
											key={member}
											className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5">
											<div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold flex-shrink-0">
												{member[0]?.toUpperCase()}
											</div>
											<span className="text-sm flex-1 truncate">
												{member}
											</span>
											{member === selectedRoom.owner && (
												<Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
											)}
											<span
												className={clsx(
													"w-2 h-2 rounded-full flex-shrink-0",
													onlineUsers.includes(member)
														? "bg-green-400"
														: "bg-gray-600",
												)}
											/>
										</div>
									))}
								</div>
							</div>

							{/* Invite peers (owner only) */}
							{selectedRoom.isOwner && (
								<div>
									<p className="text-xs uppercase tracking-[0.15em] text-gray-500 mb-2">
										Invite Peers
									</p>
									{eligibleOwnerInvites.length === 0 ? (
										<p className="text-sm text-gray-500 px-1">
											No eligible peers to invite.
										</p>
									) : (
										<>
											<div className="space-y-1 max-h-48 overflow-y-auto hide-scrollbar">
												{eligibleOwnerInvites.map((user) => (
													<button
														key={user.username}
														onClick={() =>
															toggleOwnerInviteUser(
																user.username,
															)
														}
														className={clsx(
															"w-full text-left px-3 py-2 rounded-lg border text-sm flex items-center justify-between transition-colors",
															ownerInviteSelection.includes(
																user.username,
															)
																? "border-cyan-400/70 bg-cyan-500/10"
																: "border-white/10 hover:border-white/30",
														)}>
														<span>{user.username}</span>
														{onlineUsers.includes(
															user.username,
														) && (
															<span className="text-xs text-green-400">
																Online
															</span>
														)}
													</button>
												))}
											</div>
											{ownerInviteSelection.length > 0 && (
												<button
													onClick={() => {
														handleInviteUsersToRoom(
															selectedRoom.roomId,
															ownerInviteSelection,
														);
														setOwnerInviteSelection([]);
													}}
													className="mt-2 w-full h-10 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-sm font-medium flex items-center justify-center gap-2 transition-colors">
													<UserPlus className="w-4 h-4" />
													Send Invites (
													{ownerInviteSelection.length})
												</button>
											)}
										</>
									)}
								</div>
							)}

							{/* Room settings (owner only) */}
							{selectedRoom.isOwner && (
								<div>
									<p className="text-xs uppercase tracking-[0.15em] text-gray-500 mb-2">
										Settings
									</p>
									<button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-left transition-colors">
										<Settings className="w-4 h-4 text-gray-400 flex-shrink-0" />
										Room Settings
									</button>
								</div>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
