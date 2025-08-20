import { createLogger } from '@/utils/logger';
import { DOMElementNode, DOMTextNode } from './views';
import type {
  BuildDomTreeArgs,
  RawDomTreeNode,
  BuildDomTreeResult,
} from './raw_types';
import type { DOMState, DOMBaseNode } from './views';
import type { ViewportInfo } from './history/view';

const logger = createLogger('DOMService');

export interface ReadabilityResult {
  title: string;
  content: string;
  textContent: string;
  length: number;
  excerpt: string;
  byline: string;
  dir: string;
  siteName: string;
  lang: string;
  publishedTime: string;
}

declare global {
  interface Window {
    buildDomTree: (args: BuildDomTreeArgs) => RawDomTreeNode | null;
    turn2Markdown: (selector?: string) => string;
    parserReadability: () => ReadabilityResult | null;
  }
}

/**
 * Get the markdown content for the current page.
 * @param tabId - The ID of the tab to get the markdown content for.
 * @param selector - The selector to get the markdown content for. If not provided, the body of the entire page will be converted to markdown.
 * @returns The markdown content for the selected element on the current page.
 */
export async function getMarkdownContent(
  tabId: number,
  selector?: string
): Promise<string> {
  const results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (sel) => {
      return window.turn2Markdown(sel);
    },
    args: [selector || ''], // Pass the selector as an argument
  });

  const result = results[0]?.result;
  if (!result) {
    throw new Error('Failed to get markdown content');
  }
  return result as string;
}

/**
 * Get the readability content for the current page.
 * @param tabId - The ID of the tab to get the readability content for.
 * @returns The readability content for the current page.
 */
export async function getReadabilityContent(
  tabId: number
): Promise<ReadabilityResult> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      return window.parserReadability();
    },
  });
  const result = results[0]?.result;
  if (!result) {
    throw new Error('Failed to get readability content');
  }
  return result as ReadabilityResult;
}

/**
 * Get the clickable elements for the current page.
 * @param tabId - The ID of the tab to get the clickable elements for.
 * @param url - The URL of the page.
 * @param showHighlightElements - Whether to show the highlight elements.
 * @param focusElement - The element to focus on.
 * @param viewportExpansion - The viewport expansion to use.
 * @returns A DOMState object containing the clickable elements for the current page.
 */
export async function getClickableElements(
  tabId: number,
  url: string,
  showHighlightElements = true,
  focusElement = -1,
  viewportExpansion = 0,
  debugMode = false
): Promise<DOMState> {
  const [elementTree, selectorMap] = await _buildDomTree(
    tabId,
    url,
    showHighlightElements,
    focusElement,
    viewportExpansion,
    debugMode
  );
  return { elementTree, selectorMap };
}

/**
 * Inject comprehensive buildDomTree implementation aligned with nanobrowser
 * Features: shadowRoot traversal, enhanced XPath, performance metrics, viewport expansion
 */
