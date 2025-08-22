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

    // Function calling template (Claude-style best practices: brief, direct, tool-first)
    const functionCallingTemplate: PromptTemplate = {
      id: 'function_calling',
      name: 'Function Calling',
      description: 'Structured function calling with tool schemas',
      systemPrompt: `You are an AI assistant with native tool use. Follow these rules strictly:

1) Use function calls to tools whenever action or data is required.
2) Prefer plan-first: draft a concise step plan, then call tools.
3) Never emit JSON in assistant content to represent tool calls.
4) Use exact tool names and required parameters; be strict with schemas.
5) Keep responses concise and actionable; avoid verbosity.
6) After tool results, summarize outcomes and next steps briefly.`,
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

    // Planner Agent template
    const plannerTemplate: PromptTemplate = {
      id: 'planner_agent',
      name: 'Planner Agent',
      description: 'Create a concise, reliable execution plan before any action',
      systemPrompt: `You are the Planner Agent, responsible for analyzing complex tasks and creating detailed execution plans.

Goals:
- Analyze complex user instructions that require multiple steps
- Create detailed, step-by-step execution plans with clear parameters
- Break down complex tasks into manageable, sequential steps
- Provide plans that can be executed by the Orchestrator Agent

Rules:
- Use planTask tool to create structured execution plans
- Keep steps atomic, ordered, and specific
- Include timeouts, dependencies, and error handling when needed
- Ask for missing critical parameters as notes
- Output structured plans, not prose
- Focus on planning, not execution`,
      userPromptTemplate: `Analyze and plan this complex task: {{userInput}}

Context: {{context}}

Create a detailed execution plan using the planTask tool.`,
      variables: [
        { name: 'userInput', type: 'string', description: 'User input text', required: true },
        { name: 'context', type: 'object', description: 'Current context', required: false },
      ],
      tools: ['planTask'],
      contexts: ['planner'],
    };

    // Orchestrator Agent template
    const orchestratorTemplate: PromptTemplate = {
      id: 'orchestrator_agent',
      name: 'Orchestrator Agent',
      description: 'Execute a provided plan by delegating to Automation/Web3 tools',
      systemPrompt: `You are the Orchestrator Agent, responsible for coordinating and delegating tasks to specialized agents.

Goals:
- Analyze user requests and determine the best approach
- For complex tasks: Use planTask to create a detailed plan, then orchestratePlan to execute it
- For simple tasks: Delegate directly to appropriate agents using delegateToAutomation or delegateToWeb3
- Never execute tools directly - always delegate to specialized agents

Available Actions:
1. For browser automation tasks: Use delegateToAutomation with clear instructions
2. For Web3/blockchain tasks: Use delegateToWeb3 with clear instructions
3. For complex multi-step tasks: Use planTask first, then orchestratePlan
4. For simple queries: Respond directly with helpful information

Rules:
- ALWAYS delegate browser automation to Automation Agent using delegateToAutomation
- ALWAYS delegate Web3 operations to Web3 Agent using delegateToWeb3
- Provide clear, specific instructions when delegating
- Wait for agent reports before proceeding
- Summarize outcomes briefly`,
      userPromptTemplate: `User Request: {{userInput}}

Analyze this request and either:
1. Delegate to appropriate agent (delegateToAutomation for browser tasks, delegateToWeb3 for blockchain tasks)
2. Create a plan for complex tasks (planTask)
3. Respond directly for simple queries`,
      variables: [
        { name: 'userInput', type: 'string', description: 'User request or plan to execute', required: true },
      ],
      tools: ['delegateToAutomation', 'delegateToWeb3', 'planTask', 'orchestratePlan', 'getAgentStatus'],
      contexts: ['orchestrator'],
    };

    // Automation Agent template
    const automationTemplate: PromptTemplate = {
      id: 'automation_agent',
      name: 'Automation Agent',
      description: 'Control the browser with automation tools only',
      systemPrompt: `You are the Automation Agent, responsible for performing browser automation tasks.

Goals:
- Execute browser automation tasks using the provided tools
- Perform precise, safe browser actions
- Report results back to the Orchestrator Agent

Rules:
- Use only browser automation tools provided
- Prefer robust selectors and apply waits when needed
- Always report completion using automationReport tool
- Keep actions minimal and safe
- Provide clear status updates`,
      userPromptTemplate: `Browser Automation Task: {{userInput}}

Browser Context: {{browserContext}}

Execute this task using browser automation tools, then report completion.`,
      variables: [
        { name: 'userInput', type: 'string', description: 'Step/task description', required: true },
        { name: 'browserContext', type: 'object', description: 'Browser context', required: false },
      ],
      tools: [
        'navigateToUrl','clickElement','fillForm','waitFor','takeScreenshot','scrollPage','getHighlightedElements','analyzeElement','findElementsByText','captureElementScreenshot','automationReport'
      ],
      contexts: ['automation'],
    };

    // Web3 Agent template
    const web3OnlyTemplate: PromptTemplate = {
      id: 'web3_agent',
      name: 'Web3 Agent',
      description: 'Perform Web3 wallet and on-chain operations only',
      systemPrompt: `You are the Web3 Agent, responsible for performing blockchain and Web3 operations.

Goals:
- Execute Web3 operations using the provided tools
- Perform safe blockchain transactions and queries
- Report results back to the Orchestrator Agent

Rules:
- Use only Web3 tools provided
- Confirm risky actions with clear summaries
- Always report completion using web3Report tool
- Keep output concise and informative
- Provide transaction details when relevant`,
      userPromptTemplate: `Web3 Task: {{userInput}}

Web3 Context: {{context}}

Execute this Web3 task using the provided tools, then report completion.`,
      variables: [
        { name: 'userInput', type: 'string', description: 'Web3 step/task description', required: true },
        { name: 'context', type: 'object', description: 'Web3 context', required: false },
      ],
      tools: ['checkBalance','sendTransaction','approveToken','swapTokens','bridgeTokens','stakeTokens','getNativeBalance','getTokenBalances','getAllAssets','getAssetPrices','web3Report'],
      contexts: ['web3only'],
    };

    // Element selection template (concise Claude-style guidance)
    const elementSelectionTemplate: PromptTemplate = {
      id: 'element_selection',
      name: 'Element Selection',
      description: 'Interactive element selection and analysis for web automation',
      systemPrompt: `You are an AI assistant for element selection. Work visually and be precise.

Principles:
- Highlight elements to guide selection.
- Prefer robust selectors and index-based fallbacks.
- Consider visibility, accessibility, and interactivity.
- Keep guidance concise and stepwise.

Context:
- Mode: {{selectionMode}}
- URL: {{currentUrl}}
- Elements: {{availableElements}}
- User intent: {{userIntent}}

Tools: getClickableElements, analyzeElement, highlightElement, captureElementScreenshot.
Flow: activate selector → highlight → analyze as needed → propose reliable selector.`,
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
        'captureElementScreenshot',
      ],
      contexts: ['element_selection', 'browser_automation', 'ui_interaction'],
    };

    // Register default templates
    this.registerTemplate(web3AssistantTemplate);
    this.registerTemplate(browserAutomationTemplate);
    this.registerTemplate(functionCallingTemplate);
    this.registerTemplate(elementSelectionTemplate);
    this.registerTemplate(plannerTemplate);
    this.registerTemplate(orchestratorTemplate);
    this.registerTemplate(automationTemplate);
    this.registerTemplate(web3OnlyTemplate);

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
    // Priority-based template selection
    const { tools } = promptContext;

    // Check if we have agent-specific tools (indicating a specific agent turn)
    const hasOrchestratorTools = tools?.some(tool => tool.owner === 'orchestrator') || false;
    const hasPlannerTools = tools?.some(tool => tool.owner === 'planner') || false;
    const hasAutomationTools = tools?.some(tool => tool.owner === 'automation') || false;
    const hasWeb3Tools = tools?.some(tool => tool.owner === 'web3') || false;

    // Debug logging
    logger.info('🔍 Prompt template selection:', {
      hasOrchestratorTools,
      hasPlannerTools,
      hasAutomationTools,
      hasWeb3Tools,
      toolOwners: tools?.map(t => t.owner).filter(Boolean) || [],
      toolNames: tools?.map(t => t.name) || []
    });

    // Agent-specific template selection with strict isolation
    if (hasAutomationTools && !hasOrchestratorTools && !hasPlannerTools && !hasWeb3Tools) {
      logger.info('🤖 Selecting Automation Agent template');
      return this.getTemplate('automation_agent') || this.getTemplate('browser_automation')!;
    }
    if (hasWeb3Tools && !hasOrchestratorTools && !hasPlannerTools && !hasAutomationTools) {
      logger.info('🔗 Selecting Web3 Agent template');
      return this.getTemplate('web3_agent') || this.getTemplate('web3_assistant')!;
    }
    if (hasPlannerTools && !hasOrchestratorTools && !hasAutomationTools && !hasWeb3Tools) {
      logger.info('📋 Selecting Planner Agent template');
      return this.getTemplate('planner_agent') || this.getTemplate('function_calling')!;
    }
    if (hasOrchestratorTools && !hasAutomationTools && !hasWeb3Tools) {
      logger.info('🎯 Selecting Orchestrator Agent template');
      return this.getTemplate('orchestrator_agent') || this.getTemplate('function_calling')!;
    }

    // Fallback to orchestrator for mixed or unclear contexts
    logger.info('🎯 Falling back to Orchestrator Agent template');
    return this.getTemplate('orchestrator_agent') || this.getTemplate('function_calling')!;
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
