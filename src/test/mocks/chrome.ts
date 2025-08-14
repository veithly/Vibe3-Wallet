// Chrome API mocks for testing
export const chrome = {
  runtime: {
    id: 'test-extension-id',
    getURL: jest.fn(
      (path: string) => `chrome-extension://test-extension-id/${path}`
    ),
    sendMessage: jest.fn(),
    connect: jest.fn(() => ({
      postMessage: jest.fn(),
      disconnect: jest.fn(),
      onMessage: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
      onDisconnect: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
    })),
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

// Set up global chrome mock
(global as any).chrome = chrome;
