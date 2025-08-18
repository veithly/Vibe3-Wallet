import { elementSelectionAgent } from './ElementSelectionAgent';
import { AgentContext } from '../types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ElementSelectionDemo');

// Demo AgentContext
const demoContext: AgentContext = {
  tabId: 1,
  sessionId: 'demo-session',
  eventHandler: (event) => console.log('Demo event:', event),
  currentChain: '1',
  currentAddress: '0x1234567890123456789012345678901234567890',
  riskLevel: 'LOW',
};

// Demo scenarios
const demoScenarios = [
  {
    name: 'Interactive Element Discovery',
    description: 'Find and highlight all interactive elements on a page',
    task: {
      id: 'demo-highlight',
      type: 'highlight' as const,
      priority: 'medium' as const,
      instruction: 'Show me all the interactive elements I can click on this page',
      context: {
        url: 'https://example.com',
        pageTitle: 'Demo Page',
        userIntent: 'Discover interactive elements',
        constraints: []
      },
      params: {
        filter: 'button, input, a, select, textarea',
        visibleOnly: true
      },
      dependencies: [],
      timeout: 10000
    }
  },
  {
    name: 'Button Analysis',
    description: 'Analyze a specific button element',
    task: {
      id: 'demo-analyze',
      type: 'analyze' as const,
      priority: 'high' as const,
      instruction: 'Analyze the main action button to understand its properties',
      context: {
        url: 'https://example.com',
        pageTitle: 'Demo Page',
        userIntent: 'Understand button properties',
        constraints: []
      },
      params: {
        selector: '.primary-button',
        includeAccessibility: true,
        includeEvents: true
      },
      dependencies: [],
      timeout: 5000
    }
  },
  {
    name: 'Text Search',
    description: 'Find elements containing specific text',
    task: {
      id: 'demo-find',
      type: 'find' as const,
      priority: 'medium' as const,
      instruction: 'Find all elements that say "Sign In" or "Login"',
      context: {
        url: 'https://example.com/login',
        pageTitle: 'Login Page',
        userIntent: 'Find login elements',
        constraints: []
      },
      params: {
        text: 'Sign In',
        elementType: 'button',
        caseSensitive: false,
        visibleOnly: true
      },
      dependencies: [],
      timeout: 5000
    }
  },
  {
    name: 'Form Element Discovery',
    description: 'Find all form elements for interaction',
    task: {
      id: 'demo-form',
      type: 'find' as const,
      priority: 'medium' as const,
      instruction: 'Find all input fields and form elements on this page',
      context: {
        url: 'https://example.com/form',
        pageTitle: 'Form Page',
        userIntent: 'Discover form elements',
        constraints: []
      },
      params: {
        elementType: 'input',
        visibleOnly: true,
        includeAttributes: true
      },
      dependencies: [],
      timeout: 5000
    }
  },
  {
    name: 'Link Navigation',
    description: 'Find navigation links',
    task: {
      id: 'demo-links',
      type: 'find' as const,
      priority: 'low' as const,
      instruction: 'Find all navigation links in the header',
      context: {
        url: 'https://example.com',
        pageTitle: 'Demo Page',
        userIntent: 'Find navigation links',
        constraints: []
      },
      params: {
        filter: 'nav a, header a, .navigation a',
        visibleOnly: true
      },
      dependencies: [],
      timeout: 5000
    }
  }
];

/**
 * Run element selection demo
 */
export async function runElementSelectionDemo(): Promise<void> {
  logger.info('🎯 Starting Element Selection Demo');

  console.log('\n🚀 Vibe3 Element Selection Demo');
  console.log('====================================\n');

  for (const scenario of demoScenarios) {
    console.log(`\n📋 ${scenario.name}`);
    console.log(`   ${scenario.description}`);
    console.log('   Executing...');

    try {
      const streamingUpdates: string[] = [];
      
      const result = await elementSelectionAgent.executeTask(
        scenario.task,
        demoContext,
        true, // Enable streaming
        (chunk) => {
          const update = `[${new Date().toLocaleTimeString()}] ${chunk.content}`;
          streamingUpdates.push(update);
          console.log(`   📡 ${update}`);
        }
      );

      console.log(`\n   ✅ Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`   ⏱️  Timing: ${result.timing}ms`);
      console.log(`   💬 Message: ${result.message}`);

      if (result.elements && result.elements.length > 0) {
        console.log(`   🔍 Found ${result.elements.length} elements:`);
        result.elements.slice(0, 3).forEach((element, index) => {
          console.log(`      ${index + 1}. ${element.selector}`);
          if (element.bounds) {
            console.log(`         Position: ${element.bounds.left}x${element.bounds.top}`);
          }
        });
        if (result.elements.length > 3) {
          console.log(`      ... and ${result.elements.length - 3} more`);
        }
      }

      if (result.selectedElement) {
        console.log(`   🎯 Selected Element:`);
        console.log(`      Selector: ${result.selectedElement.selector}`);
        console.log(`      Visible: ${result.selectedElement.isVisible}`);
        if (result.selectedElement.analysis) {
          console.log(`      Type: ${result.selectedElement.analysis.type}`);
          if (result.selectedElement.analysis.textContent) {
            const text = result.selectedElement.analysis.textContent.substring(0, 50);
            console.log(`      Text: "${text}..."`);
          }
        }
      }

      if (result.recommendations && result.recommendations.length > 0) {
        console.log(`   💡 Recommendations:`);
        result.recommendations.forEach((rec, index) => {
          console.log(`      ${index + 1}. ${rec}`);
        });
      }

      console.log(`   📊 Streaming Updates: ${streamingUpdates.length}`);

    } catch (error) {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      logger.error('Demo scenario failed', { scenario: scenario.name, error });
    }

    console.log('   ' + '='.repeat(50));
  }

  // Show agent status
  const status = elementSelectionAgent.getStatus();
  console.log('\n📊 Agent Status:');
  console.log(`   Active: ${status.isActive}`);
  console.log(`   Current Task: ${status.currentTask ? status.currentTask.id : 'None'}`);
  console.log(`   Execution History: ${status.executionHistory.length} tasks`);
  console.log(`   Capabilities: ${status.capabilities.length} available`);

  console.log('\n🎉 Demo completed successfully!');
  console.log('\n💡 Try these commands in the Vibe3 interface:');
  console.log('   • "Show me all the buttons on this page"');
  console.log('   • "Analyze the login button"');
  console.log('   • "Find elements that say Sign In"');
  console.log('   • "Highlight all form fields"');
  console.log('   • "What can I click on this page?"');

  logger.info('Element selection demo completed', {
    totalScenarios: demoScenarios.length,
    executionHistory: status.executionHistory.length
  });
}

/**
 * Interactive demo function for testing specific scenarios
 */
export async function runInteractiveDemo(): Promise<void> {
  console.log('\n🎮 Interactive Element Selection Demo');
  console.log('=====================================\n');

  console.log('Available scenarios:');
  demoScenarios.forEach((scenario, index) => {
    console.log(`   ${index + 1}. ${scenario.name}`);
    console.log(`      ${scenario.description}`);
  });

  console.log('\nEnter scenario number (1-5) or "all" to run all scenarios:');
  
  // In a real implementation, this would wait for user input
  // For now, we'll run all scenarios
  await runElementSelectionDemo();
}

// Export scenarios for external use
export { demoScenarios };

// Auto-run if this file is executed directly
if (require.main === module) {
  runElementSelectionDemo().catch(console.error);
}