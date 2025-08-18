// Enhanced agent status component showing real-time capabilities and system status
import React, { useState, useEffect, useCallback } from 'react';
import { createLogger } from './utils/logger';

const logger = createLogger('AgentStatus');

interface AgentCapabilities {
  functionCalling: boolean;
  streaming: boolean;
  toolCount: number;
  parallelExecution: boolean;
  errorRecovery: boolean;
}

interface AgentMetrics {
  uptime: number;
  requestsProcessed: number;
  averageResponseTime: number;
  errorRate: number;
  activeConnections: number;
}

interface SystemStatus {
  llmStatus: 'online' | 'offline' | 'degraded';
  networkStatus: 'connected' | 'disconnected' | 'slow';
  memoryUsage: number;
  cpuUsage: number;
}

interface AgentStatusProps {
  onRefresh?: () => void;
  onSettings?: () => void;
  className?: string;
}

export const AgentStatus: React.FC<AgentStatusProps> = ({
  onRefresh,
  onSettings,
  className = '',
}) => {
  const [capabilities, setCapabilities] = useState<AgentCapabilities>({
    functionCalling: false,
    streaming: false,
    toolCount: 0,
    parallelExecution: false,
    errorRecovery: false,
  });

  const [metrics, setMetrics] = useState<AgentMetrics>({
    uptime: 0,
    requestsProcessed: 0,
    averageResponseTime: 0,
    errorRate: 0,
    activeConnections: 0,
  });

  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    llmStatus: 'offline',
    networkStatus: 'disconnected',
    memoryUsage: 0,
    cpuUsage: 0,
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const [error, setError] = useState<string | null>(null);

  // Fetch agent status
  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Simulate API call to get agent status
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Mock data - in production, this would come from the actual agent
      const mockCapabilities: AgentCapabilities = {
        functionCalling: true,
        streaming: true,
        toolCount: 18,
        parallelExecution: true,
        errorRecovery: true,
      };

      const mockMetrics: AgentMetrics = {
        uptime: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
        requestsProcessed: 1247,
        averageResponseTime: 850,
        errorRate: 0.02,
        activeConnections: 3,
      };

      const mockSystemStatus: SystemStatus = {
        llmStatus: 'online',
        networkStatus: 'connected',
        memoryUsage: 45,
        cpuUsage: 23,
      };

      setCapabilities(mockCapabilities);
      setMetrics(mockMetrics);
      setSystemStatus(mockSystemStatus);
      setLastUpdate(Date.now());

      logger.info('Agent status updated', {
        mockCapabilities,
        mockMetrics,
        mockSystemStatus,
      });
    } catch (err) {
      const errorMessage = `Failed to fetch agent status: ${
        err instanceof Error ? err.message : String(err)
      }`;
      setError(errorMessage);
      logger.error('Status fetch error', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial status fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchStatus]);

  const formatUptime = (uptime: number): string => {
    const hours = Math.floor(uptime / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const formatResponseTime = (time: number): string => {
    return `${time}ms`;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'online':
      case 'connected':
        return 'agent-status-success';
      case 'degraded':
      case 'slow':
        return 'agent-status-warning';
      case 'offline':
      case 'disconnected':
        return 'agent-status-error';
      default:
        return 'agent-status-info';
    }
  };

  const getCapabilityIcon = (enabled: boolean) => {
    return enabled ? (
      <span className="text-green-500">✓</span>
    ) : (
      <span className="text-yellow-500">⚠</span>
    );
  };

  const handleManualRefresh = () => {
    fetchStatus();
    onRefresh?.();
  };

  return (
    <div className={`agent-card agent-p-4 ${className}`}>
      {error && (
        <div className="agent-mb-4 agent-p-3 agent-border agent-status-warning">
          <div className="agent-flex agent-gap-2">
            <span className="text-yellow-600 dark:text-yellow-400">⚠</span>
            <div className="agent-flex-1">
              <div className="agent-font-medium agent-text-title">Status Update Failed</div>
              <div className="agent-text-sm agent-text-body">{error}</div>
            </div>
            <button 
              onClick={handleManualRefresh}
              className="agent-button agent-button-secondary"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="agent-card">
        {/* Header */}
        <div className="agent-header">
          <div className="agent-flex agent-gap-2">
            <span className="text-blue-500">⚡</span>
            <span className="agent-font-semibold agent-text-title">Agent Status</span>
            {isLoading && (
              <span className="agent-spin">⟳</span>
            )}
          </div>
          <div className="agent-flex agent-gap-2">
            <button
              onClick={handleManualRefresh}
              disabled={isLoading}
              className="agent-icon-button"
              title="Refresh Status"
            >
              {isLoading ? (
                <span className="agent-spin">⟳</span>
              ) : (
                <span>⟳</span>
              )}
            </button>
            <button
              onClick={onSettings}
              className="agent-icon-button"
              title="Settings"
            >
              ⚙️
            </button>
          </div>
        </div>

        <div className="agent-content">
          {/* System Status Overview */}
          <div className="grid grid-cols-3 gap-4 agent-mb-6">
            <div className="agent-p-3 agent-bg-secondary agent-border agent-flex-center">
              <div className="agent-flex agent-gap-1 agent-mb-2 agent-text-sm agent-font-medium agent-text-muted">
                <span>🌐</span>
                <span>LLM Status</span>
              </div>
              <span className={`agent-status ${getStatusColor(systemStatus.llmStatus)}`}>
                {systemStatus.llmStatus.toUpperCase()}
              </span>
            </div>
            <div className="agent-p-3 agent-bg-secondary agent-border agent-flex-center">
              <div className="agent-flex agent-gap-1 agent-mb-2 agent-text-sm agent-font-medium agent-text-muted">
                <span>⚡</span>
                <span>Network</span>
              </div>
              <span className={`agent-status ${getStatusColor(systemStatus.networkStatus)}`}>
                {systemStatus.networkStatus.toUpperCase()}
              </span>
            </div>
            <div className="agent-p-3 agent-bg-secondary agent-border agent-flex-center">
              <div className="agent-flex agent-gap-1 agent-mb-2 agent-text-sm agent-font-medium agent-text-muted">
                <span>ℹ️</span>
                <span>Uptime</span>
              </div>
              <div className="agent-text-base agent-font-semibold agent-text-title">
                {formatUptime(metrics.uptime)}
              </div>
            </div>
          </div>

          {/* Capabilities */}
          <div className="mb-6">
            <h4 className="text-base font-medium text-gray-900 dark:text-white mb-4">Capabilities</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getCapabilityIcon(capabilities.functionCalling)}
                  <span className="text-sm text-gray-700 dark:text-gray-300">Function Calling</span>
                </div>
                <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
                  capabilities.functionCalling 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' 
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                }`}>
                  {capabilities.functionCalling ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getCapabilityIcon(capabilities.streaming)}
                  <span className="text-sm text-gray-700 dark:text-gray-300">Streaming Responses</span>
                </div>
                <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
                  capabilities.streaming 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' 
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                }`}>
                  {capabilities.streaming ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getCapabilityIcon(capabilities.parallelExecution)}
                  <span className="text-sm text-gray-700 dark:text-gray-300">Parallel Execution</span>
                </div>
                <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
                  capabilities.parallelExecution 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' 
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                }`}>
                  {capabilities.parallelExecution ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getCapabilityIcon(capabilities.errorRecovery)}
                  <span className="text-sm text-gray-700 dark:text-gray-300">Error Recovery</span>
                </div>
                <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
                  capabilities.errorRecovery 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' 
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                }`}>
                  {capabilities.errorRecovery ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
            <div className="mt-4">
              <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-blue-500">⚡</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">Available Tools</span>
                </div>
                <span className="inline-block px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 rounded-full">
                  {capabilities.toolCount}
                </span>
              </div>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="mb-6">
            <h4 className="text-base font-medium text-gray-900 dark:text-white mb-4">Performance Metrics</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 text-center">
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">Requests Processed</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {metrics.requestsProcessed.toLocaleString()}
                </div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 text-center">
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">Avg Response Time</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatResponseTime(metrics.averageResponseTime)}
                </div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 text-center">
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">Error Rate</div>
                <div className="flex items-center justify-center">
                  <div className="relative w-10 h-10">
                    <svg className="w-10 h-10 transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth="3"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke={metrics.errorRate > 0.05 ? '#ef4444' : '#10b981'}
                        strokeWidth="3"
                        strokeDasharray={`${metrics.errorRate * 100}, 100`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-medium text-gray-900 dark:text-white">
                        {(metrics.errorRate * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 text-center">
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">Active Connections</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {metrics.activeConnections}
                </div>
              </div>
            </div>
          </div>

          {/* System Resources */}
          <div>
            <h4 className="text-base font-medium text-gray-900 dark:text-white mb-4">System Resources</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">Memory Usage</div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mb-2">
                  <div 
                    className={`h-2 rounded-full ${
                      systemStatus.memoryUsage > 80 
                        ? 'bg-red-500' 
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${systemStatus.memoryUsage}%` }}
                  />
                </div>
                <div className="text-sm font-medium text-gray-900 dark:text-white text-center">
                  {systemStatus.memoryUsage}%
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">CPU Usage</div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mb-2">
                  <div 
                    className={`h-2 rounded-full ${
                      systemStatus.cpuUsage > 80 
                        ? 'bg-red-500' 
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${systemStatus.cpuUsage}%` }}
                  />
                </div>
                <div className="text-sm font-medium text-gray-900 dark:text-white text-center">
                  {systemStatus.cpuUsage}%
                </div>
              </div>
            </div>
          </div>

          {/* Last Update Info */}
          <div className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
            Last updated: {new Date(lastUpdate).toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
};

// Hook for managing agent status
export function useAgentStatus(autoRefresh: boolean = true) {
  const [status, setStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Mock status data
      const mockStatus = {
        capabilities: {
          functionCalling: true,
          streaming: true,
          toolCount: 18,
          parallelExecution: true,
          errorRecovery: true,
        },
        metrics: {
          uptime: Date.now() - 2 * 60 * 60 * 1000,
          requestsProcessed: 1247,
          averageResponseTime: 850,
          errorRate: 0.02,
          activeConnections: 3,
        },
        systemStatus: {
          llmStatus: 'online',
          networkStatus: 'connected',
          memoryUsage: 45,
          cpuUsage: 23,
        },
      };

      setStatus(mockStatus);
    } catch (err) {
      const errorMessage = `Failed to fetch status: ${
        err instanceof Error ? err.message : String(err)
      }`;
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();

    if (autoRefresh) {
      const interval = setInterval(refreshStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [refreshStatus, autoRefresh]);

  return {
    status,
    isLoading,
    error,
    refreshStatus,
  };
}