async function injectBuildDomTreeScript(tabId: number): Promise<void> {
  try {
    const exists = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => Boolean((window as any).buildDomTree),
    });
    const has = Boolean(exists[0]?.result);
    if (has) return;
  } catch (e) {
    // proceed to inject
  }
  // Inject comprehensive buildDomTree implementation (nanobrowser-aligned)
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      (window as any).buildDomTree = function (args: any) {
        const perfStart = performance.now();
        const perf = { timings: {} as Record<string, number> };
        try {
          const timeit = (label: string, fn: () => any) => { const s = performance.now(); const r = fn(); perf.timings[label] = (perf.timings[label] || 0) + (performance.now() - s); return r; };
          // Enhanced interactive selectors aligned with nanobrowser
          const interactiveSelectors = [
            'button', 'input', 'select', 'textarea', 'a[href]', 'area[href]',
            '[role="button"]', '[role="link"]', '[role="textbox"]', '[role="searchbox"]',
            '[role="combobox"]', '[role="listbox"]', '[role="menuitem"]', '[role="tab"]',
            '[role="switch"]', '[role="checkbox"]', '[role="radio"]', '[role="slider"]',
            '[contenteditable="true"]', '[contenteditable=""]',
            '[tabindex]:not([tabindex="-1"])', '[onclick]', '[onmousedown]',
            'summary', 'details > summary'
          ];
          const toArray = (n: any): any[] => Array.prototype.slice.call(n);
          const getStyle = (el: Element) => window.getComputedStyle(el as HTMLElement);
          const isVisible = (el: Element): boolean => {
            const r = (el as HTMLElement).getBoundingClientRect();
            const style = getStyle(el);
            return !!(r && r.width > 0 && r.height > 0) && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
          };
          const isInViewport = (el: Element): boolean => {
            const r = (el as HTMLElement).getBoundingClientRect();
            return r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0;
          };
          // Enhanced interactivity detection (nanobrowser-aligned)
          const isInteractive = (el: Element): boolean => {
            const tag = el.tagName.toLowerCase();
            const role = (el.getAttribute('role') || '').toLowerCase();
            const tabIndex = (el as HTMLElement).getAttribute('tabindex');
            const type = (el.getAttribute('type') || '').toLowerCase();

            // Form controls and navigation
            if (['button','a','input','select','textarea','summary'].includes(tag)) return true;
            if (tag === 'area' && el.getAttribute('href')) return true;
            if (tag === 'input' && ['hidden','submit','reset','image'].includes(type)) return false;

            // ARIA roles
            const interactiveRoles = ['button','link','switch','menuitem','checkbox','radio','tab','slider','combobox','listbox','searchbox','textbox'];
            if (interactiveRoles.includes(role)) return true;

            // Focusable elements
            if (tabIndex && Number(tabIndex) >= 0) return true;
            if ((el as HTMLElement).isContentEditable) return true;

            // Event handlers (basic detection)
            if (el.getAttribute('onclick') || el.getAttribute('onmousedown')) return true;

            return false;
          };
          const makeSelector = (el: Element | null): string => {
            if (!el) return '';
            if ((el as HTMLElement).id) return `#${(el as HTMLElement).id}`;
            const parts: string[] = [];
            let node: Element | null = el;
            while (node && node.nodeType === 1 && parts.length < 5) {
              let part = node.tagName.toLowerCase();
              const className = (node as HTMLElement).className;
              if (className && typeof className === 'string') {
                const cls = className.trim().split(/\s+/).slice(0, 2).join('.');
                if (cls) part += `.${cls}`;
              }
              const siblings: any[] = toArray((node.parentElement?.children || []) as any);
              const index = siblings.indexOf(node as any) + 1;
              part += `:nth-child(${index})`;
              parts.unshift(part);
              node = node.parentElement;
            }
            return parts.join(' > ');
          };
          // Enhanced XPath generation with attribute constraints and shadow DOM support
          const makeXPath = (el: Element | null): string => {
            if (!el) return '';
            const segments: string[] = [];
            let node: any = el as Element | null;
            let shadowDepth = 0;

            while (node && node.nodeType === 1) {
              const tag = node.tagName.toLowerCase();
              let predicate = '';

              // Prefer unique attributes for more stable XPath
              const id = node.getAttribute('id');
              const name = node.getAttribute('name');
              const className = node.getAttribute('class');
              const dataTestId = node.getAttribute('data-testid');

              if (id) {
                predicate = `[@id='${id}']`;
              } else if (dataTestId) {
                predicate = `[@data-testid='${dataTestId}']`;
              } else if (name && ['input','select','textarea','button'].includes(tag)) {
                predicate = `[@name='${name}']`;
              } else if (className) {
                const stableClasses = className.split(/\s+/).filter((c: string) =>
                  !c.match(/^(hover|focus|active|disabled|selected|open|closed|loading)/) &&
                  !c.match(/\d+$/) && c.length > 2
                ).slice(0, 2);
                if (stableClasses.length) {
                  predicate = `[contains(@class,'${stableClasses[0]}')]`;
                }
              }

              // Fallback to positional index
              if (!predicate) {
                let index = 1;
                let sibling = node.previousElementSibling;
                while (sibling) {
                  if (sibling.tagName.toLowerCase() === tag) index++;
                  sibling = sibling.previousElementSibling;
                }
                predicate = `[${index}]`;
              }

              // Add shadow root marker if we're in shadow DOM
              const shadowMarker = shadowDepth > 0 ? `@shadow${shadowDepth}` : '';
              segments.unshift(`${tag}${predicate}${shadowMarker}`);

              // Climb to parent in light DOM or host if in shadow DOM
              const root: any = (node as any).getRootNode?.();
              if (root && root instanceof ShadowRoot && (root as any).host) {
                shadowDepth++;
                node = (root as any).host as Element;
              } else {
                node = node.parentElement as Element | null;
              }
            }
            return '/' + segments.join('/');
          };
          const collectInteractive = (root: Document | ShadowRoot): Element[] => {
            const picked: Element[] = [];
            interactiveSelectors.forEach(sel => {
              toArray(root.querySelectorAll(sel)).forEach((el: Element) => picked.push(el));
            });
            // Recurse into shadow roots
            toArray(root.querySelectorAll('*')).forEach((el: any) => {
              if (el && el.shadowRoot) {
                picked.push(...collectInteractive(el.shadowRoot));
              }
            });
            return Array.from(new Set(picked));
          };
          // Enhanced attribute collection for better element identification
          const collectAttributes = (el: Element): Record<string,string> => {
            const attrs: Record<string,string> = {};
            const desired = [
              'id','name','type','role','href','value','placeholder','aria-label','title',
              'class','tabindex','contenteditable','data-testid','data-cy','data-qa',
              'alt','src','for','form','target','rel','download','disabled','readonly',
              'checked','selected','multiple','required','pattern','min','max','step'
            ];
            desired.forEach(k => {
              const v = (el as HTMLElement).getAttribute?.(k);
              if (v !== null && v !== undefined) attrs[k] = v;
            });
            return attrs;
          };

          // Enhanced text extraction with better semantic understanding
          const getElementText = (el: Element): string => {
            // Priority: aria-label > aria-labelledby > title > alt > textContent
            const ariaLabel = (el as HTMLElement).getAttribute?.('aria-label');
            if (ariaLabel?.trim()) return ariaLabel.trim();

            const ariaLabelledBy = (el as HTMLElement).getAttribute?.('aria-labelledby');
            if (ariaLabelledBy) {
              const labelEl = document.getElementById(ariaLabelledBy);
              if (labelEl?.textContent?.trim()) return labelEl.textContent.trim();
            }

            const title = (el as HTMLElement).getAttribute?.('title');
            if (title?.trim()) return title.trim();

            const alt = (el as HTMLElement).getAttribute?.('alt');
            if (alt?.trim()) return alt.trim();

            // For form controls, include value/placeholder
            const tag = el.tagName.toLowerCase();
            if (['input','textarea'].includes(tag)) {
              const value = (el as HTMLInputElement).value;
              const placeholder = (el as HTMLElement).getAttribute?.('placeholder');
              if (value?.trim()) return value.trim();
              if (placeholder?.trim()) return `[${placeholder.trim()}]`;
            }

            const textContent = (el.textContent || '').trim();
            if (textContent.length <= 200) return textContent;

            // For long text, get first meaningful chunk
            const sentences = textContent.split(/[.!?]+/);
            return sentences[0]?.trim().slice(0, 200) || textContent.slice(0, 200);
          };
          // Ensure overlay
          if (args?.showHighlightElements) {
            const overlayId = 'vibe3-debug-overlay';
            let overlay = document.getElementById(overlayId) as HTMLElement | null;
            if (!overlay) {
              overlay = document.createElement('div');
              overlay.id = overlayId;
              Object.assign(overlay.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483647' });
              document.documentElement.appendChild(overlay);
            }
            overlay.innerHTML = '';
          }
          // Collect and filter candidates
          const elements: Element[] = timeit('perf.queryInteractive', () => {
            const out: Element[] = [];
            interactiveSelectors.forEach(sel => {
              toArray(document.querySelectorAll(sel)).forEach((el: Element) => out.push(el));
            });
            return out;
          });
          const candidates = timeit('perf.filterCandidates', () => elements.filter(el => isVisible(el) && isInViewport(el) && isInteractive(el)));

          // Build result map with id continuity
          const map: Record<string, any> = {};
          let idCounter = Number.isFinite(args?.startId) ? Number(args.startId) : 1;
          let highlightIndex = Number.isFinite(args?.startHighlightIndex) ? Number(args.startHighlightIndex) : 0;

          const rootId = String(idCounter++);
          map[rootId] = {
            tagName: 'body',
            xpath: '',
            attributes: {},
            children: [] as string[],
            isVisible: true,
            isInteractive: false,
            isTopElement: false,
            isInViewport: true,
          };

          timeit('perf.buildNodes', () => {
            candidates.slice(0, 500).forEach((el: Element) => {
              const id = String(idCounter++);
              const r = (el as HTMLElement).getBoundingClientRect();
              (map[rootId].children as string[]).push(id);
              map[id] = {
                tagName: el.tagName.toLowerCase(),
                xpath: makeXPath(el), // store XPath for stable identification
                attributes: collectAttributes(el),
                children: [] as string[],
                isVisible: true,
                isInteractive: true,
                isTopElement: true,
                isInViewport: true,
                highlightIndex: highlightIndex++,
                viewportCoordinates: { x: r.left, y: r.top, width: r.width, height: r.height },
                pageCoordinates: { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height },
                viewportInfo: { width: window.innerWidth, height: window.innerHeight },
                textContent: getElementText(el),
              };
              if (args?.showHighlightElements) {
                const overlay = document.getElementById('vibe3-debug-overlay') as HTMLElement | null;
                if (overlay) {
                  const box = document.createElement('div');
                  Object.assign(box.style, { position: 'absolute', top: `${Math.max(0, r.top)}px`, left: `${Math.max(0, r.left)}px`, width: `${r.width}px`, height: `${r.height}px`, border: '2px solid #10b981', boxSizing: 'border-box' });
                  const label = document.createElement('div');
                  Object.assign(label.style, { position: 'absolute', top: `${Math.max(0, r.top) - 18}px`, left: `${Math.max(0, r.left)}px`, background: '#10b981', color: '#fff', fontSize: '11px', padding: '0 4px' });
                  label.textContent = `#${map[id].highlightIndex}`;
                  overlay.appendChild(box);
                  overlay.appendChild(label);
                }
              }
            });
          });

          const result = { rootId, map, perfMetrics: { timings: perf.timings } } as any;
          return result;
        } catch (e) {
          return { rootId: '1', map: { '1': { tagName: 'body', xpath: '', attributes: {}, children: [], isVisible: true } } };
        } finally {
          perf.timings.total = performance.now() - perfStart;
        }
      };
    },
  });
}

