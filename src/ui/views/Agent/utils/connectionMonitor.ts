/**
 * Agent Connection Monitoring Utilities
 *
 * Provides comprehensive monitoring and debugging tools for the Agent sidebar connection.
 * This module helps track connection health, performance metrics, and provides diagnostic tools.
 */

import { logger } from './logger';

export interface ConnectionMetrics {
  connectTime: number;
  disconnectCount: number;
  messagesSent: number;
  messagesReceived: number;
  lastHeartbeat: number;
  errors: string[];
  connectionAttempts: number;
  averageResponseTime: number;
  lastResponseTime: number;
}

export interface ConnectionEvent {
  timestamp: number;
  type:
    | 'connect'
    | 'disconnect'
    | 'message_sent'
    | 'message_received'
    | 'error'
    | 'heartbeat';
  details?: any;
}

export class ConnectionMonitor {
  private metrics: ConnectionMetrics;
  private events: ConnectionEvent[] = [];
  private responseTimeTracker = new Map<string, number>();
  private maxEvents = 100; // Keep last 100 events for debugging

  constructor() {
    this.metrics = {
      connectTime: 0,
      disconnectCount: 0,
      messagesSent: 0,
      messagesReceived: 0,
      lastHeartbeat: 0,
      errors: [],
      connectionAttempts: 0,
      averageResponseTime: 0,
      lastResponseTime: 0,
    };
  }

  /**
   * Log a connection event with automatic metrics update
   */
  logEvent(type: ConnectionEvent['type'], details?: any): void {
    const timestamp = Date.now();

    // Add to events log
    this.events.push({ timestamp, type, details });

    // Keep only the most recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Update metrics based on event type
    switch (type) {
      case 'connect':
        this.metrics.connectTime = timestamp;
        this.metrics.connectionAttempts += 1;
        break;
      case 'disconnect':
        this.metrics.disconnectCount += 1;
        break;
      case 'message_sent':
        this.metrics.messagesSent += 1;
        if (details?.messageId) {
          this.responseTimeTracker.set(details.messageId, timestamp);
        }
        break;
      case 'message_received':
        this.metrics.messagesReceived += 1;
        if (
          details?.responseToId &&
          this.responseTimeTracker.has(details.responseToId)
        ) {
          const sentTime = this.responseTimeTracker.get(details.responseToId)!;
          const responseTime = timestamp - sentTime;
          this.metrics.lastResponseTime = responseTime;
          this.updateAverageResponseTime(responseTime);
          this.responseTimeTracker.delete(details.responseToId);
        }
        break;
      case 'heartbeat':
        this.metrics.lastHeartbeat = timestamp;
        break;
      case 'error':
        if (details?.error) {
          this.metrics.errors.push(
            `${new Date(timestamp).toISOString()}: ${details.error}`
          );
          // Keep only the last 20 errors
          if (this.metrics.errors.length > 20) {
            this.metrics.errors = this.metrics.errors.slice(-20);
          }
        }
        break;
    }
  }

  /**
   * Update average response time using exponential moving average
   */
  private updateAverageResponseTime(newTime: number): void {
    if (this.metrics.averageResponseTime === 0) {
      this.metrics.averageResponseTime = newTime;
    } else {
      // Use 0.1 alpha for smoothing
      this.metrics.averageResponseTime =
        this.metrics.averageResponseTime * 0.9 + newTime * 0.1;
    }
  }

  /**
   * Get current connection metrics
   */
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  /**
   * Get recent events (last N events)
   */
  getRecentEvents(count = 20): ConnectionEvent[] {
    return this.events.slice(-count);
  }

