// IndexedDB Service for saving chats and files

const DB_NAME = "WebRTCChatDB";
const DB_VERSION = 2;
const MESSAGES_STORE = "messages";
const FILES_STORE = "files";

let db = null;
export async function updateMessageContent(messageId, newText) {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([MESSAGES_STORE], "readwrite");
		const store = transaction.objectStore(MESSAGES_STORE);
		const getRequest = store.get(messageId);

		getRequest.onsuccess = () => {
			const message = getRequest.result;
			if (!message) {
				resolve(false);
				return;
			}

			message.text = newText;
			message.edited = true;
			message.editedAt = Date.now();

			const putRequest = store.put(message);
			putRequest.onsuccess = () => resolve(true);
			putRequest.onerror = () => reject(putRequest.error);
		};

		getRequest.onerror = () => reject(getRequest.error);
	});
}

export async function updateMessageReactions(messageId, reactions) {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([MESSAGES_STORE], "readwrite");
		const store = transaction.objectStore(MESSAGES_STORE);
		const getRequest = store.get(messageId);

		getRequest.onsuccess = () => {
			const message = getRequest.result;
			if (!message) {
				resolve(false);
				return;
			}

			message.reactions = reactions;

			const putRequest = store.put(message);
			putRequest.onsuccess = () => resolve(true);
			putRequest.onerror = () => reject(putRequest.error);
		};

		getRequest.onerror = () => reject(getRequest.error);
	});
}

export async function initDB() {
	return new Promise((resolve, reject) => {
		if (db) {
			resolve(db);
			return;
		}

		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			db = request.result;
			resolve(db);
		};

		request.onupgradeneeded = (event) => {
			const database = event.target.result;

			// Delete old stores if they exist
			if (database.objectStoreNames.contains("chats")) {
				database.deleteObjectStore("chats");
			}

			// Messages store - stores individual messages with conversation key
			if (!database.objectStoreNames.contains(MESSAGES_STORE)) {
				const messagesStore = database.createObjectStore(MESSAGES_STORE, {
					keyPath: "messageId",
				});
				messagesStore.createIndex("conversationKey", "conversationKey", {
					unique: false,
				});
				messagesStore.createIndex("timestamp", "timestamp", {
					unique: false,
				});
			}

			// Files store - stores saved files
			if (!database.objectStoreNames.contains(FILES_STORE)) {
				const filesStore = database.createObjectStore(FILES_STORE, {
					keyPath: "id",
					autoIncrement: true,
				});
				filesStore.createIndex("timestamp", "timestamp", { unique: false });
				filesStore.createIndex("type", "type", { unique: false });
			}
		};
	});
}

export async function searchConversationMessages(
	currentUser,
	otherUser,
	query,
) {
	if (!query || !query.trim()) {
		return [];
	}

	const normalized = query.trim().toLowerCase();
	const messages = await getConversationMessages(currentUser, otherUser);
	return messages.filter(
		(message) =>
			typeof message.text === "string" &&
			message.text.toLowerCase().includes(normalized),
	);
}
// Message functions - save individual messages
export async function saveMessage(currentUser, otherUser, message) {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([MESSAGES_STORE], "readwrite");
		const store = transaction.objectStore(MESSAGES_STORE);

		// Create a consistent conversation key (sorted usernames)
		const conversationKey = [currentUser, otherUser].sort().join(":::");

		const messageData = {
			...message,
			conversationKey,
			savedAt: Date.now(),
		};

		const request = store.put(messageData); // use put to update if exists
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

// Get messages for a conversation between current user and another user
export async function getConversationMessages(currentUser, otherUser) {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([MESSAGES_STORE], "readonly");
		const store = transaction.objectStore(MESSAGES_STORE);
		const index = store.index("conversationKey");
		const conversationKey = [currentUser, otherUser].sort().join(":::");
		const request = index.getAll(conversationKey);

		request.onsuccess = () => {
			const messages = request.result.sort(
				(a, b) => a.timestamp - b.timestamp,
			);
			resolve(messages);
		};
		request.onerror = () => reject(request.error);
	});
}

// Get all messages grouped by conversation partner
export async function getAllMessages(currentUser) {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([MESSAGES_STORE], "readonly");
		const store = transaction.objectStore(MESSAGES_STORE);
		const request = store.getAll();

		request.onsuccess = () => {
			const messages = request.result;
			// Group messages by the other user in the conversation
			const grouped = {};
			messages.forEach((msg) => {
				const [user1, user2] = msg.conversationKey.split(":::");
				const otherUser = user1 === currentUser ? user2 : user1;
				if (!grouped[otherUser]) {
					grouped[otherUser] = [];
				}
				grouped[otherUser].push(msg);
			});
			// Sort each conversation by timestamp
			Object.keys(grouped).forEach((user) => {
				grouped[user].sort((a, b) => a.timestamp - b.timestamp);
			});
			resolve(grouped);
		};
		request.onerror = () => reject(request.error);
	});
}

