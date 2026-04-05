import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { ArrowLeft, Users, Send, PlusCircle, Check, Clock } from "lucide-react";
import clsx from "clsx";

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
		handleInviteUsersToRoom,
		setCurrentView,
	} = useApp();

	const [draftMessage, setDraftMessage] = useState("");
	const [ownerInviteSelection, setOwnerInviteSelection] = useState([]);

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

	const peerCandidates = useMemo(() => allUsers || [], [allUsers]);
	const roomInviteForSelected = pendingRoomInvites.find(
		(invite) => invite.roomId === selectedRoomId,
	);

	const selectedRoomMessages = selectedRoomId
		? roomMessages[selectedRoomId] || []
		: [];

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
		handleSendRoomMessage(selectedRoomId, draftMessage.trim());
		setDraftMessage("");
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
			</div>

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
					<div className="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_rgba(0,0,0,0)_45%)]">
						{selectedRoomMessages.length === 0 ? (
							<div className="text-sm text-gray-500">
								No room messages yet.
							</div>
						) : (
							selectedRoomMessages.map((item, index) => (
								<div
									key={item.messageId || `${item.timestamp}-${index}`}
									className={clsx(
										"max-w-[80%] px-3 py-2 rounded-2xl border",
										item.isMe
											? "ml-auto bg-cyan-600/80 border-cyan-400/25"
											: "mr-auto bg-white/10 border-white/10",
									)}>
									<p className="text-[11px] text-white/70 mb-1 flex items-center gap-1.5">
										{item.from}
										<span className="opacity-70">
											{formatTime(item.timestamp)}
										</span>
									</p>
									<p className="text-sm whitespace-pre-wrap break-words">
										{item.message}
									</p>
									{item.isMe && (
										<div className="mt-1 text-[11px] text-white/70 flex items-center justify-end gap-1">
											{item.status === "sent" ? (
												<Check className="w-3.5 h-3.5" />
											) : (
												<Clock className="w-3.5 h-3.5" />
											)}
											<span>
												{item.status === "sent"
													? "Sent"
													: "Sending"}
											</span>
										</div>
									)}
								</div>
							))
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

					<div className="p-4 border-t border-white/10 flex items-center gap-2">
						<div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
							<Users className="w-4 h-4" />
						</div>
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
				</>
			)}
		</div>
	);
}
