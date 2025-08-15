import React from 'react';
import { createRoot } from '@/ui/utils/react-compat';
import { ConfigProvider } from 'antd';
import { Provider } from 'react-redux';
import { SidePanelApp } from './SidePanelApp';
import { ErrorBoundary } from './components/ErrorBoundary';
import store from '@/ui/store';
import '@/ui/style/agent.less';
import { logger } from './utils/logger';
import { InitializationManager, TIMING_CONSTANTS } from './utils/timing';

/**
 * Render the React application with proper error handling
 */
function renderApplication(appContainer: Element): void {
  logger.info('AgentSidebar', 'Creating React root', {
    containerReady: !!appContainer,
    containerClientHeight: appContainer.clientHeight,
    containerClientWidth: appContainer.clientWidth,
  });

  const root = createRoot(appContainer);

  root.render(
    <ErrorBoundary componentName="AgentSidebar">
      <Provider store={store}>
        <ConfigProvider>
          <SidePanelApp />
        </ConfigProvider>
      </Provider>
    </ErrorBoundary>
  );
}

/**
 * Verify that the React component rendered successfully
 */
function verifyRendering(appContainer: Element): void {
  setTimeout(() => {
    const renderedContent = appContainer.querySelector('.side-panel-app');
    logger.info('AgentSidebar', 'Post-render verification', {
      hasRenderedContent: !!renderedContent,
      appContainerHTML: appContainer.innerHTML.substring(0, 200),
    });
  }, TIMING_CONSTANTS.POST_RENDER_VERIFICATION);
}

/**
 * Initialize the Agent sidebar application
 */
async function init(): Promise<void> {
  console.log('[AGENT_DEBUG] Step 1: init() function started.');
  try {
    await InitializationManager.initializeComponent(
      'AgentSidebar',
      async () => {
        console.log(
          '[AGENT_DEBUG] Step 2: Looking for #app-container element.'
        );
        const appContainer = document.querySelector('#app-container');
        if (!appContainer) {
          console.error('[AGENT_DEBUG] FATAL: #app-container not found!');
          throw new Error('Cannot find #app-container element');
        }
        console.log(
          '[AGENT_DEBUG] Step 3: App container found. Rendering React app.'
        );
        renderApplication(appContainer);
        verifyRendering(appContainer);

        logger.info('AgentSidebar', 'Initialization completed successfully');
        return appContainer;
      },
      {
        preInitDelay: TIMING_CONSTANTS.INITIALIZATION_DELAY,
        postInitDelay: TIMING_CONSTANTS.COMPONENT_MOUNT_DELAY,
      }
    );
  } catch (error) {
    console.error(
      '[AGENT_DEBUG] FATAL: Critical error during init process.',
      error
    );
    logger.error('AgentSidebar', 'Failed to initialize Agent sidebar', error);

    // Fallback UI
    const appContainer = document.querySelector('#app-container');
    if (appContainer) {
      appContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #666; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <h3>Failed to load Agent sidebar</h3>
          <p>Please check the console for more details.</p>
          <button onclick="window.location.reload()" style="padding: 8px 16px; background: #1890ff; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Refresh
          </button>
        </div>
      `;
    }
  }
}

init();
