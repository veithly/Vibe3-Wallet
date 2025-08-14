import { z } from 'zod';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  AIMessage,
} from '../llm/messages';
import { Web3Context, FunctionSchema, LLMResponse } from '../llm/types';
import { Web3Intent } from '../intent/IntentRecognizer';
import { TaskAnalysis } from '../task-analysis/IntelligentTaskAnalyzer';
import { createLogger } from '@/utils/logger';

const logger = createLogger('PromptManager');

// Prompt template schemas
export const PromptTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  systemPrompt: z.string(),
  userPromptTemplate: z.string(),
  variables: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      description: z.string(),
      required: z.boolean(),
    })
  ),
  tools: z.array(z.string()).optional(),
  contexts: z.array(z.string()).optional(),
});

export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

// Prompt context schema
export const PromptContextSchema = z.object({
  messages: z.array(z.any()),
  context: z.any(),
  intent: z.any(),
  tools: z.array(z.any()).optional(),
  conversationHistory: z.array(z.any()),
  availableActions: z.array(z.string()),
  taskAnalysis: z.any().optional(),
});

export type PromptContext = z.infer<typeof PromptContextSchema>;

// Generated prompt schema
export const GeneratedPromptSchema = z.object({
  systemPrompt: z.string(),
  userPrompt: z.string(),
  messages: z.array(z.any()),
  context: z.any(),
  intent: z.any(),
  tools: z.array(z.any()).optional(),
  timestamp: z.number().optional(),
  prompt: z.string().optional(),
});

export type GeneratedPrompt = z.infer<typeof GeneratedPromptSchema>;

/**
 * Prompt Manager for dynamic prompt generation and template management
 */
export class PromptManager {
  private templates: Map<string, PromptTemplate> = new Map();
  private defaultTemplates: Map<string, PromptTemplate> = new Map();
  private customTemplates: Map<string, PromptTemplate> = new Map();
  private promptCache: Map<string, GeneratedPrompt> = new Map();
  private cacheTimeoutMs: number = 300000; // 5 minutes

  constructor() {
    this.initializeDefaultTemplates();
    this.loadExistingPrompts();
  }

