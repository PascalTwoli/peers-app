import { useState, useRef, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import {
	ArrowLeft,
	Phone,
	PhoneOff,
	PhoneMissed,
	Video,
	Send,
	Smile,
	Paperclip,
	FolderOpen,
	ExternalLink,
	Bookmark,
	Trash2,
	X,
	Plus,
	Play,
	Download,
	Clock,
	Image,
	AlertCircle,
	RefreshCw,
	Link2,
	ChevronDown,
} from "lucide-react";
import clsx from "clsx";
import EmojiPicker from "./EmojiPicker";
import FilePreviewModal from "./FilePreviewModal";
import BatchPhotoPreviewModal from "./BatchPhotoPreviewModal";
import MediaViewerModal from "./MediaViewerModal";
import SavedFilesModal from "./SavedFilesModal";
import {
	saveFile,
	deleteMessage as deleteMessageFromDB,
	searchConversationMessages,
} from "../services/storageService";

// Custom check icons for message status (bolder stroke)
const CheckIcon = ({ className = "" }) => (
	<svg
		className={className}
		viewBox="0 0 16 16"
		fill="currentColor"
		width="14"
		height="14"
		style={{ strokeWidth: 1 }}>
		<path d="M13.485 3.929a1 1 0 0 1 .057 1.413l-6.5 7a1 1 0 0 1-1.436.033l-3.5-3.5a1 1 0 1 1 1.414-1.414l2.757 2.757 5.794-6.232a1 1 0 0 1 1.414-.057z" />
	</svg>
);

const CheckAllIcon = ({ className = "" }) => (
	<svg
		className={className}
		viewBox="0 0 16 16"
		fill="currentColor"
		width="16"
		height="16">
		<path d="M12.354 3.646a1 1 0 0 1 0 1.414l-7 7a1 1 0 0 1-1.414 0l-3.5-3.5a1 1 0 1 1 1.414-1.414L4.5 9.793l6.146-6.147a1 1 0 0 1 1.414 0z" />
		<path d="M7.354 10.354l-1-1 1.414-1.414 1 1-1.414 1.414zM15.354 3.646a1 1 0 0 1 0 1.414l-7 7a1 1 0 0 1-1.414 0l-.293-.293 1.414-1.414.293.293 6.293-6.293a1 1 0 0 1 1.414 0z" />
	</svg>
);

export default function ChatInterface() {
	const {
		username,
		selectedUser,
		callPeer,
		setSelectedUser,
		messages,
		typingUsers,
		isCallActive,
		setCurrentView,
		setSidebarOpen,
		handleStartCall,
		handleSendMessage,
		handleSendFileUpload,
		handleEditMessage,
		handleReactToMessage,
		handleRetryMessage,
		sendTypingStatus,
		sendMessage,
		deleteLocalMessages,
		showToast,
		resolveFileDownloadUrl,
		localStream,
		isMuted,
		onlineUsers,
	} = useApp();

	// Ensure audio track stays enabled during call when viewing chat
	useEffect(() => {
		if (isCallActive && localStream && !isMuted) {
			const audioTrack = localStream.getAudioTracks()[0];
			if (audioTrack && !audioTrack.enabled) {
				audioTrack.enabled = true;
			}
		}
	}, [isCallActive, localStream, isMuted]);

	const [inputValue, setInputValue] = useState("");
	const [showEmoji, setShowEmoji] = useState(false);
	const [selectedFile, setSelectedFile] = useState(null);
	const [showFilePreview, setShowFilePreview] = useState(false);
	const [fileInputMode, setFileInputMode] = useState("file");
	const [selectedFileKind, setSelectedFileKind] = useState("file");
	const [viewingMedia, setViewingMedia] = useState(null);
	const [showSavedFiles, setShowSavedFiles] = useState(false);
	const [selectedMessages, setSelectedMessages] = useState(new Set());
	const [isSelectionMode, setIsSelectionMode] = useState(false);
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [showAttachMenu, setShowAttachMenu] = useState(false);
	const [editingMessageId, setEditingMessageId] = useState(null);
	const [editingText, setEditingText] = useState("");
	const [reactionPickerFor, setReactionPickerFor] = useState(null);
	const [mediaLoadFailures, setMediaLoadFailures] = useState({});
	const [mediaUrlOverrides, setMediaUrlOverrides] = useState({});
	const [contextMenu, setContextMenu] = useState(null);
	const [pendingBatchFiles, setPendingBatchFiles] = useState(null);
	const [showBatchPreview, setShowBatchPreview] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResultIds, setSearchResultIds] = useState([]);
	const [replyTarget, setReplyTarget] = useState(null);
	const messagesEndRef = useRef(null);
	const scrollContainerRef = useRef(null);
	const isAtBottomRef = useRef(true);
	const [showScrollButton, setShowScrollButton] = useState(false);
	const [imageOrientations, setImageOrientations] = useState({});
	const inputRef = useRef(null);
	const fileInputRef = useRef(null);
	const attachMenuRef = useRef(null);
	const typingTimeoutRef = useRef(null);
	const typingIntervalRef = useRef(null);
	const isTypingRef = useRef(false);
	const longPressTimerRef = useRef(null);
	const contextMenuRef = useRef(null);
	const mediaAutoRetryCountRef = useRef({});
	const searchTimeoutRef = useRef(null);
	const touchStartRef = useRef(null);
	const touchMovedRef = useRef(false);

	const userMessages = messages[selectedUser] || [];
	const isPeerTyping = selectedUser && typingUsers[selectedUser];
	const searchResultSet = new Set(searchResultIds);

	// Get all media files from messages for navigation
	const mediaFiles = userMessages.filter(
		(msg) =>
			msg.type === "file" &&
			(msg.fileType?.startsWith("image/") ||
				msg.fileType?.startsWith("video/")),
	);
	const viewingMediaIndex = viewingMedia
		? mediaFiles.findIndex((m) => m.messageId === viewingMedia.messageId)
		: -1;
	const groupedPhotoMessageIds = new Set();

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

	useEffect(() => {
		const lastMsg = userMessages[userMessages.length - 1];
		const isMyMessage = lastMsg?.isMe || lastMsg?.from === username;
		if (isAtBottomRef.current || isMyMessage) {
			scrollToBottom("smooth");
		}
	}, [userMessages, scrollToBottom]);

	useEffect(() => {
		if (isPeerTyping && isAtBottomRef.current) {
			scrollToBottom("smooth");
		}
	}, [isPeerTyping, scrollToBottom]);

	useEffect(() => {
		if (searchTimeoutRef.current) {
			clearTimeout(searchTimeoutRef.current);
		}

		if (!searchQuery.trim() || !selectedUser) {
			setSearchResultIds([]);
			return;
		}

		searchTimeoutRef.current = setTimeout(async () => {
			try {
				const results = await searchConversationMessages(
					username,
					selectedUser,
					searchQuery,
				);
				const resultIds = results
					.map((result) => result.messageId)
					.filter(Boolean);
				setSearchResultIds(resultIds);

				if (resultIds.length > 0) {
					setTimeout(() => {
						const firstElement = document.querySelector(
							`[data-message-id="${resultIds[0]}"]`,
						);
						firstElement?.scrollIntoView({
							behavior: "smooth",
							block: "center",
						});
					}, 0);
				}
			} catch (error) {
				console.error("Failed to search messages:", error);
			}
		}, 200);

		return () => {
			if (searchTimeoutRef.current) {
				clearTimeout(searchTimeoutRef.current);
			}
		};
	}, [searchQuery, selectedUser, username]);

	// Cleanup typing timeout on unmount
	useEffect(() => {
		return () => {
			if (typingTimeoutRef.current) {
				clearTimeout(typingTimeoutRef.current);
			}
			if (typingIntervalRef.current) {
				clearInterval(typingIntervalRef.current);
			}
			if (isTypingRef.current) {
				sendTypingStatus(false);
			}
		};
	}, [sendTypingStatus]);

	// Click outside to close attachment menu
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
		return () =>
			document.removeEventListener("mousedown", handleClickOutside);
	}, [showAttachMenu, contextMenu]);

	// Escape key to go back
	useEffect(() => {
		const handleKeyDown = (e) => {
			if (e.key === "Escape") {
				if (showAttachMenu) {
					setShowAttachMenu(false);
				} else if (
					!isCallActive &&
					!showFilePreview &&
					!viewingMedia &&
					!showSavedFiles &&
					!showDeleteModal
				) {
					setCurrentView("placeholder");
					setSelectedUser(null);
				}
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		isCallActive,
		showFilePreview,
		viewingMedia,
		showSavedFiles,
		showDeleteModal,
		showAttachMenu,
		setCurrentView,
		setSelectedUser,
	]);

	const getInitials = (name) => {
		if (!name) return "??";
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase()
			.substring(0, 2);
	};

	const getAvatarColor = (name) => {
		const hash = Array.from(name || "").reduce(
			(acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0,
			0,
		);
		const hue = Math.abs(hash) % 360;
		return `linear-gradient(135deg, hsl(${hue}, 70%, 48%), hsl(${
			(hue + 30) % 360
		}, 70%, 43%))`;
	};

	const formatCallDuration = (seconds) => {
		if (!seconds) return "0:00";
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	const getRenderableFileUrl = useCallback(
		(message) => {
			if (!message) {
				return null;
			}

			return (
				mediaUrlOverrides[message.messageId] ||
				message.resolvedFileUrl ||
				message.fileUrl ||
				message.fileData ||
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

	const isVisualMediaMessage = useCallback((message) => {
		if (message?.type !== "file") {
			return false;
		}

		return (
			message.fileKind === "photo" ||
			message.fileType?.startsWith("image/") ||
			message.fileType?.startsWith("video/")
		);
	}, []);

	const isPhotoMessage = useCallback((message) => {
		if (message?.type !== "file" || message?.isUploading) {
			return false;
		}

		return (
			message.fileKind === "photo" || message.fileType?.startsWith("image/")
		);
	}, []);

	const isGroupablePhotoMessage = useCallback(
		(message) => {
			if (!isPhotoMessage(message)) {
				return false;
			}

			// HEIC/HEIF can't be rendered as <img> in browsers — keep as file attachments
			if (isLikelyUnsupportedImage(message)) {
				return false;
			}

			// Keep advanced message features in single bubbles so no metadata/action is lost.
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
		[isPhotoMessage, isLikelyUnsupportedImage],
	);

	const getPhotoGroupForIndex = useCallback(
		(startIndex) => {
			const base = userMessages[startIndex];
			if (!isGroupablePhotoMessage(base)) {
				return [];
			}

			const sameSide = (item) =>
				Boolean(item?.isMe || item?.from === username) ===
				Boolean(base?.isMe || base?.from === username);

			const group = [base];
			let lastTimestamp = base?.timestamp || 0;

			for (
				let cursor = startIndex + 1;
				cursor < userMessages.length;
				cursor += 1
			) {
				const candidate = userMessages[cursor];
				if (!isGroupablePhotoMessage(candidate) || !sameSide(candidate)) {
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
		[isGroupablePhotoMessage, userMessages, username],
	);

	const hasMediaLoadFailed = useCallback(
		(message) => Boolean(mediaLoadFailures[message?.messageId]),
		[mediaLoadFailures],
	);

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

	const clearMediaLoadFailed = useCallback((messageId) => {
		if (!messageId) {
			return;
		}

		setMediaLoadFailures((prev) => {
			if (!prev[messageId]) {
				return prev;
			}

			const next = { ...prev };
			delete next[messageId];
			return next;
		});
	}, []);

	const resolveMessageFileUrl = useCallback(
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

	const handleRedownloadFile = useCallback(
		async (message) => {
			if (!message) {
				return;
			}

			clearMediaLoadFailed(message.messageId);

			if (
				(message.isMe || message.from === username) &&
				(message.status === "failed" || message.localFile)
			) {
				handleRetryMessage(message);
				return;
			}

			const directUrl = await resolveMessageFileUrl(message);
			if (!directUrl) {
				showToast("File URL unavailable. Try again in a moment.", "info");
				return;
			}

			const link = document.createElement("a");
			link.href = directUrl;
			link.download = message.fileName || "file";
			link.click();
		},
		[
			clearMediaLoadFailed,
			handleRetryMessage,
			resolveMessageFileUrl,
			showToast,
			username,
		],
	);

	// Retries loading a photo in a group tile in-chat without triggering a download
	const handleRetryPhoto = useCallback(
		async (photo) => {
			clearMediaLoadFailed(photo.messageId);
			mediaAutoRetryCountRef.current[photo.messageId] = 0;
			await resolveMessageFileUrl(photo);
		},
		[clearMediaLoadFailed, resolveMessageFileUrl],
	);

	// Auto-retry on onError before showing the manual Retry button
	const handlePhotoLoadError = useCallback(
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
				const freshUrl = await resolveMessageFileUrl(message);
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
		[markMediaLoadFailed, resolveMessageFileUrl],
	);

	const handleOpenMedia = useCallback(
		async (message) => {
			if (!message) {
				return;
			}

			if (isLikelyUnsupportedImage(message)) {
				setViewingMedia({ ...message, isMissingMedia: true });
				return;
			}

			const resolvedUrl = await resolveMessageFileUrl(message);
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
		[isLikelyUnsupportedImage, resolveMessageFileUrl],
	);

	const handleSubmit = (e) => {
		e?.preventDefault();
		if (inputValue.trim()) {
			handleSendMessage({
				text: inputValue,
				replyTo: replyTarget
					? {
							messageId: replyTarget.messageId,
							from: replyTarget.from,
							type: replyTarget.type || "chat",
							summary: buildReplySummary(replyTarget),
						}
					: null,
			});
			setInputValue("");
			setReplyTarget(null);
			// Reset textarea height
			if (inputRef.current) {
				inputRef.current.style.height = "auto";
			}
			// Clear typing status when message is sent
			if (isTypingRef.current) {
				isTypingRef.current = false;
				sendTypingStatus(false);
			}
			if (typingTimeoutRef.current) {
				clearTimeout(typingTimeoutRef.current);
				typingTimeoutRef.current = null;
			}
		}
	};

	const handleInputChange = useCallback(
		(e) => {
			const value = e.target.value;
			setInputValue(value);

			// Auto-resize textarea
			const textarea = e.target;
			textarea.style.height = "auto";
			textarea.style.height = Math.min(textarea.scrollHeight, 128) + "px";

			// Clear existing timeout
			if (typingTimeoutRef.current) {
				clearTimeout(typingTimeoutRef.current);
				typingTimeoutRef.current = null;
			}

			if (value) {
				// Send typing status immediately if not already typing
				if (!isTypingRef.current) {
					isTypingRef.current = true;
					sendTypingStatus(true);

					// Start interval to periodically re-send typing status
					if (typingIntervalRef.current) {
						clearInterval(typingIntervalRef.current);
					}
					typingIntervalRef.current = setInterval(() => {
						if (isTypingRef.current) {
							sendTypingStatus(true);
						}
					}, 2000);
				}

				// Set timeout to clear typing status after 3 seconds of no input
				typingTimeoutRef.current = setTimeout(() => {
					isTypingRef.current = false;
					sendTypingStatus(false);
					if (typingIntervalRef.current) {
						clearInterval(typingIntervalRef.current);
						typingIntervalRef.current = null;
					}
				}, 3000);
			} else {
				// Input is empty, stop typing immediately
				if (isTypingRef.current) {
					isTypingRef.current = false;
					sendTypingStatus(false);
					if (typingIntervalRef.current) {
						clearInterval(typingIntervalRef.current);
						typingIntervalRef.current = null;
					}
				}
			}
		},
		[sendTypingStatus],
	);

	const handleKeyDown = (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	const handleEmojiSelect = (emoji) => {
		setInputValue((prev) => prev + emoji);
		inputRef.current?.focus();
	};

	const MAX_FILE_SIZE = 10 * 1024 * 1024;

	const sendFilesBatch = useCallback(
		async (files, caption, fileKind) => {
			for (const file of files) {
				await handleSendFileUpload({
					type: "file",
					file,
					fileKind,
					caption: caption || "",
				});
			}
		},
		[handleSendFileUpload],
	);

	const handleFileSelect = (e) => {
		const files = Array.from(e.target.files || []);
		if (!files.length) return;

		const oversizedFile = files.find((file) => file.size > MAX_FILE_SIZE);
		if (oversizedFile) {
			alert(
				`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB. Your file is ${(oversizedFile.size / (1024 * 1024)).toFixed(1)}MB.`,
			);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
			return;
		}

		if (files.length > 1) {
			setPendingBatchFiles({
				files,
				fileKind: fileInputMode === "photo" ? "photo" : "file",
			});
			setShowBatchPreview(true);
			if (fileInputRef.current) fileInputRef.current.value = "";
			return;
		}

		setSelectedFile(files[0]);
		setSelectedFileKind(fileInputMode);
		setShowFilePreview(true);
	};

	const handleSendFileWithCaption = async (file, caption, fileKind) => {
		if (!file || !selectedUser) return;

		try {
			await handleSendFileUpload({
				type: "file",
				file,
				fileKind: fileKind || "file",
				caption: caption || "",
			});
		} catch (error) {
			console.error("Error sending file:", error);
			alert("Failed to send file. Please try again.");
		}

		setSelectedFile(null);
		setShowFilePreview(false);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const handleSaveFile = async (fileData) => {
		const renderableUrl = getRenderableFileUrl(fileData);
		if (!renderableUrl) {
			alert("No downloadable file URL available for this message.");
			return;
		}

		try {
			await saveFile({
				...fileData,
				fileUrl: renderableUrl,
				ownerUsername: username,
				peerUsername: selectedUser,
			});
			alert("File saved successfully!");
		} catch (error) {
			console.error("Error saving file:", error);
			alert("Failed to save file.");
		}
	};

	const formatTime = (timestamp) => {
		const date = new Date(timestamp);
		return date.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
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

		return message.text || "Message";
	};

	const isPdfFile = (message) =>
		String(message?.fileType || "").toLowerCase() === "application/pdf";

	const EMOJI_OPTIONS = ["👍", "❤️", "😂", "🔥"];

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

	const startEditingMessage = (message) => {
		setEditingMessageId(message.messageId);
		setEditingText(message.text || "");
		setContextMenu(null);
	};

	const submitEditMessage = () => {
		if (!editingMessageId || !editingText.trim()) {
			return;
		}

		handleEditMessage(editingMessageId, editingText.trim());
		setEditingMessageId(null);
		setEditingText("");
	};

	const getMessageById = (messageId) =>
		userMessages.find((message) => message.messageId === messageId);

	const handleBubbleTouchStart = (event) => {
		const touch = event.touches?.[0];
		if (!touch) {
			return;
		}

		touchStartRef.current = { x: touch.clientX, y: touch.clientY };
		touchMovedRef.current = false;
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
		if (!touchStartRef.current) {
			return;
		}

		const start = touchStartRef.current;
		touchStartRef.current = null;

		if (longPressTimerRef.current) {
			clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = null;
		}

		if (!touchMovedRef.current) {
			return;
		}

		const thresholdX = 65;
		const thresholdY = 40;
		const currentTouch = event.changedTouches?.[0];
		if (!currentTouch) {
			return;
		}

		const deltaX = currentTouch.clientX - start.x;
		const deltaY = currentTouch.clientY - start.y;
		if (deltaX > thresholdX && Math.abs(deltaY) < thresholdY) {
			setReplyTarget(message);
		}
	};

	// Message selection handlers
	const handleMessageLongPress = (msgId) => {
		setIsSelectionMode(true);
		setSelectedMessages(new Set([msgId]));
	};

	const handleMessageClick = (msgId) => {
		if (isSelectionMode) {
			setSelectedMessages((prev) => {
				const newSet = new Set(prev);
				if (newSet.has(msgId)) {
					newSet.delete(msgId);
				} else {
					newSet.add(msgId);
				}
				return newSet;
			});
		}
	};

	const cancelSelection = () => {
		setIsSelectionMode(false);
		setSelectedMessages(new Set());
	};

	const getSelectedMessagesInfo = () => {
		const selected = userMessages.filter((msg) =>
			selectedMessages.has(msg.messageId),
		);
		const hasOwnMessages = selected.some(
			(msg) => msg.isMe || msg.from === username,
		);
		const hasOtherMessages = selected.some(
			(msg) => !msg.isMe && msg.from !== username,
		);
		return {
			selected,
			hasOwnMessages,
			hasOtherMessages,
			allOwn: hasOwnMessages && !hasOtherMessages,
		};
	};

	const handleDeleteForMe = async () => {
		// Delete locally only
		const msgIds = Array.from(selectedMessages);
		for (const msgId of msgIds) {
			try {
				await deleteMessageFromDB(msgId);
			} catch (err) {
				console.error("Failed to delete message:", err);
			}
		}
		// Update local state
		if (deleteLocalMessages) {
			deleteLocalMessages(selectedUser, msgIds);
		}
		cancelSelection();
		setShowDeleteModal(false);
	};

	const handleDeleteForEveryone = async () => {
		const msgIds = Array.from(selectedMessages);

		// Send delete request to server for each message
		for (const msgId of msgIds) {
			sendMessage({
				type: "delete-message",
				to: selectedUser,
				messageId: msgId,
			});
			// Also delete locally
			try {
				await deleteMessageFromDB(msgId);
			} catch (err) {
				console.error("Failed to delete message:", err);
			}
		}
		// Update local state
		if (deleteLocalMessages) {
			deleteLocalMessages(selectedUser, msgIds);
		}
		cancelSelection();
		setShowDeleteModal(false);
	};

	const formatFileSize = (bytes) => {
		if (!bytes) return "";
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1048576).toFixed(1)} MB`;
	};

	return (
		<div className="flex flex-col h-full w-full bg-bg">
			{/* Header - Selection Mode */}
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
					<button
						onClick={() => setShowDeleteModal(true)}
						className="p-2.5 rounded-full hover:bg-red-500/20 text-red-400 transition-colors"
						title="Delete">
						<Trash2 className="w-5 h-5" />
					</button>
				</div>
			) : (
				/* Header - Normal Mode */
				<div className="h-16 px-4 border-b border-white/[0.08] flex items-center justify-between bg-[#1e1e1e]/80 backdrop-blur-xl flex-shrink-0">
					<div className="flex items-center gap-3 flex-1 min-w-0">
						<button
							onClick={() => {
								if (isCallActive) {
									setCurrentView("video");
								} else {
									setSelectedUser(null);
								}
							}}
							className="p-1 -ml-1 hover:bg-white/10 rounded-full transition-colors">
							<ArrowLeft className="w-6 h-6" />
						</button>

						<div
							className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
							style={{ background: getAvatarColor(selectedUser) }}>
							{getInitials(selectedUser)}
						</div>

						<div className="flex flex-col min-w-0">
							<h3 className="font-semibold truncate">{selectedUser}</h3>
							<span
								className={clsx(
									"text-xs",
									onlineUsers.includes(selectedUser)
										? "text-success"
										: "text-gray-500",
								)}>
								{onlineUsers.includes(selectedUser)
									? "Online"
									: "Offline"}
							</span>
						</div>
					</div>

					<div className="flex items-center gap-2">
						{isCallActive ? (
							<button
								onClick={() => setCurrentView("video")}
								className="px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-full text-sm font-semibold flex items-center gap-2 animate-pulse-green hover:bg-green-500/30 transition-colors">
								<span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
								<span>
									In Call
									{callPeer && callPeer !== selectedUser
										? ` with ${callPeer}`
										: ""}
								</span>
							</button>
						) : (
							<>
								<button
									onClick={() => handleStartCall("audio")}
									className="p-2.5 rounded-full hover:bg-white/10 transition-all duration-200 hover:scale-105 active:scale-95"
									title="Voice Call">
									<Phone className="w-5 h-5" />
								</button>
								<button
									onClick={() => handleStartCall("video")}
									className="p-2.5 rounded-full hover:bg-white/10 transition-all duration-200 hover:scale-105 active:scale-95"
									title="Video Call">
									<Video className="w-5 h-5" />
								</button>
							</>
						)}
					</div>
				</div>
			)}

			<div className="px-4 py-2 border-b border-white/[0.06] bg-[#1a1a1a] flex items-center gap-2">
				<input
					type="text"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder="Search messages..."
					className="flex-1 px-3 py-1.5 rounded-lg bg-surface-light text-sm outline-none border border-transparent focus:border-cyan-500/50"
				/>
				{searchQuery.trim() && (
					<span className="text-xs text-gray-400 whitespace-nowrap">
						{searchResultIds.length} matches
					</span>
				)}
			</div>

			{/* Messages */}
			<div className="flex-1 relative">
				<div
					ref={scrollContainerRef}
					onScroll={handleScrollContainer}
					className="absolute inset-0 overflow-y-auto p-4 flex flex-col gap-3 hide-scrollbar">
				{userMessages.length === 0 ? (
					<div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
						<div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#667eea]/20 to-[#764ba2]/20 flex items-center justify-center">
							<Send className="w-7 h-7 text-[#667eea]" />
						</div>
						<div className="text-center">
							<p className="font-medium text-white/70">
								No messages yet
							</p>
							<p className="text-sm mt-1">
								Send a message to start chatting
							</p>
						</div>
					</div>
				) : (
					userMessages.map((msg, idx) => {
						if (
							msg?.messageId &&
							groupedPhotoMessageIds.has(msg.messageId)
						) {
							return null;
						}

						const photoGroup = getPhotoGroupForIndex(idx);
						if (photoGroup.length > 1) {
							photoGroup.slice(1).forEach((groupedMessage) => {
								if (groupedMessage?.messageId) {
									groupedPhotoMessageIds.add(groupedMessage.messageId);
								}
							});

							const isMine = msg.isMe || msg.from === username;
							const groupKey =
								msg.messageId || `${idx}-${photoGroup.length}`;
							const visiblePhotos = photoGroup.slice(0, 4);
							const hiddenCount = Math.max(
								0,
								photoGroup.length - visiblePhotos.length,
							);
							const statusSource =
								photoGroup[photoGroup.length - 1] || msg;
							const count = visiblePhotos.length;
							const landscapeCount = visiblePhotos
								.filter(p => imageOrientations[p.messageId] === "landscape").length;
							const isLandscapeGroup = landscapeCount >= Math.ceil(count / 2) && landscapeCount > 0;

							return (
								<div
									key={`photo-group-${groupKey}`}
									onContextMenu={(e) => {
										e.preventDefault();
										setContextMenu({
											x: e.clientX,
											y: e.clientY,
											messageId: msg.messageId,
										});
									}}
									className={clsx(
										"group w-full max-w-[min(32rem,70vw)] p-1 rounded-xl relative animate-message-in",
										isMine
											? "self-end bg-primary text-white rounded-br-sm"
											: "self-start bg-surface-light text-white rounded-bl-sm",
									)}>
									<div
										className={clsx(
											"rounded-lg overflow-hidden",
											count === 2 && !isLandscapeGroup && "grid grid-cols-2 gap-1 h-[min(32rem,70vw)]",
											count === 2 && isLandscapeGroup && "grid grid-rows-2 gap-1 h-[min(32rem,70vw)]",
											count === 3 && !isLandscapeGroup && "grid grid-cols-[5fr_4fr] grid-rows-2 gap-1 h-[min(32rem,70vw)]",
											count === 3 && isLandscapeGroup && "grid grid-cols-2 grid-rows-2 gap-1 h-[min(32rem,70vw)]",
											count >= 4 && "grid grid-cols-2 gap-1 h-[min(32rem,70vw)]",
										)}>
										{visiblePhotos.map((photo, photoIndex) => {
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
													onClick={() => handleOpenMedia(photo)}
													onContextMenu={(e) => {
														e.preventDefault();
														setContextMenu({
															x: e.clientX,
															y: e.clientY,
															messageId: photo.messageId,
														});
													}}
													className={clsx(
														"relative overflow-hidden bg-black/30 rounded-lg",
														count === 3 && !isLandscapeGroup && photoIndex === 0 && "row-span-2",
														count === 3 && isLandscapeGroup && photoIndex === 0 && "col-span-2",
													)}>
													{renderableUrl && !hasFailed && !isLikelyUnsupportedImage(photo) ? (
														<img
															src={renderableUrl}
															alt={photo.fileName || "photo"}
															className="absolute inset-0 w-full h-full object-cover"
															onLoad={(e) => {
																const { naturalWidth, naturalHeight } = e.target;
																setImageOrientations(prev => ({
																	...prev,
																	[photo.messageId]: naturalWidth >= naturalHeight ? "landscape" : "portrait",
																}));
															}}
															onError={() => handlePhotoLoadError(photo)}
															onContextMenu={(e) =>
																e.preventDefault()
															}
														/>
													) : (
														<div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/30">
															<AlertCircle className="w-5 h-5 text-gray-500" />
															<button
																onClick={async (e) => {
																	e.stopPropagation();
																	await handleRetryPhoto(photo);
																}}
																className="text-xs text-white/70 px-2.5 py-1 rounded-full bg-black/60 hover:bg-black/75 transition-colors">
																Retry
															</button>
														</div>
													)}
													{showOverlay && (
														<div className="absolute inset-0 bg-black/55 flex items-center justify-center text-white font-bold text-xl">
															+{hiddenCount}
														</div>
													)}
												</button>
											);
										})}
									</div>
									<div className="flex items-center justify-end gap-1 mt-1 pr-2">
										<span className="text-[10px] text-white/60">
											{formatTime(statusSource.timestamp)}
										</span>
										{isMine && (
											<span className="flex items-center ml-1">
												{statusSource.status === "read" ? (
													<CheckAllIcon className="text-cyan-300" />
												) : statusSource.status === "delivered" ? (
													<CheckAllIcon className="text-white/70" />
												) : statusSource.status === "pending" ? (
													<Clock className="w-3.5 h-3.5 text-gray-300" />
												) : statusSource.status === "failed" ? (
													<AlertCircle className="w-3.5 h-3.5 text-red-400" />
												) : (
													<CheckIcon className="text-white/70" />
												)}
											</span>
										)}
										<button
											onClick={(e) => {
												e.stopPropagation();
												setReactionPickerFor(
													reactionPickerFor === msg.messageId
														? null
														: msg.messageId,
												);
											}}
											className="p-1 rounded-full bg-black/35 text-white/70 hover:text-white hover:bg-black/55 transition-colors"
											title="React">
											<Smile className="w-3.5 h-3.5" />
										</button>
									</div>
									{Array.isArray(msg.reactions) &&
										msg.reactions.length > 0 && (
											<div className="flex flex-wrap gap-1 mt-1 px-1">
												{getReactionSummary(msg.reactions).map(
													(reactionItem) => (
														<span
															key={`${msg.messageId}-${reactionItem.emoji}`}
															className="px-2 py-0.5 rounded-full bg-black/70 text-xs shadow border border-white/10">
															{reactionItem.emoji}{" "}
															{reactionItem.count}
														</span>
													),
												)}
											</div>
										)}
									{reactionPickerFor === msg.messageId && (
										<div className="mt-1 flex gap-1 bg-black/85 rounded-full p-1 w-fit z-20 ml-auto">
											{EMOJI_OPTIONS.map((emoji) => (
												<button
													key={`${msg.messageId}-${emoji}`}
													onClick={(e) => {
														e.stopPropagation();
														handleReactToMessage(
															msg.messageId,
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

						return msg.type === "call-log" ? (
							// Call log entry
							<div
								key={msg.messageId || idx}
								className="self-center flex items-center gap-2 px-4 py-2 bg-[#252525] rounded-full text-sm text-gray-300 animate-message-in">
								{msg.callLogType === "completed" ? (
									<>
										<Phone className="w-4 h-4 text-green-400" />
										<span>
											{msg.isMe ? "Outgoing call" : "Incoming call"}{" "}
											• {formatCallDuration(msg.duration)}
										</span>
									</>
								) : msg.callLogType === "missed-outgoing" ? (
									<>
										<PhoneMissed className="w-4 h-4 text-red-400" />
										<span>Call not answered</span>
									</>
								) : msg.callLogType === "declined" ? (
									<>
										<PhoneOff className="w-4 h-4 text-orange-400" />
										<span>Call declined</span>
									</>
								) : msg.callLogType === "rejected" ? (
									<>
										<PhoneMissed className="w-4 h-4 text-red-400" />
										<span>Missed call</span>
									</>
								) : msg.callLogType === "missed" ? (
									<>
										<PhoneMissed className="w-4 h-4 text-red-400" />
										<span>Missed call</span>
									</>
								) : (
									<>
										<Phone className="w-4 h-4 text-gray-400" />
										<span>Call</span>
									</>
								)}
								<span className="text-xs text-gray-500 ml-1">
									{formatTime(msg.timestamp)}
								</span>
							</div>
						) : (
							<div
								key={msg.messageId || idx}
								data-message-id={msg.messageId}
								className={clsx(
									"group max-w-[85%] rounded-xl text-[15px] leading-relaxed relative break-words cursor-pointer transition-all duration-200 animate-message-in",
									isVisualMediaMessage(msg)
										? "p-1 overflow-visible"
										: "px-4 py-2.5",
									msg.isMe || msg.from === username
										? "self-end bg-primary text-white rounded-br-sm hover:brightness-110"
										: "self-start bg-surface-light text-white rounded-bl-sm hover:bg-[#3a3a3a]",
									isSelectionMode &&
										selectedMessages.has(msg.messageId) &&
										"ring-2 ring-cyan-400/70 scale-[0.98]",
									searchResultSet.has(msg.messageId) &&
										"ring-2 ring-yellow-300/60",
								)}
								style={{
									wordBreak: "break-word",
									overflowWrap: "anywhere",
								}}
								onClick={() => handleMessageClick(msg.messageId)}
								onContextMenu={(e) => {
									e.preventDefault();
									setContextMenu({
										x: e.clientX,
										y: e.clientY,
										messageId: msg.messageId,
									});
								}}
								onMouseDown={() => {
									longPressTimerRef.current = setTimeout(() => {
										handleMessageLongPress(msg.messageId);
									}, 500);
								}}
								onMouseUp={() => {
									if (longPressTimerRef.current) {
										clearTimeout(longPressTimerRef.current);
									}
								}}
								onMouseLeave={() => {
									if (longPressTimerRef.current) {
										clearTimeout(longPressTimerRef.current);
									}
								}}
								onTouchStart={(event) => {
									handleBubbleTouchStart(event);
									longPressTimerRef.current = setTimeout(() => {
										handleMessageLongPress(msg.messageId);
									}, 500);
								}}
								onTouchMove={(event) => {
									handleBubbleTouchMove(event);
								}}
								onTouchEnd={(event) => {
									handleBubbleTouchEnd(event, msg);
								}}>
								{editingMessageId === msg.messageId ? (
									<div className="flex flex-col gap-2">
										<input
											type="text"
											value={editingText}
											onChange={(e) =>
												setEditingText(e.target.value)
											}
											className="w-full bg-black/20 border border-white/20 rounded-lg px-2 py-1 text-sm"
											autoFocus
											onKeyDown={(e) => {
												if (e.key === "Enter") submitEditMessage();
												if (e.key === "Escape") {
													setEditingMessageId(null);
													setEditingText("");
												}
											}}
										/>
										<div className="flex items-center justify-end gap-2">
											<button
												onClick={() => {
													setEditingMessageId(null);
													setEditingText("");
												}}
												className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">
												Cancel
											</button>
											<button
												onClick={submitEditMessage}
												className="text-xs px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500">
												Save
											</button>
										</div>
									</div>
								) : msg.type === "file" ? (
									<div className="flex flex-col gap-2">
										{msg.replyTo?.summary && (
											<div className="px-2.5 py-2 rounded-lg bg-black/20 border-l-2 border-cyan-300/70">
												<p className="text-[10px] uppercase tracking-wide text-cyan-200/90">
													Reply to {msg.replyTo.from || "message"}
												</p>
												<p className="text-xs text-white/80 truncate">
													{msg.replyTo.summary}
												</p>
											</div>
										)}
										{msg.isUploading ? (
											<div className="p-3 bg-black/20 rounded-xl">
												<p className="text-sm font-medium truncate">
													{msg.fileName}
												</p>
												<div className="mt-2 h-2 w-full rounded-full bg-white/20 overflow-hidden">
													<div
														className="h-full bg-cyan-400 transition-all duration-150"
														style={{
															width: `${msg.uploadProgress || 0}%`,
														}}
													/>
												</div>
												<p className="text-xs text-white/70 mt-1">
													{msg.uploadProgress || 0}% uploading
												</p>
											</div>
										) : (
											<>
												{msg.fileKind === "photo" ||
												msg.fileType?.startsWith("image/") ? (
													getRenderableFileUrl(msg) &&
													!hasMediaLoadFailed(msg) &&
													!isLikelyUnsupportedImage(msg) ? (
														<img
															src={getRenderableFileUrl(msg)}
															alt={msg.fileName}
															className="w-full max-w-[min(30rem,70vw)] max-h-[32rem] rounded-lg cursor-pointer hover:opacity-90 transition-opacity object-contain bg-black/20"
															onClick={() =>
																handleOpenMedia(msg)
															}
															onContextMenu={(e) =>
																e.preventDefault()
															}
															onError={() => handlePhotoLoadError(msg)}
														/>
													) : (
														<div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-black/25 border border-white/10 max-w-[min(22rem,70vw)]">
															<div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
																<Image className="w-4 h-4 text-white/40" />
															</div>
															<div className="flex-1 min-w-0">
																<p className="text-sm font-medium truncate text-white/90">{msg.fileName}</p>
																<p className="text-xs text-white/50">
																	{msg.fileType?.split("/")[1]?.toUpperCase() || "IMAGE"}
																	{msg.fileSize ? ` · ${formatFileSize(msg.fileSize)}` : ""}
																	{" · Can't preview"}
																</p>
															</div>
															<button
																onClick={(e) => {
																	e.stopPropagation();
																	handleRedownloadFile(msg);
																}}
																className="flex-shrink-0 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
																title="Download">
																<Download className="w-4 h-4 text-white/70" />
															</button>
														</div>
													)
												) : msg.fileType?.startsWith("video/") ? (
													getRenderableFileUrl(msg) &&
													!hasMediaLoadFailed(msg) ? (
														<div
															className="relative cursor-pointer group"
															onClick={() =>
																handleOpenMedia(msg)
															}
															onContextMenu={(e) =>
																e.preventDefault()
															}>
															<video
																src={getRenderableFileUrl(msg)}
																className="w-full max-w-[22rem] max-h-[24rem] rounded-lg object-contain bg-black/20"
																onError={() =>
																	markMediaLoadFailed(
																		msg.messageId,
																	)
																}
															/>
															<div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl group-hover:bg-black/50 transition-colors">
																<div className="w-14 h-14 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
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
																<Play className="w-4 h-4 text-white/40" fill="currentColor" />
															</div>
															<div className="flex-1 min-w-0">
																<p className="text-sm font-medium truncate text-white/90">{msg.fileName}</p>
																<p className="text-xs text-white/50">
																	{msg.fileType?.split("/")[1]?.toUpperCase() || "VIDEO"}
																	{msg.fileSize ? ` · ${formatFileSize(msg.fileSize)}` : ""}
																	{" · Can't preview"}
																</p>
															</div>
															<button
																onClick={(e) => {
																	e.stopPropagation();
																	handleRedownloadFile(msg);
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
																{msg.fileName}
															</p>
															<p className="text-xs text-white/50">
																{msg.fileType?.split("/").pop()?.toUpperCase() || "FILE"}
																{msg.fileSize ? ` · ${formatFileSize(msg.fileSize)}` : ""}
															</p>
														</div>
														<div className="flex items-center gap-1 flex-shrink-0">
															{getRenderableFileUrl(msg) && (
																<button
																	onClick={async (e) => {
																		e.stopPropagation();
																		const url = await resolveMessageFileUrl(msg);
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
																	await handleRedownloadFile(msg);
																}}
																className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
																title="Download">
																<Download className="w-4 h-4 text-white/70" />
															</button>
														</div>
													</div>
												)}
												{msg.caption && (
													<p className="text-sm">{msg.caption}</p>
												)}
											</>
										)}
									</div>
								) : (
									<div className="space-y-2">
										{msg.replyTo?.summary && (
											<div className="px-2.5 py-2 rounded-lg bg-black/20 border-l-2 border-cyan-300/70">
												<p className="text-[10px] uppercase tracking-wide text-cyan-200/90">
													Reply to {msg.replyTo.from || "message"}
												</p>
												<p className="text-xs text-white/80 truncate">
													{msg.replyTo.summary}
												</p>
											</div>
										)}
										<div style={{ whiteSpace: "pre-wrap" }}>{renderTextWithLinks(msg.text)}</div>
										{detectLinks(msg.text).length > 0 && (
											<div className="space-y-2">
												<a
													href={detectLinks(msg.text)[0]}
													target="_blank"
													rel="noreferrer"
													className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-black/20">
													<Link2 className="w-3.5 h-3.5" />
													Open link
												</a>
												{renderLinkPreviewCard(
													detectLinks(msg.text)[0],
												)}
											</div>
										)}
										{msg.edited && (
											<span className="ml-1 text-[10px] text-white/60">
												(edited)
											</span>
										)}
									</div>
								)}
								<div className="flex items-center justify-end gap-1 mt-1">
									<span className="text-[10px] text-white/60">
										{formatTime(msg.timestamp)}
									</span>
									{/* Message status icons - only show for sent messages */}
									{(msg.isMe || msg.from === username) && (
										<span
											className="flex items-center ml-1"
											title={
												msg.status === "queued"
													? "Queued - will deliver when user comes online"
													: msg.status
											}>
											{msg.status === "read" ? (
												<CheckAllIcon className="text-cyan-300" />
											) : msg.status === "delivered" ? (
												<CheckAllIcon className="text-white/70" />
											) : msg.status === "pending" ? (
												<Clock className="w-3.5 h-3.5 text-gray-300" />
											) : msg.status === "failed" ? (
												<AlertCircle className="w-3.5 h-3.5 text-red-400" />
											) : (
												<CheckIcon className="text-white/70" />
											)}
										</span>
									)}
									{(msg.status === "pending" ||
										msg.status === "failed") &&
										!msg.isUploading &&
										(msg.isMe || msg.from === username) && (
											<button
												onClick={(e) => {
													e.stopPropagation();
													handleRetryMessage(msg);
												}}
												className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-black/20 hover:bg-black/30"
												title="Retry send">
												<RefreshCw className="w-3 h-3" /> Retry
											</button>
										)}
								</div>
								{Array.isArray(msg.reactions) &&
									msg.reactions.length > 0 && (
										<div className="absolute -bottom-3 left-3 flex flex-wrap gap-1 z-10">
											{getReactionSummary(msg.reactions).map(
												(reactionItem) => (
													<span
														key={`${msg.messageId}-${reactionItem.emoji}`}
														className="px-2 py-0.5 rounded-full bg-black/70 text-xs shadow-lg border border-white/10">
														{reactionItem.emoji}{" "}
														{reactionItem.count}
													</span>
												),
											)}
										</div>
									)}
								<button
									onClick={(e) => {
										e.stopPropagation();
										setReactionPickerFor(
											reactionPickerFor === msg.messageId
												? null
												: msg.messageId,
										);
									}}
									className="absolute -bottom-3 -left-2 p-1.5 rounded-full bg-black/45 text-white/70 hover:text-white hover:bg-black/65 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
									title="React">
									<Smile className="w-3.5 h-3.5" />
								</button>
								{reactionPickerFor === msg.messageId && (
									<div className="absolute -bottom-14 left-0 flex gap-1 bg-black/85 rounded-full p-1 w-fit z-20">
										{EMOJI_OPTIONS.map((emoji) => (
											<button
												key={`${msg.messageId}-${emoji}`}
												onClick={(e) => {
													e.stopPropagation();
													handleReactToMessage(
														msg.messageId,
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

				{/* Typing Indicator */}
				{isPeerTyping && (
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
							{selectedUser} is typing...
						</span>
					</div>
				)}

					<div ref={messagesEndRef} />
				</div>
				{showScrollButton && (
					<button
						onClick={() => scrollToBottom()}
						className="absolute bottom-4 right-4 z-10 w-9 h-9 rounded-full bg-[#1f1f1f] hover:bg-[#2a2a2a] border border-white/10 shadow-lg flex items-center justify-center transition-all">
						<ChevronDown className="w-5 h-5 text-white/70" />
					</button>
				)}
			</div>

			{contextMenu && (
				<div
					ref={contextMenuRef}
					className="fixed z-[70] min-w-[160px] rounded-xl border border-white/10 bg-[#1f1f1f] p-1.5 shadow-2xl"
					style={{ left: contextMenu.x, top: contextMenu.y }}>
					{(() => {
						const targetMessage = getMessageById(contextMenu.messageId);
						const canEdit =
							Boolean(
								targetMessage?.isMe || targetMessage?.from === username,
							) &&
							targetMessage?.type !== "file" &&
							targetMessage?.type !== "call-log";

						if (!canEdit) {
							return null;
						}

						return (
							<button
								onClick={() => {
									if (targetMessage) {
										startEditingMessage(targetMessage);
									}
								}}
								className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm">
								Edit
							</button>
						);
					})()}
					<button
						onClick={() => {
							const targetMessage = getMessageById(
								contextMenu.messageId,
							);
							if (targetMessage) {
								setReplyTarget(targetMessage);
							}
							setContextMenu(null);
							setTimeout(() => inputRef.current?.focus(), 0);
						}}
						className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm">
						Reply
					</button>
					<div className="px-2 py-1 text-[11px] text-gray-400">React</div>
					<div className="flex gap-1 px-2 pb-2">
						{EMOJI_OPTIONS.map((emoji) => (
							<button
								key={`menu-${emoji}`}
								onClick={() => {
									handleReactToMessage(contextMenu.messageId, emoji);
									setContextMenu(null);
								}}
								className="px-2 py-1 rounded-full hover:bg-white/10 text-sm">
								{emoji}
							</button>
						))}
					</div>
				</div>
			)}

			{/* Input Area */}
			<div className="p-3 border-t border-[#333] bg-surface flex items-end gap-2 relative">
				{/* Attachment menu toggle */}
				<div className="relative flex-shrink-0" ref={attachMenuRef}>
					<button
						onClick={() => setShowAttachMenu((v) => !v)}
						className={clsx(
							"p-2.5 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] hover:opacity-80 transition-all duration-200",
							showAttachMenu && "rotate-45",
						)}
						title="Attachments">
						<Plus className="w-5 h-5" />
					</button>

					{/* Attachment menu popup */}
					{showAttachMenu && (
						<div className="absolute bottom-14 left-0 flex flex-col gap-1.5 bg-[#252525] p-2.5 rounded-2xl shadow-2xl border border-white/10 z-50 animate-fade-in min-w-[140px]">
							<button
								onClick={() => {
									setShowEmoji((v) => !v);
									setShowAttachMenu(false);
								}}
								className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-left">
								<div className="p-2 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500">
									<Smile className="w-4 h-4" />
								</div>
								<span className="text-sm font-medium">Emoji</span>
							</button>
							<button
								onClick={() => {
									setFileInputMode("photo");
									fileInputRef.current?.click();
									setShowAttachMenu(false);
								}}
								className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-left">
								<div className="p-2 rounded-full bg-gradient-to-br from-pink-400 to-rose-600">
									<Image className="w-4 h-4" />
								</div>
								<span className="text-sm font-medium">Photos</span>
							</button>
							<button
								onClick={() => {
									setFileInputMode("file");
									fileInputRef.current?.click();
									setShowAttachMenu(false);
								}}
								className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-left">
								<div className="p-2 rounded-full bg-gradient-to-br from-blue-400 to-blue-600">
									<Paperclip className="w-4 h-4" />
								</div>
								<span className="text-sm font-medium">File</span>
							</button>
							<button
								onClick={() => {
									setShowSavedFiles(true);
									setShowAttachMenu(false);
								}}
								className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-left">
								<div className="p-2 rounded-full bg-gradient-to-br from-green-400 to-emerald-600">
									<FolderOpen className="w-4 h-4" />
								</div>
								<span className="text-sm font-medium">Saved</span>
							</button>
						</div>
					)}
				</div>

				<input
					ref={fileInputRef}
					type="file"
					onChange={handleFileSelect}
					className="hidden"
					accept={fileInputMode === "photo" ? "image/*" : "*/*"}
					multiple
				/>

				{showEmoji && (
					<div className="z-50">
						<EmojiPicker
							onSelect={handleEmojiSelect}
							onClose={() => setShowEmoji(false)}
						/>
					</div>
				)}

				{replyTarget && (
					<div className="absolute bottom-16 left-4 right-4 p-2.5 rounded-xl bg-surface-light border border-white/10 flex items-start justify-between gap-3">
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
							className="p-1 rounded hover:bg-white/10 transition-colors"
							title="Cancel reply">
							<X className="w-3.5 h-3.5" />
						</button>
					</div>
				)}

				<textarea
					ref={inputRef}
					value={inputValue}
					onChange={handleInputChange}
					onKeyDown={handleKeyDown}
					placeholder="Type a message..."
					autoComplete="off"
					spellCheck={false}
					rows={1}
					className="flex-1 min-w-0 py-3 px-4 bg-surface-light rounded-3xl text-white outline-none text-base resize-none overflow-y-auto max-h-32"
					style={{ lineHeight: "1.5" }}
				/>

				<button
					onClick={handleSubmit}
					disabled={!inputValue.trim()}
					className="p-2.5 rounded-full bg-primary hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
					<Send className="w-5 h-5" />
				</button>
			</div>

			{/* Single-file preview modal */}
			{showFilePreview && selectedFile && (
				<FilePreviewModal
					file={selectedFile}
					initialFileKind={selectedFileKind}
					onSend={handleSendFileWithCaption}
					onClose={() => {
						setShowFilePreview(false);
						setSelectedFile(null);
						if (fileInputRef.current) {
							fileInputRef.current.value = "";
						}
					}}
				/>
			)}

			{/* Multi-photo caption modal */}
			{showBatchPreview && pendingBatchFiles && (
				<BatchPhotoPreviewModal
					files={pendingBatchFiles.files}
					fileKind={pendingBatchFiles.fileKind}
					onSend={(files, caption, fileKind) => {
						sendFilesBatch(files, caption, fileKind).catch((err) => {
							console.error("Failed to send photos:", err);
						});
					}}
					onClose={() => {
						setShowBatchPreview(false);
						setPendingBatchFiles(null);
					}}
				/>
			)}

			{/* Media Viewer Modal */}
			{viewingMedia && (
				<MediaViewerModal
					media={{
						...viewingMedia,
						isMissingMedia:
							hasMediaLoadFailed(viewingMedia) ||
							!getRenderableFileUrl(viewingMedia),
					}}
					onClose={() => setViewingMedia(null)}
					onSave={handleSaveFile}
					onRedownload={handleRedownloadFile}
					mediaList={mediaFiles}
					currentIndex={viewingMediaIndex >= 0 ? viewingMediaIndex : 0}
					onNavigate={(index) => setViewingMedia(mediaFiles[index])}
				/>
			)}

			{/* Saved Files Modal */}
			{showSavedFiles && (
				<SavedFilesModal
					currentUser={username}
					peerUser={selectedUser}
					onClose={() => setShowSavedFiles(false)}
					onViewMedia={(file) => {
						setShowSavedFiles(false);
						setViewingMedia(file);
					}}
				/>
			)}

			{/* Delete Confirmation Modal */}
			{showDeleteModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
					<div className="bg-[#1e1e1e] rounded-2xl max-w-sm w-full mx-4 overflow-hidden shadow-2xl border border-white/10">
						<div className="p-4 border-b border-white/10">
							<h3 className="font-semibold text-lg">
								Delete {selectedMessages.size} message
								{selectedMessages.size > 1 ? "s" : ""}?
							</h3>
						</div>
						<div className="p-4 flex flex-col gap-2">
							{(() => {
								const { allOwn } = getSelectedMessagesInfo();
								return (
									<>
										<button
											onClick={handleDeleteForMe}
											className="w-full py-3 px-4 bg-surface-light hover:bg-white/10 rounded-xl text-left transition-colors">
											Delete for me
										</button>
										{allOwn && (
											<button
												onClick={handleDeleteForEveryone}
												className="w-full py-3 px-4 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-left transition-colors">
												Delete for everyone
											</button>
										)}
									</>
								);
							})()}
							<button
								onClick={() => setShowDeleteModal(false)}
								className="w-full py-3 px-4 hover:bg-white/5 rounded-xl text-gray-400 transition-colors">
								Cancel
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
