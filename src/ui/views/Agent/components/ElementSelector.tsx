import React, { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ElementSelector');

interface ElementHighlight {
  id: string;
  selector: string;
  bounds: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  isVisible: boolean;
  element?: {
    tagName: string;
    textContent?: string;
    attributes?: Record<string, string>;
  };
}

interface ElementSelectorProps {
  isActive: boolean;
  onActivate: (mode: 'highlight' | 'select' | 'analyze') => void;
  onDeactivate: () => void;
  onElementSelect?: (element: ElementHighlight) => void;
  className?: string;
}

export const ElementSelector: React.FC<ElementSelectorProps> = ({
  isActive,
  onActivate,
  onDeactivate,
  onElementSelect,
  className = '',
}) => {
  const [mode, setMode] = useState<'highlight' | 'select' | 'analyze'>('highlight');
  const [highlightedElements, setHighlightedElements] = useState<ElementHighlight[]>([]);
  const [selectedElement, setSelectedElement] = useState<ElementHighlight | null>(null);
  const [customFilter, setCustomFilter] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [copiedToClipboard, setCopiedToClipboard] = useState<boolean>(false);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);

  // Resolve active tab id for direct browser actions
  useEffect(() => {
    const resolveActiveTab = async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const id = tabs[0]?.id;
        if (id) setActiveTabId(id);
        else {
          const allTabs = await chrome.tabs.query({});
          const fallback = allTabs.find(t => t.active)?.id || allTabs[0]?.id || null;
          if (fallback) setActiveTabId(fallback);
        }
      } catch (e) {
        logger.warn('Failed to resolve active tab id', e);
      }
    };
    resolveActiveTab();
  }, []);
  // Keep activeTabId in sync with real browser state
  useEffect(() => {
    const handleActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      setActiveTabId(activeInfo.tabId);
      // eslint-disable-next-line no-console
      console.info('[ElementSelector] Tab activated:', activeInfo);
    };
    const handleUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tab.active) {
        setActiveTabId(tabId);
        // eslint-disable-next-line no-console
        console.info('[ElementSelector] Tab updated(active):', { tabId, changeInfo, url: tab.url, status: tab.status });
      }
    };
    const handleFocusChanged = async (windowId: number) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) return;
      try {
        const tabs = await chrome.tabs.query({ active: true, windowId });
        if (tabs[0]?.id) setActiveTabId(tabs[0].id);
      } catch (e) {
        // ignore
      }
    };

    chrome.tabs.onActivated.addListener(handleActivated);
    chrome.tabs.onUpdated.addListener(handleUpdated);
    chrome.windows.onFocusChanged.addListener(handleFocusChanged);

    return () => {
      try { chrome.tabs.onActivated.removeListener(handleActivated); } catch {}
      try { chrome.tabs.onUpdated.removeListener(handleUpdated); } catch {}
      try { chrome.windows.onFocusChanged.removeListener(handleFocusChanged); } catch {}
    };
  }, []);


  // New Debug Panel state
  const [elements, setElements] = useState<Array<ElementHighlight>>([]);
  // Bridge logging: log in panel console and mirror to page console via content script
  const uiLog = useCallback((...args: any[]) => {
    try { console.info('[ElementSelector][UI]', ...args); } catch {}
  }, []);
  const pageLog = useCallback(async (payload: any) => {
    try {
      if (activeTabId) {
        await chrome.tabs.sendMessage(activeTabId, { type: 'ELEMENT_DEBUG_PAGE_LOG', params: { payload } });
      }
    } catch {}
  }, [activeTabId]);

  useEffect(() => {
    uiLog('mounted');
    pageLog({ event: 'mounted' });
  }, [uiLog, pageLog]);

  const [filterText, setFilterText] = useState<string>('');
  const [elementType, setElementType] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<ElementHighlight | null>(null);
  const [inputValue, setInputValue] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [scanMode, setScanMode] = useState<'interactive' | 'all'>('interactive');

  const scanInteractive = useCallback(async () => {
    logger.info('Scanning interactive elements');
    logger.info('[ElementSelector] scanInteractive start', { activeTabId, scanMode, elementType, filterText });
    if (!activeTabId) return;
    setLoading(true);
    try {


      // Ping content script to ensure availability before querying
      let canProceed = true;
      try {
        const pong = await chrome.tabs.sendMessage(activeTabId, { type: 'PING' });
        // eslint-disable-next-line no-console
        console.info('[ElementSelector][Scan] Content script PONG:', pong);
      } catch (e) {
        canProceed = false;
        // eslint-disable-next-line no-console
        console.warn('[ElementSelector][Scan] Content script not available on this tab. Please open a http/https/file page.', e);
      }

      if (!canProceed) {
        // Fallback: execute in page to force scan/log/highlight when content script is unavailable
        try {
          const exec = await chrome.scripting.executeScript({
            target: { tabId: activeTabId, allFrames: true },
            func: (scanAll: boolean, textFilter: string) => {
              const toArray = (n: any): any[] => Array.prototype.slice.call(n);
              const isVisible = (el: Element): boolean => {
                const rect = (el as HTMLElement).getBoundingClientRect();
                return !!(rect && rect.width && rect.height);
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
                  const siblings: any[] = toArray(node.parentElement?.children || []);
                  const index = siblings.indexOf(node as any) + 1;
                  part += `:nth-child(${index})`;
                  parts.unshift(part);
                  node = node.parentElement;
                }
                return parts.join(' > ');
              };
              const interactiveSelectors = [
                'button','input','select','textarea','a[href]',
                '[role="button"]','[role="link"]','[role="textbox"]',
                '[contenteditable="true"]','[tabindex]:not([tabindex="-1"])'
              ];
              let overlay = document.getElementById('vibe3-debug-overlay');
              if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'vibe3-debug-overlay';
                Object.assign(overlay.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483647' });
                document.documentElement.appendChild(overlay);
              }
              overlay!.innerHTML = '';
              const allEls = toArray(document.querySelectorAll('*'))
                .filter((el: Element) => isVisible(el))
                .map((el: Element) => ({ selector: makeSelector(el), tagName: el.tagName.toLowerCase(), textContent: (el.textContent || '').trim().slice(0, 200) }));
              const interEls: Element[] = (scanAll ? toArray(document.querySelectorAll('*')) : []);
              if (!scanAll) {
                interactiveSelectors.forEach(sel => {
                  toArray(document.querySelectorAll(sel)).forEach((el: Element) => interEls.push(el));
                });
              }
              const interFiltered = interEls
                .filter((el: Element) => isVisible(el))
                .filter((el: Element) => !textFilter || (el.textContent || '').toLowerCase().includes(String(textFilter).toLowerCase()));
              interFiltered.forEach((el: Element) => {
                const r = (el as HTMLElement).getBoundingClientRect();
                const box = document.createElement('div');
                Object.assign(box.style, { position: 'absolute', top: `${Math.max(0, r.top)}px`, left: `${Math.max(0, r.left)}px`, width: `${r.width}px`, height: `${r.height}px`, border: '2px solid #10b981', boxSizing: 'border-box' });
                overlay!.appendChild(box);
              });
              console.info('[ElementSelector][Page][ExecuteScript] Tab:', { url: location.href, title: document.title });
              console.info('[ElementSelector][Page][ExecuteScript] All elements:', allEls);
              console.info('[ElementSelector][Page][ExecuteScript] Interactive count:', interFiltered.length);
              // return interactive elements with bounds for UI list
              const interactive = interFiltered.slice(0, 500).map((el: Element, idx: number) => {
                const r = (el as HTMLElement).getBoundingClientRect();
                return {
                  selector: makeSelector(el),
                  element: { tagName: el.tagName.toLowerCase(), textContent: (el.textContent || '').trim().slice(0, 100) },
                  bounds: { top: r.top, left: r.left, width: r.width, height: r.height },
                  isVisible: true,
                };
              });
              return { interactive, allCount: allEls.length };
            },
            args: [scanMode === 'all', filterText.trim()],
          });
          const frames = Array.isArray(exec) ? exec : [];
          const merged: any[] = [];
          for (const r of frames) {
            if (r && r.result && Array.isArray(r.result.interactive)) {
              merged.push(...r.result.interactive);
            }
          }
          setElements(merged as any);
          setHighlightedElements(merged as any);
          try {
            const tab = await chrome.tabs.get(activeTabId);
            console.info('[ElementSelector][Scan] Active Tab:', { id: tab.id, url: tab.url, title: tab.title, status: tab.status, audible: (tab as any).audible, discarded: (tab as any).discarded });
            console.info('[ElementSelector][Scan] Elements:', merged);
          } catch {}
        } catch (e) {
          logger.error('Fallback executeScript failed', e);
        }
        setLoading(false);
        return;
      }

      // Content script available: ensure highlight overlay via content script then scan
      try {
        await chrome.tabs.sendMessage(activeTabId, { type: 'ELEMENT_SELECTOR_CLEAR' });
      } catch {}
      await chrome.tabs.sendMessage(activeTabId, { type: 'ELEMENT_SELECTOR_ACTIVATE', options: { mode: 'highlight' } });

      // Ask page to scan and log in page console as well
      try {
        await chrome.tabs.sendMessage(activeTabId, {
          type: 'ELEMENT_DEBUG_SCAN_AND_LOG',
          params: {
            options: {
              elementType: elementType.trim(),
              textFilter: filterText.trim(),
              includeAttributes: false,
              includeAll: scanMode === 'all',
            },
          },
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[ElementSelector][Scan] Page logging failed:', e);
      }

      const res = await chrome.tabs.sendMessage(activeTabId, {
        type: 'ELEMENT_GET_INTERACTIVE',
        params: {
          options: {
            elementType: elementType.trim(),
            textFilter: filterText.trim(),
            includeAttributes: false,
            includeAll: scanMode === 'all',
          },
        },
      });

      let items = (res?.success && res?.data?.elements) ? res.data.elements : [];

      // New flow: Use toolRegistry highlightElement with interactiveOnly flag
      try {
        const toolRes = await executeTool('highlightElement', { interactiveOnly: scanMode === 'interactive' });
        const candidates = toolRes?.elements || [];
        if (Array.isArray(candidates) && candidates.length) {
          items = candidates.map((c: any) => ({ selector: c.selector, element: { tagName: c.tag, textContent: c.text } }));
        }
      } catch (e) {
        logger.warn('highlightElement tool execution failed', e);
      }

      // Fallback: execute in page to force scan/log/highlight even if content-script path fails
      if (!items.length) {
        try {
          const exec = await chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            func: (scanAll: boolean, textFilter: string) => {
              const toArray = (n: any): any[] => Array.prototype.slice.call(n);
              const isVisible = (el: Element): boolean => {
                const rect = (el as HTMLElement).getBoundingClientRect();
                return !!(rect && rect.width && rect.height);
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
                  const siblings: any[] = toArray(node.parentElement?.children || []);
                  const index = siblings.indexOf(node as any) + 1;
                  part += `:nth-child(${index})`;
                  parts.unshift(part);
                  node = node.parentElement;
                }
                return parts.join(' > ');
              };
              const interactiveSelectors = [
                'button','input','select','textarea','a[href]',
                '[role="button"]','[role="link"]','[role="textbox"]',
                '[contenteditable="true"]','[tabindex]:not([tabindex="-1"])'
              ];
              // Build overlay
              let overlay = document.getElementById('vibe3-debug-overlay');
              if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'vibe3-debug-overlay';
                Object.assign(overlay.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483647' });
                document.documentElement.appendChild(overlay);
              }
              overlay!.innerHTML = '';

              const allEls = toArray(document.querySelectorAll('*'))
                .filter((el) => isVisible(el))
                .map((el) => ({
                  selector: makeSelector(el),
                  tagName: el.tagName.toLowerCase(),
                  textContent: (el.textContent || '').trim().slice(0, 200),
                }));

              const interEls = (scanAll ? toArray(document.querySelectorAll('*')) : []);
              if (!scanAll) {
                interactiveSelectors.forEach(sel => {
                  toArray(document.querySelectorAll(sel)).forEach(el => interEls.push(el));
                });
              }
              const interFiltered = interEls
                .filter((el) => isVisible(el))
                .filter((el) => !textFilter || (el.textContent || '').toLowerCase().includes(String(textFilter).toLowerCase()));

              // Draw boxes
              interFiltered.forEach((el, idx) => {
                const r = el.getBoundingClientRect();
                const box = document.createElement('div');
                Object.assign(box.style, {
                  position: 'absolute',
                  top: `${Math.max(0, r.top)}px`,
                  left: `${Math.max(0, r.left)}px`,
                  width: `${r.width}px`,
                  height: `${r.height}px`,
                  border: '2px solid #10b981',
                  boxSizing: 'border-box',
                });
                overlay!.appendChild(box);
              });

              // Log everything in page console
              // eslint-disable-next-line no-console
              console.info('[ElementSelector][Page][ExecuteScript] Tab:', { url: location.href, title: document.title });
              // eslint-disable-next-line no-console
              console.info('[ElementSelector][Page][ExecuteScript] All elements:', allEls);
              // eslint-disable-next-line no-console
              console.info('[ElementSelector][Page][ExecuteScript] Interactive count:', interFiltered.length);

              return {
                interactive: interFiltered.slice(0, 200).map((el) => ({ selector: makeSelector(el), element: { tagName: el.tagName.toLowerCase(), textContent: (el.textContent || '').trim().slice(0, 100) } })),
                allCount: allEls.length,
              };
            },
            args: [scanMode === 'all', filterText.trim()],
          });
          const pageData = exec[0]?.result;
          if (pageData?.interactive) {
            items = pageData.interactive;
          }
          // eslint-disable-next-line no-console
          console.info('[ElementSelector][Scan][Fallback] Result:', pageData);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[ElementSelector][Scan][Fallback] executeScript failed:', e);
        }
      }

      setElements(items);
      setHighlightedElements(items);

      // Console debug: print current tab info too
      try {
        const tab = (await chrome.tabs.get(activeTabId));
        // eslint-disable-next-line no-console
        console.info('[ElementSelector][Scan] Active Tab:', { id: tab.id, url: tab.url, title: tab.title, status: tab.status, audible: (tab as any).audible, discarded: (tab as any).discarded });
        // eslint-disable-next-line no-console
        console.info('[ElementSelector][Scan] Elements:', items);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[ElementSelector][Scan] Failed to print tab/elements:', e);
      }
    } catch (e) {
      logger.error('Scan interactive elements failed', e);
      setElements([]);
      setHighlightedElements([]);
    } finally {
      setLoading(false);
    }
  }, [activeTabId, elementType, filterText]);

  const highlightOne = useCallback(async (selector: string) => {
    if (!activeTabId) return;
    try {
      await chrome.tabs.sendMessage(activeTabId, {
        type: 'ELEMENT_HIGHLIGHT',
        params: { selector, options: { flash: true } },
      });
    } catch (e) {
      logger.warn('Highlight failed', e);
    }
  }, [activeTabId]);

  const highlightAll = useCallback(async () => {
    for (const it of elements) {
      await highlightOne(it.selector);
    }
  }, [elements, highlightOne]);

  const clearHighlights = useCallback(async () => {
    if (!activeTabId) return;
    try {
      await chrome.tabs.sendMessage(activeTabId, { type: 'ELEMENT_SELECTOR_CLEAR' });
    } catch (e) {
      logger.warn('Clear highlights failed', e);
    }
  }, [activeTabId]);

  // Execute actions via ToolRegistry for consistency with Agent Tool
  const executeTool = useCallback(async (name: string, params: any) => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'AGENT_EXECUTE_TOOL', name, params });
      if (!res?.success) throw new Error(res?.error || 'Tool execution failed');
      return res.result;
    } catch (e) {
      logger.error('Tool execution failed', name, params, e);
      throw e;
    }
  }, []);

  const clickSelected = useCallback(async () => {
    if (!selectedItem) return;
    await executeTool('clickElement', { selector: selectedItem.selector });
  }, [selectedItem, executeTool]);

  const scrollSelected = useCallback(async () => {
    if (!selectedItem) return;
    await executeTool('scrollPage', { direction: 'element', selector: selectedItem.selector });
  }, [selectedItem, executeTool]);

  const inputIntoSelected = useCallback(async () => {
    if (!selectedItem) return;
    await executeTool('fillForm', { fields: [{ selector: selectedItem.selector, value: inputValue }], submit: false });
  }, [selectedItem, inputValue, executeTool]);

  const handleActivate = useCallback(async (selectedMode: typeof mode) => {
    setMode(selectedMode);
    try {
      if (activeTabId) {
        await chrome.tabs.sendMessage(activeTabId, {
          type: 'ELEMENT_SELECTOR_ACTIVATE',
          options: { mode: selectedMode },
        });
      }
    } catch (e) {
      logger.error('Failed to activate selector on page', e);
    }
    onActivate(selectedMode);
  }, [onActivate, activeTabId]);

  const handleDeactivate = useCallback(async () => {
    try {
      if (activeTabId) {
        await chrome.tabs.sendMessage(activeTabId, { type: 'ELEMENT_SELECTOR_DEACTIVATE' });
      }
    } catch (e) {
      logger.warn('Failed to deactivate selector on page', e);
    }
    setHighlightedElements([]);
    setSelectedElement(null);
    setAnalysisResult('');
    onDeactivate();
  }, [onDeactivate, activeTabId]);

  const handleElementSelect = useCallback((element: ElementHighlight) => {
    setSelectedElement(element);
    onElementSelect?.(element);
  }, [onElementSelect]);

  const analyzeElement = useCallback(async (element: ElementHighlight) => {
    setIsAnalyzing(true);
    try {
      if (!activeTabId) throw new Error('No active tab');
      const response = await chrome.tabs.sendMessage(activeTabId, {
        type: 'ELEMENT_ANALYZE',
        params: {
          selector: element.selector,
          includeAccessibility: false,
          includeEvents: false,
        },
      });

      if (response?.success && response?.data) {
        setAnalysisResult(typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
      } else {
        setAnalysisResult('Analysis failed' + (response?.error ? `: ${response.error}` : ''));
      }
    } catch (error) {
      logger.error('Element analysis failed', error);
      setAnalysisResult('Analysis failed: ' + (error as Error).message);
    } finally {
      setIsAnalyzing(false);
    }
  }, [activeTabId]);

  // Listen for element selection events from content script
  useEffect(() => {
    const handleElementSelected = (event: MessageEvent) => {
      if (event.data.type === 'ELEMENT_SELECTED') {
        handleElementSelect(event.data.element);
      }
    };

    window.addEventListener('message', handleElementSelected);
    return () => window.removeEventListener('message', handleElementSelected);
  }, [handleElementSelect]);

  // Fetch highlighted elements from the ACTIVE TAB's content script periodically
  useEffect(() => {
    if (!isActive || !activeTabId) return;

    let stopped = false;
    const fetchHighlights = async () => {
      try {
        const response = await chrome.tabs.sendMessage(activeTabId, {
          type: 'ELEMENT_SELECTOR_GET_HIGHLIGHTS',
        });
        if (stopped) return;
        if (response && response.success) {
          setHighlightedElements(response.highlights ?? []);
        }
      } catch (error: any) {
        // Avoid noisy logs when content script is not present on this tab
        const msg = (error && error.message) || String(error);
        if (!/Receiving end does not exist/i.test(msg)) {
          logger.error('Failed to fetch highlighted elements', error);
        }
      }
    };

    fetchHighlights();
    const interval = setInterval(fetchHighlights, 1000);

    return () => { stopped = true; clearInterval(interval); };
  }, [isActive, activeTabId]);

  // Render the new full debug panel (no modal)
  if (isActive) {
    return (
      <div className={`overflow-auto p-4 w-full h-full ${className}`}>
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-2 items-center">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900">Element Debug Panel</h3>
            <span className="text-xs text-gray-500">Tab: {activeTabId ?? 'unknown'}</span>
          </div>
          <div className="flex gap-2 items-center">
            <button type="button" className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700" onClick={scanInteractive}>
              {loading ? 'Scanning...' : 'Scan'}
            </button>
            <button type="button" className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => { highlightAll(); setHighlightedElements(elements); }}>
              Highlight All
            </button>
            <button type="button" className="px-3 py-1.5 text-sm rounded-md bg-gray-200 text-gray-800 hover:bg-gray-300" onClick={clearHighlights}>
              Clear Highlights
            </button>
          </div>
          {/* Scan Mode Toggle */}
          <div className="flex gap-3 items-center mb-4">
            <span className="text-sm text-gray-600">Scan Mode</span>
            <div className="inline-flex overflow-hidden rounded-md border border-gray-300">
              <button type="button"
                className={`px-3 py-1.5 text-sm ${scanMode === 'interactive' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                onClick={() => setScanMode('interactive')}
              >
                Interactive
              </button>
              <button type="button"
                className={`px-3 py-1.5 text-sm border-l border-gray-300 ${scanMode === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                onClick={() => setScanMode('all')}
              >
                All Visible
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 gap-3 mb-4 md:grid-cols-3">
          <div className="flex gap-2 items-center">
            <label className="w-20 text-sm text-gray-600">Type</label>
            <input value={elementType} onChange={(e) => setElementType(e.target.value)} placeholder="e.g. button, input, a" className="flex-1 px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-2 items-center md:col-span-2">
            <label className="w-20 text-sm text-gray-600">Text</label>
            <input value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="Filter by text content" className="flex-1 px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0 h-[calc(100%-7rem)]">
          {/* Left: list */}
          <div className="flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-semibold text-gray-900">Interactive Elements</h4>
              <span className="text-xs text-gray-500">{elements.length} items</span>
            </div>
            <div className="overflow-auto flex-1 rounded border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 text-gray-600 bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 w-12 text-left">#</th>
                    <th className="px-2 py-2 w-20 text-left">Tag</th>
                    <th className="px-2 py-2 text-left">Selector</th>
                    <th className="px-2 py-2 text-left">Text</th>
                    <th className="px-2 py-2 w-24 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {elements.map((el, idx) => (
                    <tr key={el.id ?? el.selector + idx} className={`border-t hover:bg-gray-50 cursor-pointer ${selectedItem?.selector === el.selector ? 'bg-blue-50' : ''}`} onClick={() => setSelectedItem(el)}>
                      <td className="px-2 py-1 text-gray-500 align-top">{idx + 1}</td>
                      <td className="px-2 py-1 align-top">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {el.element?.tagName || 'unknown'}
                        </span>
                      </td>
                      <td className="px-2 py-1 font-mono text-xs text-gray-800 align-top break-all">{el.selector}</td>
                      <td className="px-2 py-1 text-gray-700 align-top">{el.element?.textContent || ''}</td>
                      <td className="px-2 py-1 align-top">
                        <div className="flex gap-1">
                          <button type="button" className="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300" onClick={(e) => { e.stopPropagation(); highlightOne(el.selector); }}>Highlight</button>
                          <button type="button" className="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300" onClick={(e) => { e.stopPropagation(); setSelectedItem(el); }}>Select</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {elements.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-sm text-center text-gray-500">No elements. Click Scan to fetch interactive elements.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: details & actions */}
          <div className="flex flex-col h-full">
            <h4 className="mb-2 text-sm font-semibold text-gray-900">Selected</h4>
            {!selectedItem ? (
              <div className="flex flex-1 justify-center items-center text-sm text-gray-400 rounded border border-gray-200 border-dashed">
                Select an element from the list
              </div>
            ) : (
              <div className="overflow-auto flex-1 p-3 space-y-3 rounded border border-gray-200">
                <div>
                  <label className="block mb-1 text-sm font-medium text-gray-700">Selector</label>
                  <code className="block px-2 py-1 font-mono text-xs text-gray-800 break-all bg-gray-100 rounded">{selectedItem.selector}</code>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-1 text-sm font-medium text-gray-700">Tag</label>
                    <div className="text-sm text-gray-900">{selectedItem.element?.tagName}</div>
                  </div>
                  <div>
                    <label className="block mb-1 text-sm font-medium text-gray-700">Visible</label>
                    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${selectedItem.isVisible ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{selectedItem.isVisible ? 'Yes' : 'No'}</div>
                  </div>
                </div>
                {selectedItem.element?.textContent && (
                  <div>
                    <label className="block mb-1 text-sm font-medium text-gray-700">Text</label>
                    <div className="overflow-auto p-2 max-h-24 text-sm text-gray-700 bg-gray-50 rounded">{selectedItem.element?.textContent}</div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button type="button" className="px-3 py-1.5 text-sm rounded-md bg-gray-200 hover:bg-gray-300" onClick={scrollSelected}>Scroll Into View</button>
                  <button type="button" className="px-3 py-1.5 text-sm rounded-md bg-gray-200 hover:bg-gray-300" onClick={() => highlightOne(selectedItem.selector)}>Highlight</button>
                  {(['button','a'].includes((selectedItem.element?.tagName || '').toLowerCase())) && (
                    <button type="button" className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700" onClick={clickSelected}>Click</button>
                  )}
                </div>

                {(['input','textarea'].includes((selectedItem.element?.tagName || '').toLowerCase())) && (
                  <div>
                    <label className="block mb-1 text-sm font-medium text-gray-700">Type Text</label>
                    <div className="flex gap-2">
                      <input value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Text to input" className="flex-1 px-3 py-2 text-sm rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button type="button" className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700" onClick={inputIntoSelected}>Type</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!isActive) {
    return null;
  }

  return (
    <div className="flex fixed inset-0 z-50 justify-center items-start pt-20">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50"
        onClick={handleDeactivate}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900">Element Selector</h3>
          </div>
          <button type="button"
            aria-label="Close"
            title="Close"
            onClick={handleDeactivate}
            className="p-1 text-gray-400 rounded-full hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
      <div className="p-4 mb-4 bg-gray-50 rounded-lg border border-gray-200">
        {/* Mode Selection */}
        <div className="flex items-center mb-4">
          <label className="block w-32 text-sm font-medium text-gray-700">Selection Mode:</label>
          <div className="flex space-x-2">
            <button type="button"
              className={`px-3 py-1.5 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center ${
                mode === 'highlight'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => handleActivate('highlight')}
            >
              <svg className="mr-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Highlight
            </button>
            <button type="button"
              className={`px-3 py-1.5 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center ${
                mode === 'select'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => handleActivate('select')}
            >
              <svg className="mr-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
              Select
            </button>
            <button type="button"
              className={`px-3 py-1.5 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center ${
                mode === 'analyze'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => handleActivate('analyze')}
            >
              <svg className="mr-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              Analyze
            </button>
          </div>
        </div>

        {/* Custom Filter */}
        <div className="flex items-center mb-4">
          <label className="block w-32 text-sm font-medium text-gray-700">CSS Filter:</label>
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="e.g., button, .submit-btn, #login-form"
              value={customFilter}
              onChange={(e) => setCustomFilter(e.target.value)}
              className="px-3 py-2 pr-8 w-full rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {customFilter && (
              <button type="button"
                aria-label="Clear"
                title="Clear"
                onClick={() => setCustomFilter('')}
                className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="p-4 bg-blue-50 rounded-md border border-blue-200">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-800">
                {mode === 'highlight' && 'Interactive elements are highlighted on the page.'}
                {mode === 'select' && 'Click on any element to select it.'}
        {/* Debug Actions */}
        <div className="p-4 mb-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-semibold text-gray-900">Debug Actions</h4>
            <div className="text-xs text-gray-500">Tab: {activeTabId ?? 'unknown'}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button"
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={async () => {
                try {
                  if (activeTabId) {
                    const res = await chrome.tabs.sendMessage(activeTabId, { type: 'ELEMENT_HIGHLIGHT_DEFIELEMENTS' });
                    logger.info('DeFi highlight result', res);
                  }
                } catch (e) {
                  logger.error('DeFi highlight failed', e);
                }
              }}
            >
              Highlight DeFi Elements
            </button>

            <button type="button"
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-200 text-gray-800 hover:bg-gray-300"
              onClick={async () => {
                try {
                  if (activeTabId) {
                    await chrome.tabs.sendMessage(activeTabId, { type: 'ELEMENT_SELECTOR_CLEAR' });
                  }
                } catch (e) {
                  logger.warn('Clear highlights failed', e);
                }
              }}
            >
              Clear Highlights
            </button>
          </div>
        </div>

                {mode === 'analyze' && 'Click on elements to analyze their properties and interactions.'}
              </p>
              <p className="mt-1 text-sm text-blue-700">Press ESC to exit selection mode.</p>
            </div>
          </div>
        </div>
      </div>

            {/* Selected Element Info */}
      {selectedElement && (
        <div className="p-4 mb-4 bg-white rounded-lg border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-semibold text-gray-900">Selected Element</h4>
            <div className="flex space-x-2">
              <button type="button"
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => analyzeElement(selectedElement)}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <>
                    <svg className="mr-1 -ml-1 w-4 h-4 text-gray-700 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <svg className="mr-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    Analyze
                  </>
                )}
              </button>
              <button type="button"
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center"
                onClick={() => {
                  navigator.clipboard.writeText(selectedElement.selector);
                  setCopiedToClipboard(true);
                  setTimeout(() => setCopiedToClipboard(false), 2000);
                }}
              >
                {copiedToClipboard ? (
                  <>
                    <svg className="mr-1 w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="mr-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Selector:</label>
                <code className="block px-2 py-1 font-mono text-sm text-gray-800 bg-gray-100 rounded">
                  {selectedElement.selector}
                </code>
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Tag:</label>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {selectedElement.element?.tagName}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Visible:</label>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  selectedElement.isVisible
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {selectedElement.isVisible ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Position:</label>
                <span className="text-sm text-gray-900">
                  {Math.round(selectedElement.bounds.top)}px, {Math.round(selectedElement.bounds.left)}px
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Size:</label>
                <span className="text-sm text-gray-900">
                  {Math.round(selectedElement.bounds.width)}x{Math.round(selectedElement.bounds.height)}px
                </span>
              </div>
            </div>

            {selectedElement.element?.textContent && (
              <div>
                <label className="block mb-1 text-sm font-medium text-gray-700">Text:</label>
                <p className="overflow-y-auto p-2 max-h-20 text-sm text-gray-900 bg-gray-50 rounded">
                  {selectedElement.element.textContent.length > 100
                    ? selectedElement.element.textContent.substring(0, 100) + '...'
                    : selectedElement.element.textContent
                  }
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Analysis Result */}
      {analysisResult && (
        <div className="p-4 mb-4 bg-white rounded-lg border border-gray-200">
          <h4 className="mb-3 text-lg font-semibold text-gray-900">Analysis Result</h4>
          <pre className="overflow-x-auto p-3 text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded">
            {analysisResult}
          </pre>
        </div>
      )}

      {/* Highlighted Elements Count */}
      <div className="text-xs text-center text-gray-500">
        {highlightedElements.length} elements highlighted
      </div>
        </div>
      </div>
    </div>
  );
};

export default ElementSelector;