  /**
   * Initialize default prompt templates
   */
  private initializeDefaultTemplates(): void {
    // Web3 assistant template
    const web3AssistantTemplate: PromptTemplate = {
      id: 'web3_assistant',
      name: 'Web3 Assistant',
      description: 'General Web3 assistant for wallet operations',
      systemPrompt: `You are an AI assistant for a Web3 smart wallet called Vibe3. Your job is to help users with:

1. Wallet operations (send, receive, swap, bridge tokens)
2. DeFi interactions (staking, lending, yield farming)
3. Contract interactions and dApp guidance
4. Market information and price queries
5. Transaction analysis and security

You have access to Web3 tools and can perform actual blockchain operations. Always:

- Be helpful and clear in your explanations
- Provide transaction details when relevant
- Warn about risks and confirmations needed
- Use structured responses for complex operations
- Ask for confirmation before high-risk operations

Current context:
- Network: {{network}}
- Address: {{address}}
- Balance: {{balance}}
- Risk Level: {{riskLevel}}`,
      userPromptTemplate: `User: {{userInput}}

Context: {{context}}
Available actions: {{availableActions}}
Recent conversation: {{conversationHistory}}

Please help the user with their request.`,
      variables: [
        {
          name: 'userInput',
          type: 'string',
          description: 'User input text',
          required: true,
        },
        {
          name: 'network',
          type: 'string',
          description: 'Current network',
          required: false,
        },
        {
          name: 'address',
          type: 'string',
          description: 'User address',
          required: false,
        },
        {
          name: 'balance',
          type: 'string',
          description: 'Current balance',
          required: false,
        },
        {
          name: 'riskLevel',
          type: 'string',
          description: 'Current risk level',
          required: false,
        },
        {
          name: 'context',
          type: 'object',
          description: 'Current context',
          required: false,
        },
        {
          name: 'availableActions',
          type: 'array',
          description: 'Available actions',
          required: false,
        },
        {
          name: 'conversationHistory',
          type: 'array',
          description: 'Conversation history',
          required: false,
        },
      ],
      tools: [
        'check_balance',
        'send_transaction',
        'swap_tokens',
        'bridge_tokens',
      ],
      contexts: ['web3', 'wallet', 'defi'],
    };

    // Browser automation template
    const browserAutomationTemplate: PromptTemplate = {
      id: 'browser_automation',
      name: 'Browser Automation',
      description: 'Browser automation and web interaction',
      systemPrompt: `You are an AI assistant specialized in browser automation for Web3 applications. Your capabilities include:

1. Web page navigation and interaction
2. Form filling and data entry
3. Content extraction and analysis
4. dApp interaction and automation
5. Multi-step workflow execution

You have access to browser automation tools and can control web pages. Always:

- Be precise with element selection and interaction
- Provide clear feedback about automation progress
- Handle errors gracefully with fallback options
- Respect page load times and async operations
- Ensure user privacy and security

Current browser context:
- Active tabs: {{activeTabs}}
- Current URL: {{currentUrl}}
- Page title: {{pageTitle}}

Available automation tools:
- navigate: Open URLs and navigate between pages
- click: Click buttons, links, and interactive elements
- fill_form: Fill out forms with provided data
- extract_content: Extract text, data, or HTML from pages
- wait_for: Wait for elements or conditions
- scroll: Scroll pages to reveal content
- screenshot: Capture page screenshots`,
      userPromptTemplate: `User request: {{userInput}}

Task analysis: {{taskAnalysis}}
Browser context: {{browserContext}}
Available automation tools: {{availableTools}}

Execute the requested browser automation or provide guidance on how to accomplish it.`,
      variables: [
        {
          name: 'userInput',
          type: 'string',
          description: 'User input text',
          required: true,
        },
        {
          name: 'taskAnalysis',
          type: 'object',
          description: 'Task analysis result',
          required: false,
        },
        {
          name: 'browserContext',
          type: 'object',
          description: 'Browser context',
          required: false,
        },
        {
          name: 'activeTabs',
          type: 'number',
          description: 'Number of active tabs',
          required: false,
        },
        {
          name: 'currentUrl',
          type: 'string',
          description: 'Current page URL',
          required: false,
        },
        {
          name: 'pageTitle',
          type: 'string',
          description: 'Current page title',
          required: false,
        },
        {
          name: 'availableTools',
          type: 'array',
          description: 'Available automation tools',
          required: false,
        },
      ],
      tools: [
        'navigate',
        'click',
        'fill_form',
        'extract_content',
        'wait_for',
        'scroll',
        'screenshot',
      ],
      contexts: ['browser', 'automation', 'dapp'],
    };

    // Function calling template
    const functionCallingTemplate: PromptTemplate = {
      id: 'function_calling',
      name: 'Function Calling',
      description: 'Structured function calling with tool schemas',
      systemPrompt: `You are an AI assistant with function calling capabilities. You must use the provided tools to accomplish user requests rather than providing text-only responses.

Available tools:
{{tools}}

For each tool call, you must:
1. Use the exact tool name and parameters
2. Provide all required parameters
3. Follow the parameter schema exactly
4. Handle errors gracefully

Response format:
- If tools are needed: Respond with function calls only
- If no tools needed: Provide helpful text response
- Always explain what you're doing and why

Current context:
- Network: {{network}}
- Address: {{address}}
- Available tools: {{availableTools}}
- Risk level: {{riskLevel}}`,
      userPromptTemplate: `User: {{userInput}}

Conversation history: {{conversationHistory}}
Current context: {{context}}

Use the available tools to help the user. If you need to make function calls, respond with the exact function name and parameters.`,
      variables: [
        {
          name: 'userInput',
          type: 'string',
          description: 'User input text',
          required: true,
        },
        {
          name: 'tools',
          type: 'array',
          description: 'Available tool schemas',
          required: true,
        },
        {
          name: 'network',
          type: 'string',
          description: 'Current network',
          required: false,
        },
        {
          name: 'address',
          type: 'string',
          description: 'User address',
          required: false,
        },
        {
          name: 'availableTools',
          type: 'array',
          description: 'Available tool names',
          required: false,
        },
        {
          name: 'riskLevel',
          type: 'string',
          description: 'Current risk level',
          required: false,
        },
        {
          name: 'context',
          type: 'object',
          description: 'Current context',
          required: false,
        },
        {
          name: 'conversationHistory',
          type: 'array',
          description: 'Conversation history',
          required: false,
        },
      ],
      tools: ['*'], // All tools available
      contexts: ['function_calling', 'web3', 'automation'],
    };

    // Register default templates
    this.registerTemplate(web3AssistantTemplate);
    this.registerTemplate(browserAutomationTemplate);
    this.registerTemplate(functionCallingTemplate);

    logger.info('Default prompt templates initialized', {
      count: 3,
      templates: ['web3_assistant', 'browser_automation', 'function_calling'],
    });
  }

  /**
   * Load existing prompts from the agent/prompts directory
   */
  private async loadExistingPrompts(): Promise<void> {
    try {
      // This would normally read from the file system
      // For now, we'll simulate loading existing prompts

      logger.info('Loaded existing prompt templates', {
        count: this.customTemplates.size,
      });
    } catch (error) {
      logger.warn('Failed to load existing prompts', error);
    }
  }

  /**
   * Create enhanced prompt with context and tools
   */
  async createPrompt(promptContext: PromptContext): Promise<GeneratedPrompt> {
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(promptContext);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        logger.debug('Using cached prompt');
        return cached;
      }

