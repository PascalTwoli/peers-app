import { useCallback, useEffect, useRef, useState } from "react";

const ICE_SERVERS = {
	iceServers: [
		{ urls: "stun:stun.l.google.com:19302" },
		{ urls: "stun:stun1.l.google.com:19302" },
		{ urls: "stun:stun2.l.google.com:19302" },
	],
};

export function useRoomWebRTC({
	sendMessage,
	username,
	roomCallSession,
	onError,
}) {
	const [localStream, setLocalStream] = useState(null);
	const [remoteStreams, setRemoteStreams] = useState({});
	const [isMuted, setIsMuted] = useState(false);
	const [isVideoOff, setIsVideoOff] = useState(false);
	const [isScreenSharing, setIsScreenSharing] = useState(false);
	const [activeSpeaker, setActiveSpeaker] = useState(null);

	const peerConnectionsRef = useRef(new Map());
	const pendingCandidatesRef = useRef(new Map());
	const localStreamRef = useRef(null);
	const cameraTrackRef = useRef(null);
	const screenTrackRef = useRef(null);
	const isMutedRef = useRef(false);
	const isVideoOffRef = useRef(false);
	const isScreenSharingRef = useRef(false);
	const offerRetryTimersRef = useRef(new Map());
	const audioContextRef = useRef(null);
	const audioMetersRef = useRef(new Map());
	const lastSpokeAtRef = useRef(new Map());

	const roomId = roomCallSession?.roomId || null;
	const participants = roomCallSession?.participants || [];
	const joined = Boolean(roomCallSession?.joined && roomId);
	const participantsSignature = participants.slice().sort().join("|");

	useEffect(() => {
		localStreamRef.current = localStream;
	}, [localStream]);

	useEffect(() => {
		isMutedRef.current = isMuted;
	}, [isMuted]);

	useEffect(() => {
		isVideoOffRef.current = isVideoOff;
	}, [isVideoOff]);

	useEffect(() => {
		isScreenSharingRef.current = isScreenSharing;
	}, [isScreenSharing]);

	const clearOfferRetryForPeer = useCallback((peer) => {
		const timer = offerRetryTimersRef.current.get(peer);
		if (timer) {
			clearTimeout(timer);
			offerRetryTimersRef.current.delete(peer);
		}
	}, []);

	const sendOfferWithRetry = useCallback(
		(peer, offer, attempt = 0) => {
			if (!roomId || !peer || !offer) {
				return;
			}

			if (attempt === 0) {
				clearOfferRetryForPeer(peer);
			}

			const sent = sendMessage({
				type: "room_webrtc_offer",
				to: peer,
				roomId,
				offer,
			});

			if (sent || attempt >= 3) {
				clearOfferRetryForPeer(peer);
				return;
			}

			const delayMs = 400 * Math.pow(2, attempt);
			const timer = setTimeout(() => {
				sendOfferWithRetry(peer, offer, attempt + 1);
			}, delayMs);
			offerRetryTimersRef.current.set(peer, timer);
		},
		[clearOfferRetryForPeer, roomId, sendMessage],
	);

	const ensureAudioContext = useCallback(() => {
		const AudioCtx = window.AudioContext || window.webkitAudioContext;
		if (!AudioCtx) {
			return null;
		}

		if (!audioContextRef.current) {
			audioContextRef.current = new AudioCtx();
		}

		if (audioContextRef.current.state === "suspended") {
			audioContextRef.current.resume().catch(() => {});
		}

		return audioContextRef.current;
	}, []);

	const detachAudioMeter = useCallback((peer) => {
		const meter = audioMetersRef.current.get(peer);
		if (!meter) {
			return;
		}

		try {
			meter.source.disconnect();
			meter.analyser.disconnect();
		} catch {}

		audioMetersRef.current.delete(peer);
		lastSpokeAtRef.current.delete(peer);
	}, []);

	const attachAudioMeter = useCallback(
		(peer, stream) => {
			if (!peer) {
				return;
			}

			const audioTrack = stream?.getAudioTracks?.()[0] || null;
			if (!audioTrack) {
				detachAudioMeter(peer);
				return;
			}

			const existing = audioMetersRef.current.get(peer);
			if (existing?.trackId === audioTrack.id) {
				return;
			}

			detachAudioMeter(peer);
			const ctx = ensureAudioContext();
			if (!ctx) {
				return;
			}

			try {
				const source = ctx.createMediaStreamSource(stream);
				const analyser = ctx.createAnalyser();
				analyser.fftSize = 512;
				analyser.smoothingTimeConstant = 0.72;
				source.connect(analyser);
				audioMetersRef.current.set(peer, {
					source,
					analyser,
					dataArray: new Uint8Array(analyser.fftSize),
					trackId: audioTrack.id,
				});
			} catch (error) {
				console.error("Failed to attach room audio meter:", error);
			}
		},
		[detachAudioMeter, ensureAudioContext],
	);

	const broadcastMediaState = useCallback(
		(next = {}) => {
			if (!joined || !roomId) {
				return;
			}

			sendMessage({
				type: "room_media_state",
				roomId,
				isMuted: next.isMuted ?? isMuted,
				isVideoOff: next.isVideoOff ?? isVideoOff,
				isScreenSharing: next.isScreenSharing ?? isScreenSharing,
			});
		},
		[joined, roomId, sendMessage, isMuted, isVideoOff, isScreenSharing],
	);

	const ensureLocalStream = useCallback(async () => {
		if (localStreamRef.current) {
			return localStreamRef.current;
		}

		if (!navigator.mediaDevices?.getUserMedia) {
			throw new Error(
				"Camera/microphone access requires HTTPS or localhost.",
			);
		}

		let stream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
				video: { facingMode: "user" },
			});
		} catch {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
				video: false,
			});
		}

		cameraTrackRef.current = stream.getVideoTracks()[0] || null;
		localStreamRef.current = stream;
		setLocalStream(stream);
		setIsMuted(false);
		setIsVideoOff(stream.getVideoTracks().length === 0);
		return stream;
	}, []);

	const createPeerConnection = useCallback(
		async (peer) => {
			if (!roomId) {
				return null;
			}

			if (peerConnectionsRef.current.has(peer)) {
				return peerConnectionsRef.current.get(peer);
			}

			const pc = new RTCPeerConnection(ICE_SERVERS);
			peerConnectionsRef.current.set(peer, pc);

			pc.onicecandidate = (event) => {
				if (!event.candidate || !roomId) {
					return;
				}

				sendMessage({
					type: "room_webrtc_ice",
					to: peer,
					roomId,
					ice: event.candidate,
				});
			};

			pc.ontrack = (event) => {
				const stream = event.streams[0];
				if (!stream) {
					return;
				}

				setRemoteStreams((prev) => ({
					...prev,
					[peer]: stream,
				}));
			};

			const stream = await ensureLocalStream();
			for (const track of stream.getTracks()) {
				pc.addTrack(track, stream);
			}

			const queued = pendingCandidatesRef.current.get(peer) || [];
			for (const candidate of queued) {
				try {
					await pc.addIceCandidate(new RTCIceCandidate(candidate));
				} catch (error) {
					console.error("Failed to add queued room ICE candidate:", error);
				}
			}
			pendingCandidatesRef.current.delete(peer);

			return pc;
		},
		[ensureLocalStream, roomId, sendMessage],
	);

	const syncParticipants = useCallback(async () => {
		if (!joined || !roomId) {
			return;
		}

		await ensureLocalStream();
		const peers = participants.filter((peer) => peer && peer !== username);

		for (const peer of peers) {
			const pc = await createPeerConnection(peer);
			if (!pc) {
				continue;
			}

			if (username.localeCompare(peer) < 0) {
				try {
					const offer = await pc.createOffer();
					await pc.setLocalDescription(offer);
					sendOfferWithRetry(peer, offer);
				} catch (error) {
					console.error("Failed to create room offer:", error);
				}
			}
		}

		for (const [peer, pc] of peerConnectionsRef.current.entries()) {
			if (peers.includes(peer)) {
				continue;
			}

			pc.close();
			peerConnectionsRef.current.delete(peer);
			clearOfferRetryForPeer(peer);
			detachAudioMeter(peer);
			setRemoteStreams((prev) => {
				if (!prev[peer]) {
					return prev;
				}
				const next = { ...prev };
				delete next[peer];
				return next;
			});
		}
	}, [
		clearOfferRetryForPeer,
		createPeerConnection,
		detachAudioMeter,
		ensureLocalStream,
		joined,
		participants,
		roomId,
		sendOfferWithRetry,
		username,
	]);

	useEffect(() => {
		syncParticipants().catch((error) => {
			console.error("Failed to sync room participants:", error);
		});
	}, [syncParticipants]);

	const handleOffer = useCallback(
		async (data) => {
			if (!data?.from || !data?.offer || data.roomId !== roomId) {
				return;
			}

			try {
				const pc = await createPeerConnection(data.from);
				if (!pc) {
					return;
				}

				await pc.setRemoteDescription(
					new RTCSessionDescription(data.offer),
				);
				const answer = await pc.createAnswer();
				await pc.setLocalDescription(answer);

				sendMessage({
					type: "room_webrtc_answer",
					to: data.from,
					roomId,
					answer,
				});
			} catch (error) {
				console.error("Failed to handle room offer:", error);
			}
		},
		[createPeerConnection, roomId, sendMessage],
	);

	const handleAnswer = useCallback(
		async (data) => {
			if (!data?.from || !data?.answer || data.roomId !== roomId) {
				return;
			}

			const pc = peerConnectionsRef.current.get(data.from);
			if (!pc) {
				return;
			}

			try {
				await pc.setRemoteDescription(
					new RTCSessionDescription(data.answer),
				);
				clearOfferRetryForPeer(data.from);
			} catch (error) {
				console.error("Failed to handle room answer:", error);
			}
		},
		[clearOfferRetryForPeer, roomId],
	);

	const handleIce = useCallback(
		async (data) => {
			if (!data?.from || !data?.ice || data.roomId !== roomId) {
				return;
			}

			const pc = peerConnectionsRef.current.get(data.from);
			if (!pc || !pc.remoteDescription) {
				const queue = pendingCandidatesRef.current.get(data.from) || [];
				queue.push(data.ice);
				pendingCandidatesRef.current.set(data.from, queue);
				return;
			}

			try {
				await pc.addIceCandidate(new RTCIceCandidate(data.ice));
			} catch (error) {
				console.error("Failed to add room ICE candidate:", error);
			}
		},
		[roomId],
	);

	const renegotiateAllPeers = useCallback(async () => {
		if (!roomId) {
			return;
		}

		for (const [peer, pc] of peerConnectionsRef.current.entries()) {
			try {
				const offer = await pc.createOffer();
				await pc.setLocalDescription(offer);
				sendOfferWithRetry(peer, offer);
			} catch (error) {
				console.error("Failed to renegotiate room peer", peer, error);
			}
		}
	}, [roomId, sendOfferWithRetry]);

	const replaceOutgoingVideoTrack = useCallback(async (newTrack, stream) => {
		for (const [peer, pc] of peerConnectionsRef.current.entries()) {
			const sender = pc
				.getSenders()
				.find((item) => item.track?.kind === "video");

			if (sender) {
				try {
					await sender.replaceTrack(newTrack || null);
				} catch (error) {
					console.error(
						"Failed to replace outgoing room video track for peer",
						peer,
						error,
					);
				}
				continue;
			}

			if (newTrack && stream) {
				pc.addTrack(newTrack, stream);
			}
		}
	}, []);

	const tuneVideoSender = useCallback(async (pc) => {
		const sender = pc
			.getSenders()
			.find((item) => item.track?.kind === "video");
		if (!sender?.getParameters || !sender?.setParameters) {
			return;
		}

		try {
			const params = sender.getParameters() || {};
			const encodings = params.encodings?.length ? params.encodings : [{}];
			encodings[0].maxBitrate = 3_000_000;
			encodings[0].maxFramerate = 30;
			params.encodings = encodings;
			await sender.setParameters(params);
		} catch {
			// Best-effort tuning; not all browsers support this.
		}
	}, []);

	const replaceOutgoingAudioTrack = useCallback(async (newTrack, stream) => {
		for (const pc of peerConnectionsRef.current.values()) {
			const sender = pc
				.getSenders()
				.find((item) => item.track?.kind === "audio");

			if (sender) {
				try {
					await sender.replaceTrack(newTrack || null);
				} catch (error) {
					console.error(
						"Failed to replace outgoing room audio track:",
						error,
					);
				}
				continue;
			}

			if (newTrack && stream) {
				pc.addTrack(newTrack, stream);
			}
		}
	}, []);

	const removeLocalVideoTracks = useCallback(
		(stream, exceptTrack = null, { stopTracks = true } = {}) => {
			for (const track of stream.getVideoTracks()) {
				if (exceptTrack && track.id === exceptTrack.id) {
					continue;
				}
				stream.removeTrack(track);
				if (stopTracks) {
					track.stop();
				}
			}
		},
		[],
	);

	const stopScreenShare = useCallback(async () => {
		const stream = localStreamRef.current;
		if (!stream) {
			return;
		}

		const currentShareTrack = screenTrackRef.current;
		if (currentShareTrack) {
			currentShareTrack.onended = null;
			try {
				currentShareTrack.stop();
			} catch {}
		}
		screenTrackRef.current = null;

		try {
			let cameraTrack = cameraTrackRef.current;
			if (!cameraTrack || cameraTrack.readyState === "ended") {
				const cameraStream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: "user" },
					audio: false,
				});
				cameraTrack = cameraStream.getVideoTracks()[0] || null;
			}

			removeLocalVideoTracks(stream, null, { stopTracks: true });

			if (cameraTrack) {
				cameraTrack.enabled = !isVideoOffRef.current;
				stream.addTrack(cameraTrack);
				cameraTrackRef.current = cameraTrack;
				await replaceOutgoingVideoTrack(cameraTrack, stream);
				setIsVideoOff(!cameraTrack.enabled);
				broadcastMediaState({
					isScreenSharing: false,
					isVideoOff: !cameraTrack.enabled,
				});
			} else {
				cameraTrackRef.current = null;
				await replaceOutgoingVideoTrack(null, stream);
				setIsVideoOff(true);
				broadcastMediaState({
					isScreenSharing: false,
					isVideoOff: true,
				});
			}

			setIsScreenSharing(false);
			setLocalStream(new MediaStream(stream.getTracks()));
		} catch (error) {
			console.error("Failed to restore camera after screen share:", error);
			onError?.(
				"Could not restore camera after screen sharing. You may need to re-enable video.",
			);
			setIsScreenSharing(false);
			broadcastMediaState({ isScreenSharing: false });
		}
	}, [
		broadcastMediaState,
		onError,
		removeLocalVideoTracks,
		replaceOutgoingVideoTrack,
	]);

	const toggleMute = useCallback(async () => {
		const stream = localStreamRef.current || (await ensureLocalStream());
		if (!stream) {
			return;
		}

		let audioTrack = stream.getAudioTracks()[0] || null;
		if (!audioTrack) {
			try {
				const audioStream = await navigator.mediaDevices.getUserMedia({
					audio: true,
					video: false,
				});
				audioTrack = audioStream.getAudioTracks()[0] || null;
				if (!audioTrack) {
					return;
				}
				stream.addTrack(audioTrack);
				await replaceOutgoingAudioTrack(audioTrack, stream);
				setLocalStream(new MediaStream(stream.getTracks()));
			} catch (error) {
				onError?.("Could not access microphone.");
				return;
			}
		}

		const nextMuted = !isMuted;
		for (const track of stream.getAudioTracks()) {
			track.enabled = !nextMuted;
		}
		for (const pc of peerConnectionsRef.current.values()) {
			const sender = pc
				.getSenders()
				.find((item) => item.track?.kind === "audio");
			if (sender?.track) {
				sender.track.enabled = !nextMuted;
			}
		}
		setIsMuted(nextMuted);
		broadcastMediaState({ isMuted: nextMuted });
	}, [
		broadcastMediaState,
		ensureLocalStream,
		isMuted,
		onError,
		replaceOutgoingAudioTrack,
	]);

	const toggleVideo = useCallback(async () => {
		const stream = localStreamRef.current || (await ensureLocalStream());
		if (!stream) {
			return;
		}

		if (isScreenSharingRef.current) {
			await stopScreenShare();
			if (isVideoOffRef.current) {
				return;
			}
		}

		const currentVideoTrack = stream.getVideoTracks()[0] || null;
		if (currentVideoTrack) {
			currentVideoTrack.enabled = !currentVideoTrack.enabled;
			const nextVideoOff = !currentVideoTrack.enabled;
			setIsVideoOff(nextVideoOff);
			broadcastMediaState({ isVideoOff: nextVideoOff });
			return;
		}

		try {
			const videoStream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: "user" },
				audio: false,
			});
			const newVideoTrack = videoStream.getVideoTracks()[0];
			if (!newVideoTrack) {
				return;
			}

			removeLocalVideoTracks(stream, null, { stopTracks: true });
			stream.addTrack(newVideoTrack);
			newVideoTrack.contentHint = "motion";
			cameraTrackRef.current = newVideoTrack;
			await replaceOutgoingVideoTrack(newVideoTrack, stream);
			for (const pc of peerConnectionsRef.current.values()) {
				await tuneVideoSender(pc);
			}

			setLocalStream(new MediaStream(stream.getTracks()));
			setIsVideoOff(false);
			setIsScreenSharing(false);
			broadcastMediaState({ isVideoOff: false });
		} catch (error) {
			console.error("Failed to enable room video:", error);
			onError?.(
				error?.message ||
					"Could not enable camera. Check permissions and try again.",
			);
		}
	}, [
		broadcastMediaState,
		ensureLocalStream,
		onError,
		removeLocalVideoTracks,
		replaceOutgoingVideoTrack,
		stopScreenShare,
		tuneVideoSender,
	]);

	const toggleScreenShare = useCallback(async () => {
		const stream = localStreamRef.current || (await ensureLocalStream());
		if (!stream) {
			return;
		}

		const getDisplayMedia = navigator.mediaDevices?.getDisplayMedia;
		if (!getDisplayMedia) {
			onError?.(
				"Screen sharing is not supported on this device/browser. Use a desktop Chromium browser for best results.",
			);
			return;
		}

		if (isScreenSharingRef.current) {
			await stopScreenShare();
			return;
		}

		try {
			const displayStream = await getDisplayMedia.call(
				navigator.mediaDevices,
				{
					video: {
						frameRate: { ideal: 30, max: 60 },
					},
				},
			);
			const displayTrack = displayStream.getVideoTracks()[0];
			if (!displayTrack) {
				onError?.("No shareable screen source was selected.");
				return;
			}
			displayTrack.contentHint = "motion";
			screenTrackRef.current = displayTrack;

			removeLocalVideoTracks(stream, null, { stopTracks: false });
			stream.addTrack(displayTrack);
			await replaceOutgoingVideoTrack(displayTrack, stream);
			for (const pc of peerConnectionsRef.current.values()) {
				await tuneVideoSender(pc);
			}
			setIsScreenSharing(true);
			setIsVideoOff(false);
			setLocalStream(new MediaStream(stream.getTracks()));
			broadcastMediaState({ isScreenSharing: true, isVideoOff: false });

			displayTrack.onended = () => {
				stopScreenShare().catch((error) => {
					console.error("Failed to stop room screen share:", error);
				});
			};
		} catch (error) {
			console.error("Failed to start room screen share:", error);
			onError?.(
				error?.message ||
					"Screen share failed. On mobile devices this may be unsupported.",
			);
		}
	}, [
		broadcastMediaState,
		ensureLocalStream,
		onError,
		removeLocalVideoTracks,
		replaceOutgoingVideoTrack,
		stopScreenShare,
		tuneVideoSender,
	]);

	useEffect(() => {
		const stream = localStreamRef.current;
		if (!joined || !stream) {
			return;
		}

		const audioTrack = stream.getAudioTracks()[0];
		if (!audioTrack) {
			return;
		}

		audioTrack.onended = () => {
			if (!joined || isMutedRef.current) {
				return;
			}

			navigator.mediaDevices
				.getUserMedia({ audio: true, video: false })
				.then(async (audioStream) => {
					const nextTrack = audioStream.getAudioTracks()[0];
					if (!nextTrack || !localStreamRef.current) {
						return;
					}

					localStreamRef.current.addTrack(nextTrack);
					for (const pc of peerConnectionsRef.current.values()) {
						const sender = pc
							.getSenders()
							.find((item) => item.track?.kind === "audio");
						if (sender) {
							await sender.replaceTrack(nextTrack);
						} else {
							pc.addTrack(nextTrack, localStreamRef.current);
						}
					}

					setLocalStream(
						new MediaStream(localStreamRef.current.getTracks()),
					);
				})
				.catch(() => {
					onError?.(
						"Microphone disconnected. Please re-enable permissions.",
					);
				});
		};

		return () => {
			audioTrack.onended = null;
		};
	}, [joined, localStream, onError]);

	const cleanup = useCallback(() => {
		for (const pc of peerConnectionsRef.current.values()) {
			pc.close();
		}
		peerConnectionsRef.current.clear();
		pendingCandidatesRef.current.clear();

		for (const timer of offerRetryTimersRef.current.values()) {
			clearTimeout(timer);
		}
		offerRetryTimersRef.current.clear();

		for (const peer of audioMetersRef.current.keys()) {
			detachAudioMeter(peer);
		}
		audioMetersRef.current.clear();
		lastSpokeAtRef.current.clear();

		if (audioContextRef.current) {
			audioContextRef.current.close().catch(() => {});
			audioContextRef.current = null;
		}

		setRemoteStreams({});

		const stream = localStreamRef.current;
		if (stream) {
			stream.getTracks().forEach((track) => track.stop());
		}
		localStreamRef.current = null;
		cameraTrackRef.current = null;
		screenTrackRef.current = null;
		setLocalStream(null);
		setIsMuted(false);
		setIsVideoOff(false);
		setIsScreenSharing(false);
		setActiveSpeaker(null);
	}, [detachAudioMeter]);

	useEffect(() => {
		if (!joined) {
			cleanup();
		}
	}, [cleanup, joined]);

	useEffect(() => {
		if (!joined) {
			return;
		}

		attachAudioMeter(username, localStreamRef.current);
		for (const [peer, stream] of Object.entries(remoteStreams)) {
			attachAudioMeter(peer, stream);
		}

		for (const peer of audioMetersRef.current.keys()) {
			if (peer === username || remoteStreams[peer]) {
				continue;
			}
			detachAudioMeter(peer);
		}
	}, [attachAudioMeter, detachAudioMeter, joined, remoteStreams, username]);

	useEffect(() => {
		if (!joined) {
			setActiveSpeaker(null);
			return;
		}

		const SPEAK_THRESHOLD = 0.022;
		const HOLD_MS = 1400;
		const interval = setInterval(() => {
			const now = Date.now();
			let candidate = null;
			let maxLevel = 0;

			for (const [peer, meter] of audioMetersRef.current.entries()) {
				if (peer === username && isMuted) {
					continue;
				}

				meter.analyser.getByteTimeDomainData(meter.dataArray);
				let sumSquares = 0;
				for (const value of meter.dataArray) {
					const normalized = (value - 128) / 128;
					sumSquares += normalized * normalized;
				}
				const rms = Math.sqrt(sumSquares / meter.dataArray.length);

				if (rms > SPEAK_THRESHOLD) {
					lastSpokeAtRef.current.set(peer, now);
				}

				if (rms > maxLevel) {
					maxLevel = rms;
					candidate = peer;
				}
			}

			if (candidate && maxLevel > SPEAK_THRESHOLD) {
				setActiveSpeaker(candidate);
				return;
			}

			let freshestPeer = null;
			let freshestAt = 0;
			for (const [peer, ts] of lastSpokeAtRef.current.entries()) {
				if (now - ts <= HOLD_MS && ts > freshestAt) {
					freshestPeer = peer;
					freshestAt = ts;
				}
			}
			setActiveSpeaker(freshestPeer);
		}, 260);

		return () => clearInterval(interval);
	}, [joined, isMuted, username]);

	useEffect(() => {
		if (!joined) {
			return;
		}

		broadcastMediaState();
	}, [
		joined,
		isMuted,
		isVideoOff,
		isScreenSharing,
		roomId,
		participantsSignature,
		broadcastMediaState,
	]);

	useEffect(() => {
		return () => {
			cleanup();
		};
	}, [cleanup]);

	return {
		localStream,
		remoteStreams,
		isMuted,
		isVideoOff,
		isScreenSharing,
		activeSpeaker,
		toggleMute,
		toggleVideo,
		toggleScreenShare,
		handleOffer,
		handleAnswer,
		handleIce,
		cleanup,
	};
}
