import { createLogger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { AgentConfigManager } from './schemas/AgentConfig';
import { AgentCapability, AgentStatus, SelectedElement, AgentError } from './AgentTypes';

const logger = createLogger('ElementSelector');

// Page text/content snapshot for completion checks (nanobrowser-like parsing)
export interface PageTextSnapshot {
  url: string;
  title: string;
  text: string; // normalized visible text (scripts/styles excluded)
  headings: string[];
  links: Array<{ href: string; text: string }>;
  inputs: Array<{ name?: string; id?: string; placeholder?: string; ariaLabel?: string; labelText?: string; type?: string }>;
  meta: Record<string, string>;
  wordCount: number;
  length: number;
  timestamp: number;
}

export interface CompletionCriteria {
  includeAll?: string[]; // all must appear (case-insensitive)
  includeAny?: string[]; // at least one must appear
  excludeAny?: string[]; // none may appear
  regexIncludeAll?: string[]; // string patterns for RegExp
  regexExcludeAny?: string[]; // string patterns for RegExp
  minWordCount?: number;
}

export interface CompletionOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface CompletionResult {
  completed: boolean;
  score: number; // heuristic confidence 0..1
  matched: {
    includeAll: string[];
    includeAny: string[];
    regexIncludeAll: string[];
    regexExcludeAny: string[];
  };
  missing: {
    includeAll: string[];
    regexIncludeAll: string[];
  };
  excludedMatched: {
    excludeAny: string[];
    regexExcludeAny: string[];
  };
  snapshot: PageTextSnapshot;
  reasoning: string;
}

export interface TextWaitResult {
  found: boolean;
  matched: string[];
  missing: string[];
  snapshot?: PageTextSnapshot;
}

// Element information structure
export interface ElementInfo {
  index: number;
  tagName: string;
  attributes: Record<string, string>;
  text: string;
  isVisible: boolean;
  isClickable: boolean;
  isInteractive: boolean;
  xpath: string;
  cssSelector: string;
  boundingRect?: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  children: number;
  depth: number;
}

// Element selection criteria
export interface SelectionCriteria {
  type?: 'button' | 'link' | 'input' | 'select' | 'textarea' | 'checkbox' | 'radio';
  text?: string;
  textContains?: string;
  attributes?: Record<string, string>;
  isVisible?: boolean;
  isClickable?: boolean;
  hasText?: boolean;
  maxDepth?: number;
  minConfidence?: number;
}

// Selection result
export interface SelectionResult {
  elements: ElementInfo[];
  confidence: number;
  reasoning: string;
  description: string;
  fallbackSelectors?: string[];
}

// Enhanced selection result with AI-powered features
export interface EnhancedSelectionResult extends SelectionResult {
  aiAnalysis?: {
    naturalLanguageMatch: number;
    contextRelevance: number;
    visualSimilarity: number;
    confidenceScore: number;
    reasoning: string;
  };
  alternatives?: ElementInfo[];
  fallbackStrategies?: string[];
}

// Index-based element selector with AI-powered enhancements
export class IndexBasedElementSelector {
  private elementCache: Map<number, ElementInfo> = new Map();
  private currentIndex: number = 0;
  private cacheTimestamp: number = 0;
  private readonly cacheTimeoutMs: number = 5000; // 5 seconds cache
  private config: AgentConfigManager;
  private selectionHistory: Map<string, EnhancedSelectionResult[]> = new Map();

  constructor(config?: AgentConfigManager) {
    this.config = config || new AgentConfigManager('development');
  }

  /**
   * Get all interactive elements on the page with index-based mapping
   */
  async getPageElements(tabId: number): Promise<SelectionResult> {
    try {
      // Check cache first
      if (this.isCacheValid()) {
        const cachedElements = Array.from(this.elementCache.values());
        return {
          elements: cachedElements,
          confidence: 0.9,
          reasoning: 'Using cached element data',
          description: 'Cached page elements',
        };
      }

      // Execute script to get page elements (inline, with error capture)
      let results: any[] | undefined;
      const inlineExtract = () => {
        try {
          const elements: any[] = [];
          let index = 0;
          function isVisible(element: Element): boolean {
            const rect = (element as HTMLElement).getBoundingClientRect();
            const style = window.getComputedStyle(element as Element);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          }
          function isClickable(element: Element): boolean {
            const tagName = element.tagName.toLowerCase();
            const clickableTags = ['button', 'a', 'input', 'select', 'textarea', 'summary'];
            if (clickableTags.includes(tagName)) return true;
            const style = window.getComputedStyle(element as Element);
            return style.cursor === 'pointer' || element.hasAttribute('onclick') || (element.hasAttribute('role') && element.getAttribute('role') === 'button');
          }
          function getElementPath(element: Element): string {
            const path: string[] = [];
            let current: Element | null = element;
            while (current && current.nodeType === Node.ELEMENT_NODE) {
              let selector = current.tagName.toLowerCase();
              if ((current as HTMLElement).id) selector += `#${(current as HTMLElement).id}`;
              else {
                const className = current.getAttribute('class');
                if (className) selector += `.${className.trim().split(/\s+/).join('.')}`;
              }
              path.unshift(selector);
              current = current.parentElement;
            }
            return path.join(' > ');
          }
          function getElementXPath(element: Element): string {
            if ((element as HTMLElement).id) return `//*[@id="${(element as HTMLElement).id}"]`;
            const path: string[] = [];
            let current: Element | null = element;
            while (current && current.nodeType === Node.ELEMENT_NODE) {
              let idx = 0;
              let sibling: Element | null = current;
              while (sibling) {
                if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) idx++;
                sibling = sibling.previousElementSibling;
              }
              const tagName = current.tagName.toLowerCase();
              const seg = idx > 1 ? `${tagName}[${idx}]` : tagName;
              path.unshift(seg);
              current = current.parentElement;
            }
            return '/' + path.join('/');
          }
          function getDepth(element: Element): number {
            let depth = 0;
            let current: Element | null = element;
            while (current && current.parentElement) { depth++; current = current.parentElement; }
            return depth;
          }
          function getElementAttributes(element: Element): Record<string, string> {
            const attrs: Record<string, string> = {};
            for (let i = 0; i < element.attributes.length; i++) {
              const a = element.attributes[i];
              attrs[a.name] = a.value;
            }
            return attrs;
          }
          function process(el: Element) {
            if (!isVisible(el)) return;
            const rect = (el as HTMLElement).getBoundingClientRect();
            const info = {
              index: index++,
              tagName: el.tagName,
              attributes: getElementAttributes(el),
              text: el.textContent || '',
              isVisible: true,
              isClickable: isClickable(el),
              isInteractive: ['A','BUTTON','INPUT','SELECT','TEXTAREA','SUMMARY'].includes(el.tagName),
              xpath: getElementXPath(el),
              cssSelector: getElementPath(el),
              boundingRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
              children: el.children.length,
              depth: getDepth(el),
            } as any;
            elements.push(info);
            if (info.depth < 10) Array.from(el.children).forEach(process);
          }
          process(document.body);
          return { ok: true, elements };
        } catch (e) {
          return { ok: false, error: (e as any)?.message || String(e) };
        }
      };
      try {
        results = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN' as any, func: inlineExtract });
      } catch (_) {
        results = await chrome.scripting.executeScript({ target: { tabId }, func: inlineExtract });
      }
      const payload = results?.[0]?.result;
      if (!payload?.ok) {
        logger.error('Elements extraction failed', { tabId, error: payload?.error });
        throw new Error(payload?.error || 'Failed to extract page elements');
      }
      const elements = payload.elements as ElementInfo[];

      // Update cache
      this.updateElementCache(elements);

      logger.info('Extracted page elements', {
        count: elements.length,
        tabId,
        cacheUpdated: true,
      });

      return {
        elements,
        confidence: 0.95,
        reasoning: `Successfully extracted ${elements.length} interactive elements`,
        description: `Extracted ${elements.length} interactive elements`,
      };

    } catch (error) {
      logger.error('Failed to get page elements', error);

      // Return cached elements if available
      if (this.elementCache.size > 0) {
        const cachedElements = Array.from(this.elementCache.values());
        return {
          elements: cachedElements,
          confidence: 0.6,
          reasoning: 'Using stale cache due to extraction error',
          description: 'Stale cached elements',
          fallbackSelectors: ['body *'],
        };
      }

      return {
        elements: [],
        confidence: 0,
        reasoning: `Failed to extract elements: ${error instanceof Error ? error.message : 'Unknown error'}`,
        description: 'No elements available',
        fallbackSelectors: ['body *'],
      };
    }
  }

  /**
   * Extract a comprehensive visible-text snapshot of the current page (nanobrowser-like parsing)
   */
  async getPageTextSnapshot(tabId: number): Promise<PageTextSnapshot> {
    const inlineSnapshot = () => {
      try {
        // debug marker
        (window as any).__V3_SNAP_DBG = (window as any).__V3_SNAP_DBG || { runs: 0 };
        (window as any).__V3_SNAP_DBG.runs += 1;
        const dbgStart = Date.now();
        function isElementVisible(el: Element | null): boolean {
          if (!el || !(el instanceof Element)) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          const rect = (el as HTMLElement).getBoundingClientRect?.();
          if (!rect) return true;
          if (rect.width === 0 && rect.height === 0) return false;
          return true;
        }
        function normalizeWhitespace(s: string): string { return s.replace(/\s+/g, ' ').trim(); }
        const SKIP_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE']);
        function collectTextFromRoot(root: Document | ShadowRoot | HTMLElement): string {
          const parts: string[] = [];
          const walker = document.createTreeWalker(root as any, NodeFilter.SHOW_TEXT, {
            acceptNode(node: Node) {
              const parent = (node as any).parentElement as Element | null;
              if (!parent) return NodeFilter.FILTER_REJECT;
              if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
              const raw = (node.nodeValue || '').trim();
              if (!raw) return NodeFilter.FILTER_REJECT;
              if (!isElementVisible(parent)) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          } as any);
          let n: Node | null;
          while ((n = walker.nextNode())) {
            const txt = normalizeWhitespace(n.nodeValue || '');
            if (txt) parts.push(txt);
          }
          (root as any).querySelectorAll?.('img[alt]')?.forEach((img: HTMLImageElement) => {
            if (img.alt && isElementVisible(img)) parts.push(normalizeWhitespace(img.alt));
          });
          return normalizeWhitespace(parts.join(' '));
        }
        function getHeadings(): string[] {
          const arr: string[] = [];
          const nodes = document.querySelectorAll('h1,h2,h3,h4,h5,h6');
          nodes.forEach((el) => { if (isElementVisible(el)) arr.push(normalizeWhitespace((el as HTMLElement).innerText || '')); });
          return arr.filter(Boolean);
        }
        function getLinks(): Array<{ href: string; text: string }> {
          const arr: Array<{ href: string; text: string }> = [];
          document.querySelectorAll('a[href]')?.forEach((a) => {
            if (!isElementVisible(a)) return;
            const href = (a as HTMLAnchorElement).href;
            const text = normalizeWhitespace((a as HTMLElement).innerText || (a as HTMLAnchorElement).title || '');
            arr.push({ href, text });
          });
          return arr;
        }
        function labelTextFor(el: Element): string | undefined {
          const id = (el as HTMLElement).id;
          if (id) {
            const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
            if (label && isElementVisible(label)) return normalizeWhitespace((label as HTMLElement).innerText || '');
          }
          const parentLabel = el.closest('label');
          if (parentLabel && isElementVisible(parentLabel)) return normalizeWhitespace((parentLabel as HTMLElement).innerText || '');
          return undefined;
        }
        function getInputs(): Array<{ name?: string; id?: string; placeholder?: string; ariaLabel?: string; labelText?: string; type?: string }> {
          const arr: Array<{ name?: string; id?: string; placeholder?: string; ariaLabel?: string; labelText?: string; type?: string }> = [];
          document.querySelectorAll('input,textarea,select').forEach((el) => {
            if (!isElementVisible(el)) return;
            const anyEl = el as any;
            arr.push({
              name: anyEl.name,
              id: anyEl.id,
              placeholder: anyEl.placeholder,
              ariaLabel: anyEl.getAttribute?.('aria-label') || undefined,
              labelText: labelTextFor(el),
              type: anyEl.type,
            });
          });
          return arr;
        }
        function getMeta(): Record<string, string> {
          const meta: Record<string, string> = {};
          document.querySelectorAll('meta[name],meta[property]').forEach((m) => {
            const name = (m.getAttribute('name') || m.getAttribute('property')) as string;
            const content = m.getAttribute('content') || '';
            if (name) meta[name] = content;
          });
          return meta;
        }
        const text = collectTextFromRoot(document.body);
        const headings = getHeadings();
        const links = getLinks();
        const inputs = getInputs();
        const meta = getMeta();
        const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
        const snapshot = {
          url: location.href,
          title: document.title || '',
          text,
          headings,
          links,
          inputs,
          meta,
          wordCount,
          length: text.length,
          timestamp: Date.now(),
        };
        return { ok: true, snapshot, meta: { tookMs: Date.now() - dbgStart, runs: (window as any).__V3_SNAP_DBG.runs } };
      } catch (e) {
        return { ok: false, error: (e as any)?.message || String(e), stack: (e as any)?.stack };
      }
    };
    let results: any[] | undefined;
    try {
      results = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN' as any, func: inlineSnapshot });
    } catch (_) {
      results = await chrome.scripting.executeScript({ target: { tabId }, func: inlineSnapshot });
    }
    const payload = results?.[0]?.result;
    if (!payload?.ok) {
      logger.error('Snapshot extraction failed', { tabId, error: payload?.error, stack: payload?.stack });
      throw new Error(payload?.error || 'Failed to extract page text snapshot');
    }
    const snapshot = payload.snapshot as PageTextSnapshot;
    logger.info('Extracted page text snapshot', {
      url: snapshot.url,
      title: snapshot.title,
      length: snapshot.length,
      wordCount: snapshot.wordCount,
      meta: payload?.meta,
    });
    return snapshot;
  }

  /**
   * Convenience to get only the visible text
   */
  async getAllVisibleText(tabId: number): Promise<string> {
    const snap = await this.getPageTextSnapshot(tabId);
    return snap.text;
  }

  /**
   * Evaluate completion based on include/exclude criteria from a snapshot
   */
  evaluateCompletionFromSnapshot(
    snapshot: PageTextSnapshot,
    criteria: CompletionCriteria
  ): CompletionResult {
    const textLower = (snapshot.text || '').toLowerCase();
    const matchedIncludeAll: string[] = [];
    const missingIncludeAll: string[] = [];
    const matchedIncludeAny: string[] = [];
    const matchedRegexIncludeAll: string[] = [];
    const missingRegexIncludeAll: string[] = [];
    const matchedExcludeAny: string[] = [];
    const matchedRegexExcludeAny: string[] = [];

    const includesAll = (criteria.includeAll || []).every((term) => {
      const ok = textLower.includes(term.toLowerCase());
      if (ok) matchedIncludeAll.push(term); else missingIncludeAll.push(term);
      return ok;
    });

    const includesAny = (criteria.includeAny || []).some((term) => {
      const ok = textLower.includes(term.toLowerCase());
      if (ok) matchedIncludeAny.push(term);
      return ok;
    });

    const regexAllOk = (criteria.regexIncludeAll || []).every((pat) => {
      try {
        const re = new RegExp(pat, 'i');
        const ok = re.test(snapshot.text);
        if (ok) matchedRegexIncludeAll.push(pat); else missingRegexIncludeAll.push(pat);
        return ok;
      } catch (_) {
        missingRegexIncludeAll.push(pat);
        return false;
      }
    });

    (criteria.excludeAny || []).forEach((term) => {
      if (textLower.includes(term.toLowerCase())) matchedExcludeAny.push(term);
    });

    (criteria.regexExcludeAny || []).forEach((pat) => {
      try { if (new RegExp(pat, 'i').test(snapshot.text)) matchedRegexExcludeAny.push(pat); } catch (_) {}
    });

    const minWordOk = criteria.minWordCount ? snapshot.wordCount >= criteria.minWordCount : true;

    const noExcludes = matchedExcludeAny.length === 0 && matchedRegexExcludeAny.length === 0;
    const includeAnyOk = (criteria.includeAny && criteria.includeAny.length > 0) ? includesAny : true;
    const completed = includesAll && regexAllOk && includeAnyOk && noExcludes && minWordOk;

    // Heuristic score
    let score = 1.0;
    if (!includesAll || !regexAllOk) score -= 0.4;
    if (!includeAnyOk) score -= 0.2;
    if (!noExcludes) score -= 0.4;
    if (!minWordOk) score -= 0.1;
    score = Math.max(0, Math.min(1, score));

    const reasoningParts: string[] = [];
    if (missingIncludeAll.length > 0) reasoningParts.push(`Missing includeAll: ${missingIncludeAll.join(', ')}`);
    if (missingRegexIncludeAll.length > 0) reasoningParts.push(`Missing regexIncludeAll: ${missingRegexIncludeAll.join(', ')}`);
    if (matchedExcludeAny.length > 0 || matchedRegexExcludeAny.length > 0) reasoningParts.push('Excluded terms present');
    if (!criteria.minWordCount || minWordOk) reasoningParts.push(`WordCount=${snapshot.wordCount}`);

    return {
      completed,
      score,
      matched: {
        includeAll: matchedIncludeAll,
        includeAny: matchedIncludeAny,
        regexIncludeAll: matchedRegexIncludeAll,
        regexExcludeAny: matchedRegexExcludeAny,
      },
      missing: {
        includeAll: missingIncludeAll,
        regexIncludeAll: missingRegexIncludeAll,
      },
      excludedMatched: {
        excludeAny: matchedExcludeAny,
        regexExcludeAny: matchedRegexExcludeAny,
      },
      snapshot,
      reasoning: reasoningParts.join('. '),
    };
  }

  /**
   * Extract then evaluate completion in one call
   */
  async evaluateCompletion(
    tabId: number,
    criteria: CompletionCriteria
  ): Promise<CompletionResult> {
    const snap = await this.getPageTextSnapshot(tabId);
    return this.evaluateCompletionFromSnapshot(snap, criteria);
  }

  /**
   * Wait until all specified texts/regexes appear in page text or timeout
   */
  async waitForText(
    tabId: number,
    texts: Array<string | RegExp>,
    timeoutMs: number = 8000,
    pollIntervalMs: number = 500
  ): Promise<TextWaitResult> {
    const deadline = Date.now() + timeoutMs;
    let lastSnap: PageTextSnapshot | undefined;
    const normalized: Array<RegExp> = texts.map((t) => (t instanceof RegExp ? t : new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')));

    while (Date.now() < deadline) {
      lastSnap = await this.getPageTextSnapshot(tabId);
      const found: string[] = [];
      const missing: string[] = [];
      normalized.forEach((re, idx) => {
        const ok = re.test(lastSnap!.text);
        if (ok) found.push(texts[idx].toString()); else missing.push(texts[idx].toString());
      });
      if (missing.length === 0) return { found: true, matched: found, missing: [], snapshot: lastSnap };
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    // Final check
    if (!lastSnap) lastSnap = await this.getPageTextSnapshot(tabId);
    const found: string[] = [];
    const missing: string[] = [];
    normalized.forEach((re, idx) => { if (re.test(lastSnap!.text)) found.push(texts[idx].toString()); else missing.push(texts[idx].toString()); });
    return { found: missing.length === 0, matched: found, missing, snapshot: lastSnap };
  }

  /**
   * Poll until completion criteria satisfied or timeout
   */
  async waitForCompletion(
    tabId: number,
    criteria: CompletionCriteria,
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const timeoutMs = options?.timeoutMs ?? 10000;
    const pollIntervalMs = options?.pollIntervalMs ?? 600;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const res = await this.evaluateCompletion(tabId, criteria);
      if (res.completed) return res;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    // Final attempt
    return this.evaluateCompletion(tabId, criteria);
  }

  /**
   * Find elements by selection criteria
   */
  async findElementsByCriteria(
    tabId: number,
    criteria: SelectionCriteria
  ): Promise<SelectionResult> {
    try {
      const pageResult = await this.getPageElements(tabId);
      let filteredElements = [...pageResult.elements];

      // Apply filters
      if (criteria.type) {
        filteredElements = filteredElements.filter(el =>
          el.tagName.toLowerCase() === criteria.type ||
          (criteria.type === 'button' && (el.tagName === 'BUTTON' || el.attributes.type === 'button')) ||
          (criteria.type === 'link' && el.tagName === 'A')
        );
      }

      if (criteria.text) {
        filteredElements = filteredElements.filter(el =>
          el.text.toLowerCase().includes(criteria.text!.toLowerCase())
        );
      }

      if (criteria.textContains) {
        filteredElements = filteredElements.filter(el =>
          el.text.toLowerCase().includes(criteria.textContains!.toLowerCase())
        );
      }

      if (criteria.attributes) {
        filteredElements = filteredElements.filter(el => {
          for (const [key, value] of Object.entries(criteria.attributes!)) {
            if (el.attributes[key] !== value) {
              return false;
            }
          }
          return true;
        });
      }

      if (criteria.isVisible !== undefined) {
        filteredElements = filteredElements.filter(el => el.isVisible === criteria.isVisible);
      }

      if (criteria.isClickable !== undefined) {
        filteredElements = filteredElements.filter(el => el.isClickable === criteria.isClickable);
      }

      if (criteria.hasText !== undefined) {
        filteredElements = filteredElements.filter(el =>
          criteria.hasText ? el.text.trim().length > 0 : el.text.trim().length === 0
        );
      }

      if (criteria.maxDepth !== undefined) {
        filteredElements = filteredElements.filter(el => el.depth <= criteria.maxDepth!);
      }

      // Sort by confidence (combination of visibility, clickability, and text relevance)
      filteredElements.sort((a, b) => {
        const scoreA = this.calculateElementScore(a, criteria);
        const scoreB = this.calculateElementScore(b, criteria);
        return scoreB - scoreA;
      });

      const confidence = this.calculateSelectionConfidence(filteredElements, criteria);

      logger.info('Found elements by criteria', {
        criteria,
        foundCount: filteredElements.length,
        confidence,
      });

      return {
        elements: filteredElements,
        confidence,
        reasoning: this.generateSelectionReasoning(filteredElements, criteria),
        description: `Filtered elements: ${filteredElements.length}`,
      };

    } catch (error) {
      logger.error('Failed to find elements by criteria', { criteria, error });
      return {
        elements: [],
        confidence: 0,
        reasoning: `Selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        description: 'Selection failed',
      };
    }
  }

  /**
   * Get element by index
   */
  async getElementByIndex(tabId: number, index: number): Promise<ElementInfo | null> {
    try {
      const pageResult = await this.getPageElements(tabId);
      return pageResult.elements.find(el => el.index === index) || null;
    } catch (error) {
      logger.error('Failed to get element by index', { index, error });
      return null;
    }
  }

  /**
   * Find best element for text-based interaction
   */
  async findBestElementForText(
    tabId: number,
    text: string,
    type: 'click' | 'input' = 'click'
  ): Promise<{ element: ElementInfo | null; confidence: number; reasoning: string }> {
    try {
      const criteria: SelectionCriteria = {
        textContains: text,
        isVisible: true,
        isClickable: type === 'click',
      };

      if (type === 'input') {
        criteria.type = 'input';
      }

      const result = await this.findElementsByCriteria(tabId, criteria);

      if (result.elements.length > 0) {
        return {
          element: result.elements[0],
          confidence: result.confidence,
          reasoning: result.reasoning,
        };
      }

      // Fuzzy search if no exact match
      const fuzzyResult = await this.fuzzyTextSearch(tabId, text, type);
      return fuzzyResult;

    } catch (error) {
      logger.error('Failed to find best element for text', { text, type, error });
      return {
        element: null,
        confidence: 0,
        reasoning: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Highlight element for visual feedback
   */
  async highlightElement(tabId: number, index: number, duration: number = 2000): Promise<boolean> {
    try {
      const element = await this.getElementByIndex(tabId, index);
      if (!element) {
        logger.warn('Cannot highlight non-existent element', { index });
        return false;
      }

      await chrome.scripting.executeScript({
        target: { tabId },
        func: this.highlightElementInPage,
        args: [element, duration],
      });

      logger.info('Highlighted element', { index, duration });
      return true;

    } catch (error) {
      logger.error('Failed to highlight element', { index, error });
      return false;
    }
  }

  /**
   * Click element by index
   */
  async clickElementByIndex(tabId: number, index: number): Promise<boolean> {
    try {
      const element = await this.getElementByIndex(tabId, index);
      if (!element) {
        logger.warn('Cannot click non-existent element', { index });
        return false;
      }

      if (!element.isClickable) {
        logger.warn('Element is not clickable', { index, element });
        return false;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: this.clickElementInPage,
        args: [element],
      });

      const success = results[0]?.result?.success || false;

      logger.info('Clicked element', { index, success });
      return success;

    } catch (error) {
      logger.error('Failed to click element', { index, error });
      return false;
    }
  }

  /**
   * Input text into element by index
   */
  async inputTextByIndex(tabId: number, index: number, text: string): Promise<boolean> {
    try {
      const element = await this.getElementByIndex(tabId, index);
      if (!element) {
        logger.warn('Cannot input text into non-existent element', { index });
        return false;
      }

      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) {
        logger.warn('Element is not an input field', { index, tagName: element.tagName });
        return false;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: this.inputTextInPage,
        args: [element, text],
      });

      const success = results[0]?.result?.success || false;

      logger.info('Input text into element', { index, textLength: text.length, success });
      return success;

    } catch (error) {
      logger.error('Failed to input text', { index, text, error });
      return false;
    }
  }

  /**
   * Enhanced element selection with AI-powered analysis
   */
  async selectElementWithAI(
    tabId: number,
    description: string,
    context?: any
  ): Promise<EnhancedSelectionResult> {
    try {
      const startTime = Date.now();

      // Get all interactive elements
      const pageResult = await this.getPageElements(tabId);

      // Perform AI-powered analysis
      const aiAnalysis = await this.performAIAnalysis(description, pageResult.elements, context);

      // Filter and rank elements based on AI analysis
      const scoredElements = pageResult.elements
        .map(element => ({
          element,
          score: this.calculateAIScore(element, description, aiAnalysis)
        }))
        .filter(item => item.score > 0.3)
        .sort((a, b) => b.score - a.score);

      const bestMatch = scoredElements[0];

      if (!bestMatch || bestMatch.score < 0.5) {
        return {
          elements: [],
          confidence: 0,
          reasoning: `No suitable elements found for "${description}"`,
          description: `No elements found for "${description}"`,
          aiAnalysis,
          alternatives: scoredElements.slice(0, 5).map(item => item.element),
          fallbackStrategies: [
            'Try using exact text match',
            'Search by element type',
            'Use visual element detection',
            'Fall back to manual selection'
          ]
        };
      }

      const result: EnhancedSelectionResult = {
        elements: [bestMatch.element],
        confidence: bestMatch.score,
        reasoning: `AI-selected element with confidence ${Math.round(bestMatch.score * 100)}%`,
        description: `AI-selected element: ${description}`,
        aiAnalysis,
        alternatives: scoredElements.slice(1, 6).map(item => item.element)
      };

      // Store in selection history for learning
      this.storeSelectionHistory(tabId.toString(), description, result);

      logger.info('AI-powered element selection completed', {
        description,
        confidence: bestMatch.score,
        executionTime: Date.now() - startTime,
        alternativesCount: result.alternatives?.length || 0
      });

      return result;

    } catch (error) {
      logger.error('AI-powered element selection failed', { description, error });
      return {
        elements: [],
        confidence: 0,
        reasoning: `AI selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        description: `AI selection failed: ${description}`,
        fallbackStrategies: ['Use traditional element selection methods']
      };
    }
  }

  /**
   * Multi-strategy element selection with fallback mechanisms
   */
  async selectElementWithStrategies(
    tabId: number,
    criteria: SelectionCriteria & { description?: string }
  ): Promise<EnhancedSelectionResult> {
    const strategies = [
      () => this.selectByExactMatch(tabId, criteria),
      () => this.selectByFuzzyMatch(tabId, criteria),
      () => this.selectByContextualAnalysis(tabId, criteria),
      () => this.selectByVisualSimilarity(tabId, criteria),
      () => this.selectByAIPrediction(tabId, criteria)
    ];

    for (const strategy of strategies) {
      try {
        const result = await strategy();
        if (result.confidence >= 0.7) {
          return result;
        }
      } catch (error) {
        logger.warn('Selection strategy failed', { strategy: strategy.name, error });
        continue;
      }
    }

    // Return best available result if no strategy meets threshold
    const allResults = await Promise.allSettled(strategies.map(s => s()));
    const successfulResults = allResults
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<EnhancedSelectionResult>).value)
      .sort((a, b) => b.confidence - a.confidence);

    return successfulResults[0] || {
      elements: [],
      confidence: 0,
      reasoning: 'All selection strategies failed',
      fallbackStrategies: ['Manual element selection required']
    };
  }

  /**
   * Get element selection suggestions based on user intent
   */
  async getElementSuggestions(
    tabId: number,
    userIntent: string,
    context?: any
  ): Promise<{
    suggestions: Array<{
      element: ElementInfo;
      confidence: number;
      reasoning: string;
    }>;
    overallConfidence: number;
    recommendations: string[];
  }> {
    try {
      const pageResult = await this.getPageElements(tabId);
      const suggestions = await this.generateIntentBasedSuggestions(
        userIntent,
        pageResult.elements,
        context
      );

      const overallConfidence = suggestions.length > 0
        ? suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length
        : 0;

      const recommendations = this.generateSelectionRecommendations(suggestions, userIntent);

      return {
        suggestions,
        overallConfidence,
        recommendations
      };

    } catch (error) {
      logger.error('Failed to generate element suggestions', { userIntent, error });
      return {
        suggestions: [],
        overallConfidence: 0,
        recommendations: ['Try refining your search criteria', 'Consider using exact text matching']
      };
    }
  }

  /**
   * Validate element selection before interaction
   */
  async validateElementSelection(
    tabId: number,
    elementIndex: number,
    intendedAction: 'click' | 'input' | 'hover' | 'scroll'
  ): Promise<{
    isValid: boolean;
    confidence: number;
    warnings: string[];
    suggestions: string[];
  }> {
    try {
      const element = await this.getElementByIndex(tabId, elementIndex);
      if (!element) {
        return {
          isValid: false,
          confidence: 0,
          warnings: ['Element not found'],
          suggestions: ['Check if element index is correct', 'Refresh page elements']
        };
      }

      const warnings: string[] = [];
      const suggestions: string[] = [];
      let confidence = 1.0;

      // Validate based on intended action
      switch (intendedAction) {
        case 'click':
          if (!element.isClickable) {
            warnings.push('Element may not be clickable');
            confidence *= 0.5;
          }
          if (!element.isVisible) {
            warnings.push('Element is not visible');
            confidence *= 0.3;
          }
          break;

        case 'input':
          if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) {
            warnings.push('Element is not an input field');
            confidence *= 0.2;
          }
          break;

        case 'hover':
          if (!element.isVisible) {
            warnings.push('Element is not visible for hover');
            confidence *= 0.5;
          }
          break;

        case 'scroll':
          // Scroll is generally safe
          break;
      }

      // Additional validation checks
      if (element.depth > 15) {
        warnings.push('Element is deeply nested in DOM');
        confidence *= 0.8;
      }

      if (element.text.length > 200) {
        warnings.push('Element has unusually long text content');
        confidence *= 0.9;
      }

      // Generate suggestions based on warnings
      if (warnings.length > 0) {
        suggestions.push('Consider using a different element');
        suggestions.push('Verify element is in the correct state');

        if (intendedAction === 'click' && !element.isClickable) {
          suggestions.push('Look for nearby clickable elements');
        }
      }

      return {
        isValid: confidence >= 0.7,
        confidence,
        warnings,
        suggestions
      };

    } catch (error) {
      logger.error('Element validation failed', { elementIndex, intendedAction, error });
      return {
        isValid: false,
        confidence: 0,
        warnings: ['Validation failed'],
        suggestions: ['Retry validation', 'Check element existence']
      };
    }
  }

  // Private helper methods for AI-powered selection

  private async performAIAnalysis(
    description: string,
    elements: ElementInfo[],
    context?: any
  ): Promise<{
    naturalLanguageMatch: number;
    contextRelevance: number;
    visualSimilarity: number;
    confidenceScore: number;
    reasoning: string;
  }> {
    // Analyze natural language intent
    const intentAnalysis = this.analyzeIntent(description);

    // Calculate context relevance
    const contextScore = context ? this.calculateContextRelevance(description, context) : 0.5;

    // Analyze element patterns
    const patternAnalysis = this.analyzeElementPatterns(elements, description);

    // Calculate overall confidence
    const naturalLanguageMatch = intentAnalysis.confidence;
    const visualSimilarity = patternAnalysis.visualScore;
    const confidenceScore = (naturalLanguageMatch + contextScore + visualSimilarity) / 3;

    return {
      naturalLanguageMatch,
      contextRelevance: contextScore,
      visualSimilarity,
      confidenceScore,
      reasoning: this.generateAIReasoning(intentAnalysis, patternAnalysis, description)
    };
  }

  private calculateAIScore(
    element: ElementInfo,
    description: string,
    aiAnalysis: any
  ): number {
    let score = 0;

    // Text matching score
    const textScore = this.calculateTextRelevance(element.text, description);
    score += textScore * 0.3;

    // Type relevance score
    const typeScore = this.calculateTypeRelevance(element, description);
    score += typeScore * 0.2;

    // Attribute matching score
    const attributeScore = this.calculateAttributeRelevance(element.attributes, description);
    score += attributeScore * 0.2;

    // Position and visibility score
    const positionScore = this.calculatePositionScore(element);
    score += positionScore * 0.15;

    // Context relevance score
    score += aiAnalysis.contextRelevance * 0.15;

    return Math.min(1.0, score);
  }

  private analyzeIntent(description: string): {
    action: 'click' | 'input' | 'navigate' | 'search' | 'unknown';
    target: string;
    confidence: number;
    keywords: string[];
  } {
    const lowerDesc = description.toLowerCase();
    const keywords: string[] = [];

    // Action detection
    let action: 'click' | 'input' | 'navigate' | 'search' | 'unknown' = 'unknown';
    let confidence = 0;

    if (lowerDesc.includes('click') || lowerDesc.includes('press') || lowerDesc.includes('tap')) {
      action = 'click';
      confidence = 0.9;
      keywords.push('click', 'button');
    } else if (lowerDesc.includes('type') || lowerDesc.includes('input') || lowerDesc.includes('enter')) {
      action = 'input';
      confidence = 0.9;
      keywords.push('input', 'field');
    } else if (lowerDesc.includes('go to') || lowerDesc.includes('navigate') || lowerDesc.includes('open')) {
      action = 'navigate';
      confidence = 0.8;
      keywords.push('link', 'navigation');
    } else if (lowerDesc.includes('search') || lowerDesc.includes('find')) {
      action = 'search';
      confidence = 0.8;
      keywords.push('search', 'query');
    }

    // Target extraction
    const target = this.extractTarget(description);
    if (target) {
      keywords.push(target);
      confidence += 0.1;
    }

    return {
      action,
      target,
      confidence: Math.min(1.0, confidence),
      keywords
    };
  }

  private calculateContextRelevance(description: string, context: any): number {
    // Simple context relevance calculation
    let relevance = 0.5; // Base relevance

    if (context.url) {
      const urlRelevance = this.calculateURLRelevance(description, context.url);
      relevance += urlRelevance * 0.3;
    }

    if (context.pageTitle) {
      const titleRelevance = this.calculateTextRelevance(context.pageTitle, description);
      relevance += titleRelevance * 0.2;
    }

    return Math.min(1.0, relevance);
  }

  private analyzeElementPatterns(
    elements: ElementInfo[],
    description: string
  ): {
    visualScore: number;
    patternScore: number;
    commonAttributes: Record<string, string>;
  } {
    const lowerDesc = description.toLowerCase();

    // Analyze common patterns
    const buttonCount = elements.filter(e => e.tagName === 'BUTTON').length;
    const inputCount = elements.filter(e => ['INPUT', 'TEXTAREA'].includes(e.tagName)).length;
    const linkCount = elements.filter(e => e.tagName === 'A').length;

    let visualScore = 0.5;

    if (lowerDesc.includes('button') && buttonCount > 0) {
      visualScore += 0.3;
    }
    if (lowerDesc.includes('input') && inputCount > 0) {
      visualScore += 0.3;
    }
    if (lowerDesc.includes('link') && linkCount > 0) {
      visualScore += 0.2;
    }

    // Extract common attributes
    const commonAttributes: Record<string, string> = {};
    const attributeCounts: Record<string, Record<string, number>> = {};

    elements.forEach(element => {
      Object.entries(element.attributes).forEach(([key, value]) => {
        if (!attributeCounts[key]) attributeCounts[key] = {};
        attributeCounts[key][value] = (attributeCounts[key][value] || 0) + 1;
      });
    });

    Object.entries(attributeCounts).forEach(([key, values]) => {
      const mostCommon = Object.entries(values)
        .sort(([,a], [,b]) => b - a)[0];
      if (mostCommon[1] > elements.length * 0.3) {
        commonAttributes[key] = mostCommon[0];
      }
    });

    return {
      visualScore: Math.min(1.0, visualScore),
      patternScore: Object.keys(commonAttributes).length / 10,
      commonAttributes
    };
  }

  private generateAIReasoning(
    intentAnalysis: any,
    patternAnalysis: any,
    description: string
  ): string {
    const parts: string[] = [];

    parts.push(`Intent: ${intentAnalysis.action} "${intentAnalysis.target}"`);
    parts.push(`Confidence: ${Math.round(intentAnalysis.confidence * 100)}%`);

    if (patternAnalysis.visualScore > 0.7) {
      parts.push('Strong visual pattern match');
    }

    if (Object.keys(patternAnalysis.commonAttributes).length > 0) {
      parts.push(`Common attributes: ${Object.keys(patternAnalysis.commonAttributes).join(', ')}`);
    }

    return parts.join('. ');
  }

  private async selectByExactMatch(tabId: number, criteria: SelectionCriteria): Promise<EnhancedSelectionResult> {
    const result = await this.findElementsByCriteria(tabId, criteria);
    return {
      ...result,
      aiAnalysis: {
        naturalLanguageMatch: 0.9,
        contextRelevance: 0.8,
        visualSimilarity: 0.7,
        confidenceScore: result.confidence,
        reasoning: 'Exact match strategy used'
      }
    };
  }

  private async selectByFuzzyMatch(tabId: number, criteria: SelectionCriteria): Promise<EnhancedSelectionResult> {
    const pageResult = await this.getPageElements(tabId);
    const fuzzyCriteria = { ...criteria };

    // Relax criteria for fuzzy matching
    if (criteria.text) {
      fuzzyCriteria.textContains = criteria.text;
      delete fuzzyCriteria.text;
    }

    const result = await this.findElementsByCriteria(tabId, fuzzyCriteria);

    return {
      ...result,
      aiAnalysis: {
        naturalLanguageMatch: 0.7,
        contextRelevance: 0.6,
        visualSimilarity: 0.5,
        confidenceScore: result.confidence * 0.8,
        reasoning: 'Fuzzy match strategy used'
      }
    };
  }

  private async selectByContextualAnalysis(tabId: number, criteria: SelectionCriteria): Promise<EnhancedSelectionResult> {
    // This would use more sophisticated context analysis
    const result = await this.findElementsByCriteria(tabId, criteria);

    return {
      ...result,
      aiAnalysis: {
        naturalLanguageMatch: 0.6,
        contextRelevance: 0.9,
        visualSimilarity: 0.6,
        confidenceScore: result.confidence * 0.7,
        reasoning: 'Contextual analysis strategy used'
      }
    };
  }

  private async selectByVisualSimilarity(tabId: number, criteria: SelectionCriteria): Promise<EnhancedSelectionResult> {
    // This would use visual similarity algorithms
    const result = await this.findElementsByCriteria(tabId, criteria);

    return {
      ...result,
      aiAnalysis: {
        naturalLanguageMatch: 0.5,
        contextRelevance: 0.5,
        visualSimilarity: 0.9,
        confidenceScore: result.confidence * 0.6,
        reasoning: 'Visual similarity strategy used'
      }
    };
  }

  private async selectByAIPrediction(tabId: number, criteria: SelectionCriteria): Promise<EnhancedSelectionResult> {
    // This would use machine learning prediction
    const result = await this.findElementsByCriteria(tabId, criteria);

    return {
      ...result,
      aiAnalysis: {
        naturalLanguageMatch: 0.8,
        contextRelevance: 0.7,
        visualSimilarity: 0.8,
        confidenceScore: result.confidence * 0.9,
        reasoning: 'AI prediction strategy used'
      }
    };
  }

  private async generateIntentBasedSuggestions(
    userIntent: string,
    elements: ElementInfo[],
    context?: any
  ): Promise<Array<{
    element: ElementInfo;
    confidence: number;
    reasoning: string;
  }>> {
    const intent = this.analyzeIntent(userIntent);
    const suggestions: Array<{
      element: ElementInfo;
      confidence: number;
      reasoning: string;
    }> = [];

    elements.forEach(element => {
      let confidence = 0;
      const reasoning: string[] = [];

      // Match based on intent
      if (intent.action === 'click' && element.isClickable) {
        confidence += 0.4;
        reasoning.push('Clickable element matches click intent');
      }

      if (intent.action === 'input' && ['INPUT', 'TEXTAREA'].includes(element.tagName)) {
        confidence += 0.4;
        reasoning.push('Input element matches input intent');
      }

      // Text relevance
      const textScore = this.calculateTextRelevance(element.text, userIntent);
      confidence += textScore * 0.3;
      if (textScore > 0.5) {
        reasoning.push(`Text relevance: ${Math.round(textScore * 100)}%`);
      }

      // Attribute relevance
      const attributeScore = this.calculateAttributeRelevance(element.attributes, userIntent);
      confidence += attributeScore * 0.2;
      if (attributeScore > 0.5) {
        reasoning.push(`Attribute relevance: ${Math.round(attributeScore * 100)}%`);
      }

      // Position score
      const positionScore = this.calculatePositionScore(element);
      confidence += positionScore * 0.1;

      if (confidence > 0.3) {
        suggestions.push({
          element,
          confidence: Math.min(1.0, confidence),
          reasoning: reasoning.join(', ')
        });
      }
    });

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  private generateSelectionRecommendations(
    suggestions: Array<{
      element: ElementInfo;
      confidence: number;
      reasoning: string;
    }>,
    userIntent: string
  ): string[] {
    const recommendations: string[] = [];

    if (suggestions.length === 0) {
      recommendations.push('No suitable elements found');
      recommendations.push('Try refining your search criteria');
      return recommendations;
    }

    const bestSuggestion = suggestions[0];

    if (bestSuggestion.confidence > 0.8) {
      recommendations.push(`High confidence match found: ${bestSuggestion.element.tagName}`);
    } else if (bestSuggestion.confidence > 0.6) {
      recommendations.push(`Moderate confidence match found: ${bestSuggestion.element.tagName}`);
      recommendations.push('Consider verifying the element before interaction');
    } else {
      recommendations.push('Low confidence matches found');
      recommendations.push('Manual verification recommended');
    }

    if (suggestions.length > 1) {
      recommendations.push(`${suggestions.length} alternative elements available`);
    }

    return recommendations;
  }

  private storeSelectionHistory(tabId: string, description: string, result: EnhancedSelectionResult): void {
    const key = `${tabId}:${description}`;
    const history = this.selectionHistory.get(key) || [];

    history.push(result);

    // Keep only recent history (last 10 selections)
    if (history.length > 10) {
      history.shift();
    }

    this.selectionHistory.set(key, history);
  }

  private extractTarget(description: string): string {
    // Simple target extraction from description
    const lowerDesc = description.toLowerCase();
    const words = lowerDesc.split(' ');

    // Look for potential target words
    const targetWords = words.filter(word =>
      word.length > 2 &&
      !['click', 'type', 'input', 'search', 'find', 'go', 'to', 'the', 'on', 'in', 'at'].includes(word)
    );

    return targetWords[0] || '';
  }

  private calculateURLRelevance(description: string, url: string): number {
    const lowerDesc = description.toLowerCase();
    const lowerUrl = url.toLowerCase();

    let relevance = 0;

    // Check if description contains domain or path keywords
    const urlParts = lowerUrl.split('/');
    const domain = urlParts[2];
    const path = urlParts.slice(3).join('/');

    if (domain && lowerDesc.includes(domain)) {
      relevance += 0.5;
    }

    if (path && lowerDesc.includes(path)) {
      relevance += 0.3;
    }

    return Math.min(1.0, relevance);
  }

  private calculateTextRelevance(text: string, description: string): number {
    if (!text || !description) return 0;

    const lowerText = text.toLowerCase();
    const lowerDesc = description.toLowerCase();

    if (lowerText === lowerDesc) return 1.0;
    if (lowerText.includes(lowerDesc)) return 0.8;
    if (lowerDesc.includes(lowerText)) return 0.6;

    // Word-based matching
    const descWords = lowerDesc.split(' ').filter(w => w.length > 2);
    const textWords = lowerText.split(' ');

    let matchCount = 0;
    for (const descWord of descWords) {
      if (textWords.some(textWord => textWord.includes(descWord))) {
        matchCount++;
      }
    }

    return descWords.length > 0 ? matchCount / descWords.length : 0;
  }

  private calculateTypeRelevance(element: ElementInfo, description: string): number {
    const lowerDesc = description.toLowerCase();
    const tagName = element.tagName.toLowerCase();

    const typeMap: Record<string, string[]> = {
      'button': ['button', 'btn', 'click', 'press'],
      'input': ['input', 'type', 'enter', 'field', 'text'],
      'a': ['link', 'click', 'go', 'navigate'],
      'select': ['select', 'choose', 'dropdown'],
      'textarea': ['textarea', 'text', 'area']
    };

    const keywords = typeMap[tagName] || [];
    const matchCount = keywords.filter(keyword => lowerDesc.includes(keyword)).length;

    return keywords.length > 0 ? matchCount / keywords.length : 0;
  }

  private calculateAttributeRelevance(
    attributes: Record<string, string>,
    description: string
  ): number {
    const lowerDesc = description.toLowerCase();
    let totalScore = 0;
    let matchCount = 0;

    Object.entries(attributes).forEach(([key, value]) => {
      if (lowerDesc.includes(key.toLowerCase()) || lowerDesc.includes(value.toLowerCase())) {
        matchCount++;
        totalScore += 1;
      }
    });

    return Object.keys(attributes).length > 0 ? totalScore / Object.keys(attributes).length : 0;
  }

  private calculatePositionScore(element: ElementInfo): number {
    let score = 0.5; // Base score

    // Prefer elements that are visible and clickable
    if (element.isVisible) score += 0.2;
    if (element.isClickable) score += 0.2;

    // Prefer elements with reasonable text content
    if (element.text.length > 0 && element.text.length < 100) score += 0.1;

    // Penalize deeply nested elements
    if (element.depth > 10) score -= (element.depth - 10) * 0.02;

    return Math.max(0, Math.min(1.0, score));
  }

  // Existing private helper methods continue below...

  private isCacheValid(): boolean {
    return Date.now() - this.cacheTimestamp < this.cacheTimeoutMs;
  }

  private updateElementCache(elements: ElementInfo[]): void {
    this.elementCache.clear();
    elements.forEach(element => {
      this.elementCache.set(element.index, element);
    });
    this.cacheTimestamp = Date.now();
  }

  private calculateElementScore(element: ElementInfo, criteria: SelectionCriteria): number {
    let score = 0;

    // Visibility and clickability are important
    if (element.isVisible) score += 30;
    if (element.isClickable) score += 20;

    // Text relevance
    if (criteria.text || criteria.textContains) {
      const searchText = (criteria.text || criteria.textContains)!.toLowerCase();
      const elementText = element.text.toLowerCase();

      if (elementText === searchText) score += 40;
      else if (elementText.includes(searchText)) score += 20;
    }

    // Type matching
    if (criteria.type && element.tagName.toLowerCase() === criteria.type) {
      score += 25;
    }

    // Prefer elements with reasonable text content
    if (element.text.trim().length > 0 && element.text.trim().length < 100) {
      score += 10;
    }

    // Penalize elements that are too deep in the DOM
    if (element.depth > 10) score -= Math.max(0, element.depth - 10) * 2;

    return Math.max(0, Math.min(100, score));
  }

  private calculateSelectionConfidence(elements: ElementInfo[], criteria: SelectionCriteria): number {
    if (elements.length === 0) return 0;

    const topScore = this.calculateElementScore(elements[0], criteria);
    const secondScore = elements.length > 1 ? this.calculateElementScore(elements[1], criteria) : 0;

    // High confidence if there's a clear winner
    if (topScore >= 80 && secondScore < topScore * 0.7) {
      return 0.9;
    }
    // Medium confidence if there's a reasonable match
    else if (topScore >= 60) {
      return 0.7;
    }
    // Low confidence for marginal matches
    else {
      return 0.4;
    }
  }

  private generateSelectionReasoning(elements: ElementInfo[], criteria: SelectionCriteria): string {
    if (elements.length === 0) {
      return 'No elements matched the criteria';
    }

    const topElement = elements[0];
    const score = this.calculateElementScore(topElement, criteria);

    let reasoning = `Found ${elements.length} matching elements. `;
    reasoning += `Best match: ${topElement.tagName} (index ${topElement.index}) with score ${score}/100. `;

    if (topElement.text) {
      reasoning += `Text: "${topElement.text.substring(0, 50)}${topElement.text.length > 50 ? '...' : ''}". `;
    }

    reasoning += `Visible: ${topElement.isVisible}, Clickable: ${topElement.isClickable}`;

    return reasoning;
  }

  private async fuzzyTextSearch(
    tabId: number,
    text: string,
    type: 'click' | 'input'
  ): Promise<{ element: ElementInfo | null; confidence: number; reasoning: string }> {
    try {
      const pageResult = await this.getPageElements(tabId);
      const textLower = text.toLowerCase();

      // Calculate fuzzy match scores
      const scoredElements = pageResult.elements
        .filter(el => el.isVisible && (type === 'click' ? el.isClickable : true))
        .map(el => ({
          element: el,
          score: this.calculateFuzzyScore(el.text.toLowerCase(), textLower),
        }))
        .filter(item => item.score > 0.3)
        .sort((a, b) => b.score - a.score);

      if (scoredElements.length > 0) {
        const best = scoredElements[0];
        return {
          element: best.element,
          confidence: best.score * 0.8, // Reduce confidence for fuzzy matches
          reasoning: `Fuzzy match found with score ${Math.round(best.score * 100)}%`,
        };
      }

      return {
        element: null,
        confidence: 0,
        reasoning: `No fuzzy matches found for "${text}"`,
      };

    } catch (error) {
      logger.error('Fuzzy text search failed', { text, type, error });
      return {
        element: null,
        confidence: 0,
        reasoning: `Fuzzy search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private calculateFuzzyScore(text: string, searchTerm: string): number {
    if (text === searchTerm) return 1.0;
    if (text.includes(searchTerm)) return 0.8;

    // Simple word-based matching
    const searchWords = searchTerm.split(' ').filter(w => w.length > 2);
    const textWords = text.split(' ');

    let matchCount = 0;
    for (const searchWord of searchWords) {
      for (const textWord of textWords) {
        if (textWord.includes(searchWord) || searchWord.includes(textWord)) {
          matchCount++;
          break;
        }
      }
    }

    return searchWords.length > 0 ? matchCount / searchWords.length : 0;
  }

  // Browser script execution functions
  private extractPageTextSnapshot(): PageTextSnapshot {
    function isElementVisible(el: Element | null): boolean {
      if (!el || !(el instanceof Element)) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = (el as HTMLElement).getBoundingClientRect?.();
      if (!rect) return true;
      if ((rect.width === 0 && rect.height === 0)) return false;
      return true;
    }

    function normalizeWhitespace(s: string): string {
      return s.replace(/\s+/g, ' ').trim();
    }

    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

    function collectTextFromRoot(root: Document | ShadowRoot | HTMLElement): string {
      const parts: string[] = [];
      const walker = document.createTreeWalker(root as any, NodeFilter.SHOW_TEXT, {
        acceptNode(node: Node) {
          const parent = (node as any).parentElement as Element | null;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          const raw = (node.nodeValue || '').trim();
          if (!raw) return NodeFilter.FILTER_REJECT;
          if (!isElementVisible(parent)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      } as any);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const txt = normalizeWhitespace(n.nodeValue || '');
        if (txt) parts.push(txt);
      }
      // Also include alt text for visible images
      (root as any).querySelectorAll?.('img[alt]')?.forEach((img: HTMLImageElement) => {
        if (img.alt && isElementVisible(img)) parts.push(normalizeWhitespace(img.alt));
      });
      return normalizeWhitespace(parts.join(' '));
    }

    function getHeadings(): string[] {
      const arr: string[] = [];
      const nodes = document.querySelectorAll('h1,h2,h3,h4,h5,h6');
      nodes.forEach((el) => { if (isElementVisible(el)) arr.push(normalizeWhitespace((el as HTMLElement).innerText || '')); });
      return arr.filter(Boolean);
    }

    function getLinks(): Array<{ href: string; text: string }> {
      const arr: Array<{ href: string; text: string }> = [];
      document.querySelectorAll('a[href]')?.forEach((a) => {
        if (!isElementVisible(a)) return;
        const href = (a as HTMLAnchorElement).href;
        const text = normalizeWhitespace((a as HTMLElement).innerText || (a as HTMLAnchorElement).title || '');
        arr.push({ href, text });
      });
      return arr;
    }

    function labelTextFor(el: Element): string | undefined {
      const id = (el as HTMLElement).id;
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label && isElementVisible(label)) return normalizeWhitespace((label as HTMLElement).innerText || '');
      }
      const parentLabel = el.closest('label');
      if (parentLabel && isElementVisible(parentLabel)) return normalizeWhitespace((parentLabel as HTMLElement).innerText || '');
      return undefined;
    }

    function getInputs(): Array<{ name?: string; id?: string; placeholder?: string; ariaLabel?: string; labelText?: string; type?: string }> {
      const arr: Array<{ name?: string; id?: string; placeholder?: string; ariaLabel?: string; labelText?: string; type?: string }> = [];
      document.querySelectorAll('input,textarea,select').forEach((el) => {
        if (!isElementVisible(el)) return;
        const anyEl = el as any;
        arr.push({
          name: anyEl.name,
          id: anyEl.id,
          placeholder: anyEl.placeholder,
          ariaLabel: anyEl.getAttribute?.('aria-label') || undefined,
          labelText: labelTextFor(el),
          type: anyEl.type,
        });
      });
      return arr;
    }

    function getMeta(): Record<string, string> {
      const meta: Record<string, string> = {};
      document.querySelectorAll('meta[name],meta[property]').forEach((m) => {
        const name = (m.getAttribute('name') || m.getAttribute('property')) as string;
        const content = m.getAttribute('content') || '';
        if (name) meta[name] = content;
      });
      return meta;
    }

    const text = collectTextFromRoot(document.body);
    const headings = getHeadings();
    const links = getLinks();
    const inputs = getInputs();
    const meta = getMeta();

    const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const snapshot: PageTextSnapshot = {
      url: location.href,
      title: document.title || '',
      text,
      headings,
      links,
      inputs,
      meta,
      wordCount,
      length: text.length,
      timestamp: Date.now(),
    };
    return snapshot;
  }

  private extractPageElements(): ElementInfo[] {
    const elements: ElementInfo[] = [];
    let index = 0;

    function isVisible(element: Element): boolean {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      return rect.width > 0 &&
             rect.height > 0 &&
             style.display !== 'none' &&
             style.visibility !== 'hidden' &&
             style.opacity !== '0';
    }

    function isClickable(element: Element): boolean {
      const tagName = element.tagName.toLowerCase();
      const clickableTags = ['button', 'a', 'input', 'select', 'textarea', 'summary'];

      if (clickableTags.includes(tagName)) return true;

      const style = window.getComputedStyle(element);
      return style.cursor === 'pointer' ||
             element.hasAttribute('onclick') ||
             element.hasAttribute('role') && element.getAttribute('role') === 'button';
    }

    function getElementPath(element: Element): string {
      const path: string[] = [];
      let current = element;

      while (current && current.nodeType === Node.ELEMENT_NODE) {
        let selector = current.tagName.toLowerCase();

        if (current.id) {
          selector += `#${current.id}`;
        } else {
          const className = current.getAttribute('class');
          if (className) {
            selector += `.${className.trim().split(/\s+/).join('.')}`;
          }
        }

        path.unshift(selector);
        current = current.parentElement!;
      }

      return path.join(' > ');
    }

    function getElementXPath(element: Element): string {
      if (element.id) {
        return `//*[@id="${element.id}"]`;
      }

      const path: string[] = [];
      let current = element;

      while (current && current.nodeType === Node.ELEMENT_NODE) {
        let index = 0;
        let sibling: Element | null = current;

        while (sibling) {
          if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) {
            index++;
          }
          sibling = sibling.previousElementSibling || null;
        }

        const tagName = current.tagName.toLowerCase();
        const pathSegment = index > 1 ? `${tagName}[${index}]` : tagName;
        path.unshift(pathSegment);

        current = current.parentElement!;
      }

      return '/' + path.join('/');
    }

    function getElementAttributes(element: Element): Record<string, string> {
      const attributes: Record<string, string> = {};

      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        attributes[attr.name] = attr.value;
      }

      return attributes;
    }

    function getDepth(element: Element): number {
      let depth = 0;
      let current = element;

      while (current.parentElement) {
        depth++;
        current = current.parentElement;
      }

      return depth;
    }

    function processElement(element: Element): void {
      if (!isVisible(element)) return;

      const rect = element.getBoundingClientRect();
      const elementInfo: ElementInfo = {
        index: index++,
        tagName: element.tagName,
        attributes: getElementAttributes(element),
        text: element.textContent || '',
        isVisible: true,
        isClickable: isClickable(element),
        isInteractive: ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(element.tagName),
        xpath: getElementXPath(element),
        cssSelector: getElementPath(element),
        boundingRect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
        children: element.children.length,
        depth: getDepth(element),
      };

      elements.push(elementInfo);

      // Process children (limited depth for performance)
      if (elementInfo.depth < 10) {
        Array.from(element.children).forEach(processElement);
      }
    }

    // Start processing from body
    processElement(document.body);

    return elements;
  }

  private highlightElementInPage(element: ElementInfo, duration: number): void {
    const domElement = document.evaluate(
      element.xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue as HTMLElement;

    if (!domElement) return;

    const originalStyle = domElement.style.cssText;
    const originalOutline = domElement.style.outline;
    const originalZIndex = domElement.style.zIndex;

    // Apply highlight style
    domElement.style.outline = '3px solid #ff4444';
    domElement.style.outlineOffset = '2px';
    domElement.style.zIndex = '999999';

    // Remove highlight after duration
    setTimeout(() => {
      domElement.style.outline = originalOutline;
      domElement.style.zIndex = originalZIndex;
    }, duration);
  }

  private clickElementInPage(element: ElementInfo): { success: boolean; error?: string } {
    try {
      const domElement = document.evaluate(
        element.xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue as HTMLElement;

      if (!domElement) {
        return { success: false, error: 'Element not found in DOM' };
      }

      domElement.click();
      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Click failed',
      };
    }
  }

  private inputTextInPage(element: ElementInfo, text: string): { success: boolean; error?: string } {
    try {
      const domElement = document.evaluate(
        element.xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue as HTMLInputElement | HTMLTextAreaElement;

      if (!domElement) {
        return { success: false, error: 'Element not found in DOM' };
      }

      // Focus and clear existing value
      domElement.focus();
      domElement.value = '';

      // Input text character by character to trigger events
      for (let i = 0; i < text.length; i++) {
        domElement.value += text[i];
        domElement.dispatchEvent(new Event('input', { bubbles: true }));
        domElement.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Dispatch final events
      domElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      domElement.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Input failed',
      };
    }
  }
}