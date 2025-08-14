// Enhanced agent status component showing real-time capabilities and system status
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Tag,
  Progress,
  Button,
  Space,
  Tooltip,
  Alert,
} from 'antd';
import {
  ApiOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SyncOutlined,
  SettingOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
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
        return 'success';
      case 'degraded':
      case 'slow':
        return 'warning';
      case 'offline':
      case 'disconnected':
        return 'error';
      default:
        return 'default';
    }
  };

  const getCapabilityIcon = (enabled: boolean) => {
    return enabled ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />;
  };

  const handleManualRefresh = () => {
    fetchStatus();
    onRefresh?.();
  };

  return (
    <div className={`agent-status ${className}`}>
      {error && (
        <Alert
          message="Status Update Failed"
          description={error}
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={handleManualRefresh}>
              Retry
            </Button>
          }
        />
      )}

      <Card
        title={
          <Space>
            <ThunderboltOutlined />
            <span>Agent Status</span>
            {isLoading && <SyncOutlined spin />}
          </Space>
        }
        extra={
          <Space>
            <Tooltip title="Refresh Status">
              <Button
                icon={<SyncOutlined />}
                size="small"
                onClick={handleManualRefresh}
                loading={isLoading}
              />
            </Tooltip>
            <Tooltip title="Settings">
              <Button
                icon={<SettingOutlined />}
                size="small"
                onClick={onSettings}
              />
            </Tooltip>
          </Space>
        }
        size="small"
      >
        {/* System Status Overview */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={8}>
            <div className="status-card">
              <div className="status-header">
                <ApiOutlined />
                <span>LLM Status</span>
              </div>
              <Tag color={getStatusColor(systemStatus.llmStatus)}>
                {systemStatus.llmStatus.toUpperCase()}
              </Tag>
            </div>
          </Col>
          <Col span={8}>
            <div className="status-card">
              <div className="status-header">
                <ThunderboltOutlined />
                <span>Network</span>
              </div>
              <Tag color={getStatusColor(systemStatus.networkStatus)}>
                {systemStatus.networkStatus.toUpperCase()}
              </Tag>
            </div>
          </Col>
          <Col span={8}>
            <div className="status-card">
              <div className="status-header">
                <InfoCircleOutlined />
                <span>Uptime</span>
              </div>
              <span className="status-value">
                {formatUptime(metrics.uptime)}
              </span>
            </div>
          </Col>
        </Row>

        {/* Capabilities */}
        <div style={{ marginBottom: 24 }}>
          <h4>Capabilities</h4>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div className="capability-item">
                <Space>
                  {getCapabilityIcon(capabilities.functionCalling)}
                  <span>Function Calling</span>
                  <Tag
                    color={capabilities.functionCalling ? 'success' : 'default'}
                  >
                    {capabilities.functionCalling ? 'Enabled' : 'Disabled'}
                  </Tag>
                </Space>
              </div>
            </Col>
            <Col span={12}>
              <div className="capability-item">
                <Space>
                  {getCapabilityIcon(capabilities.streaming)}
                  <span>Streaming Responses</span>
                  <Tag color={capabilities.streaming ? 'success' : 'default'}>
                    {capabilities.streaming ? 'Enabled' : 'Disabled'}
                  </Tag>
                </Space>
              </div>
            </Col>
            <Col span={12}>
              <div className="capability-item">
                <Space>
                  {getCapabilityIcon(capabilities.parallelExecution)}
                  <span>Parallel Execution</span>
                  <Tag
                    color={
                      capabilities.parallelExecution ? 'success' : 'default'
                    }
                  >
                    {capabilities.parallelExecution ? 'Enabled' : 'Disabled'}
                  </Tag>
                </Space>
              </div>
            </Col>
            <Col span={12}>
              <div className="capability-item">
                <Space>
                  {getCapabilityIcon(capabilities.errorRecovery)}
                  <span>Error Recovery</span>
                  <Tag
                    color={capabilities.errorRecovery ? 'success' : 'default'}
                  >
                    {capabilities.errorRecovery ? 'Enabled' : 'Disabled'}
                  </Tag>
                </Space>
              </div>
            </Col>
          </Row>
          <div style={{ marginTop: 16 }}>
            <div className="capability-item">
              <Space>
                <ThunderboltOutlined />
                <span>Available Tools</span>
                <Tag color="blue">{capabilities.toolCount}</Tag>
              </Space>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div>
          <h4>Performance Metrics</h4>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div className="metric-card">
                <div className="metric-label">Requests Processed</div>
                <div className="metric-value">
                  {metrics.requestsProcessed.toLocaleString()}
                </div>
              </div>
            </Col>
            <Col span={12}>
              <div className="metric-card">
                <div className="metric-label">Avg Response Time</div>
                <div className="metric-value">
                  {formatResponseTime(metrics.averageResponseTime)}
                </div>
              </div>
            </Col>
            <Col span={12}>
              <div className="metric-card">
                <div className="metric-label">Error Rate</div>
                <div className="metric-value">
                  <Progress
                    type="circle"
                    percent={metrics.errorRate * 100}
                    width={40}
                    strokeColor={
                      metrics.errorRate > 0.05 ? '#ff4d4f' : '#52c41a'
                    }
                    format={() => `${(metrics.errorRate * 100).toFixed(1)}%`}
                  />
                </div>
              </div>
            </Col>
            <Col span={12}>
              <div className="metric-card">
                <div className="metric-label">Active Connections</div>
                <div className="metric-value">{metrics.activeConnections}</div>
              </div>
            </Col>
          </Row>
        </div>

        {/* System Resources */}
        <div style={{ marginTop: 24 }}>
          <h4>System Resources</h4>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div className="resource-card">
                <div className="resource-label">Memory Usage</div>
                <Progress
                  percent={systemStatus.memoryUsage}
                  size="small"
                  status={
                    systemStatus.memoryUsage > 80 ? 'exception' : 'normal'
                  }
                />
                <div className="resource-value">
                  {systemStatus.memoryUsage}%
                </div>
              </div>
            </Col>
            <Col span={12}>
              <div className="resource-card">
                <div className="resource-label">CPU Usage</div>
                <Progress
                  percent={systemStatus.cpuUsage}
                  size="small"
                  status={systemStatus.cpuUsage > 80 ? 'exception' : 'normal'}
                />
                <div className="resource-value">{systemStatus.cpuUsage}%</div>
              </div>
            </Col>
          </Row>
        </div>

        {/* Last Update Info */}
        <div
          style={{
            marginTop: 16,
            textAlign: 'center',
            color: '#666',
            fontSize: 12,
          }}
        >
          Last updated: {new Date(lastUpdate).toLocaleTimeString()}
        </div>
      </Card>
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

// CSS-in-JS styles for the agent status component
export const agentStatusStyles = `
  .agent-status {
    margin: 16px 0;
  }

  .status-card {
    padding: 12px;
    background: #fafafa;
    border-radius: 6px;
    border: 1px solid #f0f0f0;
    text-align: center;
  }

  .status-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 8px;
    font-weight: 500;
    color: #666;
  }

  .status-value {
    font-size: 16px;
    font-weight: 600;
    color: #262626;
  }

  .capability-item {
    padding: 8px 12px;
    background: #f8f9fa;
    border-radius: 4px;
    border: 1px solid #e9ecef;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .metric-card {
    padding: 16px;
    background: #f8f9fa;
    border-radius: 6px;
    border: 1px solid #e9ecef;
    text-align: center;
  }

  .metric-label {
    font-size: 12px;
    color: #666;
    margin-bottom: 8px;
  }

  .metric-value {
    font-size: 18px;
    font-weight: 600;
    color: #262626;
  }

  .resource-card {
    padding: 12px;
    background: #f8f9fa;
    border-radius: 6px;
    border: 1px solid #e9ecef;
  }

  .resource-label {
    font-size: 12px;
    color: #666;
    margin-bottom: 4px;
  }

  .resource-value {
    font-size: 14px;
    font-weight: 500;
    color: #262626;
    text-align: center;
    margin-top: 4px;
  }
`;
