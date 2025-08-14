import { createLogger } from '@/utils/logger';
import {
  createStorage,
  StorageWithMetrics,
  clearAgentStorage,
} from './storage/storage';
import { MessageManager, BaseMessage } from './messageManager';
import type { ModelConfig } from './storage/agentModels';
import type { ProviderConfig } from './storage/llmProviders';

const logger = createLogger('SessionManager');

export interface SessionMetadata {
  sessionId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  taskCount: number;
  errorCount: number;
  lastActivity: number;
  agentType: 'web3' | 'automation';
  modelConfig?: ModelConfig;
  providerConfig?: ProviderConfig;
}

export interface TaskRecord {
  taskId: string;
  sessionId: string;
  task: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  result?: any;
  steps: TaskStep[];
}

export interface TaskStep {
  stepId: string;
  type: string;
  description: string;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
  details?: any;
}

export interface SessionRecord {
  metadata: SessionMetadata;
  tasks: TaskRecord[];
  messages: BaseMessage[];
  context: SessionContext;
}

export interface SessionContext {
  currentChain?: string;
  currentAddress?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  balances?: Record<string, string>;
  protocols?: Record<string, any>;
  tabId?: number;
  url?: string;
}

export interface SessionMetrics {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  failedSessions: number;
  averageSessionDuration: number;
  totalTasks: number;
  averageTasksPerSession: number;
  successRate: number;
  lastSessionTime?: number;
}

export interface SessionStorageOptions {
  maxSessions: number;
  maxSessionAge: number; // in milliseconds
  maxMessagesPerSession: number;
  enablePersistence: boolean;
  enableCompression: boolean;
}