async function _buildDomTree(
  tabId: number,
  url: string,
  showHighlightElements = true,
  focusElement = -1,
  viewportExpansion = 0,
  debugMode = false
): Promise<[DOMElementNode, Map<number, DOMElementNode>]> {
  // If URL is provided and it's about:blank, return a minimal DOM tree
  if (url === 'about:blank') {
    const elementTree = new DOMElementNode({
      tagName: 'body',
      xpath: '',
      attributes: {},
      children: [],
      isVisible: false,
      isInteractive: false,
      isTopElement: false,
      isInViewport: false,
      parent: null,
    });
    return [elementTree, new Map<number, DOMElementNode>()];
  }

  await injectBuildDomTreeScript(tabId);

  // Execute on main frame first
  const mainResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: (args) => {
      return (window as any).buildDomTree(args);
    },
    args: [
      {
        showHighlightElements,
        focusHighlightIndex: focusElement,
        viewportExpansion,
        debugMode,
        startId: 1,
        startHighlightIndex: 0,
      },
    ],
  });

  const mainEval = (mainResult[0]?.result as unknown) as BuildDomTreeResult;
  if (!mainEval || !mainEval.map || !mainEval.rootId) {
    throw new Error('Failed to build DOM tree: No result returned or invalid structure');
  }

  // Build tree for main frame
  const [mainTree, mainSelectorMap] = _constructDomTree(mainEval);

  // Optionally log performance metrics
  if (debugMode && (mainEval as any).perfMetrics) {
    logger.debug('DOM Tree Building Performance Metrics (main):', (mainEval as any).perfMetrics);
  }

  // Attempt subframes: accumulate selector maps with id/highlight offsets
  let maxNodeId = Object.keys(mainEval.map).reduce((m, k) => Math.max(m, Number(k) || 0), 0);
  let maxHighlightIndex = 0;
  try {
    Object.values(mainEval.map).forEach((node: any) => {
      if (node && typeof node === 'object' && Number.isFinite(node.highlightIndex)) {
        maxHighlightIndex = Math.max(maxHighlightIndex, Number(node.highlightIndex));
      }
    });
  } catch {}

  const combinedSelectorMap = new Map<number, DOMElementNode>();
  // seed with main
  mainSelectorMap.forEach((v, k) => combinedSelectorMap.set(k, v));

  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    const subFrameIds = (frames || []).map(f => f.frameId).filter(id => typeof id === 'number' && id !== 0);
    for (const frameId of subFrameIds) {
      const subRes = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] as any },
        func: (args) => (window as any).buildDomTree(args),
        args: [
          {
            showHighlightElements,
            focusHighlightIndex: focusElement,
            viewportExpansion,
            debugMode,
            startId: maxNodeId + 1,
            startHighlightIndex: maxHighlightIndex + 1,
          },
        ],
      });
      const subEval = (subRes[0]?.result as unknown) as BuildDomTreeResult;
      if (!subEval || !subEval.map || !subEval.rootId) continue;

      // Update offsets
      maxNodeId = Math.max(maxNodeId, ...Object.keys(subEval.map).map(k => Number(k) || 0));
      try {
        Object.values(subEval.map).forEach((node: any) => {
          if (node && typeof node === 'object' && Number.isFinite(node.highlightIndex)) {
            maxHighlightIndex = Math.max(maxHighlightIndex, Number(node.highlightIndex));
          }
        });
      } catch {}

      // Merge selector maps
      const [, subSelectorMap] = _constructDomTree(subEval);
      subSelectorMap.forEach((v, k) => combinedSelectorMap.set(k, v));
    }
  } catch (e) {
    // No frame permission or call failed; ignore
    if (debugMode) logger.debug('Subframe scan skipped:', (e as Error)?.message);
  }

  return [mainTree, combinedSelectorMap];
}

