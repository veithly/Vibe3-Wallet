import { createStorage } from '../storage/storage';
import type {
  ChatSession,
  ChatMessage,
  ChatHistoryStorage,
  Message,
  ChatSessionMetadata,
  ChatAgentStepHistory,
} from './types';

// Key for storing chat session metadata
const CHAT_SESSIONS_META_KEY = 'chat_sessions_meta';

// Create storage for session metadata
const chatSessionsMetaStorage = createStorage<ChatSessionMetadata[]>(
  CHAT_SESSIONS_META_KEY,
  [],
  {
    isPersistant: true,
  }
);

// Helper function to get storage key for a specific session's messages
const getSessionMessagesKey = (sessionId: string) =>
  `chat_messages_${sessionId}`;

// Helper function to create storage for a specific session's messages
const getSessionMessagesStorage = (sessionId: string) => {
  return createStorage<ChatMessage[]>(getSessionMessagesKey(sessionId), [], {
    isPersistant: true,
  });
};

// Helper function to get storage key for a specific session's agent state history
const getSessionAgentStepHistoryKey = (sessionId: string) =>
  `chat_agent_step_${sessionId}`;

// Helper function to get storage for a specific session's agent state history
const getSessionAgentStepHistoryStorage = (sessionId: string) => {
  return createStorage<ChatAgentStepHistory>(
    getSessionAgentStepHistoryKey(sessionId),
    {
      task: '',
      history: '',
      timestamp: 0,
    },
    {
      isPersistant: true,
    }
  );
};

// Helper function to get current timestamp in milliseconds
const getCurrentTimestamp = (): number => Date.now();

/**
 * Creates a chat history storage instance with optimized operations
 */
