import { createStorage } from './storage/storage';
import { Message } from '@/ui/views/Agent/types/message';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ChatHistory');

// Enhanced session metadata with more features
export interface ChatSessionMetadata {
  id: string;
  title: string;
  createdAt: number;
  lastUpdated: number;
  messageCount: number;
  stepCount: number;
  isBookmarked: boolean;
  isArchived: boolean;
  tags: string[];
  summary?: string;
  firstMessage?: string;
  lastMessage?: string;
}

// Represents a single step in an agent's execution history
export interface AgentStep {
  id: string;
  action: string;
  status: 'completed' | 'failed' | 'in_progress' | 'pending';
  timestamp: number;
  duration?: number;
  details: Record<string, any>;
  error?: string;
  result?: any;
}

// Enhanced session structure
export interface ChatSession {
  id: string;
  messages: Message[];
  agentSteps: AgentStep[];
  metadata: ChatSessionMetadata;
}

// Search and filter options
export interface ChatHistoryFilter {
  query?: string;
  tags?: string[];
  dateRange?: {
    start: number;
    end: number;
  };
  isBookmarked?: boolean;
  isArchived?: boolean;
  hasSteps?: boolean;
}

// Sort options
export interface SortOptions {
  field: 'createdAt' | 'lastUpdated' | 'title' | 'messageCount';
  direction: 'asc' | 'desc';
}

// Legacy session format for backward compatibility
interface LegacyChatSession {
  id: string;
  messages: Message[];
  createdAt: number;
  lastMessage?: string;
}

// Session manager interface for session order management
interface SessionManager {
  currentSessionId: string | null;
  sessionOrder: string[];
  lastCleanup: number;
}

const chatHistory = createStorage<Record<string, ChatSession>>(
  'chat_history',
  {}
);
const sessionManager = createStorage<SessionManager>('session_manager', {
  currentSessionId: null,
  sessionOrder: [],
  lastCleanup: Date.now(),
});

