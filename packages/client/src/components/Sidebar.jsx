import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import {
	LogOut,
	X,
	Users,
	Wifi,
	House,
	UsersRound,
	Link,
	Settings,
	Copy,
	Plus,
} from "lucide-react";
import clsx from "clsx";

export default function Sidebar() {
	const {
		username,
		onlineUsers,
		allUsers,
		messages,
		rooms,
		pendingRoomInvites,
		lastInviteLink,
		typingUsers,
		currentView,
		userFilter,
		setUserFilter,
		selectedUser,
		setSelectedUser,
		selectedRoomId,
		sidebarOpen,
		setSidebarOpen,
		handleLogout,
		handleOpenInviteCenter,
		handleOpenRoomComposer,
		handleOpenRoom,
		handleRequestJoinRoom,
		handleApproveRoomRequest,
		handleRespondToRoomInvite,
	} = useApp();
	const [activePane, setActivePane] = useState("peers");

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
		return `linear-gradient(135deg, hsl(${hue}, 70%, 48%), hsl(${(hue + 30) % 360}, 70%, 43%))`;
	};

	// Get users to display based on filter, online users sorted to top
	const displayUsers = (
		userFilter === "online"
			? onlineUsers.map((u) => ({ username: u, isOnline: true }))
			: allUsers.length > 0
				? allUsers
				: onlineUsers.map((u) => ({ username: u, isOnline: true }))
	).slice().sort((a, b) => Number(b.isOnline) - Number(a.isOnline));

	const onlineCount =
		allUsers.filter((u) => u.isOnline).length || onlineUsers.length;

	const totalUnread = useMemo(
		() =>
			Object.keys(messages).reduce((total, user) => {
				const unreadForUser = (messages[user] || []).filter(
					(msg) => !msg.isMe && msg.from === user && msg.readByMe !== true,
				).length;
				return total + unreadForUser;
			}, 0),
		[messages],
	);

	const totalPendingRoomRequests = useMemo(
		() =>
			rooms.reduce(
				(total, room) => total + (room.pendingRequests?.length || 0),
				0,
			),
		[rooms],
	);

	const getUnreadCount = (user) => {
		const userMessages = messages[user] || [];
		return userMessages.filter(
			(msg) => !msg.isMe && msg.from === user && msg.readByMe !== true,
		).length;
	};

	const navItems = [
		{
			id: "peers",
			label: "Peers",
			icon: UsersRound,
			badge: totalUnread,
		},
		{
			id: "rooms",
			label: "Rooms",
			icon: House,
			badge: totalPendingRoomRequests,
		},
		{
			id: "invites",
			label: "Invites",
			icon: Link,
			badge: pendingRoomInvites.length,
		},
	];

	const handleMobileNavClick = (pane) => {
		setActivePane(pane);
		setSidebarOpen(true);
	};

	return (
		<>
			{sidebarOpen && (
				<div
					className="fixed inset-0 bg-black/55 z-40 md:hidden"
					onClick={() => setSidebarOpen(false)}
				/>
			)}

			<aside
				className={clsx(
					"fixed top-0 left-0 z-50 md:relative md:inset-auto",
					"h-[calc(100dvh-4rem)] md:h-full",
					"w-full max-w-[420px] md:w-[380px] md:max-w-none",
					"transition-transform duration-300",
					sidebarOpen
						? "translate-x-0"
						: "-translate-x-full md:translate-x-0",
				)}>
				<div className="h-full flex flex-col md:flex-row bg-[#161616] border-r border-white/10 shadow-2xl">
					<nav className="hidden md:flex h-full w-[68px] border-r border-white/10 bg-[#111111] flex-col items-center py-3 gap-2">
						<div className="hidden md:flex w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-200 items-center justify-center font-bold text-sm">
							P
						</div>
						<div className="w-full px-2 space-y-1">
							{navItems.map((item) => {
								const Icon = item.icon;
								const isActive = activePane === item.id;
								return (
									<button
										key={item.id}
										title={item.label}
										onClick={() => setActivePane(item.id)}
										className={clsx(
											"relative w-full h-11 rounded-xl flex items-center justify-center transition-all",
											isActive
												? "bg-cyan-500/20 text-cyan-200"
												: "text-gray-400 hover:text-white hover:bg-white/10",
										)}>
										<Icon className="w-5 h-5" />
										{item.badge > 0 && (
											<span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-cyan-500 text-black text-[10px] font-bold flex items-center justify-center">
												{item.badge > 99 ? "99+" : item.badge}
											</span>
										)}
									</button>
								);
							})}
						</div>

						<div className="mt-auto w-full px-2 space-y-1">
							<button
								title="Settings"
								onClick={() => setActivePane("settings")}
								className={clsx(
									"w-full h-11 rounded-xl flex items-center justify-center transition-all",
									activePane === "settings"
										? "bg-white/15 text-white"
										: "text-gray-400 hover:text-white hover:bg-white/10",
								)}>
								<Settings className="w-5 h-5" />
							</button>
							<button
								title="Logout"
								onClick={handleLogout}
								className="w-full h-11 rounded-xl flex items-center justify-center text-red-300 hover:text-red-200 hover:bg-red-500/20 transition-all">
								<LogOut className="w-5 h-5" />
							</button>
						</div>
					</nav>

					<div className="flex-1 min-w-0 flex flex-col bg-[#1a1a1a]">
						<div className="h-16 border-b border-white/10 px-4 md:px-5 flex items-center justify-between">
							<div>
								<p className="text-[11px] uppercase tracking-[0.16em] text-cyan-400/80">
									Workspace
								</p>
								<h2 className="text-lg font-semibold capitalize">
									{activePane}
								</h2>
							</div>
							<div className="text-right">
								<p className="text-sm font-medium truncate max-w-36">
									{username}
								</p>
								<p className="text-xs text-gray-400">
									{onlineCount} online
								</p>
							</div>
							<button
								title="Close"
								onClick={() => setSidebarOpen(false)}
								className="w-9 h-9 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all md:hidden flex items-center justify-center ml-2">
								<X className="w-5 h-5" />
							</button>
						</div>

						<div
							key={activePane}
							className="flex-1 min-h-0 flex flex-col animate-pane-in">
							{activePane === "peers" && (
								<>
									<div className="px-3 py-2 border-b border-white/10">
										<div className="flex gap-1 bg-[#252525] rounded-lg p-1">
											<button
												onClick={() => setUserFilter("all")}
												className={clsx(
													"flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
													userFilter === "all"
														? "bg-primary text-white shadow-sm"
														: "text-gray-400 hover:text-white hover:bg-white/5",
												)}>
												<Users className="w-3.5 h-3.5" />
												<span>All</span>
												<span className="text-xs opacity-70">
													({allUsers.length || onlineUsers.length})
												</span>
											</button>
											<button
												onClick={() => setUserFilter("online")}
												className={clsx(
													"flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
													userFilter === "online"
														? "bg-green-500 text-white shadow-sm"
														: "text-gray-400 hover:text-white hover:bg-white/5",
												)}>
												<Wifi className="w-3.5 h-3.5" />
												<span>Online</span>
												<span className="text-xs opacity-70">
													({onlineCount})
												</span>
											</button>
										</div>
									</div>

									<div className="flex-1 overflow-y-auto hide-scrollbar p-3">
										{displayUsers.length === 0 ? (
											<div className="text-center text-gray-500 mt-10">
												<p>
													{userFilter === "online"
														? "No users online"
														: "No users yet"}
												</p>
												<p className="text-sm mt-2">
													Share the link to invite others
												</p>
											</div>
										) : (
											<ul className="space-y-1">
												{displayUsers.map((userObj) => {
													const user =
														typeof userObj === "string"
															? userObj
															: userObj.username;
													const isOnline =
														typeof userObj === "string"
															? true
															: userObj.isOnline;
													const unreadCount = getUnreadCount(user);
													const isTyping = Boolean(
														typingUsers[user],
													);

													return (
														<li
															key={user}
															onClick={() => {
																setSelectedUser(user);
																setSidebarOpen(false);
																setActivePane("peers");
															}}
															className={clsx(
																"p-3 rounded-xl cursor-pointer transition-all duration-200 flex items-center gap-3",
																"hover:bg-white/[0.06] active:scale-[0.98]",
																selectedUser === user &&
																	"bg-gradient-to-r from-primary/20 to-primary/10 border-l-2 border-primary",
															)}>
															<div className="relative">
																<div
																	className={clsx(
																		"w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm text-white flex-shrink-0 shadow-lg",
																		!isOnline &&
																			!isTyping &&
																			"opacity-60",
																	)}
																	style={{
																		background:
																			getAvatarColor(user),
																	}}>
																	{getInitials(user)}
																</div>
																<span
																	className={clsx(
																		"absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#181818]",
																		isTyping
																			? "bg-cyan-400"
																			: isOnline
																				? "bg-green-500"
																				: "bg-gray-500",
																	)}
																/>
															</div>
															<div className="flex flex-col flex-1 min-w-0">
																<span
																	className={clsx(
																		"font-medium truncate",
																		!isOnline &&
																			"text-gray-400",
																	)}>
																	{user}
																</span>
																<span
																	className={clsx(
																		"text-xs flex items-center gap-1",
																		isTyping
																			? "text-cyan-400"
																			: isOnline
																				? "text-green-400"
																				: "text-gray-500",
																	)}>
																	{isTyping
																		? "Typing..."
																		: isOnline
																			? "Online"
																			: "Offline"}
																</span>
															</div>
															{unreadCount > 0 && (
																<span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-white text-[11px] font-semibold flex items-center justify-center">
																	{unreadCount > 99
																		? "99+"
																		: unreadCount}
																</span>
															)}
														</li>
													);
												})}
											</ul>
										)}
									</div>
								</>
							)}

							{activePane === "rooms" && (
								<div className="flex-1 overflow-y-auto hide-scrollbar p-3 space-y-3">
									<button
										onClick={handleOpenRoomComposer}
										className="w-full h-11 rounded-xl bg-cyan-600/25 hover:bg-cyan-600/35 text-cyan-100 font-medium text-sm transition-colors flex items-center justify-center gap-2">
										<Plus className="w-4 h-4" />
										Create Room
									</button>
									{rooms.length === 0 ? (
										<div className="text-sm text-gray-500 p-4 rounded-xl bg-white/5">
											No active rooms yet.
										</div>
									) : (
										rooms.map((room) => (
											<div
												key={room.roomId}
												onClick={() => handleOpenRoom(room.roomId)}
												className={clsx(
													"rounded-xl bg-white/[0.05] p-3 border cursor-pointer transition-colors",
													selectedRoomId === room.roomId
														? "border-cyan-400/70 bg-cyan-500/10"
														: "border-white/10 hover:border-white/25",
												)}>
												<div className="flex items-center justify-between gap-2">
													<div className="min-w-0">
														<p className="text-sm font-medium truncate">
															{room.name}
														</p>
														<div className="text-[11px] text-gray-400 flex items-center gap-2">
															<span>
																{room.members.length} members
															</span>
															{room.isInvited && (
																<span className="text-cyan-300">
																	Invited
																</span>
															)}
														</div>
													</div>
													{!room.isMember && (
														<button
															onClick={(e) => {
																e.stopPropagation();
																handleOpenRoom(room.roomId);
															}}
															className="text-xs px-2 py-1 rounded-lg bg-cyan-700/40 hover:bg-cyan-700/60">
															Open
														</button>
													)}
												</div>
												{room.isOwner &&
													room.pendingRequests?.length > 0 && (
														<div className="mt-2 space-y-1.5">
															<p className="text-[11px] text-gray-400">
																Pending approvals
															</p>
															{room.pendingRequests.map(
																(requestUser) => (
																	<button
																		key={`${room.roomId}-${requestUser}`}
																		onClick={(e) => {
																			e.stopPropagation();
																			handleApproveRoomRequest(
																				room.roomId,
																				requestUser,
																			);
																		}}
																		className="w-full text-left text-xs px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10">
																		Approve {requestUser}
																	</button>
																),
															)}
														</div>
													)}
											</div>
										))
									)}
								</div>
							)}

							{activePane === "invites" && (
								<div className="flex-1 overflow-y-auto hide-scrollbar p-3 space-y-3">
									{pendingRoomInvites.length > 0 && (
										<div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-3 space-y-2">
											<p className="text-xs uppercase tracking-[0.15em] text-cyan-300">
												Room Invites
											</p>
											{pendingRoomInvites.map((invite) => (
												<div
													key={invite.roomId}
													className="rounded-lg border border-white/10 bg-black/30 p-2.5">
													<p className="text-sm font-medium truncate">
														{invite.roomName}
													</p>
													<p className="text-xs text-gray-400">
														Invited by {invite.owner || "unknown"}
													</p>
													<div className="mt-2 flex items-center gap-2">
														<button
															onClick={() =>
																handleRespondToRoomInvite(
																	invite.roomId,
																	true,
																)
															}
															className="h-8 px-3 rounded-md bg-cyan-600 hover:bg-cyan-500 text-xs font-medium">
															Accept
														</button>
														<button
															onClick={() =>
																handleRespondToRoomInvite(
																	invite.roomId,
																	false,
																)
															}
															className="h-8 px-3 rounded-md bg-white/10 hover:bg-white/20 text-xs font-medium">
															Decline
														</button>
													</div>
												</div>
											))}
										</div>
									)}
									<button
										onClick={handleOpenInviteCenter}
										className="w-full h-11 rounded-xl bg-cyan-600/25 hover:bg-cyan-600/35 text-cyan-100 font-medium text-sm transition-colors">
										Open Invite Center
									</button>
									<div className="rounded-xl border border-white/10 bg-white/5 p-3">
										<p className="text-xs uppercase tracking-[0.15em] text-gray-400 mb-2">
											Latest link
										</p>
										{lastInviteLink ? (
											<>
												<p className="text-xs text-gray-200 break-all">
													{lastInviteLink}
												</p>
												<button
													onClick={() =>
														navigator.clipboard.writeText(
															lastInviteLink,
														)
													}
													className="mt-3 h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium flex items-center gap-2">
													<Copy className="w-3.5 h-3.5" />
													Copy link
												</button>
											</>
										) : (
											<p className="text-sm text-gray-500">
												No link generated yet. Open Invite Center to create one.
											</p>
										)}
									</div>
								</div>
							)}

							{activePane === "settings" && (
								<div className="flex-1 overflow-y-auto hide-scrollbar p-3 space-y-3">
									<div className="rounded-xl border border-white/10 bg-white/5 p-3">
										<p className="text-xs uppercase tracking-[0.15em] text-gray-400">
											Account
										</p>
										<p className="mt-2 text-base font-medium">
											{username}
										</p>
										<p className="text-sm text-gray-400">
											No-account mode is active
										</p>
									</div>
									<div className="rounded-xl border border-white/10 bg-white/5 p-3">
										<p className="text-xs uppercase tracking-[0.15em] text-gray-400">
											Mobile readiness
										</p>
										<p className="mt-2 text-sm text-gray-300">
											Navigation is now separated into feature rail +
											context panel for easier future migration to
											native tab stacks.
										</p>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			</aside>

			{currentView !== "video" && (
				<nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden h-16 border-t border-white/10 bg-[#0f0f0f]/95 backdrop-blur-xl px-2 pb-[max(0px,env(safe-area-inset-bottom))]">
					<div className="h-full grid grid-cols-4 gap-1">
						{[
							...navItems,
							{
								id: "settings",
								label: "Settings",
								icon: Settings,
								badge: 0,
							},
						].map((item) => {
							const Icon = item.icon;
							const isActive = activePane === item.id && sidebarOpen;
							return (
								<button
									key={`mobile-${item.id}`}
									onClick={() => handleMobileNavClick(item.id)}
									className={clsx(
										"relative flex flex-col items-center justify-center rounded-xl text-[11px] transition-colors",
										isActive
											? "text-cyan-200 bg-cyan-500/15"
											: "text-gray-400 hover:text-white hover:bg-white/10",
									)}>
									<Icon className="w-4 h-4 mb-0.5" />
									<span>{item.label}</span>
									{item.badge > 0 && (
										<span className="absolute top-1 right-3 min-w-4 h-4 px-1 rounded-full bg-cyan-500 text-black text-[10px] font-bold flex items-center justify-center">
											{item.badge > 99 ? "99+" : item.badge}
										</span>
									)}
								</button>
							);
						})}
					</div>
				</nav>
			)}
		</>
	);
}