export function createChatHistoryStorage(): ChatHistoryStorage {
  return {
    getAllSessions: async (): Promise<ChatSession[]> => {
      const sessionsMeta = await chatSessionsMetaStorage.get();

      // For listing purposes, we can return sessions without loading messages
      // This makes the list view very fast
      return sessionsMeta.map((meta) => ({
        ...meta,
        messages: [], // Empty array as we don't load messages for listing
      }));
    },

    clearAllSessions: async (): Promise<void> => {
      const sessionsMeta = await chatSessionsMetaStorage.get();
      for (const sessionMeta of sessionsMeta) {
        const messagesStorage = getSessionMessagesStorage(sessionMeta.id);
        await messagesStorage.set([]);
      }
      await chatSessionsMetaStorage.set([]);
    },

    // Get session metadata without messages (for UI listing)
    getSessionsMetadata: async (): Promise<ChatSessionMetadata[]> => {
      return await chatSessionsMetaStorage.get();
    },

    getSession: async (sessionId: string): Promise<ChatSession | null> => {
      const sessionsMeta = await chatSessionsMetaStorage.get();
      const sessionMeta = sessionsMeta.find(
        (session) => session.id === sessionId
      );

      if (!sessionMeta) return null;

      // Load messages only when a specific session is requested
      const messagesStorage = getSessionMessagesStorage(sessionId);
      const messages = await messagesStorage.get();

      return {
        ...sessionMeta,
        messages,
      };
    },

    createSession: async (title: string): Promise<ChatSession> => {
      const newSessionId = crypto.randomUUID();
      const currentTime = getCurrentTimestamp();
      const newSessionMeta: ChatSessionMetadata = {
        id: newSessionId,
        title,
        createdAt: currentTime,
        updatedAt: currentTime,
        messageCount: 0,
      };

      // Create empty messages array for the new session
      const messagesStorage = getSessionMessagesStorage(newSessionId);
      await messagesStorage.set([]);

      // Add session metadata to the index
      const currentMeta = await chatSessionsMetaStorage.get();
      await chatSessionsMetaStorage.set([...currentMeta, newSessionMeta]);

      return {
        ...newSessionMeta,
        messages: [],
      };
    },

    updateTitle: async (
      sessionId: string,
      title: string
    ): Promise<ChatSessionMetadata> => {
      let updatedSessionMeta: ChatSessionMetadata | undefined;

      // Update the title and capture the updated session in a single pass
      const currentMeta = await chatSessionsMetaStorage.get();
      const updatedMeta = currentMeta.map((session) => {
        if (session.id === sessionId) {
          // Create the updated session
          const updated = {
            ...session,
            title,
            updatedAt: getCurrentTimestamp(),
          };

          // Capture it for return value
          updatedSessionMeta = updated;

          return updated;
        }
        return session;
      });

      await chatSessionsMetaStorage.set(updatedMeta);

      // Check if we found and updated the session
      if (!updatedSessionMeta) {
        throw new Error('Session not found');
      }

      // Return the already captured metadata
      return updatedSessionMeta;
    },

    deleteSession: async (sessionId: string): Promise<void> => {
      // Remove session from metadata
      const currentMeta = await chatSessionsMetaStorage.get();
      const filteredMeta = currentMeta.filter(
        (session) => session.id !== sessionId
      );
      await chatSessionsMetaStorage.set(filteredMeta);

      // Remove the session's messages
      const messagesStorage = getSessionMessagesStorage(sessionId);
      await messagesStorage.set([]);
    },

    addMessage: async (
      sessionId: string,
      message: Message
    ): Promise<ChatMessage> => {
      const newMessage: ChatMessage = {
        ...message,
        id: crypto.randomUUID(),
      };

      // First check if session exists and update metadata in a single operation
      let sessionFound = false;

      const currentMeta = await chatSessionsMetaStorage.get();
      const updatedMeta = currentMeta.map((session) => {
        if (session.id === sessionId) {
          sessionFound = true;
          return {
            ...session,
            updatedAt: getCurrentTimestamp(),
            messageCount: session.messageCount + 1,
          };
        }
        return session;
      });

      // Throw error if session wasn't found
      if (!sessionFound) {
        throw new Error(`Session with ID ${sessionId} not found`);
      }

      await chatSessionsMetaStorage.set(updatedMeta);

      // Only add the message if the session exists
      const messagesStorage = getSessionMessagesStorage(sessionId);
      const currentMessages = await messagesStorage.get();
      await messagesStorage.set([...currentMessages, newMessage]);

      return newMessage;
    },

    deleteMessage: async (
      sessionId: string,
      messageId: string
    ): Promise<void> => {
      // Get the messages storage for this session
      const messagesStorage = getSessionMessagesStorage(sessionId);

      // Get current messages to calculate the new count
      const currentMessages = await messagesStorage.get();
      const messageToDelete = currentMessages.find(
        (msg) => msg.id === messageId
      );

      if (!messageToDelete) return; // Message not found

      // Remove the message directly from the messages storage
      const filteredMessages = currentMessages.filter(
        (msg) => msg.id !== messageId
      );
      await messagesStorage.set(filteredMessages);

      // Update the session's metadata (updatedAt timestamp and messageCount)
      const currentMeta = await chatSessionsMetaStorage.get();
      const updatedMeta = currentMeta.map((session) => {
        if (session.id === sessionId) {
          return {
            ...session,
            updatedAt: getCurrentTimestamp(),
            messageCount: Math.max(0, session.messageCount - 1),
          };
        }
        return session;
      });

      await chatSessionsMetaStorage.set(updatedMeta);
    },

    storeAgentStepHistory: async (
      sessionId: string,
      task: string,
      history: string
    ): Promise<void> => {
      // Check if session exists
      const sessionsMeta = await chatSessionsMetaStorage.get();
      const sessionMeta = sessionsMeta.find(
        (session) => session.id === sessionId
      );
      if (!sessionMeta) {
        throw new Error(`Session with ID ${sessionId} not found`);
      }

      const agentStepHistoryStorage = getSessionAgentStepHistoryStorage(
        sessionId
      );
      await agentStepHistoryStorage.set({
        task,
        history,
        timestamp: getCurrentTimestamp(),
      });
    },

    loadAgentStepHistory: async (
      sessionId: string
    ): Promise<ChatAgentStepHistory | null> => {
      const agentStepHistoryStorage = getSessionAgentStepHistoryStorage(
        sessionId
      );
      const history = await agentStepHistoryStorage.get();
      if (
        !history ||
        !history.task ||
        !history.timestamp ||
        history.history === '' ||
        history.history === '[]'
      )
        return null;
      return history;
    },
  };
}

// Export the storage instance for direct use
export const chatHistoryStore = createChatHistoryStorage();
