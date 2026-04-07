import { useEffect, useRef, useState, useCallback } from "react";

const ICE_SERVERS = {
	iceServers: [
		{ urls: "stun:stun.l.google.com:19302" },
		{ urls: "stun:stun1.l.google.com:19302" },
		{ urls: "stun:stun2.l.google.com:19302" },
	],
};

export function useWebRTC({
	sendMessage,
	username,
	selectedUser,
	callPeer,
	onCallConnected,
	onCallEnded,
}) {
	const [localStream, setLocalStream] = useState(null);
	const [remoteStream, setRemoteStream] = useState(null);
	const [isMuted, setIsMuted] = useState(false);
	const [isVideoOff, setIsVideoOff] = useState(false);
	const [isScreenSharing, setIsScreenSharing] = useState(false);
	const [callStats, setCallStats] = useState({
		bitrateKbps: 0,
		latencyMs: 0,
		packetLossPct: 0,
		resolution: "-",
	});

	const peerConnectionRef = useRef(null);
	const pendingCandidatesRef = useRef([]);
	const dataChannelRef = useRef(null);
	const localStreamRef = useRef(null);
	const cameraFacingModeRef = useRef("user");
	const screenTrackRef = useRef(null);
	const previousBytesSentRef = useRef(0);
	const previousStatsTsRef = useRef(0);

	// Use callPeer for signaling if available, otherwise fall back to selectedUser
	const targetPeer = callPeer || selectedUser;

	useEffect(() => {
		localStreamRef.current = localStream;
	}, [localStream]);

	const createPeerConnection = useCallback(
		(targetUser) => {
			const pc = new RTCPeerConnection(ICE_SERVERS);

			pc.onicecandidate = (event) => {
				if (event.candidate && targetUser) {
					sendMessage({
						type: "ice",
						to: targetUser,
						ice: event.candidate,
					});
				}
			};

			pc.ontrack = (event) => {
				console.log("Received remote stream:", event.streams[0]);
				console.log(
					"Audio tracks:",
					event.streams[0].getAudioTracks().length,
				);
				console.log(
					"Video tracks:",
					event.streams[0].getVideoTracks().length,
				);
				setRemoteStream(event.streams[0]);
			};

			pc.oniceconnectionstatechange = () => {
				console.log("ICE connection state:", pc.iceConnectionState);
				if (
					pc.iceConnectionState === "connected" ||
					pc.iceConnectionState === "completed"
				) {
					onCallConnected?.();
				} else if (
					pc.iceConnectionState === "failed" ||
					pc.iceConnectionState === "closed"
				) {
					// Only end call on failed/closed, not on 'disconnected' as it can recover
					onCallEnded?.();
				}
			};

			pc.onconnectionstatechange = () => {
				console.log("Connection state:", pc.connectionState);
				if (pc.connectionState === "connected") {
					onCallConnected?.();
				} else if (
					pc.connectionState === "failed" ||
					pc.connectionState === "closed"
				) {
					onCallEnded?.();
				}
			};

			// Data channel for peer-to-peer messaging
			pc.ondatachannel = (event) => {
				dataChannelRef.current = event.channel;
			};

			peerConnectionRef.current = pc;
			return pc;
		},
		[sendMessage, onCallConnected, onCallEnded],
	);

	const getMediaStream = useCallback(async (type) => {
		try {
			// Check if mediaDevices is available (requires HTTPS or localhost)
			if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
				throw new Error(
					"Camera/microphone access requires HTTPS. Please use localhost or enable HTTPS.",
				);
			}

			const constraints = {
				audio: true,
				video: type === "video" ? { facingMode: "user" } : false,
			};
			const stream = await navigator.mediaDevices.getUserMedia(constraints);
			console.log(
				"Local stream obtained:",
				stream.getAudioTracks().length,
				"audio tracks,",
				stream.getVideoTracks().length,
				"video tracks",
			);
			setLocalStream(stream);
			return stream;
		} catch (error) {
			console.error("Failed to get media:", error);
			throw error;
		}
	}, []);

	const startCall = useCallback(
		async (targetUser, callType = "video") => {
			try {
				console.log("Starting call to", targetUser, "type:", callType);
				const stream = await getMediaStream(callType);
				const pc = createPeerConnection(targetUser);

				stream.getTracks().forEach((track) => {
					console.log(
						"Adding track to peer connection (caller):",
						track.kind,
						track.label,
					);
					pc.addTrack(track, stream);
				});

				// Create data channel
				dataChannelRef.current = pc.createDataChannel("chat");

				const offer = await pc.createOffer();
				await pc.setLocalDescription(offer);

				console.log("Sending offer to", targetUser);
				sendMessage({
					type: "offer",
					to: targetUser,
					offer: offer,
					callType,
				});
			} catch (error) {
				console.error("Failed to start call:", error);
				throw error;
			}
		},
		[sendMessage, getMediaStream, createPeerConnection],
	);

	const answerCall = useCallback(
		async (callData) => {
			try {
				console.log(
					"Answering call from",
					callData.from,
					"type:",
					callData.callType,
				);
				const stream = await getMediaStream(callData.callType || "video");
				const pc = createPeerConnection(callData.from);

				stream.getTracks().forEach((track) => {
					console.log(
						"Adding track to peer connection (callee):",
						track.kind,
						track.label,
					);
					pc.addTrack(track, stream);
				});

				await pc.setRemoteDescription(
					new RTCSessionDescription(callData.offer),
				);

				// Process pending ICE candidates
				for (const candidate of pendingCandidatesRef.current) {
					await pc.addIceCandidate(new RTCIceCandidate(candidate));
				}
				pendingCandidatesRef.current = [];

				const answer = await pc.createAnswer();
				await pc.setLocalDescription(answer);

				console.log("Sending answer to", callData.from);
				sendMessage({
					type: "answer",
					to: callData.from,
					answer: answer,
				});
			} catch (error) {
				console.error("Failed to answer call:", error);
				throw error;
			}
		},
		[sendMessage, getMediaStream, createPeerConnection],
	);

	const handleAnswer = useCallback(
		async (data) => {
			const pc = peerConnectionRef.current;

			// Check if this is a renegotiation offer (for video upgrade)
			if (data.offer && data.isUpgrade) {
				console.log(
					"Handling renegotiation offer for video upgrade from",
					data.from,
				);
				if (pc) {
					try {
						// If we don't have video yet, add it
						if (localStream && !localStream.getVideoTracks().length) {
							try {
								const videoStream =
									await navigator.mediaDevices.getUserMedia({
										video: { facingMode: "user" },
									});
								const newVideoTrack = videoStream.getVideoTracks()[0];
								localStream.addTrack(newVideoTrack);
								pc.addTrack(newVideoTrack, localStream);
							} catch (err) {
								console.log("Could not add local video:", err);
							}
						}

						await pc.setRemoteDescription(
							new RTCSessionDescription(data.offer),
						);
						const answer = await pc.createAnswer();
						await pc.setLocalDescription(answer);

						sendMessage({
							type: "answer",
							to: data.from,
							answer: answer,
						});
					} catch (error) {
						console.error("Failed to handle renegotiation:", error);
					}
				}
				return;
			}

			// Normal answer handling
			console.log("Received answer from", data.from);
			if (pc) {
				try {
					await pc.setRemoteDescription(
						new RTCSessionDescription(data.answer),
					);
					console.log(
						"Remote description set, processing",
						pendingCandidatesRef.current.length,
						"pending ICE candidates",
					);

					// Process pending ICE candidates
					for (const candidate of pendingCandidatesRef.current) {
						await pc.addIceCandidate(new RTCIceCandidate(candidate));
					}
					pendingCandidatesRef.current = [];
				} catch (error) {
					console.error("Failed to handle answer:", error);
				}
			} else {
				console.warn("No peer connection when handling answer");
			}
		},
		[localStream, sendMessage],
	);

	const handleIceCandidate = useCallback(async (data) => {
		const pc = peerConnectionRef.current;
		if (pc && pc.remoteDescription) {
			try {
				await pc.addIceCandidate(new RTCIceCandidate(data.ice));
			} catch (error) {
				console.error("Failed to add ICE candidate:", error);
			}
		} else {
			pendingCandidatesRef.current.push(data.ice);
		}
	}, []);

	const endCall = useCallback(() => {
		const activeLocalStream = localStreamRef.current || localStream;
		if (activeLocalStream) {
			activeLocalStream.getTracks().forEach((track) => track.stop());
			localStreamRef.current = null;
			setLocalStream(null);
		}

		if (dataChannelRef.current) {
			dataChannelRef.current.close();
			dataChannelRef.current = null;
		}

		if (peerConnectionRef.current) {
			peerConnectionRef.current.close();
			peerConnectionRef.current = null;
		}

		setRemoteStream(null);
		setIsMuted(false);
		setIsVideoOff(false);
		setIsScreenSharing(false);
		pendingCandidatesRef.current = [];
	}, [localStream]);

	const stopScreenShare = useCallback(
		async (isTrackEnded = false) => {
			const stream = localStreamRef.current;
			const pc = peerConnectionRef.current;
			if (!stream || !pc || !isScreenSharing) {
				return;
			}

			try {
				const cameraStream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: { ideal: cameraFacingModeRef.current } },
					audio: false,
				});
				const cameraTrack = cameraStream.getVideoTracks()[0];
				const videoSender = pc
					.getSenders()
					.find((sender) => sender.track?.kind === "video");
				if (videoSender && cameraTrack) {
					await videoSender.replaceTrack(cameraTrack);
				}

				const currentVideoTrack = stream
					.getVideoTracks()
					.find((track) => track !== cameraTrack);
				if (currentVideoTrack && currentVideoTrack !== cameraTrack) {
					stream.removeTrack(currentVideoTrack);
					if (!isTrackEnded) {
						currentVideoTrack.stop();
					}
				}

				stream.addTrack(cameraTrack);
				setLocalStream(stream);
				setIsScreenSharing(false);
				screenTrackRef.current = null;
			} catch (error) {
				console.error("Failed to stop screen share:", error);
			}
		},
		[isScreenSharing],
	);

	const toggleScreenShare = useCallback(async () => {
		const stream = localStreamRef.current;
		const pc = peerConnectionRef.current;
		if (!stream || !pc) {
			return;
		}

		if (isScreenSharing) {
			await stopScreenShare();
			return;
		}

		try {
			const displayStream = await navigator.mediaDevices.getDisplayMedia({
				video: true,
			});
			const displayTrack = displayStream.getVideoTracks()[0];
			if (!displayTrack) {
				return;
			}

			const videoSender = pc
				.getSenders()
				.find((sender) => sender.track?.kind === "video");
			if (videoSender) {
				await videoSender.replaceTrack(displayTrack);
			}

			const existingVideoTrack = stream.getVideoTracks()[0];
			if (existingVideoTrack) {
				stream.removeTrack(existingVideoTrack);
				existingVideoTrack.stop();
			}

			stream.addTrack(displayTrack);
			setLocalStream(stream);
			screenTrackRef.current = displayTrack;
			setIsScreenSharing(true);

			displayTrack.onended = () => {
				stopScreenShare(true);
			};
		} catch (error) {
			console.error("Failed to start screen share:", error);
		}
	}, [isScreenSharing, stopScreenShare]);

	const flipCamera = useCallback(async () => {
		const stream = localStreamRef.current;
		const pc = peerConnectionRef.current;
		if (!stream) return;

		const oldVideoTrack = stream.getVideoTracks()[0];
		if (!oldVideoTrack) return;

		const nextFacingMode =
			cameraFacingModeRef.current === "user" ? "environment" : "user";

		try {
			const newVideoStream = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: { facingMode: { ideal: nextFacingMode } },
			});
			const newVideoTrack = newVideoStream.getVideoTracks()[0];
			const videoSender = pc
				?.getSenders()
				.find((sender) => sender.track?.kind === "video");

			if (videoSender) {
				await videoSender.replaceTrack(newVideoTrack);
			}

			stream.removeTrack(oldVideoTrack);
			oldVideoTrack.stop();
			stream.addTrack(newVideoTrack);
			setLocalStream(stream);
			setIsVideoOff(false);
			cameraFacingModeRef.current = nextFacingMode;

			if (targetPeer) {
				sendMessage({
					type: "video-toggle",
					to: targetPeer,
					enabled: true,
				});
			}
		} catch (error) {
			console.error("Failed to flip camera:", error);
			throw error;
		}
	}, [sendMessage, targetPeer]);

	useEffect(() => {
		return () => {
			if (dataChannelRef.current) {
				dataChannelRef.current.close();
				dataChannelRef.current = null;
			}

			if (peerConnectionRef.current) {
				peerConnectionRef.current.close();
				peerConnectionRef.current = null;
			}

			const stream = localStreamRef.current;
			if (stream) {
				stream.getTracks().forEach((track) => track.stop());
				localStreamRef.current = null;
			}

			pendingCandidatesRef.current = [];
		};
	}, []);

	useEffect(() => {
		const pc = peerConnectionRef.current;
		if (!pc) {
			return;
		}

		const timer = setInterval(async () => {
			if (!peerConnectionRef.current) {
				return;
			}

			try {
				const stats = await peerConnectionRef.current.getStats();
				let bytesSent = null;
				let packetsLost = 0;
				let packetsReceived = 0;
				let rttMs = 0;
				let resolution = "-";

				stats.forEach((report) => {
					if (report.type === "outbound-rtp" && report.kind === "video") {
						if (typeof report.bytesSent === "number") {
							bytesSent = report.bytesSent;
						}
						if (
							typeof report.frameWidth === "number" &&
							typeof report.frameHeight === "number"
						) {
							resolution = `${report.frameWidth}x${report.frameHeight}`;
						}
					}

					if (report.type === "inbound-rtp" && report.kind === "video") {
						packetsLost += report.packetsLost || 0;
						packetsReceived += report.packetsReceived || 0;
					}

					if (
						report.type === "candidate-pair" &&
						report.state === "succeeded" &&
						typeof report.currentRoundTripTime === "number"
					) {
						rttMs = Math.round(report.currentRoundTripTime * 1000);
					}
				});

				const now = Date.now();
				let bitrateKbps = 0;
				if (
					bytesSent !== null &&
					previousStatsTsRef.current &&
					now > previousStatsTsRef.current
				) {
					const elapsedSec = (now - previousStatsTsRef.current) / 1000;
					const bytesDiff = bytesSent - previousBytesSentRef.current;
					bitrateKbps = Math.max(
						0,
						Math.round((bytesDiff * 8) / 1024 / elapsedSec),
					);
				}

				if (bytesSent !== null) {
					previousBytesSentRef.current = bytesSent;
					previousStatsTsRef.current = now;
				}

				const totalPackets = packetsReceived + packetsLost;
				const packetLossPct =
					totalPackets > 0
						? Number(((packetsLost / totalPackets) * 100).toFixed(1))
						: 0;

				setCallStats({
					bitrateKbps,
					latencyMs: rttMs,
					packetLossPct,
					resolution,
				});
			} catch (error) {
				console.error("Failed to read call stats:", error);
			}
		}, 2000);

		return () => clearInterval(timer);
	}, [isScreenSharing, remoteStream]);

	const toggleMute = useCallback(() => {
		if (localStream) {
			const audioTrack = localStream.getAudioTracks()[0];
			if (audioTrack) {
				audioTrack.enabled = !audioTrack.enabled;
				setIsMuted(!audioTrack.enabled);
			}
		}
	}, [localStream]);

	const toggleVideo = useCallback(async () => {
		if (localStream) {
			const videoTrack = localStream.getVideoTracks()[0];

			if (videoTrack) {
				// Has video track - just toggle it on/off
				videoTrack.enabled = !videoTrack.enabled;
				setIsVideoOff(!videoTrack.enabled);

				// Notify remote peer about video state change
				if (targetPeer) {
					sendMessage({
						type: "video-toggle",
						to: targetPeer,
						enabled: videoTrack.enabled,
					});
				}
			}
		}
	}, [localStream, sendMessage, targetPeer]);

	const upgradeToVideo = useCallback(
		async (peerUser) => {
			if (!localStream) {
				return;
			}

			const existingVideoTrack = localStream.getVideoTracks()[0];
			if (existingVideoTrack) {
				existingVideoTrack.enabled = true;
				setIsVideoOff(false);
				return;
			}

			try {
				const videoStream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: "user" },
				});
				const newVideoTrack = videoStream.getVideoTracks()[0];

				localStream.addTrack(newVideoTrack);

				const pc = peerConnectionRef.current;
				if (pc) {
					pc.addTrack(newVideoTrack, localStream);

					const offer = await pc.createOffer();
					await pc.setLocalDescription(offer);

					const upgradePeer = peerUser || targetPeer;
					if (upgradePeer) {
						sendMessage({
							type: "offer",
							to: upgradePeer,
							offer,
							callType: "video",
							isUpgrade: true,
						});
					}
				}

				setIsVideoOff(false);
			} catch (error) {
				console.error("Failed to upgrade call to video:", error);
				throw error;
			}
		},
		[localStream, sendMessage, targetPeer],
	);

	return {
		localStream,
		remoteStream,
		startCall,
		answerCall,
		endCall,
		toggleMute,
		toggleVideo,
		isMuted,
		isVideoOff,
		isScreenSharing,
		toggleScreenShare,
		callStats,
		flipCamera,
		handleAnswer,
		handleIceCandidate,
		upgradeToVideo,
	};
}
