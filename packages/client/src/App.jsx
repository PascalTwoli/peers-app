import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import LoginScreen from "./components/LoginScreen";
import Sidebar from "./components/Sidebar";
import MainContent from "./components/MainContent";
import ToastContainer from "./components/ToastContainer";
import CallEndedModal from "./components/CallEndedModal";
import { useWebSocket } from "./hooks/useWebSocket";
import { useWebRTC } from "./hooks/useWebRTC";
import { useRoomWebRTC } from "./hooks/useRoomWebRTC";
import { useAudio } from "./hooks/useAudio";
import { AppContext } from "./context/AppContext";
import {
	saveMessage,
	getAllMessages,
	saveFile,
	deleteMessage as deleteMessageFromDB,
	updateMessageStatus,
	updateMessageContent,
	updateMessageReactions,
	markConversationReadByUser,
} from "./services/storageService";
import {
	createMessageId,
	createCallLog,
	createTextMessage,
} from "./utils/messageFactory";
import { apiUrl } from "./config/serverConfig";

const ROOM_MESSAGES_STORAGE_KEY_PREFIX = "peers_room_messages";
const MAX_UPLOAD_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_PREFIXES = ["image/", "text/"];
const ALLOWED_UPLOAD_MIME_TYPES = new Set(["application/pdf"]);

function isAllowedUploadMimeType(fileType) {
	if (!fileType || typeof fileType !== "string") {
		return false;
	}

	if (ALLOWED_UPLOAD_MIME_TYPES.has(fileType)) {
		return true;
	}

	return ALLOWED_UPLOAD_MIME_PREFIXES.some((prefix) =>
		fileType.startsWith(prefix),
	);
}

function createRoomMessagesStorageKey(username) {
	return `${ROOM_MESSAGES_STORAGE_KEY_PREFIX}:${username}`;
}

function decodePathSegment(value) {
	if (!value) {
		return "";
	}

	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function encodePathSegment(value) {
	if (!value) {
		return "";
	}

	return encodeURIComponent(value);
}

function dedupeRoomsById(rooms) {
	if (!Array.isArray(rooms)) {
		return [];
	}

	const seen = new Set();
	const unique = [];

	for (const room of rooms) {
		if (!room?.roomId || seen.has(room.roomId)) {
			continue;
		}

		seen.add(room.roomId);
		unique.push(room);
	}

	return unique;
}

function parseWorkspacePath(pathname) {
	if (!pathname.startsWith("/app")) {
		return { type: "external" };
	}

	const relative = pathname.slice(4) || "/";

	if (relative === "/" || relative === "") {
		return { type: "placeholder" };
	}

	if (relative === "/invite") {
		return { type: "invite" };
	}

	if (relative === "/rooms/create") {
		return { type: "room-create" };
	}

	const roomCallMatch = relative.match(/^\/rooms\/([^/]+)\/call$/);
	if (roomCallMatch?.[1]) {
		return {
			type: "room-call",
			roomId: decodePathSegment(roomCallMatch[1]),
		};
	}

	const roomMatch = relative.match(/^\/rooms\/([^/]+)$/);
	if (roomMatch?.[1]) {
		return {
			type: "room",
			roomId: decodePathSegment(roomMatch[1]),
		};
	}

	const chatMatch = relative.match(/^\/chat\/([^/]+)$/);
	if (chatMatch?.[1]) {
		return {
			type: "chat",
			user: decodePathSegment(chatMatch[1]),
		};
	}

	const callMatch = relative.match(/^\/call\/([^/]+)$/);
	if (callMatch?.[1]) {
		return {
			type: "video",
			user: decodePathSegment(callMatch[1]),
		};
	}

	return { type: "placeholder" };
}

function getWorkspacePath({
	currentView,
	selectedUser,
	selectedRoomId,
	callPeer,
}) {
	if (currentView === "invite") {
		return "/app/invite";
	}

	if (currentView === "room-create") {
		return "/app/rooms/create";
	}

	if (currentView === "room-call" && selectedRoomId) {
		return `/app/rooms/${encodePathSegment(selectedRoomId)}/call`;
	}

	if (currentView === "room" && selectedRoomId) {
		return `/app/rooms/${encodePathSegment(selectedRoomId)}`;
	}

	if (currentView === "video") {
		const peer = selectedUser || callPeer;
		if (peer) {
			return `/app/call/${encodePathSegment(peer)}`;
		}
	}

	if (currentView === "chat" && selectedUser) {
		return `/app/chat/${encodePathSegment(selectedUser)}`;
	}

	return "/app";
}

async function resolveSignedDownloadUrl({ username, fileId, fileUrl }) {
	if (!username || (!fileId && !fileUrl)) {
		return fileUrl || null;
	}

	try {
		const response = await fetch(apiUrl("/api/download-url"), {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-user-name": username,
			},
			body: JSON.stringify({
				username,
				fileId,
				fileUrl,
			}),
		});

		if (!response.ok) {
			return fileUrl || null;
		}

		const { downloadUrl } = await response.json();
		return downloadUrl || fileUrl || null;
	} catch (error) {
		console.error("Failed to resolve signed download URL:", error);
		return fileUrl || null;
	}
}

