import { useState, useEffect, useRef, useCallback } from "react";
import LoginScreen from "./components/LoginScreen";
import Sidebar from "./components/Sidebar";
import MainContent from "./components/MainContent";
import ToastContainer from "./components/ToastContainer";
import CallEndedModal from "./components/CallEndedModal";
import { useWebSocket } from "./hooks/useWebSocket";
import { useWebRTC } from "./hooks/useWebRTC";
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
	createFileMessage,
	createTextMessage,
} from "./utils/messageFactory";

const ROOM_MESSAGES_STORAGE_KEY_PREFIX = "peers_room_messages";

function dedupeRoomsById(rooms) {
	if (!Array.isArray(rooms)) {
		return [];
	}

	const seen = new Set();
	const result = [];
	for (const room of rooms) {
		if (!room?.roomId || seen.has(room.roomId)) {
			continue;
		}
		seen.add(room.roomId);
		result.push(room);
	}

	return result;
}

function createRoomMessagesStorageKey(username) {
	return `${ROOM_MESSAGES_STORAGE_KEY_PREFIX}:${username}`;
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
			setRoomMessages(loadPersistedRoomMessages(savedUser));
			// Load persisted messages
			getAllMessages(savedUser)
				.then((savedMessages) => {
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
						setMessages(normalizedMessages);
					}
				})
				.catch((err) => console.error("Failed to load messages:", err));
		}
	}, []);

	useEffect(() => {
		persistRoomMessages(username, roomMessages);
	}, [username, roomMessages]);

	useEffect(() => {
		const match = window.location.pathname.match(/^\/join\/([a-zA-Z0-9]+)/);
		if (match?.[1]) {
			setPendingInviteCode(match[1]);
		}
	}, []);

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
	const sendMessageRef = useRef(null);
	const selectedUserRef = useRef(null);
	const currentViewRef = useRef("placeholder");
	const callTimeoutRef = useRef(null);
	const callStartTimeRef = useRef(null);
	const incomingChunkBufferRef = useRef(new Map());

	const CHUNK_SIZE = 64 * 1024;

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

	// WebSocket connection
	const { sendMessage, isConnected } = useWebSocket({
		username,
		isLoggedIn,
		onOnlineUsers: setOnlineUsers,
		onAllUsers: setAllUsers,
		onMessage: (msg) => {
			if (msg.from) {
				const isChatOpenWithSender =
					selectedUserRef.current === msg.from &&
					currentViewRef.current === "chat";
				const incomingMsg = {
					...msg,
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
				if (msg.type === "file" && msg.fileData) {
					saveFile({
						fileName: msg.fileName,
						fileType: msg.fileType,
						fileSize: msg.fileSize,
						fileData: msg.fileData,
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
		onFileChunk: (data) => {
			if (!data?.from || !data?.messageId) {
				return;
			}

			const key = `${data.from}:${data.messageId}`;
			let buffer = incomingChunkBufferRef.current.get(key);
			if (!buffer) {
				buffer = {
					messageId: data.messageId,
					fileName: data.fileName,
					fileType: data.fileType,
					fileKind: data.fileKind || "file",
					caption: data.caption || "",
					timestamp: data.timestamp || Date.now(),
					totalChunks: data.totalChunks,
					chunks: new Array(data.totalChunks),
				};
				incomingChunkBufferRef.current.set(key, buffer);
			}

			if (
				!Number.isInteger(data.chunkIndex) ||
				data.chunkIndex < 0 ||
				data.chunkIndex >= buffer.totalChunks
			) {
				return;
			}

			buffer.chunks[data.chunkIndex] = data.chunkData;
			const receivedChunks = buffer.chunks.filter(Boolean).length;
			if (receivedChunks < buffer.totalChunks) {
				return;
			}

			const reconstructedData = buffer.chunks.join("");
			incomingChunkBufferRef.current.delete(key);

			const receivedMessage = {
				type: "file",
				fileName: buffer.fileName,
				fileType: buffer.fileType,
				fileKind: buffer.fileKind,
				fileData: reconstructedData,
				fileSize: reconstructedData.length,
				caption: buffer.caption,
				from: data.from,
				messageId: buffer.messageId,
				timestamp: buffer.timestamp,
				isMe: false,
			};

			const isChatOpenWithSender =
				selectedUserRef.current === data.from &&
				currentViewRef.current === "chat";
			const incomingMsg = {
				...receivedMessage,
				readByMe: isChatOpenWithSender,
			};

			setMessages((prev) => {
				const peerMessages = prev[data.from] || [];
				const hasDuplicate = peerMessages.some(
					(existing) => existing.messageId === incomingMsg.messageId,
				);
				if (hasDuplicate) {
					return prev;
				}

				return {
					...prev,
					[data.from]: [...peerMessages, incomingMsg],
				};
			});

			saveMessage(username, data.from, incomingMsg).catch((err) =>
				console.error("Failed to save chunked file message:", err),
			);

			saveFile({
				fileName: incomingMsg.fileName,
				fileType: incomingMsg.fileType,
				fileSize: incomingMsg.fileSize,
				fileData: incomingMsg.fileData,
				from: incomingMsg.from,
				ownerUsername: username,
				peerUsername: incomingMsg.from,
				timestamp: incomingMsg.timestamp,
			}).catch((err) => console.error("Failed to save chunked file:", err));

			if (incomingMsg.messageId && sendMessageRef.current) {
				sendMessageRef.current({
					type: "delivered",
					to: incomingMsg.from,
					messageId: incomingMsg.messageId,
				});

				if (isChatOpenWithSender) {
					setTimeout(() => {
						sendMessageRef.current?.({
							type: "read",
							to: incomingMsg.from,
							messageId: incomingMsg.messageId,
						});
					}, 100);
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
		onRoomChat: (data) => {
			if (data?.from && data?.roomId && data?.message) {
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
						next[existingIndex] = {
							...next[existingIndex],
							status: "sent",
							timestamp: data.timestamp || next[existingIndex].timestamp,
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
								timestamp: data.timestamp || Date.now(),
								status: "sent",
								isMe: data.from === username,
							},
						],
					};
				});
				showToast(
					`[Room ${data.roomId.slice(0, 6)}] ${data.from}: ${data.message}`,
					"message",
				);
			}
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
			if (data.isUpgrade && isCallActive) {
				// Handle renegotiation for video upgrade without showing incoming call modal
				handleAnswerRef.current?.(data);
				setCallType("video");
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
			// Message was queued for offline user - update status
			// Only upgrade from 'sent' to 'queued'
			if (data.to && data.messageId) {
				setMessages((prev) => ({
					...prev,
					[data.to]: (prev[data.to] || []).map((msg) => {
						if (msg.messageId !== data.messageId) return msg;
						const currentPriority = STATUS_PRIORITY[msg.status] ?? 1;
						const newPriority = STATUS_PRIORITY.queued;
						return newPriority > currentPriority
							? { ...msg, status: "queued" }
							: msg;
					}),
				}));
				// Persist to IndexedDB
				updateMessageStatus(data.messageId, "queued").catch((err) =>
					console.error("Failed to persist queued status:", err),
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
		},
		onVideoToggle: (data) => {
			// Remote user toggled their video
			if (data?.from) {
				setRemoteVideoOff(!data.enabled);
			}
		},
		showToast,
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
	}, [handleAnswer, handleIceCandidate]);

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
		callStartTimeRef.current = null;
		setCurrentView("chat");
	}, [endCall, callPeer, selectedUser, sendMessage, isCallActive, addCallLog]);

	const handleSendMessage = useCallback(
		(data) => {
			if (!selectedUser) return;

			let msg;
			if (typeof data === "string") {
				msg = createTextMessage(selectedUser, data);
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

	const handleSendFileUpload = useCallback(
		async (filePayload) => {
			if (!selectedUser || !filePayload?.fileData) {
				return;
			}

			const messageId = createMessageId("file");
			const timestamp = Date.now();
			const localUploadMessage = {
				type: "file",
				to: selectedUser,
				messageId,
				timestamp,
				from: username,
				isMe: true,
				status: "pending",
				fileName: filePayload.fileName,
				fileType: filePayload.fileType,
				fileKind: filePayload.fileKind || "file",
				fileSize: filePayload.fileSize,
				caption: filePayload.caption || "",
				isUploading: true,
				uploadProgress: 0,
				fileData: null,
			};

			setMessages((prev) => ({
				...prev,
				[selectedUser]: [...(prev[selectedUser] || []), localUploadMessage],
			}));

			saveMessage(username, selectedUser, localUploadMessage).catch((err) =>
				console.error("Failed to save pending file message:", err),
			);

			const rawData = filePayload.fileData;
			const totalChunks = Math.max(
				1,
				Math.ceil(rawData.length / CHUNK_SIZE),
			);
			let sendFailed = false;

			for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
				const start = chunkIndex * CHUNK_SIZE;
				const end = start + CHUNK_SIZE;
				const chunkData = rawData.slice(start, end);

				const sent = sendMessage({
					type: "file_chunk",
					to: selectedUser,
					messageId,
					fileName: filePayload.fileName,
					fileType: filePayload.fileType,
					fileKind: filePayload.fileKind || "file",
					caption: filePayload.caption || "",
					totalChunks,
					chunkIndex,
					chunkData,
					timestamp,
				});

				if (!sent) {
					sendFailed = true;
					break;
				}

				const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
				setMessages((prev) => ({
					...prev,
					[selectedUser]: (prev[selectedUser] || []).map((message) =>
						message.messageId === messageId
							? { ...message, uploadProgress: progress }
							: message,
					),
				}));
			}

			if (sendFailed) {
				setMessages((prev) => ({
					...prev,
					[selectedUser]: (prev[selectedUser] || []).map((message) =>
						message.messageId === messageId
							? {
									...message,
									isUploading: false,
									status: "failed",
								}
							: message,
					),
				}));
				showToast(
					"File upload interrupted. Retry when reconnected.",
					"danger",
				);
				return;
			}

			setMessages((prev) => ({
				...prev,
				[selectedUser]: (prev[selectedUser] || []).map((message) =>
					message.messageId === messageId
						? {
								...message,
								status: "sent",
								isUploading: false,
								uploadProgress: 100,
								fileData: rawData,
							}
						: message,
				),
			}));

			const finalized = createFileMessage(selectedUser, {
				...filePayload,
				messageId,
				timestamp,
			});
			await saveMessage(username, selectedUser, {
				...finalized,
				from: username,
				isMe: true,
				status: "sent",
			}).catch((err) =>
				console.error("Failed to persist finalized file message:", err),
			);

			saveFile({
				fileName: filePayload.fileName,
				fileType: filePayload.fileType,
				fileSize: filePayload.fileSize,
				fileData: rawData,
				from: username,
				ownerUsername: username,
				peerUsername: selectedUser,
				timestamp,
			}).catch((err) => console.error("Failed to auto-save file:", err));
		},
		[selectedUser, username, sendMessage, showToast],
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

					if (message.type === "file" || message.type === "file-message") {
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
		(roomId, message) => {
			const text = typeof message === "string" ? message.trim() : "";
			if (!roomId || !text) {
				return;
			}

			const messageId = createMessageId("room");
			const timestamp = Date.now();

			setRoomMessages((prev) => ({
				...prev,
				[roomId]: [
					...(prev[roomId] || []),
					{
						messageId,
						from: username,
						message: text,
						timestamp,
						status: "pending",
						isMe: true,
					},
				],
			}));

			sendMessage({
				type: "room_chat",
				roomId,
				message: text,
				messageId,
				timestamp,
			});
		},
		[sendMessage, username],
	);

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

	const contextValue = {
		username,
		selectedUser,
		selectedRoom,
		selectedRoomId,
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
		sidebarOpen,
		localStream,
		remoteStream,
		isMuted,
		isVideoOff,
		remoteVideoOff,
		isScreenSharing,
		callStats,
		sendMessage,
		setSelectedUser: handleSelectUser,
		setCurrentView,
		setSidebarOpen,
		handleStartCall,
		handleAnswerCall,
		handleRejectCall,
		handleHangup,
		handleSendMessage,
		handleSendFileUpload,
		handleEditMessage,
		handleReactToMessage,
		handleCreateInviteLink,
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
		sendTypingStatus,
		handleLogout,
		showToast,
		toggleMute,
		toggleVideo: () => toggleVideo(() => setCallType("video")),
		flipCamera,
		toggleScreenShare,
		deleteLocalMessages,
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