/**
 * Constructs a DOM tree from the evaluated page data.
 * @param evalPage - The result of building the DOM tree.
 * @returns A tuple containing the DOM element tree and selector map.
 */
function _constructDomTree(
  evalPage: BuildDomTreeResult
): [DOMElementNode, Map<number, DOMElementNode>] {
  const jsNodeMap = evalPage.map;
  const jsRootId = evalPage.rootId;

  const selectorMap = new Map<number, DOMElementNode>();
  const nodeMap: Record<string, DOMBaseNode> = {};

  // First pass: create all nodes
  for (const [id, nodeData] of Object.entries(jsNodeMap)) {
    const [node] = _parse_node(nodeData);
    if (node === null) {
      continue;
    }

    nodeMap[id] = node;

    // Add to selector map if it has a highlight index
    if (
      node instanceof DOMElementNode &&
      node.highlightIndex !== undefined &&
      node.highlightIndex !== null
    ) {
      selectorMap.set(node.highlightIndex, node);
    }
  }

  // Second pass: build the tree structure
  for (const [id, node] of Object.entries(nodeMap)) {
    if (node instanceof DOMElementNode) {
      const nodeData = jsNodeMap[id];
      const childrenIds = 'children' in nodeData ? nodeData.children : [];

      for (const childId of childrenIds) {
        if (!(childId in nodeMap)) {
          continue;
        }

        const childNode = nodeMap[childId];

        childNode.parent = node;
        node.children.push(childNode);
      }
    }
  }

  const htmlToDict = nodeMap[String(jsRootId)];

  if (htmlToDict === undefined || !(htmlToDict instanceof DOMElementNode)) {
    throw new Error('Failed to parse HTML to dictionary');
  }

  return [htmlToDict, selectorMap];
}

