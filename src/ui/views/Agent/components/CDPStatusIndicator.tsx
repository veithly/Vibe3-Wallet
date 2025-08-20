/**
 * CDP Status Indicator Component
 * Shows the status of Chrome DevTools Protocol connection
 */

import React, { useState, useEffect } from 'react';
import { createLogger } from '@/utils/logger';

const logger = createLogger('CDPStatusIndicator');

interface CDPStatus {
  connected: boolean;
  tabId: number | null;
  tabUrl: string;
  debuggerActive: boolean;
  error?: string;
}

export const CDPStatusIndicator: React.FC = () => {
  const [status, setStatus] = useState<CDPStatus>({
    connected: false,
    tabId: null,
    tabUrl: '',
    debuggerActive: false
  });

  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Check CDP status periodically
    const checkStatus = async () => {
      try {
        // Query active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tab?.id) {
          // Check if debugger is attached
          try {
            await chrome.debugger.sendCommand({ tabId: tab.id }, 'Runtime.evaluate', {
              expression: '1+1',
              returnByValue: true
            });
            
            setStatus({
              connected: true,
              tabId: tab.id,
              tabUrl: tab.url || '',
              debuggerActive: true
            });
          } catch (error) {
            // Debugger not attached
            setStatus({
              connected: false,
              tabId: tab.id,
              tabUrl: tab.url || '',
              debuggerActive: false,
              error: 'CDP not attached'
            });
          }
        } else {
          setStatus({
            connected: false,
            tabId: null,
            tabUrl: '',
            debuggerActive: false,
            error: 'No active tab'
          });
        }
      } catch (error) {
        setStatus(prev => ({
          ...prev,
          connected: false,
          debuggerActive: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }));
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    if (status.debuggerActive) return 'bg-green-500';
    if (status.connected) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusText = () => {
    if (status.debuggerActive) return 'CDP Active';
    if (status.connected) return 'Tab Ready';
    return 'CDP Inactive';
  };

  const handleAttachCDP = async () => {
    if (!status.tabId) return;

    try {
      await chrome.debugger.attach({ tabId: status.tabId }, '1.3');
      await chrome.debugger.sendCommand({ tabId: status.tabId }, 'Runtime.enable');
      await chrome.debugger.sendCommand({ tabId: status.tabId }, 'DOM.enable');
      await chrome.debugger.sendCommand({ tabId: status.tabId }, 'Input.enable');
      
      logger.info('CDP attached manually', { tabId: status.tabId });
      
      // Refresh status
      setTimeout(() => {
        setStatus(prev => ({ ...prev, debuggerActive: true, error: undefined }));
      }, 500);
    } catch (error) {
      logger.error('Failed to attach CDP manually', error);
      setStatus(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Attach failed'
      }));
    }
  };

  const handleDetachCDP = async () => {
    if (!status.tabId) return;

    try {
      await chrome.debugger.detach({ tabId: status.tabId });
      logger.info('CDP detached manually', { tabId: status.tabId });
      
      // Refresh status
      setTimeout(() => {
        setStatus(prev => ({ ...prev, debuggerActive: false, error: undefined }));
      }, 500);
    } catch (error) {
      logger.error('Failed to detach CDP manually', error);
      setStatus(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Detach failed'
      }));
    }
  };

  return (
    <div className="relative">
      {/* Status Indicator */}
      <div 
        className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-100"
        onClick={() => setShowDetails(!showDetails)}
        title="Click to show CDP status details"
      >
        <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
        <span className="text-xs font-medium text-gray-700">{getStatusText()}</span>
        <svg 
          className={`w-3 h-3 text-gray-500 transition-transform ${showDetails ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Details Panel */}
      {showDetails && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-3">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">CDP Status</h3>
            
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className={`font-medium ${status.debuggerActive ? 'text-green-600' : 'text-red-600'}`}>
                  {status.debuggerActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Tab ID:</span>
                <span className="font-mono">{status.tabId || 'None'}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">URL:</span>
                <span className="font-mono text-right max-w-48 truncate" title={status.tabUrl}>
                  {status.tabUrl || 'None'}
                </span>
              </div>
              
              {status.error && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Error:</span>
                  <span className="text-red-600 text-right max-w-48 truncate" title={status.error}>
                    {status.error}
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mt-3">
              {!status.debuggerActive && status.tabId && (
                <button
                  onClick={handleAttachCDP}
                  className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Attach CDP
                </button>
              )}
              
              {status.debuggerActive && status.tabId && (
                <button
                  onClick={handleDetachCDP}
                  className="flex-1 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Detach CDP
                </button>
              )}
            </div>

            {/* Info Note */}
            <div className="mt-3 p-2 bg-blue-50 rounded text-xs text-blue-700">
              <div className="font-medium mb-1">About CDP:</div>
              <div>Chrome DevTools Protocol enables reliable browser automation. When active, you'll see "Nanobrowser: AI Web Agent Automation started debugging this browser" - this is normal and indicates enhanced automation capabilities.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
