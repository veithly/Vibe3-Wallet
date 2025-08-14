import { z } from 'zod';
import { IWeb3LLM, Web3Context, LLMResponse } from '../llm/types';
import { HumanMessage, SystemMessage } from '../llm/messages';
import { createLogger } from '@/utils/logger';

const logger = createLogger('IntelligentTaskAnalyzer');

// Task analysis schemas
export const TaskAnalysisSchema = z.object({
  taskType: z.enum(['navigation', 'form_filling', 'content_extraction', 'web3_operation', 'interaction', 'automation']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  requiresBrowserAutomation: z.boolean(),
  requiresWeb3: z.boolean(),
  complexity: z.enum(['low', 'medium', 'high']),
  estimatedSteps: z.number().min(1).max(20),
  browserActions: z.array(z.string()).optional(),
  web3Actions: z.array(z.string()).optional(),
  entities: z.array(z.object({
    type: z.string(),
    value: z.string(),
    confidence: z.number()
  })).optional(),
  timestamp: z.number().optional(),
  analysis: z.string().optional()
});

export type TaskAnalysis = z.infer<typeof TaskAnalysisSchema>;

// Task type definitions
export type AutomationTaskType = 
  | 'navigation'
  | 'form_filling'
  | 'content_extraction'
  | 'web3_operation'
  | 'interaction'
  | 'automation';

/**
 * Intelligent Task Analyzer that uses LLM to analyze user instructions
 * instead of hardcoded string matching
 */
export class IntelligentTaskAnalyzer {
  private llm: IWeb3LLM;
  private analysisCache: Map<string, CacheEntry> = new Map();
  private cacheTimeoutMs: number = 60000; // 1 minute cache

  constructor(llm: IWeb3LLM) {
    this.llm = llm;
  }

  /**
   * Analyze user instruction to determine task type and requirements
   */
  async analyzeTask(
    instruction: string,
    context: Web3Context
  ): Promise<TaskAnalysis> {
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(instruction, context);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        logger.debug('Using cached task analysis', { taskType: cached.taskType });
        return cached;
      }

      logger.info('Analyzing task with AI', { instruction });

      // Create analysis prompt
      const analysisPrompt = this.createAnalysisPrompt(instruction, context);

      // Get LLM analysis
      const response = await this.llm.generateResponse(
        [new SystemMessage(analysisPrompt.systemPrompt), new HumanMessage(analysisPrompt.userPrompt)],
        context
      );

      // Parse and validate response
      const analysis = this.parseAnalysisResponse(response.response);
      
      // Cache the result
      this.setToCache(cacheKey, analysis);

      logger.info('Task analysis completed', {
        taskType: analysis.taskType,
        confidence: analysis.confidence,
        complexity: analysis.complexity
      });

      return analysis;
    } catch (error) {
      logger.error('Task analysis failed', error);
      
      // Fallback to simple analysis
      return this.getFallbackAnalysis(instruction);
    }
  }

  /**
   * Create structured prompt for task analysis
   */
  private createAnalysisPrompt(instruction: string, context: Web3Context): {
    systemPrompt: string;
    userPrompt: string;
  } {
    const systemPrompt = `You are an intelligent task analyzer for a Web3 AI assistant. Your job is to analyze user instructions and determine:

1. Task Type: What type of task is this?
2. Requirements: Does it require browser automation, Web3 operations, or both?
3. Complexity: How complex is this task?
4. Steps: How many steps will this task require?

Task Types:
- navigation: Opening URLs, navigating between pages
- form_filling: Filling out forms, inputting data
- content_extraction: Reading page content, scraping data
- web3_operation: Token swaps, transfers, contract interactions
- interaction: Clicking elements, scrolling, etc.
- automation: Complex multi-step automation sequences

Complexity Levels:
- low: Single step, straightforward
- medium: Multiple steps, some complexity
- high: Many steps, complex logic, error-prone

You must respond with a JSON object in this exact format:
{
  "taskType": "navigation|form_filling|content_extraction|web3_operation|interaction|automation",
  "confidence": 0.8,
  "reasoning": "Brief explanation of your analysis",
  "requiresBrowserAutomation": true/false,
  "requiresWeb3": true/false,
  "complexity": "low|medium|high",
  "estimatedSteps": 3,
  "browserActions": ["navigate", "click"],
  "web3Actions": ["approve", "swap"],
  "entities": [
    {
      "type": "url|form_element|button|token|contract",
      "value": "extracted value",
      "confidence": 0.9
    }
  ]
}

Examples:
1. User: "Open uniswap and swap ETH for USDC"
   Response: {
     "taskType": "automation",
     "confidence": 0.95,
     "reasoning": "User wants to navigate to Uniswap and perform a token swap",
     "requiresBrowserAutomation": true,
     "requiresWeb3": true,
     "complexity": "medium",
     "estimatedSteps": 5,
     "browserActions": ["navigate", "click", "input"],
     "web3Actions": ["connect_wallet", "approve", "swap"],
     "entities": [
       {"type": "url", "value": "uniswap.org", "confidence": 0.9},
       {"type": "token", "value": "ETH", "confidence": 1.0},
       {"type": "token", "value": "USDC", "confidence": 1.0}
     ]
   }

2. User: "What's my ETH balance?"
   Response: {
     "taskType": "web3_operation",
     "confidence": 0.9,
     "reasoning": "Simple balance check query",
     "requiresBrowserAutomation": false,
     "requiresWeb3": true,
     "complexity": "low",
     "estimatedSteps": 1,
     "web3Actions": ["check_balance"],
     "entities": [
       {"type": "token", "value": "ETH", "confidence": 1.0}
     ]
   }`;

    const userPrompt = `Analyze this user instruction: "${instruction}"

Current context:
- Network: Chain ID ${context.currentChain}
- Address: ${context.currentAddress || 'Not connected'}
- Risk Level: ${context.riskLevel}

Provide your analysis in the required JSON format.`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Parse and validate LLM response
   */
  private parseAnalysisResponse(response: string): TaskAnalysis {
    try {
      // Extract JSON from response (handle cases where LLM adds extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate with Zod schema
      const validated = TaskAnalysisSchema.parse(parsed);
      
      return validated;
    } catch (error) {
      logger.error('Failed to parse analysis response', { response, error });
      throw new Error(`Invalid analysis response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fallback analysis when LLM fails
   */
  private getFallbackAnalysis(instruction: string): TaskAnalysis {
    const lowerInstruction = instruction.toLowerCase();
    
    // Simple keyword-based fallback
    const hasWeb3Keywords = /(swap|transfer|balance|approve|stake|bridge|token|eth|usdc|usdt|wallet|connect)/i.test(instruction);
    const hasBrowserKeywords = /(open|navigate|click|fill|form|page|website|url)/i.test(instruction);
    const hasQueryKeywords = /(what|how|check|show|tell|price|value)/i.test(instruction);

    let taskType: AutomationTaskType = 'interaction';
    let complexity: 'low' | 'medium' | 'high' = 'low';
    let estimatedSteps = 1;

    if (hasQueryKeywords && !hasBrowserKeywords) {
      taskType = 'web3_operation';
      complexity = 'low';
      estimatedSteps = 1;
    } else if (hasWeb3Keywords && hasBrowserKeywords) {
      taskType = 'automation';
      complexity = 'medium';
      estimatedSteps = 3;
    } else if (hasWeb3Keywords) {
      taskType = 'web3_operation';
      complexity = 'medium';
      estimatedSteps = 2;
    } else if (hasBrowserKeywords) {
      taskType = 'navigation';
      complexity = 'low';
      estimatedSteps = 2;
    }

    return {
      taskType,
      confidence: 0.5, // Lower confidence for fallback
      reasoning: 'Fallback analysis due to LLM error',
      requiresBrowserAutomation: hasBrowserKeywords,
      requiresWeb3: hasWeb3Keywords,
      complexity,
      estimatedSteps,
      browserActions: hasBrowserKeywords ? ['navigate'] : undefined,
      web3Actions: hasWeb3Keywords ? ['query'] : undefined,
      entities: []
    };
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(instruction: string, context: Web3Context): string {
    return `${instruction}_${context.currentChain}_${context.currentAddress || 'disconnected'}`;
  }

  /**
   * Get from cache
   */
  private getFromCache(key: string): TaskAnalysis | null {
    const cached = this.analysisCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeoutMs) {
      return cached.analysis;
    }
    return null;
  }

  /**
   * Set to cache
   */
  private setToCache(key: string, analysis: TaskAnalysis): void {
    this.analysisCache.set(key, {
      analysis,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.analysisCache.clear();
    logger.info('Task analysis cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    // Basic stats - could be enhanced with hit tracking
    return {
      size: this.analysisCache.size,
      hitRate: 0 // Would need hit tracking implementation
    };
  }

  /**
   * Check if task requires browser automation
   */
  requiresBrowserAutomation(instruction: string, context: Web3Context): Promise<boolean> {
    return this.analyzeTask(instruction, context).then(analysis => analysis.requiresBrowserAutomation);
  }

  /**
   * Check if task requires Web3 operations
   */
  requiresWeb3(instruction: string, context: Web3Context): Promise<boolean> {
    return this.analyzeTask(instruction, context).then(analysis => analysis.requiresWeb3);
  }

  /**
   * Get task complexity
   */
  getTaskComplexity(instruction: string, context: Web3Context): Promise<'low' | 'medium' | 'high'> {
    return this.analyzeTask(instruction, context).then(analysis => analysis.complexity);
  }
}

// Cache entry type
interface CacheEntry {
  analysis: TaskAnalysis;
  timestamp: number;
}