/**
 * Parse a raw DOM node and return the node object and its children IDs.
 * @param nodeData - The raw DOM node data to parse.
 * @returns A tuple containing the parsed node and an array of child IDs.
 */
export function _parse_node(
  nodeData: RawDomTreeNode
): [DOMBaseNode | null, string[]] {
  if (!nodeData) {
    return [null, []];
  }

  // Process text nodes immediately
  if ('type' in nodeData && nodeData.type === 'TEXT_NODE') {
    const textNode = new DOMTextNode(nodeData.text, nodeData.isVisible, null);
    return [textNode, []];
  }

  // At this point, nodeData is RawDomElementNode (not a text node)
  // TypeScript needs help to narrow the type
  const elementData = nodeData as Exclude<RawDomTreeNode, { type: string }>;

  // Process viewport info if it exists
  let viewportInfo: ViewportInfo | undefined = undefined;
  if (
    'viewport' in nodeData &&
    typeof nodeData.viewport === 'object' &&
    nodeData.viewport
  ) {
    const viewportObj = nodeData.viewport as { width: number; height: number };
    viewportInfo = {
      width: viewportObj.width,
      height: viewportObj.height,
      scrollX: 0,
      scrollY: 0,
    };
  }

  const elementNode = new DOMElementNode({
    tagName: elementData.tagName,
    xpath: elementData.xpath,
    attributes: elementData.attributes ?? {},
    children: [],
    isVisible: elementData.isVisible ?? false,
    isInteractive: elementData.isInteractive ?? false,
    isTopElement: elementData.isTopElement ?? false,
    isInViewport: elementData.isInViewport ?? false,
    highlightIndex: elementData.highlightIndex ?? null,
    shadowRoot: elementData.shadowRoot ?? false,
    parent: null,
    viewportInfo: viewportInfo,
  });

  const childrenIds = elementData.children || [];

  return [elementNode, childrenIds];
}

