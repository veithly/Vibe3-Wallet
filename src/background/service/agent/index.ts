// 🔥🔥🔥 EXTREMELY AGGRESSIVE DEBUGGING - AGENT INDEX LOADED! 🔥🔥🔥
console.log('🔥🔥🔥 AGENT INDEX MODULE LOADED - THIS MUST APPEAR! 🔥🔥🔥', {
  timestamp: Date.now(),
  moduleStack: new Error().stack
});

// Simple test function that doesn't depend on external modules
export function testDebugging() {
  console.log('🚨🚨🚨 DEBUGGING TEST FUNCTION CALLED! 🚨🚨🚨');
  return 'debugging-test-successful';
}

export * from './context';
export * from './messageManager';
export * from './executor';
export * from './Web3Agent';
export * from './sessionManager';
