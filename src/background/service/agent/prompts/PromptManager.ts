import { z } from 'zod';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '../llm/messages';
import { Web3Context } from '../llm/types';
import { createLogger } from '@/utils/logger';
import { defiElementSelectionTemplates } from './defi-interactions';

import { Web3Intent } from '../intent/IntentRecognizer';
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
- parse_page: Parse page text and metadata (nanobrowser-style)
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
        'parse_page',
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
      systemPrompt: `You are an AI assistant with function calling capabilities. Always use native function calling with the provided tools to accomplish user requests. Do not output JSON in assistant content when tools are needed.

Guidelines:
1. Use the exact tool name and parameters
2. Provide all required parameters
3. Follow the parameter schema exactly
4. Handle errors gracefully
5. If no tools are needed, provide a concise direct answer
6. After tool results are available, explain what you did and the results succinctly`,
      userPromptTemplate: `{{userInput}}`,
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
      ],
      tools: ['*'], // All tools available
      contexts: ['function_calling', 'web3', 'automation'],
    };

    // Element selection template
    const elementSelectionTemplate: PromptTemplate = {
      id: 'element_selection',
      name: 'Element Selection',
      description: 'Interactive element selection and analysis for web automation',
      systemPrompt: `You are an AI assistant specialized in element selection and analysis for web automation. Your capabilities include:

1. Interactive element highlighting and selection
2. Element analysis and property extraction
3. DOM traversal and element discovery
4. Accessibility and interaction analysis
5. Visual element identification and targeting

You have access to element selection tools that can highlight, analyze, and interact with web page elements. Always:

- Use visual highlighting to guide users to relevant elements
- Provide clear element descriptions and selectors
- Analyze element properties for optimal interaction
- Consider accessibility and user experience
- Suggest the most reliable selectors for automation

Current element selection context:
- Selection mode: {{selectionMode}}
- Current page: {{currentUrl}}
- Available elements: {{availableElements}}
- User intent: {{userIntent}}

Available element selection tools:
- getClickableElements: Build DOM and get interactive elements (nanobrowser-aligned)
- analyzeElement: Analyze specific element properties
- highlightElement: Highlight specific elements
- captureElementScreenshot: Take screenshots of elements

When working with elements:
1. First activate element selection to show available options
2. Use element analysis to understand properties and interactions
3. Provide reliable CSS selectors for automation
4. Consider element visibility and accessibility
5. Give clear guidance for user interaction`,
      userPromptTemplate: `User: {{userInput}}

Element Selection Context:
- Mode: {{selectionMode}}
- Page: {{currentUrl}}
- Available Elements: {{availableElements}}
- User Intent: {{userIntent}}

Please help with element selection and analysis. {{additionalContext}}`,
      variables: [
        {
          name: 'userInput',
          type: 'string',
          description: 'User input text',
          required: true,
        },
        {
          name: 'selectionMode',
          type: 'string',
          description: 'Current element selection mode',
          required: false,
        },
        {
          name: 'currentUrl',
          type: 'string',
          description: 'Current page URL',
          required: false,
        },
        {
          name: 'availableElements',
          type: 'array',
          description: 'Available interactive elements',
          required: false,
        },
        {
          name: 'userIntent',
          type: 'string',
          description: 'User intent for element selection',
          required: false,
        },
        {
          name: 'additionalContext',
          type: 'string',
          description: 'Additional context information',
          required: false,
        },
      ],
      tools: [
        'activateElementSelector',
        'getHighlightedElements',
        'analyzeElement',
        'findElementsByText',
        'getClickableElements',
        'highlightElement',
        'captureElementScreenshot',
      ],
      contexts: ['element_selection', 'browser_automation', 'ui_interaction'],
    };

    // Register default templates
    this.registerTemplate(web3AssistantTemplate);
    this.registerTemplate(browserAutomationTemplate);
    this.registerTemplate(functionCallingTemplate);
    this.registerTemplate(elementSelectionTemplate);

    // Register DeFi-specific templates
    defiElementSelectionTemplates.forEach(template => {
      try {
        this.registerTemplate(template);
      } catch (error) {
        logger.warn('Failed to register DeFi template', { template: template.id, error });
      }
    });

    const defiTemplateNames = defiElementSelectionTemplates.map(t => t.id);

    logger.info('Default prompt templates initialized', {
      count: 4 + defiElementSelectionTemplates.length,
      templates: ['web3_assistant', 'browser_automation', 'function_calling', 'element_selection', ...defiTemplateNames],
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

      // Prepare messages (ensure ReAct: plan first, then tool calls)
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
    const { intent, tools, taskAnalysis, context } = promptContext;

    // Check if this is a function calling scenario
    if (tools && tools.length > 0) {
      // Check for DeFi-specific contexts first
      if (intent && intent.action) {
        const action = intent.action.toLowerCase();
        if (action.includes('connect') || action.includes('wallet')) {
          return (
            this.getTemplate('defi_wallet_connection') ||
            this.getTemplate('function_calling') ||
            this.getTemplate('web3_assistant')!
          );
        }
        if (action.includes('swap') || action.includes('exchange')) {
          return (
            this.getTemplate('defi_token_swap') ||
            this.getTemplate('function_calling') ||
            this.getTemplate('web3_assistant')!
          );
        }
        if (action.includes('approve') || action.includes('enable')) {
          return (
            this.getTemplate('defi_token_approval') ||
            this.getTemplate('function_calling') ||
            this.getTemplate('web3_assistant')!
          );
        }
        if (action.includes('liquidity') || action.includes('pool')) {
          return (
            this.getTemplate('defi_liquidity_provision') ||
            this.getTemplate('function_calling') ||
            this.getTemplate('web3_assistant')!
          );
        }
        if (action.includes('stake') || action.includes('farm') || action.includes('yield')) {
          return (
            this.getTemplate('defi_staking_yield') ||
            this.getTemplate('function_calling') ||
            this.getTemplate('web3_assistant')!
          );
        }
      }

      // Check for element selection tools
      const elementSelectionTools = tools.filter(tool =>
        tool.name.includes('Element') ||
        tool.name.includes('element') ||
        tool.name.includes('highlight') ||
        tool.name.includes('analyze')
      );

      if (elementSelectionTools.length > 0) {
        return (
          this.getTemplate('element_selection') ||
          this.getTemplate('function_calling') ||
          this.getTemplate('web3_assistant')!
        );
      }

      return (
        this.getTemplate('function_calling') ||
        this.getTemplate('web3_assistant')!
      );
    }

    // Check if this is a browser automation task
    if (taskAnalysis && taskAnalysis.requiresBrowserAutomation) {
      return (
        this.getTemplate('browser_automation') ||
        this.getTemplate('element_selection') ||
        this.getTemplate('web3_assistant')!
      );
    }

    // Check for DeFi context based on conversation or available actions
    if (context && context.conversationHistory) {
      const recentMessages = context.conversationHistory.slice(-3);
      const hasDeFiKeywords = recentMessages.some(msg => {
        const content = (msg.content || '').toLowerCase();
        return content.includes('defi') ||
               content.includes('swap') ||
               content.includes('stake') ||
               content.includes('liquidity') ||
               content.includes('approve') ||
               content.includes('wallet') ||
               content.includes('connect');
      });

      if (hasDeFiKeywords) {
        return this.getTemplate('web3_assistant')!;
      }
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

    // Add DeFi-specific variables if applicable
    if (intent && intent.action) {
      const action = intent.action.toLowerCase();
      variables.userIntent = action;

      if (action.includes('connect') || action.includes('wallet')) {
        variables.dappType = this.detectDAppType(context.currentUrl) || 'Unknown';
        variables.requiredNetwork = this.getNetworkName(context.currentChain);
      }

      if (action.includes('swap') || action.includes('exchange')) {
        variables.dexType = this.detectDEXType(context.currentUrl) || 'Unknown';
        variables.fromToken = this.extractTokenFromIntent(intent, 'from');
        variables.toToken = this.extractTokenFromIntent(intent, 'to');
        variables.swapAmount = this.extractAmountFromIntent(intent);
      }

      if (action.includes('approve')) {
        variables.token = this.extractTokenFromIntent(intent, 'token');
        variables.spender = this.extractContractFromIntent(intent);
        variables.amount = this.extractAmountFromIntent(intent);
        variables.purpose = this.extractPurposeFromIntent(intent);
      }

      if (action.includes('liquidity')) {
        variables.actionType = action.includes('add') || action.includes('provide') ? 'add' : 'remove';
        variables.tokenPair = this.extractTokenPairFromIntent(intent);
        variables.amount = this.extractAmountFromIntent(intent);
      }

      if (action.includes('stake') || action.includes('farm')) {
        variables.actionType = action.includes('unstake') || action.includes('withdraw') ? 'unstake' : 'stake';
        variables.token = this.extractTokenFromIntent(intent, 'token');
        variables.amount = this.extractAmountFromIntent(intent);
        variables.apy = this.extractAPYFromContext(context);
        variables.lockPeriod = this.extractLockPeriodFromIntent(intent);
      }
    }

    // Add browser-specific variables if needed
    if (taskAnalysis && taskAnalysis.requiresBrowserAutomation) {
      variables.activeTabs = '1'; // Would get from browser context
      variables.currentUrl = context.currentUrl || 'about:blank';
      variables.pageTitle = 'New Tab'; // Would get from browser context
      variables.taskAnalysis = JSON.stringify(taskAnalysis, null, 2);
      variables.browserContext = JSON.stringify(context, null, 2);
    }

    // Add element selection variables if needed
    const elementSelectionTools = promptContext.tools?.filter(tool =>
      tool.name.includes('Element') ||
      tool.name.includes('element') ||
      tool.name.includes('highlight') ||
      tool.name.includes('analyze')
    );

    if (elementSelectionTools && elementSelectionTools.length > 0) {
      variables.selectionMode = 'highlight';
      variables.availableElements = 'Interactive elements will be identified';
      variables.additionalContext = 'Element selection tools are available for DeFi interface interaction';
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

    // Proper OpenAI-style roles: system → history → user (avoid duplicate user message)
    messages.push(new SystemMessage(systemPrompt));

    // Include only recent history to manage context size
    const recentHistoryRaw = conversationHistory.slice(-10);

    // Collapse consecutive duplicate human messages by content
    const recentHistory: BaseMessage[] = [];
    for (const m of recentHistoryRaw) {
      const prev = recentHistory[recentHistory.length - 1];
      const prevType = (prev as any)?._getType?.();
      const currType = (m as any)?._getType?.();
      const prevContent = (prev as any)?.content;
      const currContent = (m as any)?.content;
      const bothHumanSameContent = prev && prevType === 'human' && currType === 'human' && String(prevContent) === String(currContent);
      if (bothHumanSameContent) continue; // skip duplicate
      recentHistory.push(m);
    }

    // Detect if the last message is a human message (the raw user input)
    const lastMsg = recentHistory[recentHistory.length - 1];
    const isLastHuman = lastMsg && (lastMsg as any)._getType?.() === 'human';

    // Detect if there are recent tool results; if so, we should not append a fresh templated user prompt
    const hasRecentToolActivity = recentHistory.some((m) => {
      const type = (m as any)._getType?.();
      const hasToolId = (m as any)?.tool_call_id || (m as any)?.additional_kwargs?.tool_call_id;
      // LangChain ToolMessage returns type 'tool'; assistant tool_calls are AIMessage with additional_kwargs.tool_calls
      const hasAssistantToolCalls = Array.isArray((m as any)?.additional_kwargs?.tool_calls) && (m as any).additional_kwargs.tool_calls.length > 0;
      return type === 'tool' || !!hasToolId || hasAssistantToolCalls;
    });

    // Build history without duplicating the user message when adding the templated user prompt
    if (hasRecentToolActivity) {
      // After tools executed, keep full recent history and DO NOT add a new templated user prompt
      messages.push(...recentHistory);
    } else {
      // Normal first-turn: replace the latest HumanMessage anywhere in recent history
      let lastHumanIndex = -1;
      for (let i = recentHistory.length - 1; i >= 0; i--) {
        const t = (recentHistory[i] as any)?._getType?.();
        if (t === 'human') { lastHumanIndex = i; break; }
      }

      if (lastHumanIndex >= 0) {
        const withoutLastHuman = [...recentHistory.slice(0, lastHumanIndex), ...recentHistory.slice(lastHumanIndex + 1)];
        messages.push(...withoutLastHuman);
      } else {
        messages.push(...recentHistory);
      }

      // Current turn user message (templated)
      messages.push(new HumanMessage(userPrompt));
    }

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
   * DeFi context extraction helper methods
   */
  private detectDAppType(url: string): string {
    if (!url) return 'Unknown';

    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('uniswap') || lowerUrl.includes('sushi')) return 'DEX';
    if (lowerUrl.includes('aave') || lowerUrl.includes('compound')) return 'Lending';
    if (lowerUrl.includes('curve') || lowerUrl.includes('balancer')) return 'Liquidity Pool';
    if (lowerUrl.includes('lido') || lowerUrl.includes('rocket')) return 'Staking';
    if (lowerUrl.includes('opensea') || lowerUrl.includes('rarible')) return 'NFT Marketplace';
    return 'Generic dApp';
  }

  private detectDEXType(url: string): string {
    if (!url) return 'Unknown';

    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('uniswap')) return 'Uniswap';
    if (lowerUrl.includes('sushi')) return 'SushiSwap';
    if (lowerUrl.includes('pancake')) return 'PancakeSwap';
    if (lowerUrl.includes('curve')) return 'Curve';
    if (lowerUrl.includes('balancer')) return 'Balancer';
    return 'Generic DEX';
  }

  private extractTokenFromIntent(intent: Web3Intent, type: 'from' | 'to' | 'token'): string {
    if (intent.entities) {
      if (type === 'from' && intent.entities.fromToken) {
        return intent.entities.fromToken;
      }
      if (type === 'to' && intent.entities.toToken) {
        return intent.entities.toToken;
      }
      if (type === 'token' && intent.entities.tokenA) {
        return intent.entities.tokenA;
      }
    }

    // Fallback to text extraction from intent
    const text = intent.action.toLowerCase();
    if (type === 'from' && text.includes('from')) {
      const match = text.match(/from\s+([a-zA-Z0-9]+)/);
      return match ? match[1] : 'Unknown';
    }
    if (type === 'to' && text.includes('to')) {
      const match = text.match(/to\s+([a-zA-Z0-9]+)/);
      return match ? match[1] : 'Unknown';
    }

    return 'Unknown';
  }

  private extractAmountFromIntent(intent: Web3Intent): string {
    if (intent.entities && intent.entities.amount) {
      return intent.entities.amount;
    }

    // Extract amount from action text
    const text = intent.action.toLowerCase();
    const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:eth|usdc|usdt|dai|btc|matic)/);
    return amountMatch ? amountMatch[1] : 'Unknown amount';
  }

  private extractContractFromIntent(intent: Web3Intent): string {
    if (intent.entities) {
      if (intent.entities.contract) {
        return intent.entities.contract;
      }
      if (intent.entities.spender) {
        return intent.entities.spender;
      }
      if (intent.entities.stakingContract) {
        return intent.entities.stakingContract;
      }
      if (intent.entities.governanceContract) {
        return intent.entities.governanceContract;
      }
    }
    return 'Unknown contract';
  }

  private extractPurposeFromIntent(intent: Web3Intent): string {
    const text = intent.action.toLowerCase();
    if (text.includes('swap')) return 'Token swap';
    if (text.includes('liquidity')) return 'Liquidity provision';
    if (text.includes('stake')) return 'Staking';
    if (text.includes('farm')) return 'Yield farming';
    if (text.includes('approve')) return 'Token approval';
    if (text.includes('send')) return 'Token transfer';
    if (text.includes('bridge')) return 'Cross-chain bridge';
    return 'Unknown purpose';
  }

  private extractTokenPairFromIntent(intent: Web3Intent): string {
    const fromToken = this.extractTokenFromIntent(intent, 'from');
    const toToken = this.extractTokenFromIntent(intent, 'to');
    return `${fromToken}/${toToken}`;
  }

  private extractAPYFromContext(context: Web3Context): string {
    // This would normally extract APY from context or external data
    return 'Variable APY';
  }

  private extractLockPeriodFromIntent(intent: Web3Intent): string {
    const text = intent.action.toLowerCase();
    if (text.includes('30') || text.includes('month')) return '30 days';
    if (text.includes('90') || text.includes('quarter')) return '90 days';
    if (text.includes('365') || text.includes('year')) return '1 year';
    return 'Flexible';
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