export async function removeHighlights(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Remove the highlight container and all its contents
        const container = document.getElementById(
          'playwright-highlight-container'
        );
        if (container) {
          container.remove();
        }

        // Remove highlight attributes from elements
        const highlightedElements = document.querySelectorAll(
          '[browser-user-highlight-id^="playwright-highlight-"]'
        );
        for (const el of Array.from(highlightedElements)) {
          el.removeAttribute('browser-user-highlight-id');
        }
      },
    });
  } catch (error) {
    logger.error('Failed to remove highlights:', error);
  }
}

/**
 * Get the scroll information for the current page.
 * @param tabId - The ID of the tab to get the scroll information for.
 * @returns A tuple containing the number of pixels above and below the current scroll position.
 */
// export async function getScrollInfo(tabId: number): Promise<[number, number]> {
//   const results = await chrome.scripting.executeScript({
//     target: { tabId: tabId },
//     func: () => {
//       const scroll_y = window.scrollY;
//       const viewport_height = window.innerHeight;
//       const total_height = document.documentElement.scrollHeight;
//       return {
//         pixels_above: scroll_y,
//         pixels_below: total_height - (scroll_y + viewport_height),
//       };
//     },
//   });
//
//   const result = results[0]?.result;
//   if (!result) {
//     throw new Error('Failed to get scroll information');
//   }
//   return [result.pixels_above, result.pixels_below];
// }

export async function getScrollInfo(
  tabId: number
): Promise<[number, number, number]> {
  const results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: () => {
      const scrollY = window.scrollY;
      const visualViewportHeight =
        window.visualViewport?.height || window.innerHeight;
      const scrollHeight = document.body.scrollHeight;
      return {
        scrollY: scrollY,
        visualViewportHeight: visualViewportHeight,
        scrollHeight: scrollHeight,
      };
    },
  });

  const result = results[0]?.result;
  if (!result) {
    throw new Error('Failed to get scroll information');
  }
  return [result.scrollY, result.visualViewportHeight, result.scrollHeight];
}
