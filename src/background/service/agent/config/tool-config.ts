// Tool configuration for Vibe3 AI Agent
// This file manages which tools are enabled/disabled in the system

export interface ToolConfig {
  name: string;
  enabled: boolean;
  reason?: string;
  disabledSince?: string;
}

export const TOOL_CONFIGURATIONS: ToolConfig[] = [
  {
    name: 'getTransactionHistory',
    enabled: false,
    reason: 'Temporarily disabled for system optimization',
    disabledSince: '2024-12-19',
  },
  // Add other tool configurations here as needed
];

export function isToolEnabled(toolName: string): boolean {
  const config = TOOL_CONFIGURATIONS.find(tool => tool.name === toolName);
  return config ? config.enabled : true; // Default to enabled if not configured
}

export function getToolConfig(toolName: string): ToolConfig | undefined {
  return TOOL_CONFIGURATIONS.find(tool => tool.name === toolName);
}

export function getEnabledTools(): string[] {
  return TOOL_CONFIGURATIONS
    .filter(tool => tool.enabled)
    .map(tool => tool.name);
}

export function getDisabledTools(): ToolConfig[] {
  return TOOL_CONFIGURATIONS.filter(tool => !tool.enabled);
}
