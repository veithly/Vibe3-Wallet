import React, { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@/utils/logger';
import { CDPStatusIndicator } from './CDPStatusIndicator';

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
  const [loading, setLoading] = useState<boolean>(false);
  const [scanMode, setScanMode] = useState<'interactive' | 'all'>('interactive');

  const scanInteractive = useCallback(async () => {
    logger.info('Scanning interactive elements [nanobrowser mode]');
    logger.info('[ElementSelector] scanInteractive start', { activeTabId, scanMode, elementType, filterText });
    if (!activeTabId) return;
    setLoading(true);
    try {
      // Prefer backend DOM service (nanobrowser-style). It will inject buildDomTree if missing and draw overlay.
      let items: any[] = [];
      try {
        const toolRes = await executeTool('getClickableElements', { showHighlightElements: true, debugMode: false });
        const data = toolRes?.data || toolRes;
        items = Array.isArray(data?.items) ? data.items : [];
      } catch (e) {
        logger.warn('getClickableElements tool execution failed', e);
      }

      setElements(items);
      setHighlightedElements(items);

      try {
        const tab = await chrome.tabs.get(activeTabId);
        console.info('[ElementSelector][Scan] Active Tab:', { id: tab.id, url: tab.url, title: tab.title, status: tab.status, audible: (tab as any).audible, discarded: (tab as any).discarded });
        console.info('[ElementSelector][Scan] Elements:', items);
      } catch (e) {
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

  const highlightAll = useCallback(async () => {
    try {
      await executeTool('highlightElements', { interactiveOnly: 'all', limit: 500 });
      setHighlightedElements(elements);
    } catch (e) {
      logger.warn('Highlight all failed', e);
    }
  }, [elements, executeTool]);

  const clearHighlights = useCallback(async () => {
    if (!activeTabId) return;
    try {
      await executeTool('clearHighlights', {});
      setHighlightedElements([]);
    } catch (e) {
      logger.warn('Clear highlights failed', e);
      // Fallback to direct cleanup
      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTabId, allFrames: true },
          func: () => {
            const overlayId = 'vibe3-debug-overlay';
            const overlay = document.getElementById(overlayId);
            if (overlay) overlay.innerHTML = '';
          }
        });
        setHighlightedElements([]);
      } catch (execErr) {
        logger.warn('Clear highlights fallback failed', execErr);
      }
    }
  }, [activeTabId, executeTool]);

  // Enhanced action detection based on DOMState (nanobrowser-aligned)
  const getElementActions = useCallback((el: any) => {
    const actions: Array<{name: string, color: string, handler: (el: any) => Promise<void>}> = [];
    const tag = (el.element?.tagName || '').toLowerCase();
    const type = (el.element?.attributes?.type || '').toLowerCase();
    const role = (el.element?.attributes?.role || '').toLowerCase();
    const tabindex = el.element?.attributes?.tabindex;
    const contenteditable = el.element?.attributes?.contenteditable;
    const onclick = el.element?.attributes?.onclick;
    const disabled = el.element?.attributes?.disabled;

    // Skip disabled elements
    if (disabled === 'true' || disabled === '') return actions;

    // Click action for clickable elements (enhanced detection)
    const isClickable = ['button', 'a', 'summary'].includes(tag) ||
                       ['button', 'link', 'menuitem', 'switch', 'tab', 'checkbox', 'radio'].includes(role) ||
                       (tabindex && parseInt(tabindex) >= 0) ||
                       onclick ||
                       (tag === 'input' && ['button', 'submit', 'reset', 'image'].includes(type));

    if (isClickable) {
      actions.push({
        name: 'Click',
        color: 'bg-indigo-600 hover:bg-indigo-700',
        handler: async (element) => {
          await executeTool('clickElement', { selector: element.selector, noDedup: true, _source: 'ElementSelector' });
        }
      });
    }

    // Type action for text inputs (enhanced detection)
    const isTypeable = (tag === 'input' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'hidden'].includes(type)) ||
                      tag === 'textarea' ||
                      contenteditable === 'true' || contenteditable === '' ||
                      role === 'textbox' || role === 'searchbox';

    if (isTypeable) {
      actions.push({
        name: 'Type',
        color: 'bg-blue-600 hover:bg-blue-700',
        handler: async (element) => {
          const value = prompt('Enter text to type:') || '';
          if (value) {
            await executeTool('fillForm', { fields: [{ selector: element.selector, value }], submit: false, noDedup: true, _source: 'ElementSelector' });
          }
        }
      });
    }

    // Toggle action for checkboxes and switches
    if ((tag === 'input' && ['checkbox', 'radio'].includes(type)) || role === 'switch' || role === 'checkbox') {
      actions.push({
        name: 'Toggle',
        color: 'bg-amber-600 hover:bg-amber-700',
        handler: async (element) => {
          await executeTool('fillForm', { fields: [{ selector: element.selector, type: 'checkbox', value: 'toggle' }], submit: false, noDedup: true, _source: 'ElementSelector' });
        }
      });
    }

    // Select action for dropdowns
    if (tag === 'select' || role === 'combobox' || role === 'listbox') {
      actions.push({
        name: 'Select Option',
        color: 'bg-purple-600 hover:bg-purple-700',
        handler: async (element) => {
          const value = prompt('Enter option value or visible text:') || '';
          if (value) {
            // Try as visible text first, then as value
            await executeTool('fillForm', { fields: [{ selector: element.selector, type: 'select', visibleText: value, value }], submit: false, noDedup: true, _source: 'ElementSelector' });
          }
        }
      });
    }

    // Hover action for elements with hover effects
    if (isClickable || isTypeable) {
      actions.push({
        name: 'Hover',
        color: 'bg-gray-500 hover:bg-gray-600',
        handler: async (element) => {
          await executeTool('hoverElement', { selector: element.selector, duration: 1000, noDedup: true, _source: 'ElementSelector' });
        }
      });
    }

    // Scroll into view action
    actions.push({
      name: 'Scroll To',
      color: 'bg-green-600 hover:bg-green-700',
      handler: async (element) => {
        await executeTool('scrollIntoView', { selector: element.selector, block: 'center', smooth: true, noDedup: true, _source: 'ElementSelector' });
      }
    });

    return actions;
  }, [executeTool]);

  const handleActivate = useCallback(async (selectedMode: typeof mode) => {
    setMode(selectedMode);
    onActivate(selectedMode);
  }, [onActivate]);

  const handleDeactivate = useCallback(async () => {
    setHighlightedElements([]);
    setSelectedElement(null);
    setAnalysisResult('');
    await clearHighlights();
    onDeactivate();
  }, [onDeactivate, clearHighlights]);



  const analyzeElement = useCallback(async (element: ElementHighlight) => {
    setIsAnalyzing(true);
    try {
      // Simple analysis based on available element data
      const analysis = {
        selector: element.selector,
        tagName: element.element?.tagName,
        textContent: element.element?.textContent,
        bounds: element.bounds,
        isVisible: element.isVisible,
        isInteractive: (element as any).isInteractive,
      };
      setAnalysisResult(JSON.stringify(analysis, null, 2));
    } catch (error) {
      logger.error('Element analysis failed', error);
      setAnalysisResult('Analysis failed: ' + (error as Error).message);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // Render the new full debug panel (no modal)
  if (isActive) {
    return (
      <div className={`overflow-auto p-4 w-full h-full ${className}`}>
        {/* Compact Header */}
        <div className="flex flex-wrap gap-2 justify-between items-center mb-3">
          <div className="flex gap-2 items-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h3 className="text-base font-medium text-gray-900">Elements</h3>
            {loading && <div className="w-3 h-3 rounded-full border-2 border-blue-600 animate-spin border-t-transparent"></div>}
            <span className="text-xs text-gray-500">({elements.length})</span>
            <CDPStatusIndicator />
          </div>

          <div className="flex gap-1 items-center">
            {/* Scan Mode Toggle */}
            <div className="inline-flex overflow-hidden mr-2 rounded border border-gray-300">
              <button type="button"
                className={`px-2 py-1 text-xs ${scanMode === 'interactive' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                onClick={() => setScanMode('interactive')}
                title="Interactive elements only"
              >
                Interactive
              </button>
              <button type="button"
                className={`px-2 py-1 text-xs border-l border-gray-300 ${scanMode === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                onClick={() => setScanMode('all')}
                title="All visible elements"
              >
                All
              </button>
            </div>

            <button type="button" className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700" onClick={scanInteractive} disabled={loading}>
              {loading ? 'Scanning...' : 'Scan'}
            </button>
            <button type="button" className="px-2 py-1 text-xs text-white bg-emerald-600 rounded hover:bg-emerald-700" onClick={() => { highlightAll(); setHighlightedElements(elements); }} disabled={elements.length === 0} title="Highlight all elements">
              All
            </button>
            <button type="button" className="px-2 py-1 text-xs text-gray-700 bg-gray-200 rounded hover:bg-gray-300" onClick={clearHighlights} title="Clear highlights">
              Clear
            </button>
          </div>
        </div>

        {/* Compact Filters */}
        <div className="flex gap-2 mb-3">
          <input value={elementType} onChange={(e) => setElementType(e.target.value)} placeholder="Type filter (e.g. button)" className="px-2 py-1 w-32 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <input value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="Text filter" className="flex-1 px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-h-0 h-[calc(100%-6rem)]">
          {/* Left: list */}
          <div className="flex flex-col min-h-0">
            <div className="overflow-auto flex-1 rounded border border-gray-200">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 text-gray-600 bg-gray-50">
                  <tr>
                    <th className="px-1 py-1 w-8 text-left">#</th>
                    <th className="px-1 py-1 w-16 text-left">Tag</th>
                    <th className="px-1 py-1 text-left">Text</th>
                    <th className="px-1 py-1 w-40 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {elements.map((el, idx) => (
                    <tr key={el.id ?? el.selector + idx} className={`border-t hover:bg-gray-50 cursor-pointer ${selectedItem?.selector === el.selector ? 'bg-blue-50' : ''}`} onClick={() => setSelectedItem(el)}>
                      <td className="px-1 py-1 text-xs text-gray-500 align-top">{idx + 1}</td>
                      <td className="px-1 py-1 align-top">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {el.element?.tagName || '?'}
                        </span>
                      </td>
                      <td className="px-1 py-1 max-w-0 text-xs text-gray-700 truncate align-top" title={el.element?.textContent || el.selector}>
                        {el.element?.textContent || el.selector}
                      </td>
                      <td className="px-1 py-1 align-top">
                        <div className="flex flex-wrap gap-0.5">
                          {getElementActions(el).map(action => (
                            <button
                              key={action.name}
                              type="button"
                              className={`px-1.5 py-0.5 text-xs text-white rounded hover:opacity-90 ${action.color}`}
                              onClick={async (e) => {
                                e.stopPropagation();
                                setSelectedItem(el);
                                await action.handler(el);
                              }}
                              title={`${action.name} this element`}
                            >
                              {action.name}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {elements.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-xs text-center text-gray-500">No elements. Click Scan to fetch interactive elements.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: details & actions */}
          <div className="flex flex-col h-full">
            <h4 className="mb-2 text-xs font-medium text-gray-900">Selected Element</h4>
            {!selectedItem ? (
              <div className="flex flex-1 justify-center items-center text-xs text-gray-400 rounded border border-gray-200 border-dashed">
                Select an element from the list
              </div>
            ) : (
              <div className="overflow-auto flex-1 p-2 space-y-2 rounded border border-gray-200">
                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-700">Selector</label>
                  <code className="block px-2 py-1 font-mono text-xs text-gray-800 break-all bg-gray-100 rounded">{selectedItem.selector}</code>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block mb-1 text-xs font-medium text-gray-700">Tag</label>
                    <div className="text-xs text-gray-900">{selectedItem.element?.tagName}</div>
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-medium text-gray-700">Visible</label>
                    <div className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${selectedItem.isVisible ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{selectedItem.isVisible ? 'Yes' : 'No'}</div>
                  </div>
                </div>
                {selectedItem.element?.textContent && (
                  <div>
                    <label className="block mb-1 text-xs font-medium text-gray-700">Text</label>
                    <div className="overflow-auto p-2 max-h-20 text-xs text-gray-700 bg-gray-50 rounded">{selectedItem.element?.textContent}</div>
                  </div>
                )}

                <div>
                  <label className="block mb-1 text-xs font-medium text-gray-700">Available Actions</label>
                  <div className="flex flex-wrap gap-1">
                    {getElementActions(selectedItem).map(action => (
                      <button
                        key={action.name}
                        type="button"
                        className={`px-2 py-1 text-xs text-white rounded hover:opacity-90 ${action.color}`}
                        onClick={() => action.handler(selectedItem)}
                        title={`${action.name} this element`}
                      >
                        {action.name}
                      </button>
                    ))}
                  </div>
                </div>


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