function loadPersistedRoomMessages(username) {
	if (!username) {
		return {};
	}

	try {
		const raw = localStorage.getItem(createRoomMessagesStorageKey(username));
		if (!raw) {
			return {};
		}
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch (error) {
		console.error("Failed to load room messages from storage:", error);
		return {};
	}
}

function persistRoomMessages(username, roomMessages) {
	if (!username) {
		return;
	}

	try {
		localStorage.setItem(
			createRoomMessagesStorageKey(username),
			JSON.stringify(roomMessages || {}),
		);
	} catch (error) {
		console.error("Failed to persist room messages:", error);
	}
}

function App() {
	const location = useLocation();
	const navigate = useNavigate();
	const isApplyingRouteRef = useRef(false);

	const STATUS_PRIORITY = {
		failed: -1,
		pending: 0,
		sent: 1,
		queued: 2,
		delivered: 3,
		read: 4,
	};

	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const [username, setUsername] = useState("");
	const [lastUsername, setLastUsername] = useState("");
	const [selectedUser, setSelectedUser] = useState(null);
	const [onlineUsers, setOnlineUsers] = useState([]);
	const [allUsers, setAllUsers] = useState([]); // All registered users with online status
	const [messages, setMessages] = useState({});
	const [toasts, setToasts] = useState([]);
	const [currentView, setCurrentView] = useState("placeholder");
	const [isCallActive, setIsCallActive] = useState(false);
	const [callType, setCallType] = useState("video");
	const [incomingCall, setIncomingCall] = useState(null);
	const [incomingVideoUpgradeRequest, setIncomingVideoUpgradeRequest] =
		useState(null);
	const [isVideoUpgradePending, setIsVideoUpgradePending] = useState(false);
	const [isCalling, setIsCalling] = useState(false);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [typingUsers, setTypingUsers] = useState({}); // { username: timestamp }
	const [userFilter, setUserFilter] = useState("all"); // 'all' or 'online'
	const [callEndedInfo, setCallEndedInfo] = useState(null); // { duration, caller } for call ended modal
	const [remoteVideoOff, setRemoteVideoOff] = useState(false); // Track when remote user turns off video
	const [callPeer, setCallPeer] = useState(null); // Track who we're actually in a call with (separate from selectedUser)
	const [callStartTime, setCallStartTime] = useState(null); // When the call started (for persistent timer)
	const [lastInviteLink, setLastInviteLink] = useState("");
	const [rooms, setRooms] = useState([]);
	const [pendingInviteCode, setPendingInviteCode] = useState("");
	const [selectedRoomId, setSelectedRoomId] = useState(null);
	const [roomMessages, setRoomMessages] = useState({});
	const [pendingRoomInvites, setPendingRoomInvites] = useState([]);
	const [roomComposerDraft, setRoomComposerDraft] = useState({
		name: "",
		selectedUsers: [],
	});
	const [isCreatingRoom, setIsCreatingRoom] = useState(false);
	const [roomCallSession, setRoomCallSession] = useState(null);
	const [roomCallIncomingByRoom, setRoomCallIncomingByRoom] = useState({});
	const [roomCallParticipantsByRoom, setRoomCallParticipantsByRoom] = useState(
		{},
	);
	const [roomCallLastJoinedByRoom, setRoomCallLastJoinedByRoom] = useState({});
	const [roomMediaStateByUser, setRoomMediaStateByUser] = useState({});

	// Audio hooks for call tones and notifications
	const {
		playDialTone,
		stopDialTone,
		playRingtone,
		stopRingtone,
		playNotification,
		playCallRejectedtone,
		stopAll,
	} = useAudio();

	// Play dial tone when calling
	useEffect(() => {
		if (isCalling) {
			playDialTone();
		} else {
			stopDialTone();
		}
	}, [isCalling, playDialTone, stopDialTone]);

	// Play ringtone when receiving incoming call
	useEffect(() => {
		if (incomingCall) {
			playRingtone();
		} else {
			stopRingtone();
		}
	}, [incomingCall, playRingtone, stopRingtone]);

	// Stop all tones when call becomes active
	useEffect(() => {
		if (isCallActive) {
			stopAll();
		}
	}, [isCallActive, stopAll]);

	// Request notification permission on login
	useEffect(() => {
		if (
			isLoggedIn &&
			"Notification" in window &&
			Notification.permission === "default"
		) {
			Notification.requestPermission();
		}
	}, [isLoggedIn]);

	// Show browser notification for incoming message
	const showNotification = useCallback((title, body, from) => {
		// Browser notification (when tab not focused)
		if ("Notification" in window && Notification.permission === "granted") {
			try {
				const notification = new Notification(title, {
					body,
					icon: "/favicon.ico",
					tag: `msg-${from}-${Date.now()}`,
					requireInteraction: false,
				});
				notification.onclick = () => {
					window.focus();
					setSelectedUser(from);
					setCurrentView("chat");
					notification.close();
				};
				// Auto-close after 5 seconds
				setTimeout(() => notification.close(), 5000);
			} catch (err) {
				console.error("Failed to show notification:", err);
			}
		}
	}, []);

	// Check for persisted username and load messages
	useEffect(() => {
		const savedUser = localStorage.getItem("peers_username");
		const savedLastUser = localStorage.getItem("peers_last_username");
		if (savedLastUser) {
			setLastUsername(savedLastUser);
		}
		if (savedUser) {
			setUsername(savedUser);
			setIsLoggedIn(true);
			const persistedRoomMessages = loadPersistedRoomMessages(savedUser);
			Promise.all(
				Object.entries(persistedRoomMessages).map(
					async ([roomId, messagesForRoom]) => {
						const resolved = await Promise.all(
							(messagesForRoom || []).map(async (message) => {
								if (
									message?.type !== "file" ||
									(!message.fileUrl && !message.fileId)
								) {
									return message;
								}

								const resolvedFileUrl = await resolveSignedDownloadUrl({
									username: savedUser,
									fileId: message.fileId,
									fileUrl: message.fileUrl,
								});

								return {
									...message,
									resolvedFileUrl,
								};
							}),
						);

						return [roomId, resolved];
					},
				),
			).then((entries) => {
				setRoomMessages(Object.fromEntries(entries));
			});
			// Load persisted messages
			getAllMessages(savedUser)
				.then(async (savedMessages) => {
					if (savedMessages && Object.keys(savedMessages).length > 0) {
						const normalizedMessages = {};
						Object.entries(savedMessages).forEach(
							([peer, peerMessages]) => {
								normalizedMessages[peer] = peerMessages.map((msg) =>
									!msg.isMe && msg.from !== savedUser
										? { ...msg, readByMe: msg.readByMe ?? true }
										: msg,
								);
							},
						);

						const resolvedMessages = {};
						for (const [peer, peerMessages] of Object.entries(
							normalizedMessages,
						)) {
							resolvedMessages[peer] = await Promise.all(
								peerMessages.map(async (message) => {
									if (
										message?.type !== "file" ||
										(!message.fileUrl && !message.fileId)
									) {
										return message;
									}

									const resolvedFileUrl =
										await resolveSignedDownloadUrl({
											username: savedUser,
											fileId: message.fileId,
											fileUrl: message.fileUrl,
										});

									return {
										...message,
										resolvedFileUrl,
									};
								}),
							);
						}

						setMessages(resolvedMessages);
					}
				})
				.catch((err) => console.error("Failed to load messages:", err));
		}
	}, []);

	useEffect(() => {
		persistRoomMessages(username, roomMessages);
	}, [username, roomMessages]);

	useEffect(() => {
		const match = location.pathname.match(/^\/join\/([a-zA-Z0-9]+)/);
		if (match?.[1]) {
			setPendingInviteCode(match[1]);
		}
	}, [location.pathname]);

	const showToast = useCallback((message, type = "info") => {
		const id = Date.now();
		setToasts((prev) => [...prev, { id, message, type }]);
		setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== id));
		}, 3000);
	}, []);

	const handleLogin = useCallback((name) => {
		setUsername(name);
		localStorage.setItem("peers_username", name);
		localStorage.setItem("peers_last_username", name);
		setLastUsername(name);
		setIsLoggedIn(true);
	}, []);

	const handleLogout = useCallback(() => {
		localStorage.removeItem("peers_username");
		setIsLoggedIn(false);
		setUsername("");
		setSelectedUser(null);
		setOnlineUsers([]);
		setMessages({});
		window.location.reload();
	}, []);

	// Refs to hold WebRTC handlers (set after useWebRTC is initialized)
	const handleAnswerRef = useRef(null);
	const handleIceCandidateRef = useRef(null);
	const handleRoomOfferRef = useRef(null);
	const handleRoomAnswerRef = useRef(null);
	const handleRoomIceRef = useRef(null);
	const roomCleanupRef = useRef(null);
	const sendMessageRef = useRef(null);
	const upgradeToVideoRef = useRef(null);
	const selectedUserRef = useRef(null);
	const selectedRoomIdRef = useRef(null);
	const currentViewRef = useRef("placeholder");
	const isCallActiveRef = useRef(false);
	const callPeerRef = useRef(null);
	const callTimeoutRef = useRef(null);
	const callStartTimeRef = useRef(null);

	const selectedRoom =
		rooms.find((room) => room.roomId === selectedRoomId) || null;

	const applyReactionToMessage = useCallback(
		(message, reactionUser, emoji) => {
			const currentReactions = Array.isArray(message.reactions)
				? message.reactions
				: [];

			const filtered = currentReactions.filter(
				(reaction) => reaction.user !== reactionUser,
			);

			const existing = currentReactions.find(
				(reaction) => reaction.user === reactionUser,
			);

			if (existing && existing.emoji === emoji) {
				return { ...message, reactions: filtered };
			}

			return {
				...message,
				reactions: [...filtered, { emoji, user: reactionUser }],
			};
		},
		[],
	);

	// Keep refs in sync with state
	useEffect(() => {
		selectedUserRef.current = selectedUser;
	}, [selectedUser]);

	useEffect(() => {
		currentViewRef.current = currentView;
	}, [currentView]);

	useEffect(() => {
		selectedRoomIdRef.current = selectedRoomId;
	}, [selectedRoomId]);

	useEffect(() => {
		if (!isLoggedIn) {
			return;
		}

		const parsed = parseWorkspacePath(location.pathname);
		if (parsed.type === "external") {
			return;
		}

		isApplyingRouteRef.current = true;

		if (parsed.type === "chat") {
			setSelectedRoomId(null);
			if (parsed.user) {
				setSelectedUser(parsed.user);
				setCurrentView("chat");
			} else {
				setCurrentView("placeholder");
			}
		} else if (parsed.type === "video") {
			setSelectedRoomId(null);
			if (parsed.user) {
				setSelectedUser(parsed.user);
			}
			setCurrentView("video");
		} else if (parsed.type === "room") {
			setSelectedUser(null);
			if (parsed.roomId) {
				setSelectedRoomId(parsed.roomId);
				setCurrentView("room");
			}
		} else if (parsed.type === "room-call") {
			setSelectedUser(null);
			if (parsed.roomId) {
				setSelectedRoomId(parsed.roomId);
				const joinedSameRoom =
					roomCallSession?.joined &&
					roomCallSession?.roomId === parsed.roomId;
				setCurrentView(joinedSameRoom ? "room-call" : "room");
			}
		} else if (parsed.type === "invite") {
			setCurrentView("invite");
		} else if (parsed.type === "room-create") {
			setSelectedUser(null);
			setCurrentView("room-create");
		} else {
			setCurrentView("placeholder");
		}

		queueMicrotask(() => {
			isApplyingRouteRef.current = false;
		});
	}, [
		isLoggedIn,
		location.pathname,
		roomCallSession?.joined,
		roomCallSession?.roomId,
	]);

	useEffect(() => {
		if (!isLoggedIn || isApplyingRouteRef.current) {
			return;
		}

		if (!location.pathname.startsWith("/app")) {
			return;
		}

		const nextPath = getWorkspacePath({
			currentView,
			selectedUser,
			selectedRoomId:
				currentView === "room-call"
					? roomCallSession?.roomId || selectedRoomId
					: selectedRoomId,
			callPeer,
		});

		if (nextPath !== location.pathname) {
			navigate(nextPath, { replace: true });
		}
	}, [
		isLoggedIn,
		currentView,
		selectedUser,
		selectedRoomId,
		roomCallSession?.roomId,
		callPeer,
		location.pathname,
		navigate,
	]);

	useEffect(() => {
		isCallActiveRef.current = isCallActive;
	}, [isCallActive]);

	useEffect(() => {
		callPeerRef.current = callPeer;
	}, [callPeer]);

	// WebSocket connection
	const { sendMessage, isConnected } = useWebSocket({
		username,
		isLoggedIn,
		onOnlineUsers: setOnlineUsers,
		onAllUsers: setAllUsers,
		onMessage: async (msg) => {
			if (msg.from) {
				const resolvedFileUrl =
					msg.type === "file"
						? await resolveSignedDownloadUrl({
								username,
								fileId: msg.fileId,
								fileUrl: msg.fileUrl,
							})
						: null;
				const isChatOpenWithSender =
					selectedUserRef.current === msg.from &&
					currentViewRef.current === "chat";
				const incomingMsg = {
					...msg,
					resolvedFileUrl,
					readByMe: isChatOpenWithSender,
				};
				let isNewMessage = false;

				setMessages((prev) => {
					const peerMessages = prev[msg.from] || [];
					const hasDuplicate =
						incomingMsg.messageId &&
						peerMessages.some(
							(existing) => existing.messageId === incomingMsg.messageId,
						);

					if (hasDuplicate) {
						return prev;
					}

					isNewMessage = true;
					return {
						...prev,
						[msg.from]: [...peerMessages, incomingMsg],
					};
				});

				if (!isNewMessage) {
					return;
				}
				// Persist received message
				saveMessage(username, msg.from, incomingMsg).catch((err) =>
					console.error("Failed to save message:", err),
				);
				// Auto-save file messages to saved files
				if (msg.type === "file" && (msg.fileUrl || msg.fileData)) {
					saveFile({
						fileName: msg.fileName,
						fileType: msg.fileType,
						fileSize: msg.fileSize,
						fileData: msg.fileData || null,
						fileUrl: msg.fileUrl || null,
						resolvedFileUrl: resolvedFileUrl || null,
						fileId: msg.fileId || null,
						from: msg.from,
						ownerUsername: username,
						peerUsername: msg.from,
						timestamp: msg.timestamp,
					}).catch((err) =>
						console.error("Failed to auto-save file:", err),
					);
				}
				// Show notifications
				const notificationBody =
					msg.type === "file" ? `Sent a file: ${msg.fileName}` : msg.text;

				// Show in-app toast notification if chat is not open with this sender
				if (!isChatOpenWithSender) {
					showToast(
						`${msg.from}: ${notificationBody.substring(0, 50)}${notificationBody.length > 50 ? "..." : ""}`,
						"message",
					);
					// Play notification sound
					playNotification();
				}

				// Show browser notification
				showNotification(
					`New message from ${msg.from}`,
					notificationBody,
					msg.from,
				);
				// Send delivery confirmation back to sender
				if (msg.messageId && sendMessageRef.current) {
					// Always send delivered confirmation
					sendMessageRef.current({
						type: "delivered",
						to: msg.from,
						messageId: msg.messageId,
					});

					// If chat with this sender is currently open, also send read confirmation
					const isChatOpen =
						selectedUserRef.current === msg.from &&
						currentViewRef.current === "chat";
					if (isChatOpen) {
						// Small delay to ensure delivered is processed first
						setTimeout(() => {
							sendMessageRef.current?.({
								type: "read",
								to: msg.from,
								messageId: msg.messageId,
							});
						}, 100);
					}
				}
			}
		},
		onEditMessage: (data) => {
			if (
				!data?.from ||
				!data?.messageId ||
				typeof data.newText !== "string"
			) {
				return;
			}

			setMessages((prev) => ({
				...prev,
				[data.from]: (prev[data.from] || []).map((message) =>
					message.messageId === data.messageId
						? {
								...message,
								text: data.newText,
								edited: true,
								editedAt: data.editedAt || Date.now(),
							}
						: message,
				),
			}));

			updateMessageContent(data.messageId, data.newText).catch((err) =>
				console.error("Failed to persist edited message:", err),
			);
		},
		onReaction: (data) => {
			if (!data?.from || !data?.messageId || !data.emoji) {
				return;
			}

			let updatedReactions = null;
			setMessages((prev) => {
				const updatedPeerMessages = (prev[data.from] || []).map(
					(message) => {
						if (message.messageId !== data.messageId) {
							return message;
						}

						const nextMessage = applyReactionToMessage(
							message,
							data.from,
							data.emoji,
						);
						updatedReactions = nextMessage.reactions || [];
						return nextMessage;
					},
				);

				return {
					...prev,
					[data.from]: updatedPeerMessages,
				};
			});

			if (updatedReactions) {
				updateMessageReactions(data.messageId, updatedReactions).catch(
					(err) =>
						console.error("Failed to persist message reactions:", err),
				);
			}
		},
		onInviteCreated: (data) => {
			if (!data?.link) {
				return;
			}
			setLastInviteLink(data.link);
			setCurrentView("invite");
			navigator.clipboard
				.writeText(data.link)
				.then(() => showToast("Invite link copied to clipboard", "success"))
				.catch(() => showToast("Invite created", "success"));
		},
		onInviteTarget: (data) => {
			if (!data?.targetUser) {
				return;
			}
			setSelectedUser(data.targetUser);
			setCurrentView("chat");
			showToast(`Connected via invite to ${data.targetUser}`, "success");
		},
		onRoomList: (data) => {
			const nextRooms = dedupeRoomsById(data.rooms);
			setRooms(nextRooms);
			if (isCreatingRoom && roomComposerDraft.name?.trim()) {
				const createdRoom = nextRooms.find(
					(room) =>
						room.isOwner &&
						room.name?.trim().toLowerCase() ===
							roomComposerDraft.name.trim().toLowerCase(),
				);
				if (createdRoom?.roomId) {
					setSelectedRoomId(createdRoom.roomId);
					setCurrentView("room");
					setIsCreatingRoom(false);
					setRoomComposerDraft({ name: "", selectedUsers: [] });
				}
			}
			setPendingRoomInvites((prev) => {
				const byId = new Map(
					prev
						.filter((invite) => {
							const room = nextRooms.find(
								(item) => item.roomId === invite.roomId,
							);
							return room?.isInvited;
						})
						.map((invite) => [invite.roomId, invite]),
				);

				nextRooms
					.filter((room) => room.isInvited)
					.forEach((room) => {
						if (!byId.has(room.roomId)) {
							byId.set(room.roomId, {
								roomId: room.roomId,
								roomName: room.name || "Room",
								owner: room.owner,
								timestamp: Date.now(),
							});
						}
					});

				return Array.from(byId.values());
			});
		},
		onRoomJoinRequest: (data) => {
			if (data?.username && data?.roomId) {
				showToast(
					`${data.username} requested to join room ${data.roomId.slice(0, 6)}`,
					"info",
				);
			}
		},
		onRoomMessageStatus: (data) => {
			if (
				!data?.roomId ||
				!data?.messageId ||
				!data?.from ||
				!data?.status
			) {
				return;
			}

			setRoomMessages((prev) => {
				const existing = prev[data.roomId] || [];
				const next = existing.map((message) => {
					if (message.messageId !== data.messageId) {
						return message;
					}

					const deliveredBy = Array.isArray(message.deliveredBy)
						? message.deliveredBy
						: [];
					const readBy = Array.isArray(message.readBy)
						? message.readBy
						: [];

					if (data.status === "read") {
						return {
							...message,
							status: "read",
							deliveredBy: Array.from(
								new Set([...deliveredBy, data.from]),
							),
							readBy: Array.from(new Set([...readBy, data.from])),
						};
					}

					return {
						...message,
						status:
							message.status === "pending" ? "sent" : message.status,
						deliveredBy: Array.from(new Set([...deliveredBy, data.from])),
					};
				});

				return {
					...prev,
					[data.roomId]: next,
				};
			});
		},
		onRoomChat: (data) => {
			if (data?.from && data?.roomId && data?.message) {
				const isMe = data.from === username;
				const shouldMarkReadNow =
					!isMe && selectedRoomIdRef.current === data.roomId;
				const sentPriority = STATUS_PRIORITY.sent;

				setRoomMessages((prev) => {
					const existing = prev[data.roomId] || [];
					const messageId =
						typeof data.messageId === "string" && data.messageId.trim()
							? data.messageId
							: `${data.from}-${data.timestamp || Date.now()}-${data.message}`;

					const existingIndex = existing.findIndex(
						(item) => item.messageId === messageId,
					);

					if (existingIndex >= 0) {
						const next = [...existing];
						const currentStatus = next[existingIndex].status;
						const currentPriority =
							STATUS_PRIORITY[currentStatus] ?? STATUS_PRIORITY.pending;
						const deliveredBy = Array.isArray(
							next[existingIndex].deliveredBy,
						)
							? next[existingIndex].deliveredBy
							: [];
						const readBy = Array.isArray(next[existingIndex].readBy)
							? next[existingIndex].readBy
							: [];
						next[existingIndex] = {
							...next[existingIndex],
							status:
								currentPriority < sentPriority
									? "sent"
									: currentStatus,
							timestamp: data.timestamp || next[existingIndex].timestamp,
							replyTo:
								data.replyTo || next[existingIndex].replyTo || null,
							deliveredBy: Array.from(
								new Set([...deliveredBy, data.from]),
							),
							readBy: shouldMarkReadNow
								? Array.from(new Set([...readBy, username]))
								: readBy,
						};
						return {
							...prev,
							[data.roomId]: next,
						};
					}

					return {
						...prev,
						[data.roomId]: [
							...existing,
							{
								messageId,
								from: data.from,
								message: data.message,
								replyTo: data.replyTo || null,
								timestamp: data.timestamp || Date.now(),
								status: "sent",
								isMe,
								deliveredBy: [data.from],
								readBy: shouldMarkReadNow ? [username] : [],
							},
						],
					};
				});

				if (!isMe) {
					sendMessageRef.current?.({
						type: "room_message_status",
						to: data.from,
						roomId: data.roomId,
						messageId: data.messageId,
						status: "delivered",
					});

					if (shouldMarkReadNow) {
						sendMessageRef.current?.({
							type: "room_message_status",
							to: data.from,
							roomId: data.roomId,
							messageId: data.messageId,
							status: "read",
						});
					}
				}
				showToast(
					`[Room ${data.roomId.slice(0, 6)}] ${data.from}: ${data.message}`,
					"message",
				);
			}
		},
		onRoomReaction: (data) => {
			if (!data?.roomId || !data?.messageId || !data?.emoji || !data?.from) {
				return;
			}

			setRoomMessages((prev) => {
				const existing = prev[data.roomId] || [];
				const next = existing.map((message) => {
					if (message.messageId !== data.messageId) {
						return message;
					}

					return applyReactionToMessage(message, data.from, data.emoji);
				});

				return {
					...prev,
					[data.roomId]: next,
				};
			});
		},
		onRoomFile: async (data) => {
			if (
				!data?.from ||
				!data?.roomId ||
				!data?.fileUrl ||
				!data?.fileName
			) {
				return;
			}

			const resolvedFileUrl = await resolveSignedDownloadUrl({
				username,
				fileId: data.fileId,
				fileUrl: data.fileUrl,
			});

			const isMe = data.from === username;
			const shouldMarkReadNow =
				!isMe && selectedRoomIdRef.current === data.roomId;
			const sentPriority = STATUS_PRIORITY.sent;

			setRoomMessages((prev) => {
				const existing = prev[data.roomId] || [];
				const messageId =
					typeof data.messageId === "string" && data.messageId.trim()
						? data.messageId
						: `${data.from}-${data.timestamp || Date.now()}-${data.fileName}`;

				const existingIndex = existing.findIndex(
					(item) => item.messageId === messageId,
				);

				if (existingIndex >= 0) {
					const next = [...existing];
					const currentStatus = next[existingIndex].status;
					const currentPriority =
						STATUS_PRIORITY[currentStatus] ?? STATUS_PRIORITY.pending;
					const deliveredBy = Array.isArray(
						next[existingIndex].deliveredBy,
					)
						? next[existingIndex].deliveredBy
						: [];
					const readBy = Array.isArray(next[existingIndex].readBy)
						? next[existingIndex].readBy
						: [];
					next[existingIndex] = {
						...next[existingIndex],
						status:
							currentPriority < sentPriority
								? "sent"
								: currentStatus,
						timestamp: data.timestamp || next[existingIndex].timestamp,
						fileId: data.fileId || next[existingIndex].fileId || null,
						fileUrl: data.fileUrl || next[existingIndex].fileUrl || null,
						replyTo: data.replyTo || next[existingIndex].replyTo || null,
						resolvedFileUrl:
							resolvedFileUrl ||
							next[existingIndex].resolvedFileUrl ||
							next[existingIndex].fileUrl ||
							null,
						deliveredBy: Array.from(new Set([...deliveredBy, data.from])),
						readBy: shouldMarkReadNow
							? Array.from(new Set([...readBy, username]))
							: readBy,
					};
					return {
						...prev,
						[data.roomId]: next,
					};
				}

				return {
					...prev,
					[data.roomId]: [
						...existing,
						{
							messageId,
							from: data.from,
							type: "file",
							fileName: data.fileName,
							fileType: data.fileType,
							fileKind: data.fileKind || "file",
							fileSize: data.fileSize,
							fileId: data.fileId || null,
							fileUrl: data.fileUrl,
							resolvedFileUrl,
							caption: data.caption || "",
							replyTo: data.replyTo || null,
							timestamp: data.timestamp || Date.now(),
							status: "sent",
							isMe,
							deliveredBy: [data.from],
							readBy: shouldMarkReadNow ? [username] : [],
						},
					],
				};
			});

			if (!isMe) {
				sendMessageRef.current?.({
					type: "room_message_status",
					to: data.from,
					roomId: data.roomId,
					messageId: data.messageId,
					status: "delivered",
				});

				if (shouldMarkReadNow) {
					sendMessageRef.current?.({
						type: "room_message_status",
						to: data.from,
						roomId: data.roomId,
						messageId: data.messageId,
						status: "read",
					});
				}
			}

			showToast(
				`[Room ${data.roomId.slice(0, 6)}] ${data.from} sent ${data.fileName}`,
				"message",
			);
		},
		onRoomCallStarted: (data) => {
			if (!data?.roomId || !data?.startedBy) {
				return;
			}

			setRoomCallParticipantsByRoom((prev) => ({
				...prev,
				[data.roomId]: prev[data.roomId] || [],
			}));

			if (data.startedBy !== username) {
				setRoomCallIncomingByRoom((prev) => ({
					...prev,
					[data.roomId]: data.startedBy,
				}));
				showToast(`${data.startedBy} started a room call`, "info");
			}
		},
		onRoomCallParticipants: (data) => {
			if (!data?.roomId || !Array.isArray(data.participants)) {
				return;
			}

			setRoomCallParticipantsByRoom((prev) => ({
				...prev,
				[data.roomId]: data.participants,
			}));

			setRoomCallSession((prev) => {
				const sameRoom = prev?.roomId === data.roomId;
				if (!sameRoom && !data.participants.includes(username)) {
					return prev;
				}

				return {
					roomId: data.roomId,
					participants: data.participants,
					joined: data.participants.includes(username),
				};
			});

			if (data.participants.includes(username)) {
				setRoomCallLastJoinedByRoom((prev) => ({
					...prev,
					[data.roomId]: true,
				}));

				setRoomCallIncomingByRoom((prev) => {
					if (!prev[data.roomId]) {
						return prev;
					}
					const next = { ...prev };
					delete next[data.roomId];
					return next;
				});

				setRoomMediaStateByUser((prev) => {
					const next = {};
					for (const participant of data.participants) {
						if (prev[participant]) {
							next[participant] = prev[participant];
						}
					}
					if (!next[username]) {
						next[username] = {
							isMuted: false,
							isVideoOff: false,
							isScreenSharing: false,
						};
					}
					return next;
				});
			}
		},
		onRoomMediaState: (data) => {
			if (!data?.roomId || !data?.from) {
				return;
			}

			setRoomMediaStateByUser((prev) => ({
				...prev,
				[data.from]: {
					isMuted: Boolean(data.isMuted),
					isVideoOff: Boolean(data.isVideoOff),
					isScreenSharing: Boolean(data.isScreenSharing),
				},
			}));
		},
		onRoomCallEnded: (data) => {
			if (!data?.roomId) {
				return;
			}

			setRoomCallParticipantsByRoom((prev) => {
				if (!(data.roomId in prev)) {
					return prev;
				}
				const next = { ...prev };
				delete next[data.roomId];
				return next;
			});
			setRoomCallLastJoinedByRoom((prev) => {
				if (!(data.roomId in prev)) {
					return prev;
				}
				const next = { ...prev };
				delete next[data.roomId];
				return next;
			});

			setRoomCallSession((prev) =>
				prev?.roomId === data.roomId ? null : prev,
			);
			setRoomCallIncomingByRoom((prev) => {
				if (!prev[data.roomId]) {
					return prev;
				}
				const next = { ...prev };
				delete next[data.roomId];
				return next;
			});

			if (currentViewRef.current === "room-call") {
				setCurrentView("room");
			}
			roomCleanupRef.current?.();
			setRoomMediaStateByUser({});
			showToast("Room call ended", "info");
		},
		onRoomWebRTCOffer: (data) => {
			handleRoomOfferRef.current?.(data);
		},
		onRoomWebRTCAnswer: (data) => {
			handleRoomAnswerRef.current?.(data);
		},
		onRoomWebRTCIce: (data) => {
			handleRoomIceRef.current?.(data);
		},
		onRoomCreated: (data) => {
			if (!data?.roomId) {
				setIsCreatingRoom(false);
				return;
			}
			setIsCreatingRoom(false);
			setRooms((prev) => {
				if (prev.some((room) => room.roomId === data.roomId)) {
					return prev;
				}
				return [
					...prev,
					{
						roomId: data.roomId,
						name: data.roomName || "Untitled Room",
						owner: username,
						members: [username],
						pendingRequests: [],
						pendingInvites: [],
						isOwner: true,
						isMember: true,
						isInvited: false,
					},
				];
			});
			setSelectedRoomId(data.roomId);
			setCurrentView("room");
			setRoomComposerDraft({ name: "", selectedUsers: [] });
			showToast(`Room created: ${data.roomName || data.roomId}`, "success");
		},
		onRoomInvite: (data) => {
			if (!data?.roomId) {
				return;
			}
			setPendingRoomInvites((prev) => {
				if (prev.some((invite) => invite.roomId === data.roomId)) {
					return prev;
				}
				return [
					...prev,
					{
						roomId: data.roomId,
						roomName: data.roomName || "Room",
						owner: data.owner,
						timestamp: data.timestamp || Date.now(),
					},
				];
			});
			showToast(
				`${data.owner || "Someone"} invited you to ${data.roomName || "a room"}`,
				"info",
			);
		},
		onRoomInviteResult: (data) => {
			if (!data?.roomId || !data?.username) {
				return;
			}
			showToast(
				`${data.username} ${data.accepted ? "joined" : "declined"} room ${data.roomId.slice(0, 6)}`,
				data.accepted ? "success" : "info",
			);
		},
		onOffer: (data) => {
			console.log(
				"Received offer from",
				data.from,
				"type:",
				data.callType,
				"isUpgrade:",
				data.isUpgrade,
			);

			// If this is a video upgrade during an existing call, handle it silently
			if (
				data.isUpgrade &&
				isCallActiveRef.current &&
				callPeerRef.current === data.from
			) {
				// Handle renegotiation for video upgrade without showing incoming call modal
				handleAnswerRef.current?.(data);
				setCallType("video");
				setIncomingVideoUpgradeRequest(null);
				setIsVideoUpgradePending(false);
				return;
			}

			// Normal incoming call
			setIncomingCall(data);
		},
		onAnswer: (data) => {
			// Call was answered - clear timeout and record start time
			if (callTimeoutRef.current) {
				clearTimeout(callTimeoutRef.current);
				callTimeoutRef.current = null;
			}
			callStartTimeRef.current = Date.now();
			handleAnswerRef.current?.(data);
		},
		onIce: (data) => handleIceCandidateRef.current?.(data),
		onHangup: (data) => {
			// Clear timeout
			if (callTimeoutRef.current) {
				clearTimeout(callTimeoutRef.current);
				callTimeoutRef.current = null;
			}

			// Clear incoming call modal if still showing (caller hung up before we answered)
			setIncomingCall(null);

			// Calculate duration if call was active
			let duration = null;
			if (callStartTimeRef.current) {
				duration = Math.floor(
					(Date.now() - callStartTimeRef.current) / 1000,
				);
			}

			// Log call based on state
			if (data?.from) {
				if (duration !== null && duration > 0) {
					// Completed call with duration
					const callLog = createCallLog("completed", {
						duration,
						isMe: false,
					});
					setMessages((prev) => ({
						...prev,
						[data.from]: [...(prev[data.from] || []), callLog],
					}));
					saveMessage(username, data.from, {
						...callLog,
						from: data.from,
					}).catch((err) =>
						console.error("Failed to save call log:", err),
					);
					// Show call ended modal for completed calls
					setCallEndedInfo({ duration, caller: data.from });
				} else if (!callStartTimeRef.current) {
					// Call was hung up before being answered - missed call for receiver
					const callLog = createCallLog("missed", { isMe: false });
					setMessages((prev) => ({
						...prev,
						[data.from]: [...(prev[data.from] || []), callLog],
					}));
					saveMessage(username, data.from, {
						...callLog,
						from: data.from,
					}).catch((err) =>
						console.error("Failed to save call log:", err),
					);
				}
			}

			callStartTimeRef.current = null;
			setIsCallActive(false);
			setIsCalling(false);
			setCallPeer(null);
			setIncomingVideoUpgradeRequest(null);
			setIsVideoUpgradePending(false);
			if (currentViewRef.current === "video") {
				setCurrentView("chat");
			}
		},
		onTyping: (data) => {
			if (data.isTyping) {
				// Store timestamp when typing started/refreshed
				setTypingUsers((prev) => ({ ...prev, [data.from]: Date.now() }));
			} else {
				setTypingUsers((prev) => {
					const updated = { ...prev };
					delete updated[data.from];
					return updated;
				});
			}
		},
		onDeleteMessage: (data) => {
			// Delete message from local state when receiver gets delete-for-everyone
			if (data.from && data.messageId) {
				setMessages((prev) => ({
					...prev,
					[data.from]: (prev[data.from] || []).filter(
						(msg) => msg.messageId !== data.messageId,
					),
				}));
				// Also delete from IndexedDB
				deleteMessageFromDB(data.messageId).catch((err) =>
					console.error("Failed to delete message from DB:", err),
				);
			}
		},
		onDelivered: (data) => {
			// Update message status to delivered when receiver confirms
			// Status hierarchy: sent < queued < delivered < read (only upgrade, never downgrade)
			if (data.from && data.messageId) {
				setMessages((prev) => ({
					...prev,
					[data.from]: (prev[data.from] || []).map((msg) => {
						if (msg.messageId !== data.messageId) return msg;
						const currentPriority = STATUS_PRIORITY[msg.status] ?? 1;
						const newPriority = STATUS_PRIORITY.delivered;
						return newPriority > currentPriority
							? { ...msg, status: "delivered" }
							: msg;
					}),
				}));
				// Persist to IndexedDB (storage also enforces hierarchy)
				updateMessageStatus(data.messageId, "delivered").catch((err) =>
					console.error("Failed to persist delivered status:", err),
				);
			}
		},
		onRead: (data) => {
			// Update message status to read when receiver confirms
			// Read is the highest status - always applies
			if (data.from && data.messageId) {
				setMessages((prev) => ({
					...prev,
					[data.from]: (prev[data.from] || []).map((msg) => {
						if (msg.messageId !== data.messageId) return msg;
						const currentPriority = STATUS_PRIORITY[msg.status] ?? 1;
						const newPriority = STATUS_PRIORITY.read;
						return newPriority > currentPriority
							? { ...msg, status: "read" }
							: msg;
					}),
				}));
				// Persist to IndexedDB
				updateMessageStatus(data.messageId, "read").catch((err) =>
					console.error("Failed to persist read status:", err),
				);
			}
		},
		onMessageQueued: (data) => {
			// Message left sender device and was accepted by server.
			// Keep it as sent so UI stays one-tick, even when receiver is offline.
			if (data.to && data.messageId) {
				setMessages((prev) => ({
					...prev,
					[data.to]: (prev[data.to] || []).map((msg) => {
						if (msg.messageId !== data.messageId) return msg;
						const currentPriority = STATUS_PRIORITY[msg.status] ?? 1;
						const newPriority = STATUS_PRIORITY.sent;
						return newPriority > currentPriority
							? { ...msg, status: "sent" }
							: msg;
					}),
				}));
				// Persist to IndexedDB
				updateMessageStatus(data.messageId, "sent").catch((err) =>
					console.error("Failed to persist sent status:", err),
				);
			}
		},
		onReject: (data) => {
			// Call was rejected by the other party - play rejected tone on caller's end
			playCallRejectedtone();

			if (callTimeoutRef.current) {
				clearTimeout(callTimeoutRef.current);
				callTimeoutRef.current = null;
			}
			// Log missed call (rejected by receiver)
			if (data?.from) {
				const callLog = createCallLog("declined", { isMe: true });
				setMessages((prev) => ({
					...prev,
					[data.from]: [...(prev[data.from] || []), callLog],
				}));
				saveMessage(username, data.from, {
					...callLog,
					from: username,
				}).catch((err) => console.error("Failed to save call log:", err));
			}
			callStartTimeRef.current = null;
			setIsCallActive(false);
			setIsCalling(false);
			setIncomingVideoUpgradeRequest(null);
			setIsVideoUpgradePending(false);
		},
		onVideoToggle: (data) => {
			// Remote user toggled their video
			if (data?.from) {
				setRemoteVideoOff(!data.enabled);
			}
		},
		onVideoUpgradeRequest: (data) => {
			if (!data?.from) {
				return;
			}

			if (isCallActiveRef.current && callPeerRef.current === data.from) {
				setIncomingVideoUpgradeRequest({
					from: data.from,
					timestamp: Date.now(),
				});
				showToast(`${data.from} wants to enable video`, "info");
				return;
			}

			sendMessageRef.current?.({
				type: "video_upgrade_response",
				to: data.from,
				accepted: false,
			});
		},
		onVideoUpgradeResponse: async (data) => {
			if (!data?.from || !isVideoUpgradePending) {
				return;
			}

			setIsVideoUpgradePending(false);

			if (!data.accepted) {
				showToast(`${data.from} declined video upgrade`, "info");
				return;
			}

			try {
				await upgradeToVideoRef.current?.(data.from);
				setCallType("video");
				showToast(`${data.from} accepted video upgrade`, "success");
			} catch (error) {
				showToast(
					error.message || "Unable to start camera for video upgrade",
					"danger",
				);
			}
		},
		showToast,
	});

	const {
		localStream: roomLocalStream,
		remoteStreams: roomRemoteStreams,
		isMuted: roomIsMuted,
		isVideoOff: roomIsVideoOff,
		isScreenSharing: roomIsScreenSharing,
		activeSpeaker: roomActiveSpeaker,
		toggleMute: toggleRoomMute,
		toggleVideo: toggleRoomVideo,
		toggleScreenShare: toggleRoomScreenShare,
		handleOffer: handleRoomOffer,
		handleAnswer: handleRoomAnswer,
		handleIce: handleRoomIce,
		cleanup: cleanupRoomMedia,
	} = useRoomWebRTC({
		sendMessage,
		username,
		roomCallSession,
		onError: (message) => showToast(message, "danger"),
	});

	// WebRTC
	const {
		localStream,
		remoteStream,
		startCall,
		answerCall,
		endCall,
		toggleMute,
		toggleVideo,
		upgradeToVideo,
		flipCamera,
		isScreenSharing,
		toggleScreenShare,
		callStats,
		isMuted,
		isVideoOff,
		handleAnswer,
		handleIceCandidate,
	} = useWebRTC({
		sendMessage,
		username,
		selectedUser,
		callPeer,
		onCallConnected: () => {
			// Only set if not already active (prevent timer reset on ICE reconnection)
			if (!isCallActive) {
				setIsCallActive(true);
				setIsCalling(false);
				setCallStartTime(Date.now());
				setCurrentView("video");
			}
		},
		onCallEnded: () => {
			setIsCallActive(false);
			setIsCalling(false);
			setIncomingVideoUpgradeRequest(null);
			setIsVideoUpgradePending(false);
			setCallStartTime(null);
			if (selectedUser) {
				setCurrentView("chat");
			} else {
				setCurrentView("placeholder");
			}
		},
	});

	// Update refs after useWebRTC is initialized
	useEffect(() => {
		handleAnswerRef.current = handleAnswer;
		handleIceCandidateRef.current = handleIceCandidate;
		upgradeToVideoRef.current = upgradeToVideo;
		handleRoomOfferRef.current = handleRoomOffer;
		handleRoomAnswerRef.current = handleRoomAnswer;
		handleRoomIceRef.current = handleRoomIce;
		roomCleanupRef.current = cleanupRoomMedia;
	}, [
		handleAnswer,
		handleIceCandidate,
		upgradeToVideo,
		handleRoomOffer,
		handleRoomAnswer,
		handleRoomIce,
		cleanupRoomMedia,
	]);

	// Update sendMessageRef
	useEffect(() => {
		sendMessageRef.current = sendMessage;
	}, [sendMessage]);

	// Cleanup stale typing indicators (if no refresh received within 4 seconds)
	useEffect(() => {
		const interval = setInterval(() => {
			const now = Date.now();
			setTypingUsers((prev) => {
				const updated = { ...prev };
				let hasChanges = false;
				for (const user in updated) {
					if (now - updated[user] > 4000) {
						delete updated[user];
						hasChanges = true;
					}
				}
				return hasChanges ? updated : prev;
			});
		}, 1000);
		return () => clearInterval(interval);
	}, []);

	// Auto-dismiss call ended modal after 3 seconds
	useEffect(() => {
		if (callEndedInfo) {
			const timer = setTimeout(() => {
				setCallEndedInfo(null);
			}, 3000);
			return () => clearTimeout(timer);
		}
	}, [callEndedInfo]);

	const handleSelectUser = useCallback(
		(user) => {
			setSelectedRoomId(null);
			setSelectedUser(user);
			if (user) {
				setCurrentView("chat");
				setMessages((prev) => ({
					...prev,
					[user]: (prev[user] || []).map((msg) =>
						!msg.isMe && msg.from === user
							? { ...msg, readByMe: true }
							: msg,
					),
				}));
				markConversationReadByUser(username, user).catch((err) =>
					console.error("Failed to persist read state:", err),
				);
				// Send read confirmations for unread messages from this user
				const userMessages = messages[user] || [];
				userMessages.forEach((msg) => {
					if (!msg.isMe && msg.from !== username && msg.messageId) {
						sendMessageRef.current?.({
							type: "read",
							to: msg.from,
							messageId: msg.messageId,
						});
					}
				});
			} else {
				setCurrentView("placeholder");
			}
			if (window.innerWidth <= 768) {
				setSidebarOpen(false);
			}
		},
		[messages, username],
	);

	// Helper to add call log to chat
	const addCallLog = useCallback(
		(user, callLogType, duration = null) => {
			const callLog = createCallLog(callLogType, {
				duration,
				isMe:
					callLogType === "outgoing" || callLogType === "missed-outgoing",
			});
			setMessages((prev) => ({
				...prev,
				[user]: [...(prev[user] || []), callLog],
			}));
			// Persist call log
			saveMessage(username, user, { ...callLog, from: username }).catch(
				(err) => console.error("Failed to save call log:", err),
			);
		},
		[username],
	);

	// Detect when call peer goes offline during a call
	useEffect(() => {
		if ((isCallActive || isCalling) && callPeer) {
			const isPeerOnline = onlineUsers.includes(callPeer);
			if (!isPeerOnline) {
				// Call peer went offline - end the call
				showToast(`${callPeer} disconnected`, "info");

				// Calculate duration if call was active
				let duration = null;
				if (isCallActive && callStartTimeRef.current) {
					duration = Math.floor(
						(Date.now() - callStartTimeRef.current) / 1000,
					);
				}

				// End the call
				endCall();

				// Clear timeout
				if (callTimeoutRef.current) {
					clearTimeout(callTimeoutRef.current);
					callTimeoutRef.current = null;
				}

				// Show call ended modal if there was a duration
				if (duration !== null && duration > 0) {
					addCallLog(callPeer, "completed", duration);
					setCallEndedInfo({ duration, caller: callPeer });
				}

				setIsCallActive(false);
				setIsCalling(false);
				setCallPeer(null);
				callStartTimeRef.current = null;
				setCurrentView("chat");
			}
		}
	}, [
		onlineUsers,
		isCallActive,
		isCalling,
		callPeer,
		endCall,
		showToast,
		addCallLog,
	]);

	const handleStartCall = useCallback(
		async (type) => {
			setCallType(type);
			setIsCalling(true);
			setCallPeer(selectedUser); // Track who we're calling
			callStartTimeRef.current = Date.now();

			// Set 30-second timeout for unanswered calls
			callTimeoutRef.current = setTimeout(() => {
				if (callTimeoutRef.current) {
					// Call was not answered - auto hangup
					showToast("Call not answered", "info");
					endCall();
					if (selectedUserRef.current) {
						sendMessageRef.current?.({
							type: "hangup",
							to: selectedUserRef.current,
						});
						// Log missed call (outgoing)
						addCallLog(selectedUserRef.current, "missed-outgoing");
					}
					setIsCalling(false);
					setIsCallActive(false);
					setCallPeer(null);
				}
			}, 30000);

			try {
				await startCall(selectedUser, type);
			} catch (error) {
				// Clear timeout on error
				if (callTimeoutRef.current) {
					clearTimeout(callTimeoutRef.current);
					callTimeoutRef.current = null;
				}
				setIsCalling(false);
				setCallPeer(null);
				showToast(error.message || "Failed to start call", "danger");
			}
		},
		[selectedUser, startCall, showToast, endCall, addCallLog],
	);

	const handleAnswerCall = useCallback(async () => {
		if (incomingCall) {
			const callData = incomingCall;
			// Set callPeer to track who we're in a call with
			setCallPeer(callData.from);
			// Set selectedUser to the caller so ICE candidates are sent correctly
			setSelectedUser(callData.from);
			setCallType(callData.callType || "video");
			setIncomingCall(null);
			// Clear any existing timeout (from caller's side)
			if (callTimeoutRef.current) {
				clearTimeout(callTimeoutRef.current);
				callTimeoutRef.current = null;
			}
			// Record call start time for duration tracking
			callStartTimeRef.current = Date.now();
			// Transition to video view immediately when answering
			setCurrentView("video");
			setIsCallActive(true);
			try {
				await answerCall(callData);
			} catch (error) {
				// Revert state on error
				setIsCallActive(false);
				setCallPeer(null);
				setCurrentView("chat");
				showToast(error.message || "Failed to answer call", "danger");
			}
		}
	}, [incomingCall, answerCall, showToast]);

	const handleRejectCall = useCallback(() => {
		if (incomingCall) {
			sendMessage({
				type: "reject",
				to: incomingCall.from,
			});
			// Log rejected call
			addCallLog(incomingCall.from, "rejected");
		}
		setIncomingCall(null);
	}, [incomingCall, sendMessage, addCallLog]);

	const handleAcceptVideoUpgrade = useCallback(() => {
		if (!incomingVideoUpgradeRequest) {
			return;
		}

		sendMessage({
			type: "video_upgrade_response",
			to: incomingVideoUpgradeRequest.from,
			accepted: true,
		});
		setIncomingVideoUpgradeRequest(null);
		showToast("Video upgrade accepted", "success");
	}, [incomingVideoUpgradeRequest, sendMessage, showToast]);

	const handleDeclineVideoUpgrade = useCallback(() => {
		if (!incomingVideoUpgradeRequest) {
			return;
		}

		sendMessage({
			type: "video_upgrade_response",
			to: incomingVideoUpgradeRequest.from,
			accepted: false,
		});
		setIncomingVideoUpgradeRequest(null);
		showToast("Video upgrade declined", "info");
	}, [incomingVideoUpgradeRequest, sendMessage, showToast]);

	const handleToggleVideo = useCallback(async () => {
		if (!localStream) {
			return;
		}

		const hasVideoTrack = localStream.getVideoTracks().length > 0;
		if (hasVideoTrack) {
			toggleVideo();
			return;
		}

		if (!isCallActive || !callPeer) {
			showToast("Start a call before enabling video", "info");
			return;
		}

		if (isVideoUpgradePending) {
			showToast("Waiting for video permission from peer", "info");
			return;
		}

		sendMessage({
			type: "video_upgrade_request",
			to: callPeer,
		});
		setIsVideoUpgradePending(true);
		showToast("Video permission request sent", "info");
	}, [
		localStream,
		toggleVideo,
		isCallActive,
		callPeer,
		isVideoUpgradePending,
		sendMessage,
		showToast,
	]);

	const handleHangup = useCallback(() => {
		// Clear timeout if call ends before timeout
		if (callTimeoutRef.current) {
			clearTimeout(callTimeoutRef.current);
			callTimeoutRef.current = null;
		}

		// Calculate call duration if call was active
		let duration = null;
		if (isCallActive && callStartTimeRef.current) {
			duration = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
		}

		// Use callPeer (the actual call participant) instead of selectedUser
		const peer = callPeer || selectedUser;

		endCall();
		if (peer) {
			sendMessage({
				type: "hangup",
				to: peer,
			});
			// Log completed call with duration (only if call was connected)
			if (duration !== null && duration > 0) {
				addCallLog(peer, "completed", duration);
				// Show call ended modal
				setCallEndedInfo({ duration, caller: peer });
			}
		}
		setIsCallActive(false);
		setIsCalling(false);
		setCallPeer(null);
		setIncomingVideoUpgradeRequest(null);
		setIsVideoUpgradePending(false);
		callStartTimeRef.current = null;
		setCurrentView("chat");
	}, [endCall, callPeer, selectedUser, sendMessage, isCallActive, addCallLog]);

	const handleSendMessage = useCallback(
		(data) => {
			if (!selectedUser) return;

			let msg;
			if (typeof data === "string") {
				msg = createTextMessage(selectedUser, data);
			} else if (
				data &&
				typeof data === "object" &&
				typeof data.text === "string"
			) {
				msg = {
					...createTextMessage(selectedUser, data.text),
					replyTo: data.replyTo || null,
				};
			} else {
				return;
			}

			const sentToSocket = sendMessage(msg);
			const messageStatus = sentToSocket ? "sent" : "pending";

			const localMsg = {
				...msg,
				from: username,
				isMe: true,
				status: messageStatus,
			};

			// Add to local messages
			setMessages((prev) => ({
				...prev,
				[selectedUser]: [...(prev[selectedUser] || []), localMsg],
			}));

			// Persist sent message
			saveMessage(username, selectedUser, localMsg).catch((err) =>
				console.error("Failed to save message:", err),
			);

			if (!sentToSocket) {
				showToast(
					"Message pending. It will send when reconnected.",
					"info",
				);
			}
		},
		[selectedUser, username, sendMessage, showToast],
	);

	const requestSignedUploadUrl = useCallback(
		async (file, contentType) => {
			const urlResponse = await fetch(apiUrl("/api/upload-url"), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-user-name": username,
				},
				body: JSON.stringify({
					username,
					filename: file.name,
					fileType: contentType,
					fileSize: file.size,
				}),
			});

			if (!urlResponse.ok) {
				throw new Error("Failed to request signed upload URL");
			}

			const { uploadUrl, fileUrl, fileId } = await urlResponse.json();
			if (!uploadUrl || !fileUrl || !fileId) {
				throw new Error("Invalid upload URL response");
			}

			return { uploadUrl, fileUrl, fileId };
		},
		[username],
	);

	const handleSendFileUpload = useCallback(
		async (filePayload) => {
			if (!selectedUser || !filePayload?.file) {
				return;
			}

			const file = filePayload.file;
			const contentType = file.type || "application/octet-stream";

			if (!isAllowedUploadMimeType(contentType)) {
				showToast(
					"Unsupported file type. Only images, PDF, and text files are allowed.",
					"danger",
				);
				return;
			}

			if (file.size <= 0 || file.size > MAX_UPLOAD_FILE_SIZE) {
				showToast("File size must be 10MB or less.", "danger");
				return;
			}

			const messageId =
				filePayload.existingMessageId || createMessageId("file");
			const timestamp = filePayload.existingTimestamp || Date.now();
			const localUploadMessage = {
				type: "file",
				to: selectedUser,
				messageId,
				timestamp,
				from: username,
				isMe: true,
				status: "pending",
				fileName: file.name,
				fileType: file.type,
				fileKind: filePayload.fileKind || "file",
				fileSize: file.size,
				caption: filePayload.caption || "",
				isUploading: true,
				uploadProgress: 0,
				fileData: null,
				localFile: file,
				fileId: null,
				fileUrl: null,
				resolvedFileUrl: null,
			};

			setMessages((prev) => {
				const peerMessages = prev[selectedUser] || [];
				const hasExisting = peerMessages.some(
					(message) => message.messageId === messageId,
				);

				return {
					...prev,
					[selectedUser]: hasExisting
						? peerMessages.map((message) =>
								message.messageId === messageId
									? {
											...message,
											status: "pending",
											isUploading: true,
											uploadProgress: 0,
											localFile: file,
										}
									: message,
							)
						: [...peerMessages, localUploadMessage],
				};
			});

			saveMessage(username, selectedUser, {
				...localUploadMessage,
				localFile: null,
			}).catch((err) =>
				console.error("Failed to save pending file message:", err),
			);

			try {
				const { uploadUrl, fileUrl, fileId } = await requestSignedUploadUrl(
					file,
					contentType,
				);
				const resolvedFileUrl = await resolveSignedDownloadUrl({
					username,
					fileId,
					fileUrl,
				});

				await new Promise((resolve, reject) => {
					const xhr = new XMLHttpRequest();
					xhr.open("PUT", uploadUrl);
					xhr.setRequestHeader("Content-Type", contentType);

					xhr.upload.onprogress = (event) => {
						if (!event.lengthComputable) {
							return;
						}

						const progress = Math.min(
							99,
							Math.max(
								1,
								Math.round((event.loaded / event.total) * 100),
							),
						);

						setMessages((prev) => ({
							...prev,
							[selectedUser]: (prev[selectedUser] || []).map(
								(message) =>
									message.messageId === messageId
										? {
												...message,
												uploadProgress: progress,
											}
										: message,
							),
						}));
					};

					xhr.onload = () => {
						if (xhr.status >= 200 && xhr.status < 300) {
							resolve();
							return;
						}

						reject(new Error("Failed to upload file to storage"));
					};

					xhr.onerror = () =>
						reject(new Error("Network error during upload"));
					xhr.onabort = () => reject(new Error("Upload aborted"));
					xhr.send(file);
				});

				setMessages((prev) => ({
					...prev,
					[selectedUser]: (prev[selectedUser] || []).map((message) =>
						message.messageId === messageId
							? {
									...message,
									status: "sent",
									isUploading: false,
									uploadProgress: 100,
									localFile: null,
									fileId,
									fileUrl,
									resolvedFileUrl,
								}
							: message,
					),
				}));

				const sent = sendMessage({
					type: "file",
					to: selectedUser,
					from: username,
					fileName: file.name,
					fileType: contentType,
					fileKind: filePayload.fileKind || "file",
					fileSize: file.size,
					fileId,
					fileUrl,
					caption: filePayload.caption || "",
					messageId,
					timestamp,
				});

				if (!sent) {
					throw new Error(
						"Socket unavailable while sending file metadata",
					);
				}

				await saveMessage(username, selectedUser, {
					type: "file",
					to: selectedUser,
					from: username,
					isMe: true,
					status: "sent",
					fileName: file.name,
					fileType: contentType,
					fileKind: filePayload.fileKind || "file",
					fileSize: file.size,
					fileId,
					fileUrl,
					resolvedFileUrl,
					caption: filePayload.caption || "",
					messageId,
					timestamp,
				});

				await saveFile({
					fileName: file.name,
					fileType: contentType,
					fileSize: file.size,
					fileData: null,
					fileUrl,
					resolvedFileUrl,
					fileId,
					from: username,
					ownerUsername: username,
					peerUsername: selectedUser,
					timestamp,
				});
			} catch (error) {
				setMessages((prev) => ({
					...prev,
					[selectedUser]: (prev[selectedUser] || []).map((message) =>
						message.messageId === messageId
							? {
									...message,
									isUploading: false,
									status: "failed",
									uploadProgress: 0,
								}
							: message,
					),
				}));
				console.error("Failed to upload file:", error);
				showToast("File upload failed. Please try again.", "danger");
			}
		},
		[selectedUser, username, sendMessage, showToast, requestSignedUploadUrl],
	);

	const handleRetryMessage = useCallback(
		async (message) => {
			if (!selectedUser || !message?.messageId) {
				return;
			}

			if (message.type === "file") {
				if (message.fileUrl) {
					const sent = sendMessage({
						type: "file",
						to: selectedUser,
						from: username,
						fileName: message.fileName,
						fileType: message.fileType,
						fileKind: message.fileKind || "file",
						fileSize: message.fileSize,
						fileId: message.fileId || null,
						fileUrl: message.fileUrl,
						caption: message.caption || "",
						messageId: message.messageId,
						timestamp: message.timestamp || Date.now(),
					});

					const nextStatus = sent ? "sent" : "pending";
					setMessages((prev) => ({
						...prev,
						[selectedUser]: (prev[selectedUser] || []).map((item) =>
							item.messageId === message.messageId
								? { ...item, status: nextStatus, isUploading: false }
								: item,
						),
					}));

					updateMessageStatus(message.messageId, nextStatus).catch((err) =>
						console.error("Failed to persist retried file status:", err),
					);
					return;
				}

				if (message.localFile) {
					await handleSendFileUpload({
						type: "file",
						file: message.localFile,
						fileKind: message.fileKind || "file",
						caption: message.caption || "",
						existingMessageId: message.messageId,
						existingTimestamp: message.timestamp,
					});
				}
				return;
			}

			if (typeof message.text === "string" && message.text.trim()) {
				const sent = sendMessage({
					type: "chat",
					to: selectedUser,
					text: message.text,
					messageId: message.messageId,
					timestamp: message.timestamp || Date.now(),
				});

				const nextStatus = sent ? "sent" : "pending";
				setMessages((prev) => ({
					...prev,
					[selectedUser]: (prev[selectedUser] || []).map((item) =>
						item.messageId === message.messageId
							? { ...item, status: nextStatus }
							: item,
					),
				}));

				updateMessageStatus(message.messageId, nextStatus).catch((err) =>
					console.error("Failed to persist retried message status:", err),
				);
			}
		},
		[selectedUser, sendMessage, username, handleSendFileUpload],
	);

	const handleEditMessage = useCallback(
		(messageId, newText) => {
			if (!selectedUser || !messageId || !newText.trim()) {
				return;
			}

			setMessages((prev) => ({
				...prev,
				[selectedUser]: (prev[selectedUser] || []).map((message) =>
					message.messageId === messageId
						? {
								...message,
								text: newText,
								edited: true,
								editedAt: Date.now(),
							}
						: message,
				),
			}));

			updateMessageContent(messageId, newText).catch((err) =>
				console.error("Failed to persist local edit:", err),
			);

			sendMessage({
				type: "edit_message",
				to: selectedUser,
				messageId,
				newText,
			});
		},
		[selectedUser, sendMessage],
	);

	const handleReactToMessage = useCallback(
		(messageId, emoji) => {
			if (!selectedUser || !messageId || !emoji) {
				return;
			}

			let updatedReactions = null;
			setMessages((prev) => {
				const updatedPeerMessages = (prev[selectedUser] || []).map(
					(message) => {
						if (message.messageId !== messageId) {
							return message;
						}

						const nextMessage = applyReactionToMessage(
							message,
							username,
							emoji,
						);
						updatedReactions = nextMessage.reactions || [];
						return nextMessage;
					},
				);

				return {
					...prev,
					[selectedUser]: updatedPeerMessages,
				};
			});

			if (updatedReactions) {
				updateMessageReactions(messageId, updatedReactions).catch((err) =>
					console.error("Failed to persist local reaction:", err),
				);
			}

			sendMessage({
				type: "reaction",
				to: selectedUser,
				messageId,
				emoji,
			});
		},
		[selectedUser, sendMessage, applyReactionToMessage, username],
	);

	const handleReactToRoomMessage = useCallback(
		(roomId, messageId, emoji) => {
			if (!roomId || !messageId || !emoji) {
				return;
			}

			setRoomMessages((prev) => {
				const existing = prev[roomId] || [];
				const next = existing.map((message) => {
					if (message.messageId !== messageId) {
						return message;
					}

					return applyReactionToMessage(message, username, emoji);
				});

				return {
					...prev,
					[roomId]: next,
				};
			});

			sendMessage({
				type: "room_reaction",
				roomId,
				messageId,
				emoji,
			});
		},
		[applyReactionToMessage, sendMessage, username],
	);

	useEffect(() => {
		if (!isConnected || !sendMessageRef.current) {
			return;
		}

		const statusUpdates = [];
		setMessages((prev) => {
			let changed = false;
			const nextMessages = { ...prev };

			for (const [peer, peerMessages] of Object.entries(prev)) {
				nextMessages[peer] = peerMessages.map((message) => {
					if (
						!message.isMe ||
						(message.status !== "pending" && message.status !== "failed")
					) {
						return message;
					}

					if (message.type === "file") {
						return message;
					}

					const sent = sendMessageRef.current?.(message);
					if (!sent) {
						return message;
					}

					changed = true;
					statusUpdates.push(message.messageId);
					return { ...message, status: "sent" };
				});
			}

			return changed ? nextMessages : prev;
		});

		statusUpdates.forEach((messageId) => {
			updateMessageStatus(messageId, "sent").catch((err) =>
				console.error("Failed to persist sent status:", err),
			);
		});
	}, [isConnected]);

	useEffect(() => {
		if (!isConnected || !pendingInviteCode) {
			return;
		}

		sendMessage({
			type: "invite_join",
			code: pendingInviteCode,
		});
		setPendingInviteCode("");
	}, [isConnected, pendingInviteCode, sendMessage]);

	useEffect(() => {
		if (!isConnected) {
			return;
		}

		sendMessage({ type: "list_rooms" });
	}, [isConnected, sendMessage]);

	useEffect(() => {
		if (!isCreatingRoom) {
			return;
		}

		const timer = setTimeout(() => {
			setIsCreatingRoom(false);
			showToast(
				"Room creation is taking longer than expected. Please try again.",
				"info",
			);
		}, 10000);

		return () => clearTimeout(timer);
	}, [isCreatingRoom, showToast]);

	const sendTypingStatus = useCallback(
		(isTyping) => {
			if (selectedUser) {
				sendMessage({
					type: "typing",
					to: selectedUser,
					isTyping,
				});
			}
		},
		[selectedUser, sendMessage],
	);

	const handleCreateInviteLink = useCallback(() => {
		sendMessage({ type: "create_invite" });
	}, [sendMessage]);

	const handleOpenInviteCenter = useCallback(() => {
		setCurrentView("invite");
	}, []);

	const handleOpenRoomComposer = useCallback(() => {
		setSelectedUser(null);
		setCurrentView("room-create");
	}, []);

	const handleUpdateRoomComposer = useCallback((updates) => {
		setRoomComposerDraft((prev) => ({ ...prev, ...updates }));
	}, []);

	const handleOpenRoom = useCallback(
		(roomId) => {
			if (!roomId) {
				return;
			}

			setSelectedUser(null);
			setSelectedRoomId(roomId);
			setCurrentView("room");
			if (window.innerWidth <= 768) {
				setSidebarOpen(false);
			}
		},
		[setSidebarOpen],
	);

	const handleCreateRoom = useCallback(
		(roomName, invitedUsers = []) => {
			if (!roomName?.trim()) {
				return;
			}

			setIsCreatingRoom(true);

			const sent = sendMessage({
				type: "create_room",
				roomName: roomName.trim(),
				invitedUsers,
			});

			if (!sent) {
				setIsCreatingRoom(false);
				showToast("You are offline. Could not create room.", "danger");
			}
		},
		[sendMessage, showToast],
	);

	const handleCreateRoomFromComposer = useCallback(() => {
		if (!roomComposerDraft.name?.trim()) {
			showToast("Please provide a room name", "danger");
			return;
		}

		handleCreateRoom(roomComposerDraft.name, roomComposerDraft.selectedUsers);
	}, [roomComposerDraft, handleCreateRoom, showToast]);

	const handleRequestJoinRoom = useCallback(
		(roomId) => {
			if (!roomId) {
				return;
			}
			sendMessage({ type: "join_room_request", roomId });
		},
		[sendMessage],
	);

	const handleApproveRoomRequest = useCallback(
		(roomId, requestUser) => {
			if (!roomId || !requestUser) {
				return;
			}
			sendMessage({
				type: "approve_room_request",
				roomId,
				username: requestUser,
			});
		},
		[sendMessage],
	);

	const handleInviteUsersToRoom = useCallback(
		(roomId, usernames) => {
			if (!roomId || !Array.isArray(usernames) || usernames.length === 0) {
				return;
			}

			sendMessage({
				type: "room_invite_users",
				roomId,
				usernames,
			});
		},
		[sendMessage],
	);

	const handleRespondToRoomInvite = useCallback(
		(roomId, accept) => {
			if (!roomId) {
				return;
			}

			sendMessage({ type: "room_invite_response", roomId, accept });
			setPendingRoomInvites((prev) =>
				prev.filter((invite) => invite.roomId !== roomId),
			);
			if (accept) {
				setSelectedRoomId(roomId);
				setCurrentView("room");
			}
		},
		[sendMessage],
	);

	const handleSendRoomMessage = useCallback(
		(roomId, messageInput) => {
			const text =
				typeof messageInput === "string"
					? messageInput.trim()
					: typeof messageInput?.text === "string"
						? messageInput.text.trim()
						: "";
			if (!roomId || !text) {
				return;
			}

			const replyTo = messageInput?.replyTo || null;

			const messageId = createMessageId("room");
			const timestamp = Date.now();

			const sent = sendMessage({
				type: "room_chat",
				roomId,
				message: text,
				replyTo,
				messageId,
				timestamp,
			});

			setRoomMessages((prev) => ({
				...prev,
				[roomId]: [
					...(prev[roomId] || []),
					{
						messageId,
						from: username,
						message: text,
						replyTo,
						timestamp,
						status: sent ? "sent" : "pending",
						isMe: true,
						deliveredBy: [username],
						readBy: [username],
					},
				],
			}));
		},
		[sendMessage, username],
	);

	const handleSendRoomFileUpload = useCallback(
		async (roomId, filePayload) => {
			if (!roomId || !filePayload?.file) {
				return;
			}

			const file = filePayload.file;
			const contentType = file.type || "application/octet-stream";

			if (!isAllowedUploadMimeType(contentType)) {
				showToast(
					"Unsupported file type. Only images, PDF, and text files are allowed.",
					"danger",
				);
				return;
			}

			if (file.size <= 0 || file.size > MAX_UPLOAD_FILE_SIZE) {
				showToast("File size must be 10MB or less.", "danger");
				return;
			}

			const messageId =
				filePayload.existingMessageId || createMessageId("room-file");
			const timestamp = filePayload.existingTimestamp || Date.now();
			const replyTo = filePayload.replyTo || null;
			const isRetry = Boolean(filePayload.existingMessageId);

			setRoomMessages((prev) => {
				const existing = prev[roomId] || [];
				const nextMessage = {
					messageId,
					from: username,
					type: "file",
					fileName: file.name,
					fileType: contentType,
					fileKind: filePayload.fileKind || "file",
					fileSize: file.size,
					fileId: null,
					caption: filePayload.caption || "",
					replyTo,
					fileUrl: null,
					resolvedFileUrl: null,
					localFile: file,
					isUploading: true,
					uploadProgress: 0,
					timestamp,
					status: "pending",
					isMe: true,
					deliveredBy: [username],
					readBy: [username],
				};

				if (isRetry) {
					return {
						...prev,
						[roomId]: existing.map((message) =>
							message.messageId === messageId
								? { ...message, ...nextMessage }
								: message,
						),
					};
				}

				return {
					...prev,
					[roomId]: [...existing, nextMessage],
				};
			});

			try {
				const { uploadUrl, fileUrl, fileId } = await requestSignedUploadUrl(
					file,
					contentType,
				);
				const resolvedFileUrl = await resolveSignedDownloadUrl({
					username,
					fileId,
					fileUrl,
				});

				await new Promise((resolve, reject) => {
					const xhr = new XMLHttpRequest();
					xhr.open("PUT", uploadUrl);
					xhr.setRequestHeader("Content-Type", contentType);

					xhr.upload.onprogress = (event) => {
						if (!event.lengthComputable) {
							return;
						}

						const progress = Math.min(
							99,
							Math.max(
								1,
								Math.round((event.loaded / event.total) * 100),
							),
						);

						setRoomMessages((prev) => ({
							...prev,
							[roomId]: (prev[roomId] || []).map((message) =>
								message.messageId === messageId
									? { ...message, uploadProgress: progress }
									: message,
							),
						}));
					};

					xhr.onload = () => {
						if (xhr.status >= 200 && xhr.status < 300) {
							resolve();
							return;
						}

						reject(new Error("Failed to upload file to storage"));
					};

					xhr.onerror = () =>
						reject(new Error("Network error during upload"));
					xhr.onabort = () => reject(new Error("Upload aborted"));
					xhr.send(file);
				});

				setRoomMessages((prev) => ({
					...prev,
					[roomId]: (prev[roomId] || []).map((message) =>
						message.messageId === messageId
							? {
									...message,
									isUploading: false,
									uploadProgress: 100,
									status: "sent",
									fileId,
									fileUrl,
									resolvedFileUrl,
								}
							: message,
					),
				}));

				const sent = sendMessage({
					type: "room_file",
					roomId,
					fileName: file.name,
					fileType: contentType,
					fileKind: filePayload.fileKind || "file",
					fileSize: file.size,
					fileId,
					fileUrl,
					caption: filePayload.caption || "",
					replyTo,
					messageId,
					timestamp,
				});

				if (!sent) {
					throw new Error(
						"Socket unavailable while sending room file metadata",
					);
				}
			} catch (error) {
				setRoomMessages((prev) => ({
					...prev,
					[roomId]: (prev[roomId] || []).map((message) =>
						message.messageId === messageId
							? {
									...message,
									isUploading: false,
									status: "failed",
								}
							: message,
					),
				}));
				console.error("Failed to upload room file:", error);
				showToast("Room file upload failed. Please try again.", "danger");
			}
		},
		[requestSignedUploadUrl, sendMessage, showToast, username],
	);

	const handleRetryRoomMessage = useCallback(
		async (roomId, message) => {
			if (!roomId || !message?.messageId) {
				return;
			}

			if (message.type === "file") {
				if (message.localFile) {
					await handleSendRoomFileUpload(roomId, {
						file: message.localFile,
						fileKind: message.fileKind || "file",
						caption: message.caption || "",
						replyTo: message.replyTo || null,
						existingMessageId: message.messageId,
						existingTimestamp: message.timestamp,
					});
					return;
				}

				if (!message.fileUrl) {
					return;
				}

				const sent = sendMessage({
					type: "room_file",
					roomId,
					fileName: message.fileName,
					fileType: message.fileType,
					fileKind: message.fileKind || "file",
					fileSize: message.fileSize,
					fileId: message.fileId || null,
					fileUrl: message.fileUrl,
					caption: message.caption || "",
					replyTo: message.replyTo || null,
					messageId: message.messageId,
					timestamp: message.timestamp || Date.now(),
				});

				setRoomMessages((prev) => ({
					...prev,
					[roomId]: (prev[roomId] || []).map((item) =>
						item.messageId === message.messageId
							? { ...item, status: sent ? "sent" : "pending" }
							: item,
					),
				}));
				return;
			}

			if (typeof message.message === "string" && message.message.trim()) {
				const sent = sendMessage({
					type: "room_chat",
					roomId,
					message: message.message,
					replyTo: message.replyTo || null,
					messageId: message.messageId,
					timestamp: message.timestamp || Date.now(),
				});

				setRoomMessages((prev) => ({
					...prev,
					[roomId]: (prev[roomId] || []).map((item) =>
						item.messageId === message.messageId
							? { ...item, status: sent ? "sent" : "pending" }
							: item,
					),
				}));
			}
		},
		[sendMessage, handleSendRoomFileUpload],
	);

	const handleStartRoomCall = useCallback(
		(roomId) => {
			if (!roomId) {
				return;
			}

			sendMessage({ type: "room_call_start", roomId });
			sendMessage({ type: "room_call_join", roomId });
			setRoomCallSession({
				roomId,
				participants: [username],
				joined: true,
			});
			setRoomCallParticipantsByRoom((prev) => ({
				...prev,
				[roomId]: Array.from(new Set([...(prev[roomId] || []), username])),
			}));
			setRoomCallLastJoinedByRoom((prev) => ({
				...prev,
				[roomId]: true,
			}));
			setRoomMediaStateByUser({
				[username]: {
					isMuted: roomIsMuted,
					isVideoOff: roomIsVideoOff,
					isScreenSharing: roomIsScreenSharing,
				},
			});
			setRoomCallIncomingByRoom((prev) => {
				if (!prev[roomId]) {
					return prev;
				}
				const next = { ...prev };
				delete next[roomId];
				return next;
			});
			setCurrentView("room-call");
		},
		[roomIsMuted, roomIsScreenSharing, roomIsVideoOff, sendMessage, username],
	);

	const handleJoinRoomCall = useCallback(
		(roomId) => {
			if (!roomId) {
				return;
			}

			sendMessage({ type: "room_call_join", roomId });
			setRoomCallSession((prev) => ({
				roomId,
				participants: prev?.roomId === roomId ? prev.participants : [],
				joined: true,
			}));
			setRoomCallParticipantsByRoom((prev) => ({
				...prev,
				[roomId]: Array.from(new Set([...(prev[roomId] || []), username])),
			}));
			setRoomCallLastJoinedByRoom((prev) => ({
				...prev,
				[roomId]: true,
			}));
			setRoomMediaStateByUser((prev) => ({
				...prev,
				[username]: {
					isMuted: roomIsMuted,
					isVideoOff: roomIsVideoOff,
					isScreenSharing: roomIsScreenSharing,
				},
			}));
			setRoomCallIncomingByRoom((prev) => {
				if (!prev[roomId]) {
					return prev;
				}
				const next = { ...prev };
				delete next[roomId];
				return next;
			});
			setCurrentView("room-call");
		},
		[roomIsMuted, roomIsScreenSharing, roomIsVideoOff, sendMessage, username],
	);

	const handleLeaveRoomCall = useCallback(() => {
		if (!roomCallSession?.roomId) {
			cleanupRoomMedia();
			setRoomMediaStateByUser({});
			setCurrentView("room");
			return;
		}

		const roomId = roomCallSession.roomId;

		sendMessage({
			type: "room_call_leave",
			roomId,
		});
		cleanupRoomMedia();
		setRoomCallSession(null);
		setRoomCallParticipantsByRoom((prev) => {
			if (!prev[roomId]) {
				return prev;
			}
			return {
				...prev,
				[roomId]: prev[roomId].filter(
					(participant) => participant !== username,
				),
			};
		});
		setRoomMediaStateByUser({});
		setCurrentView("room");
	}, [roomCallSession, sendMessage, cleanupRoomMedia, username]);

	const handleEndRoomCallForEveryone = useCallback(
		(roomId) => {
			if (!roomId) {
				return;
			}

			sendMessage({
				type: "room_call_end",
				roomId,
			});
		},
		[sendMessage],
	);

	useEffect(() => {
		if (!roomCallSession?.joined || !roomCallSession.roomId) {
			return;
		}

		setRoomMediaStateByUser((prev) => ({
			...prev,
			[username]: {
				isMuted: roomIsMuted,
				isVideoOff: roomIsVideoOff,
				isScreenSharing: roomIsScreenSharing,
			},
		}));
	}, [
		roomCallSession?.joined,
		roomCallSession?.roomId,
		roomIsMuted,
		roomIsVideoOff,
		roomIsScreenSharing,
		username,
	]);

	useEffect(() => {
		if (!selectedRoomId) {
			return;
		}

		const roomId = selectedRoomId;
		setRoomMessages((prev) => {
			const existing = prev[roomId] || [];
			let hasChanges = false;

			const next = existing.map((message) => {
				if (message.isMe || !message.messageId || !message.from) {
					return message;
				}

				const readBy = Array.isArray(message.readBy) ? message.readBy : [];
				if (readBy.includes(username)) {
					return message;
				}

				hasChanges = true;
				sendMessageRef.current?.({
					type: "room_message_status",
					to: message.from,
					roomId,
					messageId: message.messageId,
					status: "read",
				});

				const deliveredBy = Array.isArray(message.deliveredBy)
					? message.deliveredBy
					: [];

				return {
					...message,
					deliveredBy: Array.from(new Set([...deliveredBy, username])),
					readBy: Array.from(new Set([...readBy, username])),
				};
			});

			if (!hasChanges) {
				return prev;
			}

			return {
				...prev,
				[roomId]: next,
			};
		});
	}, [selectedRoomId, username]);

	useEffect(() => {
		if (!isConnected || !roomCallSession?.joined || !roomCallSession.roomId) {
			return;
		}

		sendMessage({
			type: "room_call_join",
			roomId: roomCallSession.roomId,
		});
	}, [
		isConnected,
		roomCallSession?.joined,
		roomCallSession?.roomId,
		sendMessage,
	]);

	// Auto-clear typing status after 3 seconds of inactivity
	useEffect(() => {
		const interval = setInterval(() => {
			const now = Date.now();
			setTypingUsers((prev) => {
				const updated = { ...prev };
				let changed = false;
				for (const user in updated) {
					if (now - updated[user] > 3000) {
						delete updated[user];
						changed = true;
					}
				}
				return changed ? updated : prev;
			});
		}, 1000);
		return () => clearInterval(interval);
	}, []);

	// Delete local messages
	const deleteLocalMessages = useCallback((user, messageIds) => {
		setMessages((prev) => ({
			...prev,
			[user]: (prev[user] || []).filter(
				(msg) => !messageIds.includes(msg.messageId),
			),
		}));
	}, []);

	const deleteLocalRoomMessages = useCallback((roomId, messageIds) => {
		if (!roomId || !Array.isArray(messageIds) || messageIds.length === 0) {
			return;
		}

		setRoomMessages((prev) => ({
			...prev,
			[roomId]: (prev[roomId] || []).filter(
				(message) => !messageIds.includes(message.messageId),
			),
		}));
	}, []);

	const resolveFileDownloadUrl = useCallback(
		async ({ fileId, fileUrl }) =>
			resolveSignedDownloadUrl({
				username,
				fileId,
				fileUrl,
			}),
		[username],
	);

	const contextValue = {
		username,
		selectedUser,
		selectedRoom,
		selectedRoomId,
		roomCallSession,
		roomCallIncomingByRoom,
		roomCallParticipantsByRoom,
		roomCallLastJoinedByRoom,
		roomMediaStateByUser,
		roomActiveSpeaker,
		callPeer,
		onlineUsers,
		allUsers,
		userFilter,
		setUserFilter,
		messages,
		roomMessages,
		rooms,
		pendingRoomInvites,
		roomComposerDraft,
		isCreatingRoom,
		lastInviteLink,
		typingUsers,
		currentView,
		isCallActive,
		callType,
		setCallType,
		callStartTime,
		isCalling,
		incomingCall,
		incomingVideoUpgradeRequest,
		isVideoUpgradePending,
		sidebarOpen,
		localStream,
		remoteStream,
		roomLocalStream,
		roomRemoteStreams,
		isMuted,
		isVideoOff,
		roomIsMuted,
		roomIsVideoOff,
		remoteVideoOff,
		isScreenSharing,
		roomIsScreenSharing,
		callStats,
		sendMessage,
		setSelectedUser: handleSelectUser,
		setCurrentView,
		setSidebarOpen,
		handleStartCall,
		handleAnswerCall,
		handleRejectCall,
		handleAcceptVideoUpgrade,
		handleDeclineVideoUpgrade,
		handleHangup,
		handleSendMessage,
		handleSendFileUpload,
		handleEditMessage,
		handleReactToMessage,
		handleReactToRoomMessage,
		handleCreateInviteLink,
		handleOpenInviteCenter,
		handleOpenRoomComposer,
		handleUpdateRoomComposer,
		handleCreateRoom,
		handleCreateRoomFromComposer,
		handleOpenRoom,
		handleRequestJoinRoom,
		handleApproveRoomRequest,
		handleInviteUsersToRoom,
		handleRespondToRoomInvite,
		handleSendRoomMessage,
		handleSendRoomFileUpload,
		handleStartRoomCall,
		handleJoinRoomCall,
		handleEndRoomCallForEveryone,
		handleLeaveRoomCall,
		sendTypingStatus,
		handleLogout,
		showToast,
		toggleMute,
		toggleVideo: handleToggleVideo,
		toggleRoomMute,
		toggleRoomVideo,
		flipCamera,
		toggleScreenShare,
		toggleRoomScreenShare,
		deleteLocalMessages,
		deleteLocalRoomMessages,
		handleRetryMessage,
		handleRetryRoomMessage,
		resolveFileDownloadUrl,
	};

	if (!isLoggedIn) {
		return (
			<LoginScreen
				onLogin={handleLogin}
				showToast={showToast}
				initialName={lastUsername}
			/>
		);
	}

	return (
		<AppContext.Provider value={contextValue}>
			<div className="flex h-full w-full overflow-hidden">
				<Sidebar />
				<MainContent />
				<ToastContainer toasts={toasts} />
				<CallEndedModal callEndedInfo={callEndedInfo} />
			</div>
		</AppContext.Provider>
	);
}

export default App;