export async function deleteMessage(messageId) {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([MESSAGES_STORE], "readwrite");
		const store = transaction.objectStore(MESSAGES_STORE);
		const request = store.delete(messageId);

		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

// Status hierarchy: failed (-1) < pending (0) < sent (1) < queued (2) < delivered (3) < read (4)
const STATUS_PRIORITY = {
	failed: -1,
	pending: 0,
	sent: 1,
	queued: 2,
	delivered: 3,
	read: 4,
};

// Update message status - only upgrades allowed, never downgrades
export async function updateMessageStatus(messageId, newStatus) {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([MESSAGES_STORE], "readwrite");
		const store = transaction.objectStore(MESSAGES_STORE);

		// First get the message
		const getRequest = store.get(messageId);
		getRequest.onsuccess = () => {
			const message = getRequest.result;
			if (message) {
				const currentPriority = STATUS_PRIORITY[message.status] ?? 0;
				const newPriority = STATUS_PRIORITY[newStatus] ?? 0;

				// Only update if new status is higher priority (upgrade only)
				if (newPriority > currentPriority) {
					message.status = newStatus;
					const putRequest = store.put(message);
					putRequest.onsuccess = () => resolve(true);
					putRequest.onerror = () => reject(putRequest.error);
				} else {
					resolve(false); // Status not upgraded (already at higher status)
				}
			} else {
				resolve(false); // Message not found
			}
		};
		getRequest.onerror = () => reject(getRequest.error);
	});
}

export async function clearConversation(currentUser, otherUser) {
	const database = await initDB();
	const conversationKey = [currentUser, otherUser].sort().join(":::");

	return new Promise((resolve, reject) => {
		const transaction = database.transaction([MESSAGES_STORE], "readwrite");
		const store = transaction.objectStore(MESSAGES_STORE);
		const index = store.index("conversationKey");
		const request = index.openCursor(IDBKeyRange.only(conversationKey));

		request.onsuccess = (event) => {
			const cursor = event.target.result;
			if (cursor) {
				cursor.delete();
				cursor.continue();
			} else {
				resolve();
			}
		};
		request.onerror = () => reject(request.error);
	});
}

// Mark all incoming messages from otherUser in a conversation as read by current user
export async function markConversationReadByUser(currentUser, otherUser) {
	const database = await initDB();
	const conversationKey = [currentUser, otherUser].sort().join(":::");

	return new Promise((resolve, reject) => {
		const transaction = database.transaction([MESSAGES_STORE], "readwrite");
		const store = transaction.objectStore(MESSAGES_STORE);
		const index = store.index("conversationKey");
		const request = index.openCursor(IDBKeyRange.only(conversationKey));
		let updatedCount = 0;

		request.onsuccess = (event) => {
			const cursor = event.target.result;
			if (cursor) {
				const value = cursor.value;
				if (
					value.from === otherUser &&
					!value.isMe &&
					value.readByMe !== true
				) {
					value.readByMe = true;
					cursor.update(value);
					updatedCount++;
				}
				cursor.continue();
			} else {
				resolve(updatedCount);
			}
		};

		request.onerror = () => reject(request.error);
	});
}

// File functions
export async function saveFile(fileData) {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([FILES_STORE], "readwrite");
		const store = transaction.objectStore(FILES_STORE);

		const ownerUsername = fileData.ownerUsername || null;
		const peerUsername = fileData.peerUsername || null;
		const conversationKey =
			ownerUsername && peerUsername
				? [ownerUsername, peerUsername].sort().join(":::")
				: null;

		const fileRecord = {
			fileName: fileData.fileName,
			fileType: fileData.fileType,
			fileSize: fileData.fileSize,
			fileData: fileData.fileData,
			from: fileData.from,
			ownerUsername,
			peerUsername,
			conversationKey,
			timestamp: fileData.timestamp || Date.now(),
		};

		const request = store.add(fileRecord);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function getAllFiles() {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([FILES_STORE], "readonly");
		const store = transaction.objectStore(FILES_STORE);
		const request = store.getAll();

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function getSavedFilesForConversation(currentUser, otherUser) {
	const allFiles = await getAllFiles();
	if (!currentUser) {
		return [];
	}

	const conversationKey = otherUser
		? [currentUser, otherUser].sort().join(":::")
		: null;

	return allFiles.filter((file) => {
		if (file.ownerUsername && file.ownerUsername !== currentUser) {
			return false;
		}

		if (!otherUser) {
			return file.ownerUsername === currentUser;
		}

		if (file.conversationKey) {
			return file.conversationKey === conversationKey;
		}

		// Legacy fallback: incoming files used to save only `from`.
		return file.from === otherUser;
	});
}

export async function deleteFile(id) {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([FILES_STORE], "readwrite");
		const store = transaction.objectStore(FILES_STORE);
		const request = store.delete(id);

		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

export async function clearAllFiles() {
	const database = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction([FILES_STORE], "readwrite");
		const store = transaction.objectStore(FILES_STORE);
		const request = store.clear();

		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

// Initialize DB on import
initDB().catch(console.error);