// Enhanced chat history store with session management
export const chatHistoryStore = {
  // Session management methods
  async sessionExists(sessionId: string): Promise<boolean> {
    try {
      const history = await chatHistory.get();
      return !!history[sessionId];
    } catch (error) {
      logger.error('ChatHistory', 'Failed to check session existence', error);
      return false;
    }
  },

  async createSession(sessionId?: string, title?: string): Promise<string> {
    const actualSessionId =
      sessionId ||
      `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const manager = await sessionManager.get();

    const session: ChatSession = {
      id: actualSessionId,
      messages: [],
      agentSteps: [],
      metadata: {
        id: actualSessionId,
        title: title || 'New Chat',
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        messageCount: 0,
        stepCount: 0,
        isBookmarked: false,
        isArchived: false,
        tags: [],
      },
    };

    const history = await chatHistory.get();
    history[actualSessionId] = session;
    await chatHistory.set(history);

    // Update session order
    manager.currentSessionId = actualSessionId;
    manager.sessionOrder = [
      actualSessionId,
      ...manager.sessionOrder.filter((id) => id !== actualSessionId),
    ];
    await sessionManager.set(manager);

    logger.info('ChatHistory', 'Session created', {
      sessionId: actualSessionId,
    });
    return actualSessionId;
  },

  async getSession(sessionId: string): Promise<Message[]> {
    try {
      const history = await chatHistory.get();
      const session = history[sessionId];
      return session?.messages || [];
    } catch (error) {
      logger.error('ChatHistory', 'Failed to get session', error);
      return [];
    }
  },

  async getFullSession(sessionId: string): Promise<ChatSession | null> {
    try {
      const history = await chatHistory.get();
      return history[sessionId] || null;
    } catch (error) {
      logger.error('ChatHistory', 'Failed to get full session', error);
      return null;
    }
  },

  async addMessage(sessionId: string, message: Message) {
    try {
      await this.addMessageToSession(sessionId, message);
    } catch (error) {
      // Fallback to legacy format for compatibility
      const history = await chatHistory.get();
      if (!history[sessionId]) {
        // Create legacy session format
        const legacySession: ChatSession = {
          id: sessionId,
          messages: [],
          agentSteps: [],
          metadata: {
            id: sessionId,
            title: message.content.substring(0, 50) || 'New Chat',
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            messageCount: 0,
            stepCount: 0,
            isBookmarked: false,
            isArchived: false,
            tags: [],
          },
        };
        history[sessionId] = legacySession;
        await chatHistory.set(history);
      }
      const session = history[sessionId];
      session.messages.push(message);
      session.metadata.messageCount = session.messages.length;
      session.metadata.lastUpdated = Date.now();
      // Update first/last message
      if (session.messages.length === 1) {
        session.metadata.firstMessage = message.content.substring(0, 100);
      }
      session.metadata.lastMessage = message.content.substring(0, 100);
      // Auto-generate title from first user message if not set
      if (session.metadata.title === 'New Chat' && message.actor === 'user') {
        session.metadata.title =
          message.content.substring(0, 50) +
          (message.content.length > 50 ? '...' : '');
      }
      await chatHistory.set(history);
      logger.debug('ChatHistory', 'Message added to legacy session', {
        sessionId,
        messageActor: message.actor,
      });
    }
  },

  async addMessageToSession(
    sessionId: string,
    message: Message
  ): Promise<void> {
    const history = await chatHistory.get();
    if (!history[sessionId]) {
      throw new Error('Session not found');
    }
    const session = history[sessionId];
    session.messages.push(message);
    session.metadata.messageCount = session.messages.length;
    session.metadata.lastUpdated = Date.now();
    // Update first/last message
    if (session.messages.length === 1) {
      session.metadata.firstMessage = message.content.substring(0, 100);
    }
    session.metadata.lastMessage = message.content.substring(0, 100);
    // Auto-generate title from first user message if not set
    if (session.metadata.title === 'New Chat' && message.actor === 'user') {
      session.metadata.title =
        message.content.substring(0, 50) +
        (message.content.length > 50 ? '...' : '');
    }
    await chatHistory.set(history);
    logger.debug('ChatHistory', 'Message added to session', {
      sessionId,
      messageActor: message.actor,
    });
  },

  async addAgentStep(sessionId: string, step: AgentStep): Promise<void> {
    const history = await chatHistory.get();
    if (!history[sessionId]) {
      throw new Error('Session not found');
    }
    const session = history[sessionId];
    session.agentSteps.push(step);
    session.metadata.stepCount = session.agentSteps.length;
    session.metadata.lastUpdated = Date.now();
    await chatHistory.set(history);
    logger.debug('ChatHistory', 'Agent step added', {
      sessionId,
      stepAction: step.action,
    });
  },

  async updateSessionMetadata(
    sessionId: string,
    metadata: Partial<ChatSessionMetadata>
  ): Promise<void> {
    const history = await chatHistory.get();
    if (!history[sessionId]) {
      throw new Error('Session not found');
    }
    const session = history[sessionId];
    session.metadata = { ...session.metadata, ...metadata };
    session.metadata.lastUpdated = Date.now();
    await chatHistory.set(history);
    logger.debug('ChatHistory', 'Session metadata updated', { sessionId });
  },

  async deleteSession(sessionId: string): Promise<void> {
    const history = await chatHistory.get();
    delete history[sessionId];
    await chatHistory.set(history);
    // Update session order
    const manager = await sessionManager.get();
    manager.sessionOrder = manager.sessionOrder.filter(
      (id) => id !== sessionId
    );
    if (manager.currentSessionId === sessionId) {
      manager.currentSessionId = null;
    }
    await sessionManager.set(manager);
    logger.info('ChatHistory', 'Session deleted', { sessionId });
  },

  async getAllSessions(): Promise<ChatSession[]> {
    try {
      const history = await chatHistory.get();
      return Object.values(history)
        .filter((session) => !session.metadata.isArchived)
        .sort((a, b) => b.metadata.lastUpdated - a.metadata.lastUpdated);
    } catch (error) {
      logger.error('ChatHistory', 'Failed to get all sessions', error);
      return [];
    }
  },

  async getArchivedSessions(): Promise<ChatSession[]> {
    try {
      const history = await chatHistory.get();
      return Object.values(history)
        .filter((session) => session.metadata.isArchived)
        .sort((a, b) => b.metadata.lastUpdated - a.metadata.lastUpdated);
    } catch (error) {
      logger.error('ChatHistory', 'Failed to get archived sessions', error);
      return [];
    }
  },

  async getBookmarkedSessions(): Promise<ChatSession[]> {
    try {
      const history = await chatHistory.get();
      return Object.values(history)
        .filter((session) => session.metadata.isBookmarked)
        .sort((a, b) => b.metadata.lastUpdated - a.metadata.lastUpdated);
    } catch (error) {
      logger.error('ChatHistory', 'Failed to get bookmarked sessions', error);
      return [];
    }
  },

  async searchSessions(filter: ChatHistoryFilter): Promise<ChatSession[]> {
    try {
      const history = await chatHistory.get();
      let sessions = Object.values(history);

      // Apply text search filter
      if (filter.query) {
        const query = filter.query.toLowerCase();
        sessions = sessions.filter(
          (session) =>
            session.metadata.title.toLowerCase().includes(query) ||
            session.metadata.firstMessage?.toLowerCase().includes(query) ||
            session.metadata.lastMessage?.toLowerCase().includes(query) ||
            session.messages.some((msg) =>
              msg.content.toLowerCase().includes(query)
            )
        );
      }

      // Apply tag filter
      if (filter.tags && filter.tags.length > 0) {
        sessions = sessions.filter((session) =>
          filter.tags!.some((tag) => session.metadata.tags.includes(tag))
        );
      }

      // Apply date range filter
      if (filter.dateRange) {
        sessions = sessions.filter(
          (session) =>
            session.metadata.createdAt >= filter.dateRange!.start &&
            session.metadata.createdAt <= filter.dateRange!.end
        );
      }

      // Apply bookmark filter
      if (filter.isBookmarked !== undefined) {
        sessions = sessions.filter(
          (session) => session.metadata.isBookmarked === filter.isBookmarked
        );
      }

      // Apply archived filter
      if (filter.isArchived !== undefined) {
        sessions = sessions.filter(
          (session) => session.metadata.isArchived === filter.isArchived
        );
      }

      // Apply has steps filter
      if (filter.hasSteps !== undefined) {
        sessions = sessions.filter(
          (session) => session.agentSteps.length > 0 === filter.hasSteps
        );
      }

      return sessions.sort(
        (a, b) => b.metadata.lastUpdated - a.metadata.lastUpdated
      );
    } catch (error) {
      logger.error('ChatHistory', 'Failed to search sessions', error);
      return [];
    }
  },

  async getSessionsWithSteps(): Promise<ChatSession[]> {
    try {
      const history = await chatHistory.get();
      return Object.values(history)
        .filter((session) => session.agentSteps.length > 0)
        .sort((a, b) => b.metadata.lastUpdated - a.metadata.lastUpdated);
    } catch (error) {
      logger.error('ChatHistory', 'Failed to get sessions with steps', error);
      return [];
    }
  },

  async getCurrentSession(): Promise<ChatSession | null> {
    const manager = await sessionManager.get();
    if (!manager.currentSessionId) return null;

    const history = await chatHistory.get();
    return history[manager.currentSessionId] || null;
  },

  async setCurrentSession(sessionId: string): Promise<void> {
    const manager = await sessionManager.get();
    manager.currentSessionId = sessionId;
    // Update session order
    manager.sessionOrder = [
      sessionId,
      ...manager.sessionOrder.filter((id) => id !== sessionId),
    ];
    await sessionManager.set(manager);
    logger.debug('ChatHistory', 'Current session set', { sessionId });
  },

  async getSessionStats(): Promise<{
    totalSessions: number;
    totalMessages: number;
    totalSteps: number;
    bookmarkedSessions: number;
    archivedSessions: number;
    recentActivity: number;
  }> {
    try {
      const history = await chatHistory.get();
      const sessions = Object.values(history);
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

      return {
        totalSessions: sessions.length,
        totalMessages: sessions.reduce(
          (sum, session) => sum + session.metadata.messageCount,
          0
        ),
        totalSteps: sessions.reduce(
          (sum, session) => sum + session.metadata.stepCount,
          0
        ),
        bookmarkedSessions: sessions.filter((s) => s.metadata.isBookmarked)
          .length,
        archivedSessions: sessions.filter((s) => s.metadata.isArchived).length,
        recentActivity: sessions.filter(
          (s) => s.metadata.lastUpdated > oneDayAgo
        ).length,
      };
    } catch (error) {
      logger.error('ChatHistory', 'Failed to get session stats', error);
      return {
        totalSessions: 0,
        totalMessages: 0,
        totalSteps: 0,
        bookmarkedSessions: 0,
        archivedSessions: 0,
        recentActivity: 0,
      };
    }
  },

  async cleanupOldSessions(
    maxAge: number = 30 * 24 * 60 * 60 * 1000
  ): Promise<number> {
    try {
      const history = await chatHistory.get();
      const now = Date.now();
      const cutoffTime = now - maxAge;
      let deletedCount = 0;

      for (const [sessionId, session] of Object.entries(history)) {
        if (
          session.metadata.lastUpdated < cutoffTime &&
          !session.metadata.isBookmarked
        ) {
          delete history[sessionId];
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        await chatHistory.set(history);
        // Update session order
        const manager = await sessionManager.get();
        manager.sessionOrder = manager.sessionOrder.filter(
          (sessionId) => history[sessionId] !== undefined
        );
        if (manager.currentSessionId && !history[manager.currentSessionId]) {
          manager.currentSessionId = null;
        }
        await sessionManager.set(manager);
      }

      logger.info('ChatHistory', 'Old sessions cleaned up', {
        deletedCount,
        maxAge,
      });
      return deletedCount;
    } catch (error) {
      logger.error('ChatHistory', 'Failed to cleanup old sessions', error);
      return 0;
    }
  },

  async clearAllHistory(): Promise<void> {
    await this.clearAllHistoryEnhanced();
  },

  // Legacy compatibility methods
  async getHistory(): Promise<Record<string, LegacyChatSession>> {
    const history = await chatHistory.get();
    const legacyHistory: Record<string, LegacyChatSession> = {};
    for (const [sessionId, session] of Object.entries(history)) {
      legacyHistory[sessionId] = {
        id: session.id,
        messages: session.messages,
        createdAt: session.metadata.createdAt,
        lastMessage: session.metadata.lastMessage,
      };
    }
    return legacyHistory;
  },

  async clearAllHistoryEnhanced(): Promise<void> {
    await chatHistory.set({});
    const manager = await sessionManager.get();
    manager.currentSessionId = null;
    manager.sessionOrder = [];
    await sessionManager.set(manager);
    logger.info('ChatHistory', 'All history cleared');
  },

  // Method to store agent steps (alias for addAgentStep)
  async storeAgentStep(sessionId: string, step: AgentStep): Promise<void> {
    return this.addAgentStep(sessionId, step);
  },

  // Method to update agent steps
  async updateAgentStep(
    sessionId: string,
    stepId: string,
    updates: Partial<AgentStep>
  ): Promise<void> {
    const history = await chatHistory.get();
    if (!history[sessionId]) {
      throw new Error('Session not found');
    }
    const session = history[sessionId];
    const stepIndex = session.agentSteps.findIndex(
      (step) => step.id === stepId
    );
    if (stepIndex === -1) {
      throw new Error('Step not found');
    }
    session.agentSteps[stepIndex] = {
      ...session.agentSteps[stepIndex],
      ...updates,
    };
    session.metadata.lastUpdated = Date.now();
    await chatHistory.set(history);
    logger.debug('ChatHistory', 'Agent step updated', { sessionId, stepId });
  },

  // Method to get sessions metadata (legacy compatibility)
  async getSessionsMetadata(): Promise<ChatSessionMetadata[]> {
    try {
      const history = await chatHistory.get();
      return Object.values(history).map((session) => session.metadata);
    } catch (error) {
      logger.error('ChatHistory', 'Failed to get sessions metadata', error);
      return [];
    }
  },
};
