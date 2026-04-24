import { useEffect, useRef, useState, useCallback } from "react";
import { getWebSocketUrl } from "../config/serverConfig";

function getWsCandidateUrls(primaryUrl) {
	const candidates = [primaryUrl];

	try {
		const parsed = new URL(primaryUrl);
		if (parsed.hostname === "localhost") {
			const fallback = new URL(primaryUrl);
			fallback.hostname = "127.0.0.1";
			candidates.push(fallback.toString());
		} else if (parsed.hostname === "127.0.0.1") {
			const fallback = new URL(primaryUrl);
			fallback.hostname = "localhost";
			candidates.push(fallback.toString());
		}
	} catch {
		return candidates;
	}

	return Array.from(new Set(candidates));
}

export function useWebSocket({
	username,
	isLoggedIn,
	onOnlineUsers,
	onAllUsers,
	onMessage,
	onOffer,
	onAnswer,
	onIce,
	onHangup,
	onReject,
	onTyping,
	onDeleteMessage,
	onDelivered,
	onRead,
	onMessageQueued,
	onVideoToggle,
	onEditMessage,
	onReaction,
	onInviteCreated,
	onInviteTarget,
	onRoomList,
	onRoomJoinRequest,
	onRoomChat,
	onRoomFile,
	onRoomTyping,
	onRoomReaction,
	onRoomMessageStatus,
	onRoomCreated,
	onRoomInvite,
	onRoomInviteResult,
	onRoomCallStarted,
	onRoomCallParticipants,
	onRoomCallEnded,
	onRoomMediaState,
	onRoomWebRTCOffer,
	onRoomWebRTCAnswer,
	onRoomWebRTCIce,
	onVideoUpgradeRequest,
	onVideoUpgradeResponse,
	showToast,
}) {
	const wsRef = useRef(null);
	const [isConnected, setIsConnected] = useState(false);
	const reconnectAttemptsRef = useRef(0);
	const urlCandidateIndexRef = useRef(0);
	const reconnectTimeoutRef = useRef(null);
	const heartbeatIntervalRef = useRef(null);
	const pongTimeoutRef = useRef(null);
	const isMountedRef = useRef(true);

	// Store callbacks in refs to avoid effect re-runs
	const callbacksRef = useRef({
		onOnlineUsers,
		onAllUsers,
		onMessage,
		onOffer,
		onAnswer,
		onIce,
		onHangup,
		onReject,
		onTyping,
		onDeleteMessage,
		onDelivered,
		onRead,
		onMessageQueued,
		onVideoToggle,
		onEditMessage,
		onReaction,
		onInviteCreated,
		onInviteTarget,
		onRoomList,
		onRoomJoinRequest,
		onRoomChat,
		onRoomFile,
		onRoomTyping,
		onRoomReaction,
		onRoomMessageStatus,
		onRoomCreated,
		onRoomInvite,
		onRoomInviteResult,
		onRoomCallStarted,
		onRoomCallParticipants,
		onRoomCallEnded,
		onRoomMediaState,
		onRoomWebRTCOffer,
		onRoomWebRTCAnswer,
		onRoomWebRTCIce,
		onVideoUpgradeRequest,
		onVideoUpgradeResponse,
		showToast,
	});

	// Update refs when callbacks change
	useEffect(() => {
		callbacksRef.current = {
			onOnlineUsers,
			onAllUsers,
			onMessage,
			onOffer,
			onAnswer,
			onIce,
			onHangup,
			onReject,
			onTyping,
			onDeleteMessage,
			onDelivered,
			onRead,
			onMessageQueued,
			onVideoToggle,
			onEditMessage,
			onReaction,
			onInviteCreated,
			onInviteTarget,
			onRoomList,
			onRoomJoinRequest,
			onRoomChat,
			onRoomFile,
			onRoomTyping,
			onRoomReaction,
			onRoomMessageStatus,
			onRoomCreated,
			onRoomInvite,
			onRoomInviteResult,
			onRoomCallStarted,
			onRoomCallParticipants,
			onRoomCallEnded,
			onRoomMediaState,
			onRoomWebRTCOffer,
			onRoomWebRTCAnswer,
			onRoomWebRTCIce,
			onVideoUpgradeRequest,
			onVideoUpgradeResponse,
			showToast,
		};
	});

	const sendMessage = useCallback((msg) => {
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(msg));
			return true;
		}
		return false;
	}, []);

	const stopHeartbeat = useCallback(() => {
		if (heartbeatIntervalRef.current) {
			clearInterval(heartbeatIntervalRef.current);
			heartbeatIntervalRef.current = null;
		}
		if (pongTimeoutRef.current) {
			clearTimeout(pongTimeoutRef.current);
			pongTimeoutRef.current = null;
		}
	}, []);

	const startHeartbeat = useCallback(() => {
		stopHeartbeat();

		heartbeatIntervalRef.current = setInterval(() => {
			if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
				wsRef.current.send(JSON.stringify({ type: "ping" }));

				pongTimeoutRef.current = setTimeout(() => {
					console.warn("Pong timeout - closing connection");
					wsRef.current?.close();
				}, 10000);
			}
		}, 30000);
	}, [stopHeartbeat]);

	useEffect(() => {
		isMountedRef.current = true;

		if (!isLoggedIn || !username) {
			return;
		}

		// Connect to environment-aware WebSocket endpoint.
		const wsCandidates = getWsCandidateUrls(getWebSocketUrl());

		const connect = () => {
			if (!isMountedRef.current) return;

			// Clear any pending reconnect
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
			}

			const wsUrl =
				wsCandidates[
					Math.min(urlCandidateIndexRef.current, wsCandidates.length - 1)
				];
			console.log("Connecting to WebSocket:", wsUrl);
			const ws = new WebSocket(wsUrl);
			wsRef.current = ws;

			ws.onopen = () => {
				if (!isMountedRef.current) {
					ws.close();
					return;
				}
				setIsConnected(true);
				reconnectAttemptsRef.current = 0;
				urlCandidateIndexRef.current = 0;
				callbacksRef.current.showToast?.("Connected to server", "success");
				startHeartbeat();

				ws.send(JSON.stringify({ type: "join", username }));
			};

			ws.onmessage = (event) => {
				if (!isMountedRef.current) return;

				try {
					const data = JSON.parse(event.data);
					const cb = callbacksRef.current;

					switch (data.type) {
						case "pong":
							if (pongTimeoutRef.current) {
								clearTimeout(pongTimeoutRef.current);
							}
							break;

						case "welcome":
							console.log("WebSocket welcome received");
							if (data.sessionId) {
								localStorage.setItem(
									"peers_session_token",
									data.sessionId,
								);
							}
							break;

						case "onlineUsers":
							console.log("Received online users:", data.users);
							const filteredUsers = data.users.filter(
								(u) => u !== username,
							);
							console.log(
								"Filtered online users (excluding self):",
								filteredUsers,
							);
							cb.onOnlineUsers?.(filteredUsers);
							break;

						case "allUsers":
							console.log("Received all users:", data.users);
							const filteredAllUsers = data.users.filter(
								(u) => u.username !== username,
							);
							console.log(
								"Filtered all users (excluding self):",
								filteredAllUsers,
							);
							cb.onAllUsers?.(filteredAllUsers);
							break;

						case "message-queued":
							cb.onMessageQueued?.(data);
							break;

						case "offer":
							cb.onOffer?.(data);
							break;

						case "answer":
							cb.onAnswer?.(data);
							break;

						case "ice":
							cb.onIce?.(data);
							break;

						case "hangup":
							cb.onHangup?.(data);
							break;

						case "chat":
							cb.onMessage?.({
								text: data.text,
								replyTo: data.replyTo || null,
								from: data.from,
								messageId: data.messageId,
								timestamp: data.timestamp,
								isMe: false,
							});
							break;

						case "typing":
							cb.onTyping?.({ ...data, isTyping: true });
							break;

						case "stop_typing":
							cb.onTyping?.({ ...data, isTyping: false });
							break;

						case "reject":
							cb.showToast?.(`${data.from} declined the call`, "info");
							cb.onReject?.(data);
							break;

						case "video-toggle":
							cb.onVideoToggle?.(data);
							break;

						case "file":
							cb.onMessage?.({
								type: "file",
								fileName: data.fileName,
								fileType: data.fileType,
								fileKind: data.fileKind || "file",
								fileSize: data.fileSize,
								fileId: data.fileId || null,
								fileUrl: data.fileUrl,
								caption: data.caption || "",
								from: data.from,
								messageId: data.messageId,
								timestamp: data.timestamp,
								isMe: false,
							});
							break;

						case "edit_message":
							cb.onEditMessage?.(data);
							break;

						case "reaction":
							cb.onReaction?.(data);
							break;

						case "invite_created":
							cb.onInviteCreated?.(data);
							break;

						case "invite_target":
							cb.onInviteTarget?.(data);
							break;

						case "room_list":
							cb.onRoomList?.(data);
							break;

						case "room_join_request":
							cb.onRoomJoinRequest?.(data);
							break;

						case "room_chat":
							cb.onRoomChat?.(data);
							break;

						case "room_file":
							cb.onRoomFile?.(data);
							break;

						case "room_typing":
						case "room_stop_typing":
							cb.onRoomTyping?.({
								...data,
								isTyping: data.type === "room_typing",
							});
							break;

						case "room_reaction":
							cb.onRoomReaction?.(data);
							break;

						case "room_message_status":
							cb.onRoomMessageStatus?.(data);
							break;

						case "room_created":
							cb.onRoomCreated?.(data);
							break;

						case "room_invite":
							cb.onRoomInvite?.(data);
							break;

						case "room_invite_result":
							cb.onRoomInviteResult?.(data);
							break;

						case "room_call_started":
							cb.onRoomCallStarted?.(data);
							break;

						case "room_call_participants":
							cb.onRoomCallParticipants?.(data);
							break;

						case "room_call_ended":
							cb.onRoomCallEnded?.(data);
							break;

						case "room_media_state":
							cb.onRoomMediaState?.(data);
							break;

						case "room_webrtc_offer":
							cb.onRoomWebRTCOffer?.(data);
							break;

						case "room_webrtc_answer":
							cb.onRoomWebRTCAnswer?.(data);
							break;

						case "room_webrtc_ice":
							cb.onRoomWebRTCIce?.(data);
							break;

						case "video_upgrade_request":
							cb.onVideoUpgradeRequest?.(data);
							break;

						case "video_upgrade_response":
							cb.onVideoUpgradeResponse?.(data);
							break;

						case "delivered":
							cb.onDelivered?.(data);
							break;
						case "read":
							cb.onRead?.(data);
							break;

						case "delete-message":
							cb.onDeleteMessage?.(data);
							break;

						default:
							console.log("Unknown message type:", data.type);
					}
				} catch (e) {
					console.error("Failed to parse message:", e);
				}
			};

			ws.onclose = () => {
				setIsConnected(false);
				stopHeartbeat();

				if (
					isMountedRef.current &&
					urlCandidateIndexRef.current < wsCandidates.length - 1
				) {
					urlCandidateIndexRef.current += 1;
					console.log(
						"Primary WebSocket URL failed, trying fallback:",
						wsCandidates[urlCandidateIndexRef.current],
					);
					reconnectTimeoutRef.current = setTimeout(() => {
						if (isMountedRef.current) {
							connect();
						}
					}, 250);
					return;
				}

				urlCandidateIndexRef.current = 0;

				// Only reconnect if still mounted and under retry limit
				if (isMountedRef.current && reconnectAttemptsRef.current < 5) {
					reconnectAttemptsRef.current++;
					const delay = Math.min(
						1000 * Math.pow(2, reconnectAttemptsRef.current),
						30000,
					);
					console.log(
						`Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttemptsRef.current})`,
					);
					callbacksRef.current.showToast?.(
						`Reconnecting in ${delay / 1000}s...`,
						"info",
					);

					reconnectTimeoutRef.current = setTimeout(() => {
						if (isMountedRef.current) {
							connect();
						}
					}, delay);
				} else if (
					isMountedRef.current &&
					reconnectAttemptsRef.current >= 5
				) {
					callbacksRef.current.showToast?.(
						"Connection lost. Please refresh the page.",
						"danger",
					);
				}
			};

			ws.onerror = (error) => {
				console.error("WebSocket error:", error);
			};
		};

		connect();

		return () => {
			isMountedRef.current = false;
			stopHeartbeat();

			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
			}

			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
		};
	}, [isLoggedIn, username, startHeartbeat, stopHeartbeat]);

	return {
		ws: wsRef.current,
		isConnected,
		sendMessage,
	};
}
