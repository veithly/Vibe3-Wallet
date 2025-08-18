import React, { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@/utils/logger';
import IconButton from './IconButton';


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

  const handleActivate = useCallback((selectedMode: typeof mode) => {
    setMode(selectedMode);
    onActivate(selectedMode);
  }, [onActivate]);

  const handleDeactivate = useCallback(() => {
    setHighlightedElements([]);
    setSelectedElement(null);
    setAnalysisResult('');
    onDeactivate();
  }, [onDeactivate]);

  const handleElementSelect = useCallback((element: ElementHighlight) => {
    setSelectedElement(element);
    onElementSelect?.(element);
  }, [onElementSelect]);

  const analyzeElement = useCallback(async (element: ElementHighlight) => {
    setIsAnalyzing(true);
    try {
      // Send analysis request to background script
      const response = await chrome.runtime.sendMessage({
        type: 'ELEMENT_ANALYZE',
        payload: {
          selector: element.selector,
          element: element.element,
        },
      });

      if (response.success) {
        setAnalysisResult(response.analysis);
      } else {
        setAnalysisResult('Analysis failed: ' + response.error);
      }
    } catch (error) {
      logger.error('Element analysis failed', error);
      setAnalysisResult('Analysis failed: ' + (error as Error).message);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

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

  // Fetch highlighted elements from content script
  useEffect(() => {
    if (!isActive) return;

    const fetchHighlights = async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'ELEMENT_SELECTOR_GET_HIGHLIGHTS',
        });

        if (response.success) {
          setHighlightedElements(response.highlights);
        }
      } catch (error) {
        logger.error('Failed to fetch highlighted elements', error);
      }
    };

    fetchHighlights();
    const interval = setInterval(fetchHighlights, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  if (!isActive) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50"
        onClick={handleDeactivate}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900">Element Selector</h3>
          </div>
          <button
            onClick={handleDeactivate}
            className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4">
        {/* Mode Selection */}
        <div className="flex items-center mb-4">
          <label className="block text-sm font-medium text-gray-700 w-32">Selection Mode:</label>
          <div className="flex space-x-2">
            <button
              className={`px-3 py-1.5 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center ${
                mode === 'highlight'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => handleActivate('highlight')}
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Highlight
            </button>
            <button
              className={`px-3 py-1.5 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center ${
                mode === 'select'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => handleActivate('select')}
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
              Select
            </button>
            <button
              className={`px-3 py-1.5 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center ${
                mode === 'analyze'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => handleActivate('analyze')}
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              Analyze
            </button>
          </div>
        </div>

        {/* Custom Filter */}
        <div className="flex items-center mb-4">
          <label className="block text-sm font-medium text-gray-700 w-32">CSS Filter:</label>
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="e.g., button, .submit-btn, #login-form"
              value={customFilter}
              onChange={(e) => setCustomFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8"
            />
            {customFilter && (
              <button
                onClick={() => setCustomFilter('')}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
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
                {mode === 'analyze' && 'Click on elements to analyze their properties and interactions.'}
              </p>
              <p className="text-sm text-blue-700 mt-1">Press ESC to exit selection mode.</p>
            </div>
          </div>
        </div>
      </div>

            {/* Selected Element Info */}
      {selectedElement && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-gray-900">Selected Element</h4>
            <div className="flex space-x-2">
              <button
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => analyzeElement(selectedElement)}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-1 h-4 w-4 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    Analyze
                  </>
                )}
              </button>
              <button
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center"
                onClick={() => {
                  navigator.clipboard.writeText(selectedElement.selector);
                  setCopiedToClipboard(true);
                  setTimeout(() => setCopiedToClipboard(false), 2000);
                }}
              >
                {copiedToClipboard ? (
                  <>
                    <svg className="w-4 h-4 mr-1 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Selector:</label>
                <code className="block text-sm bg-gray-100 px-2 py-1 rounded text-gray-800 font-mono">
                  {selectedElement.selector}
                </code>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tag:</label>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {selectedElement.element?.tagName}
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Visible:</label>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  selectedElement.isVisible 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {selectedElement.isVisible ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Position:</label>
                <span className="text-sm text-gray-900">
                  {Math.round(selectedElement.bounds.top)}px, {Math.round(selectedElement.bounds.left)}px
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Size:</label>
                <span className="text-sm text-gray-900">
                  {Math.round(selectedElement.bounds.width)}x{Math.round(selectedElement.bounds.height)}px
                </span>
              </div>
            </div>
            
            {selectedElement.element?.textContent && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Text:</label>
                <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded max-h-20 overflow-y-auto">
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
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <h4 className="text-lg font-semibold text-gray-900 mb-3">Analysis Result</h4>
          <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded overflow-x-auto">
            {analysisResult}
          </pre>
        </div>
      )}

      {/* Highlighted Elements Count */}
      <div className="text-center text-gray-500 text-xs">
        {highlightedElements.length} elements highlighted
      </div>
        </div>
      </div>
    </div>
  );
};

export default ElementSelector;