      // Select appropriate template
      const template = this.selectTemplate(promptContext);

      // Generate prompt variables
      const variables = this.generatePromptVariables(promptContext);

      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(template, variables);

      // Build user prompt
      const userPrompt = this.buildUserPrompt(template, variables);

      // Prepare messages
      const messages = this.prepareMessages(
        systemPrompt,
        userPrompt,
        promptContext.messages
      );

      const generatedPrompt: GeneratedPrompt = {
        systemPrompt,
        userPrompt,
        messages,
        context: promptContext.context,
        intent: promptContext.intent,
        tools: promptContext.tools,
      };

      // Cache the result
      this.setToCache(cacheKey, generatedPrompt);

      logger.debug('Generated prompt', {
        template: template.id,
        variablesCount: Object.keys(variables).length,
        messagesCount: messages.length,
      });

      return generatedPrompt;
    } catch (error) {
      logger.error('Failed to create prompt', error);
      throw new Error(
        `Prompt generation failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Select appropriate template based on context
   */
  private selectTemplate(promptContext: PromptContext): PromptTemplate {
    const { intent, tools, taskAnalysis } = promptContext;

    // Check if this is a function calling scenario
    if (tools && tools.length > 0) {
      return (
        this.getTemplate('function_calling') ||
        this.getTemplate('web3_assistant')!
      );
    }

    // Check if this is a browser automation task
    if (taskAnalysis && taskAnalysis.requiresBrowserAutomation) {
      return (
        this.getTemplate('browser_automation') ||
        this.getTemplate('web3_assistant')!
      );
    }

    // Default to Web3 assistant
    return this.getTemplate('web3_assistant')!;
  }

  /**
   * Generate prompt variables from context
   */
  private generatePromptVariables(
    promptContext: PromptContext
  ): Record<string, any> {
    const {
      context,
      intent,
      conversationHistory,
      availableActions,
      taskAnalysis,
    } = promptContext;

    const variables: Record<string, any> = {
      // Core context
      network: this.getNetworkName(context.currentChain),
      address: context.currentAddress || 'Not connected',
      balance: this.formatBalance(context.balances),
      riskLevel: context.riskLevel || 'LOW',

      // User input
      userInput: this.getLatestUserMessage(conversationHistory),

      // Actions and tools
      availableActions: availableActions.join(', '),
      availableTools:
        promptContext.tools?.map((t) => t.name).join(', ') || 'None',

      // Conversation
      conversationHistory: this.formatConversationHistory(conversationHistory),

      // Context object
      context: JSON.stringify(context, null, 2),
    };

    // Add browser-specific variables if needed
    if (taskAnalysis && taskAnalysis.requiresBrowserAutomation) {
      variables.activeTabs = '1'; // Would get from browser context
      variables.currentUrl = 'about:blank'; // Would get from browser context
      variables.pageTitle = 'New Tab'; // Would get from browser context
      variables.taskAnalysis = JSON.stringify(taskAnalysis, null, 2);
      variables.browserContext = JSON.stringify(context, null, 2);
    }

    // Add tools for function calling
    if (promptContext.tools) {
      variables.tools = JSON.stringify(promptContext.tools, null, 2);
    }

    return variables;
  }

  /**
   * Build system prompt from template and variables
   */
  private buildSystemPrompt(
    template: PromptTemplate,
    variables: Record<string, any>
  ): string {
    let systemPrompt = template.systemPrompt;

    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      systemPrompt = systemPrompt.replace(
        new RegExp(placeholder, 'g'),
        String(value)
      );
    }

    return systemPrompt;
  }

  /**
   * Build user prompt from template and variables
   */
  private buildUserPrompt(
    template: PromptTemplate,
    variables: Record<string, any>
  ): string {
    let userPrompt = template.userPromptTemplate;

    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      userPrompt = userPrompt.replace(
        new RegExp(placeholder, 'g'),
        String(value)
      );
    }

    return userPrompt;
  }

  /**
   * Prepare messages for LLM
   */
  private prepareMessages(
    systemPrompt: string,
    userPrompt: string,
    conversationHistory: BaseMessage[]
  ): BaseMessage[] {
    const messages: BaseMessage[] = [];

    // Add system message
    messages.push(new SystemMessage(systemPrompt));

    // Add conversation history (last 10 messages to prevent context overflow)
    const recentHistory = conversationHistory.slice(-10);
    messages.push(...recentHistory);

    // Add current user message
    messages.push(new HumanMessage(userPrompt));

    return messages;
  }

  /**
   * Template management methods
   */
  registerTemplate(template: PromptTemplate): void {
    try {
      const validated = PromptTemplateSchema.parse(template);
      this.templates.set(template.id, validated);
      this.defaultTemplates.set(template.id, validated);
      logger.info('Registered template', {
        id: template.id,
        name: template.name,
      });
    } catch (error) {
      logger.error('Failed to register template', { template, error });
      throw new Error(
        `Invalid template: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  registerCustomTemplate(template: PromptTemplate): void {
    try {
      const validated = PromptTemplateSchema.parse(template);
      this.templates.set(template.id, validated);
      this.customTemplates.set(template.id, validated);
      logger.info('Registered custom template', {
        id: template.id,
        name: template.name,
      });
    } catch (error) {
      logger.error('Failed to register custom template', { template, error });
      throw new Error(
        `Invalid custom template: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  getTemplate(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  getAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  getTemplatesByContext(context: string): PromptTemplate[] {
    return Array.from(this.templates.values()).filter((template) =>
      template.contexts?.includes(context)
    );
  }

  /**
   * Cache management
   */
  private generateCacheKey(promptContext: PromptContext): string {
    const userInput = this.getLatestUserMessage(
      promptContext.conversationHistory
    );
    const intent = promptContext.intent?.action || 'unknown';
    const hasTools = promptContext.tools && promptContext.tools.length > 0;

    return `${userInput}_${intent}_${hasTools}_${Date.now()}`;
  }

  private getFromCache(key: string): GeneratedPrompt | null {
    const cached = this.promptCache.get(key);
    if (
      cached &&
      cached.timestamp &&
      Date.now() - cached.timestamp < this.cacheTimeoutMs
    ) {
      return cached;
    }
    return null;
  }

  private setToCache(key: string, prompt: GeneratedPrompt): void {
    this.promptCache.set(key, {
      ...prompt,
      timestamp: Date.now(),
    });
  }

  clearCache(): void {
    this.promptCache.clear();
    logger.info('Prompt cache cleared');
  }

  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.promptCache.size,
      hitRate: 0, // Would need hit tracking implementation
    };
  }

  /**
   * Utility methods
   */
  private getNetworkName(chainId: number): string {
    const networks: Record<number, string> = {
      1: 'Ethereum Mainnet',
      56: 'BSC Mainnet',
      137: 'Polygon Mainnet',
      43114: 'Avalanche Mainnet',
      8453: 'Base Mainnet',
      10: 'Optimism Mainnet',
    };
    return networks[chainId] || `Chain ${chainId}`;
  }

  private formatBalance(balances: Record<string, string>): string {
    if (!balances || Object.keys(balances).length === 0) {
      return 'No balance information';
    }

    return Object.entries(balances)
      .map(([token, amount]) => `${amount} ${token}`)
      .join(', ');
  }

  private getLatestUserMessage(conversationHistory: BaseMessage[]): string {
    const userMessages = conversationHistory.filter(
      (msg) => msg instanceof HumanMessage
    );
    if (userMessages.length === 0) {
      return '';
    }
    return userMessages[userMessages.length - 1].content as string;
  }

  private formatConversationHistory(
    conversationHistory: BaseMessage[]
  ): string {
    if (conversationHistory.length === 0) {
      return 'No conversation history';
    }

    return conversationHistory
      .slice(-5) // Last 5 messages
      .map((msg) => {
        const role = msg instanceof HumanMessage ? 'User' : 'Assistant';
        return `${role}: ${msg.content}`;
      })
      .join('\n');
  }

  /**
   * Public methods for external access
   */
  async getPromptStats(): Promise<{
    totalTemplates: number;
    defaultTemplates: number;
    customTemplates: number;
    cacheSize: number;
  }> {
    return {
      totalTemplates: this.templates.size,
      defaultTemplates: this.defaultTemplates.size,
      customTemplates: this.customTemplates.size,
      cacheSize: this.promptCache.size,
    };
  }

  async optimizePrompts(): Promise<void> {
    // Clear old cache entries
    const now = Date.now();
    for (const [key, entry] of this.promptCache.entries()) {
      if (entry.timestamp && now - entry.timestamp > this.cacheTimeoutMs) {
        this.promptCache.delete(key);
      }
    }

    logger.info('Prompt optimization completed', {
      cacheSize: this.promptCache.size,
    });
  }

  exportTemplates(): string {
    const templates = Array.from(this.templates.values());
    return JSON.stringify(templates, null, 2);
  }

  importTemplates(templatesJson: string): void {
    try {
      const templates = JSON.parse(templatesJson);
      let imported = 0;

      for (const template of templates) {
        try {
          this.registerCustomTemplate(template);
          imported++;
        } catch (error) {
          logger.warn('Failed to import template', { template, error });
        }
      }

      logger.info('Template import completed', {
        imported,
        total: templates.length,
      });
    } catch (error) {
      logger.error('Failed to import templates', error);
      throw new Error('Invalid template JSON');
    }
  }
}

// Cache entry type
interface CacheEntry {
  prompt: GeneratedPrompt;
  timestamp: number;
}