  /**
   * Get connection health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check for recent errors
    const recentErrors = this.metrics.errors.filter((error) => {
      const errorTime = new Date(error.split(':')[0]).getTime();
      return Date.now() - errorTime < 5 * 60 * 1000; // Last 5 minutes
    });

    if (recentErrors.length > 3) {
      status = 'critical';
      issues.push('Multiple connection errors in the last 5 minutes');
      recommendations.push(
        'Check network connectivity and extension permissions'
      );
    } else if (recentErrors.length > 0) {
      status = 'warning';
      issues.push('Recent connection errors detected');
    }

    // Check heartbeat status
    const timeSinceLastHeartbeat = Date.now() - this.metrics.lastHeartbeat;
    if (timeSinceLastHeartbeat > 60000) {
      // 1 minute
      if (status !== 'critical') status = 'warning';
      issues.push('No recent heartbeat detected');
      recommendations.push('Connection may be unstable');
    }

    // Check disconnect rate
    if (this.metrics.disconnectCount > 5) {
      if (status !== 'critical') status = 'warning';
      issues.push('High number of disconnections');
      recommendations.push('Consider restarting the extension');
    }

    // Check response times
    if (this.metrics.averageResponseTime > 5000) {
      // 5 seconds
      if (status !== 'critical') status = 'warning';
      issues.push('High average response time');
      recommendations.push('Performance may be degraded');
    }

    return { status, issues, recommendations };
  }

  /**
   * Generate a diagnostic report
   */
  generateDiagnosticReport(): string {
    const health = this.getHealthStatus();
    const recentEvents = this.getRecentEvents(10);

    return `
=== Agent Connection Diagnostic Report ===
Generated: ${new Date().toISOString()}

Health Status: ${health.status.toUpperCase()}
${
  health.issues.length > 0
    ? 'Issues: ' + health.issues.join(', ')
    : 'No issues detected'
}
${
  health.recommendations.length > 0
    ? 'Recommendations: ' + health.recommendations.join(', ')
    : ''
}

=== Connection Metrics ===
Connection Attempts: ${this.metrics.connectionAttempts}
Messages Sent: ${this.metrics.messagesSent}
Messages Received: ${this.metrics.messagesReceived}
Disconnect Count: ${this.metrics.disconnectCount}
Average Response Time: ${Math.round(this.metrics.averageResponseTime)}ms
Last Response Time: ${this.metrics.lastResponseTime}ms
Last Heartbeat: ${
      this.metrics.lastHeartbeat
        ? new Date(this.metrics.lastHeartbeat).toISOString()
        : 'Never'
    }
Error Count: ${this.metrics.errors.length}

=== Recent Events (Last 10) ===
${recentEvents
  .map(
    (event) =>
      `${new Date(
        event.timestamp
      ).toISOString()} - ${event.type.toUpperCase()}${
        event.details ? ': ' + JSON.stringify(event.details) : ''
      }`
  )
  .join('\n')}

=== Recent Errors ===
${this.metrics.errors.slice(-5).join('\n') || 'No recent errors'}

=== End Report ===
    `.trim();
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.metrics = {
      connectTime: 0,
      disconnectCount: 0,
      messagesSent: 0,
      messagesReceived: 0,
      lastHeartbeat: 0,
      errors: [],
      connectionAttempts: 0,
      averageResponseTime: 0,
      lastResponseTime: 0,
    };
    this.events = [];
    this.responseTimeTracker.clear();
  }

  /**
   * Export metrics and events for external analysis
   */
  exportData(): {
    metrics: ConnectionMetrics;
    events: ConnectionEvent[];
    generatedAt: string;
  } {
    return {
      metrics: this.getMetrics(),
      events: [...this.events],
      generatedAt: new Date().toISOString(),
    };
  }
}

// Global monitor instance
export const connectionMonitor = new ConnectionMonitor();

/**
 * Helper function to automatically track message responses
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Performance testing utilities
 */
export class ConnectionTester {
  private monitor: ConnectionMonitor;

  constructor(monitor: ConnectionMonitor) {
    this.monitor = monitor;
  }

  /**
   * Test connection latency by sending ping messages
   */
  async testLatency(
    port: chrome.runtime.Port,
    iterations = 5
  ): Promise<{
    averageLatency: number;
    minLatency: number;
    maxLatency: number;
    results: number[];
  }> {
    const results: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      const messageId = generateMessageId();

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({
            averageLatency: -1,
            minLatency: -1,
            maxLatency: -1,
            results: [-1],
          });
        }, 5000);

        const listener = (message: any) => {
          if (
            message.type === 'ping_response' &&
            message.messageId === messageId
          ) {
            const latency = Date.now() - startTime;
            results.push(latency);
            clearTimeout(timeout);
            port.onMessage.removeListener(listener);

            if (results.length === iterations) {
              const avgLatency =
                results.reduce((a, b) => a + b, 0) / results.length;
              resolve({
                averageLatency: avgLatency,
                minLatency: Math.min(...results),
                maxLatency: Math.max(...results),
                results,
              });
            }
          }
        };

        port.onMessage.addListener(listener);
        port.postMessage({ type: 'ping', messageId, timestamp: startTime });
      });
    }

    return { averageLatency: 0, minLatency: 0, maxLatency: 0, results: [] };
  }

  /**
   * Stress test the connection with multiple rapid messages
   */
  async stressTest(
    port: chrome.runtime.Port,
    messageCount = 10,
    interval = 100
  ): Promise<{
    totalTime: number;
    messagesSucceeded: number;
    messagesFailed: number;
    averageInterval: number;
  }> {
    const startTime = Date.now();
    let succeeded = 0;
    let failed = 0;
    const intervals: number[] = [];
    let lastMessageTime = startTime;

    for (let i = 0; i < messageCount; i++) {
      try {
        const messageTime = Date.now();
        intervals.push(messageTime - lastMessageTime);
        lastMessageTime = messageTime;

        port.postMessage({
          type: 'stress_test',
          messageId: generateMessageId(),
          sequenceNumber: i,
          timestamp: messageTime,
        });
        succeeded++;

        if (i < messageCount - 1) {
          await new Promise((resolve) => setTimeout(resolve, interval));
        }
      } catch (error) {
        failed++;
        this.monitor.logEvent('error', {
          error: `Stress test message ${i} failed: ${error}`,
        });
      }
    }

    const totalTime = Date.now() - startTime;
    const averageInterval =
      intervals.reduce((a, b) => a + b, 0) / intervals.length;

    return {
      totalTime,
      messagesSucceeded: succeeded,
      messagesFailed: failed,
      averageInterval,
    };
  }
}
