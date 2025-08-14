// Test setup for Jest
import '@testing-library/jest-dom';

// Mock Chrome APIs
global.chrome = {
  runtime: {
    id: 'test-extension-id',
    getURL: (path: string) => `chrome-extension://test-extension-id/${path}`,
    sendMessage: jest.fn(),
    connect: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn(),
    },
    sync: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn(),
    },
  },
  tabs: {
    query: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  },
  windows: {
    update: jest.fn(),
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
    setTitle: jest.fn(),
    setIcon: jest.fn(),
  },
} as any;

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Setup global test utilities
(global as any).describe = describe;
(global as any).it = it;
(global as any).test = test;
(global as any).expect = expect;
(global as any).beforeAll = beforeAll;
(global as any).beforeEach = beforeEach;
(global as any).afterAll = afterAll;
(global as any).afterEach = afterEach;