export class SessionManager {
  private currentSession: SessionRecord | null = null;
  private sessionStorage: StorageWithMetrics<Record<string, SessionRecord>>;
  private activeSessions: Map<string, SessionRecord> = new Map();
  private options: SessionStorageOptions;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: Partial<SessionStorageOptions> = {}) {
    this.options = {
      maxSessions: 100,
      maxSessionAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      maxMessagesPerSession: 1000,
      enablePersistence: true,
      enableCompression: true,
      ...options,
    };

    this.sessionStorage = createStorage<Record<string, SessionRecord>>(
      'sessions',
      {},
      {
        isPersistant: this.options.enablePersistence,
        enableMetrics: true,
        retryAttempts: 3,
      }
    );

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Load existing sessions from storage
      const sessions = await this.sessionStorage.get();
      this.activeSessions = new Map(Object.entries(sessions));

      // Clean up expired sessions
      await this.cleanupExpiredSessions();

      // Start periodic cleanup
      this.startPeriodicCleanup();

      logger.info('SessionManager', 'Initialized successfully', {
        loadedSessions: this.activeSessions.size,
        options: this.options,
      });
    } catch (error) {
      logger.error('SessionManager', 'Failed to initialize', error);
    }
  }

  /**
   * Create a new session
   */
  async createSession(
    task: string,
    agentType: 'web3' | 'automation',
    context: SessionContext = {},
    modelConfig?: ModelConfig,
    providerConfig?: ProviderConfig
  ): Promise<string> {
    try {
      const sessionId = this.generateSessionId();
      const startTime = Date.now();

      const metadata: SessionMetadata = {
        sessionId,
        startTime,
        status: 'active',
        taskCount: 0,
        errorCount: 0,
        lastActivity: startTime,
        agentType,
        modelConfig,
        providerConfig,
      };

      const session: SessionRecord = {
        metadata,
        tasks: [],
        messages: [],
        context,
      };

      // Add initial task
      const taskId = this.generateTaskId();
      const taskRecord: TaskRecord = {
        taskId,
        sessionId,
        task,
        startTime,
        status: 'running',
        steps: [],
      };

      session.tasks.push(taskRecord);
      session.metadata.taskCount = 1;

      // Store session
      this.currentSession = session;
      this.activeSessions.set(sessionId, session);

      // Persist to storage
      await this.saveSession(session);

      logger.info('SessionManager', 'Created new session', {
        sessionId,
        agentType,
        task,
      });

      return sessionId;
    } catch (error) {
      logger.error('SessionManager', 'Failed to create session', error);
      throw error;
    }
  }

  /**
   * Get current session
   */
  getCurrentSession(): SessionRecord | null {
    return this.currentSession;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<SessionRecord | null> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (session) {
        return session;
      }

      // Try to load from storage
      const sessions = await this.sessionStorage.get();
      const storedSession = sessions[sessionId];
      if (storedSession) {
        this.activeSessions.set(sessionId, storedSession);
        return storedSession;
      }

      return null;
    } catch (error) {
      logger.error('SessionManager', 'Failed to get session', {
        sessionId,
        error,
      });
      return null;
    }
  }

  /**
   * Update session context
   */
  async updateSessionContext(
    sessionId: string,
    context: Partial<SessionContext>
  ): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      session.context = { ...session.context, ...context };
      session.metadata.lastActivity = Date.now();

      await this.saveSession(session);
      logger.debug('SessionManager', 'Updated session context', {
        sessionId,
        context,
      });
    } catch (error) {
      logger.error('SessionManager', 'Failed to update session context', error);
      throw error;
    }
  }

  /**
   * Add message to session
   */
  async addSessionMessage(
    sessionId: string,
    message: BaseMessage
  ): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      session.messages.push(message);
      session.metadata.lastActivity = Date.now();

      // Limit messages to prevent memory issues
      if (session.messages.length > this.options.maxMessagesPerSession) {
        session.messages = session.messages.slice(
          -this.options.maxMessagesPerSession
        );
      }

      await this.saveSession(session);
      logger.debug('SessionManager', 'Added message to session', {
        sessionId,
        messageType: message._getType(),
        messageLength: message.content.length,
      });
    } catch (error) {
      logger.error('SessionManager', 'Failed to add session message', error);
      throw error;
    }
  }

  /**
   * Add task step to current task
   */
  async addTaskStep(
    sessionId: string,
    step: Omit<TaskStep, 'stepId' | 'startTime'>
  ): Promise<string> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const currentTask = this.getCurrentTask(session);
      if (!currentTask) {
        throw new Error(`No active task in session ${sessionId}`);
      }

      const stepId = this.generateStepId();
      const taskStep: TaskStep = {
        ...step,
        stepId,
        startTime: Date.now(),
      };

      currentTask.steps.push(taskStep);
      session.metadata.lastActivity = Date.now();

      await this.saveSession(session);
      logger.debug('SessionManager', 'Added task step', {
        sessionId,
        taskId: currentTask.taskId,
        stepType: step.type,
      });

      return stepId;
    } catch (error) {
      logger.error('SessionManager', 'Failed to add task step', error);
      throw error;
    }
  }

  /**
   * Update task step status
   */
  async updateTaskStep(
    sessionId: string,
    stepId: string,
    status: TaskStep['status'],
    error?: string,
    details?: any
  ): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const currentTask = this.getCurrentTask(session);
      if (!currentTask) {
        throw new Error(`No active task in session ${sessionId}`);
      }

      const step = currentTask.steps.find((s) => s.stepId === stepId);
      if (!step) {
        throw new Error(`Step ${stepId} not found in session ${sessionId}`);
      }

      step.status = status;
      if (error) step.error = error;
      if (details) step.details = details;
      if (status !== 'pending' && status !== 'running') {
        step.endTime = Date.now();
      }

      session.metadata.lastActivity = Date.now();
      await this.saveSession(session);

      logger.debug('SessionManager', 'Updated task step', {
        sessionId,
        stepId,
        status,
      });
    } catch (error) {
      logger.error('SessionManager', 'Failed to update task step', error);
      throw error;
    }
  }

  /**
   * Complete current task
   */
  async completeTask(
    sessionId: string,
    result?: any,
    error?: string
  ): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const currentTask = this.getCurrentTask(session);
      if (!currentTask) {
        throw new Error(`No active task in session ${sessionId}`);
      }

      currentTask.endTime = Date.now();
      currentTask.duration = currentTask.endTime - currentTask.startTime;
      currentTask.result = result;

      if (error) {
        currentTask.status = 'failed';
        currentTask.error = error;
        session.metadata.errorCount++;
      } else {
        currentTask.status = 'completed';
      }

      session.metadata.lastActivity = Date.now();
      await this.saveSession(session);

      logger.info('SessionManager', 'Completed task', {
        sessionId,
        taskId: currentTask.taskId,
        status: currentTask.status,
        duration: currentTask.duration,
      });
    } catch (error) {
      logger.error('SessionManager', 'Failed to complete task', error);
      throw error;
    }
  }

  /**
   * Complete session
   */
  async completeSession(
    sessionId: string,
    status: SessionMetadata['status'] = 'completed'
  ): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      session.metadata.endTime = Date.now();
      session.metadata.duration =
        session.metadata.endTime - session.metadata.startTime;
      session.metadata.status = status;
      session.metadata.lastActivity = Date.now();

      // Complete any running tasks
      const runningTasks = session.tasks.filter((t) => t.status === 'running');
      for (const task of runningTasks) {
        task.endTime = session.metadata.endTime;
        task.duration = task.endTime - task.startTime;
        task.status = status === 'completed' ? 'completed' : 'cancelled';
      }

      await this.saveSession(session);

      if (this.currentSession?.metadata.sessionId === sessionId) {
        this.currentSession = null;
      }

      logger.info('SessionManager', 'Completed session', {
        sessionId,
        status,
        duration: session.metadata.duration,
        taskCount: session.tasks.length,
      });
    } catch (error) {
      logger.error('SessionManager', 'Failed to complete session', error);
      throw error;
    }
  }

  /**
   * Get all sessions
   */
  async getAllSessions(): Promise<SessionRecord[]> {
    try {
      const sessions = await this.sessionStorage.get();
      return Object.values(sessions);
    } catch (error) {
      logger.error('SessionManager', 'Failed to get all sessions', error);
      return [];
    }
  }

  /**
   * Get session metrics
   */
  async getSessionMetrics(): Promise<SessionMetrics> {
    try {
      const sessions = await this.getAllSessions();

      const totalSessions = sessions.length;
      const activeSessions = sessions.filter(
        (s) => s.metadata.status === 'active'
      ).length;
      const completedSessions = sessions.filter(
        (s) => s.metadata.status === 'completed'
      ).length;
      const failedSessions = sessions.filter(
        (s) => s.metadata.status === 'failed'
      ).length;

      const totalDuration = sessions
        .filter((s) => s.metadata.duration)
        .reduce((sum, s) => sum + (s.metadata.duration || 0), 0);

      const averageSessionDuration =
        completedSessions > 0 ? totalDuration / completedSessions : 0;

      const totalTasks = sessions.reduce((sum, s) => sum + s.tasks.length, 0);
      const averageTasksPerSession =
        totalSessions > 0 ? totalTasks / totalSessions : 0;

      const successRate =
        totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0;

      const lastSessionTime =
        sessions.length > 0
          ? Math.max(...sessions.map((s) => s.metadata.lastActivity))
          : undefined;

      return {
        totalSessions,
        activeSessions,
        completedSessions,
        failedSessions,
        averageSessionDuration,
        totalTasks,
        averageTasksPerSession,
        successRate,
        lastSessionTime,
      };
    } catch (error) {
      logger.error('SessionManager', 'Failed to get session metrics', error);
      return {
        totalSessions: 0,
        activeSessions: 0,
        completedSessions: 0,
        failedSessions: 0,
        averageSessionDuration: 0,
        totalTasks: 0,
        averageTasksPerSession: 0,
        successRate: 0,
      };
    }
  }

  /**
   * Clear all sessions
   */
  async clearAllSessions(): Promise<void> {
    try {
      logger.info('SessionManager', 'Clearing all sessions');

      this.currentSession = null;
      this.activeSessions.clear();

      await this.sessionStorage.set({});

      logger.info('SessionManager', 'All sessions cleared');
    } catch (error) {
      logger.error('SessionManager', 'Failed to clear sessions', error);
      throw error;
    }
  }

  /**
   * Export session data
   */
  async exportSession(sessionId: string): Promise<string> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const exportData = {
        session,
        exportTime: Date.now(),
        version: '1.0.0',
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      logger.error('SessionManager', 'Failed to export session', error);
      throw error;
    }
  }

  /**
   * Import session data
   */
  async importSession(sessionData: string): Promise<string> {
    try {
      const importData = JSON.parse(sessionData);

      if (!importData.session || !importData.session.metadata) {
        throw new Error('Invalid session data format');
      }

      const session = importData.session;

      // Generate new session ID to avoid conflicts
      const newSessionId = this.generateSessionId();
      session.metadata.sessionId = newSessionId;

      // Update task IDs
      session.tasks.forEach((task: TaskRecord) => {
        task.taskId = this.generateTaskId();
        task.sessionId = newSessionId;
        task.steps.forEach((step: TaskStep) => {
          step.stepId = this.generateStepId();
        });
      });

      await this.saveSession(session);
      logger.info('SessionManager', 'Imported session', {
        originalSessionId: importData.session.metadata.sessionId,
        newSessionId,
      });

      return newSessionId;
    } catch (error) {
      logger.error('SessionManager', 'Failed to import session', error);
      throw error;
    }
  }

  private async saveSession(session: SessionRecord): Promise<void> {
    try {
      const sessions = await this.sessionStorage.get();
      sessions[session.metadata.sessionId] = session;

      // Apply session limit
      const sessionIds = Object.keys(sessions);
      if (sessionIds.length > this.options.maxSessions) {
        const sortedSessions = sessionIds
          .map((id) => ({ id, time: sessions[id].metadata.lastActivity }))
          .sort((a, b) => b.time - a.time);

        const sessionsToRemove = sortedSessions.slice(this.options.maxSessions);
        sessionsToRemove.forEach(({ id }) => {
          delete sessions[id];
          this.activeSessions.delete(id);
        });
      }

      await this.sessionStorage.set(sessions);
    } catch (error) {
      logger.error('SessionManager', 'Failed to save session', error);
      throw error;
    }
  }

  private getCurrentTask(session: SessionRecord): TaskRecord | undefined {
    return session.tasks.find((t) => t.status === 'running');
  }

  private async cleanupExpiredSessions(): Promise<void> {
    try {
      const sessions = await this.sessionStorage.get();
      const now = Date.now();
      const cutoffTime = now - this.options.maxSessionAge;

      let removedCount = 0;
      Object.entries(sessions).forEach(([sessionId, session]) => {
        const typedSession = session as SessionRecord;
        if (typedSession.metadata.lastActivity < cutoffTime) {
          delete sessions[sessionId];
          this.activeSessions.delete(sessionId);
          removedCount++;
        }
      });

      if (removedCount > 0) {
        await this.sessionStorage.set(sessions);
        logger.info(
          'SessionManager',
          `Cleaned up ${removedCount} expired sessions`
        );
      }
    } catch (error) {
      logger.error(
        'SessionManager',
        'Failed to cleanup expired sessions',
        error
      );
    }
  }

  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions().catch((error) => {
        logger.error('SessionManager', 'Periodic cleanup failed', error);
      });
    }, 60 * 60 * 1000); // Every hour
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateStepId(): string {
    return `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.currentSession = null;
    this.activeSessions.clear();

    logger.info('SessionManager', 'Cleanup completed');
  }
}

// Global session manager instance
export const sessionManager = new SessionManager();
