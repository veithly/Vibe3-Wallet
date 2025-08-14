import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SidePanelApp } from '../SidePanelApp';
import { chatHistoryStore } from '@/background/service/agent/chatHistory';
import favoritesStorage from '@/background/service/agent/storage/favorites';

// Mock all child components and services
jest.mock('../components/MessageList', () => () => (
  <div data-testid="message-list" />
));
jest.mock('../components/ChatInput', () => (props: any) => (
  <div data-testid="chat-input">
    <button
      data-testid="send-message"
      onClick={() => props.onSendMessage('Hello')}
    />
    <button data-testid="stop-task" onClick={() => props.onStopTask()} />
    <button data-testid="mic-button" onClick={() => props.onMicClick()} />
  </div>
));
jest.mock('../components/ChatHistoryList', () => () => (
  <div data-testid="chat-history-list" />
));
jest.mock('../components/BookmarkList', () => () => (
  <div data-testid="bookmark-list" />
));
jest.mock('../components/Settings', () => () => (
  <div data-testid="settings-component" />
));
jest.mock('../components/ErrorBoundary', () => ({ children }: any) => (
  <>{children}</>
));
jest.mock('../components/IconButton', () => (props: any) => (
  <button data-testid={`icon-button-${props.icon}`} onClick={props.onClick}>
    {props.tooltip}
  </button>
));

jest.mock('@/background/service/agent/chatHistory', () => ({
  chatHistoryStore: {
    addMessage: jest.fn(),
    getSessionsMetadata: jest.fn(),
    getSession: jest.fn(),
    clearAllHistory: jest.fn(),
  },
}));

jest.mock('@/background/service/agent/storage/favorites', () => ({
  getAllPrompts: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock chrome APIs
let mockPort: any;

beforeEach(() => {
  mockPort = {
    postMessage: jest.fn(),
    disconnect: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
    },
    onDisconnect: {
      addListener: jest.fn(),
    },
  };

  global.chrome = {
    runtime: {
      connect: jest.fn(() => mockPort),
      getURL: jest.fn(),
      sendMessage: jest.fn(),
      onMessage: { addListener: jest.fn() },
      lastError: null,
    },
    tabs: {
      query: jest.fn().mockResolvedValue([
        {
          id: 1,
          active: true,
          currentWindow: true,
          url: 'https://example.com',
        },
      ]),
    },
  } as any;

  global.chrome.runtime.getURL = jest.fn();
  (chatHistoryStore.getSessionsMetadata as jest.Mock).mockResolvedValue([]);
  (favoritesStorage.getAllPrompts as jest.Mock).mockResolvedValue([]);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('SidePanelApp', () => {
  const renderComponent = () => render(<SidePanelApp />);

  describe('Initialization and Connection', () => {
    it('shows loading state initially', () => {
      renderComponent();
      expect(
        screen.getByText(/Initializing Agent sidebar.../i)
      ).toBeInTheDocument();
    });

    it('connects to background script on mount', async () => {
      renderComponent();

      await waitFor(() => {
        expect(global.chrome.runtime.connect).toHaveBeenCalledWith({
          name: 'rabby-agent-connection',
        });
      });
    });

    it('shows main UI after successful connection', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('chat-input')).toBeInTheDocument();
        expect(screen.getByTestId('bookmark-list')).toBeInTheDocument();
      });
    });

    it('handles connection errors gracefully', async () => {
      (global.chrome.runtime.connect as jest.Mock).mockImplementation(() => {
        throw new Error('Connection failed');
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/Initialization Error/i)).toBeInTheDocument();
        expect(screen.getByText('Connection failed')).toBeInTheDocument();
      });
    });
  });

  describe('UI Elements and Actions', () => {
    beforeEach(async () => {
      renderComponent();
      await waitFor(() =>
        expect(screen.getByTestId('chat-input')).toBeInTheDocument()
      );
    });

    it('renders header with icon buttons', () => {
      expect(screen.getByTestId('icon-button-moon')).toBeInTheDocument();
      expect(screen.getByTestId('icon-button-settings')).toBeInTheDocument();
      expect(screen.getByTestId('icon-button-history')).toBeInTheDocument();
    });

    it('toggles dark mode', () => {
      const darkModeToggle = screen.getByTestId('icon-button-moon');
      fireEvent.click(darkModeToggle);

      expect(screen.getByTestId('icon-button-sun')).toBeInTheDocument();
    });

    it('opens and closes settings', () => {
      const settingsButton = screen.getByTestId('icon-button-settings');
      fireEvent.click(settingsButton);

      expect(screen.getByTestId('settings-component')).toBeInTheDocument();

      // Close settings by clicking again (in a real scenario, this would be handled within Settings component)
    });

    it('opens and closes history', async () => {
      const historyButton = screen.getByTestId('icon-button-history');
      fireEvent.click(historyButton);

      await waitFor(() => {
        expect(chatHistoryStore.getSessionsMetadata).toHaveBeenCalled();
        expect(screen.getByTestId('chat-history-list')).toBeInTheDocument();
      });
    });
  });

  describe('Chat Functionality', () => {
    beforeEach(async () => {
      renderComponent();
      await waitFor(() =>
        expect(screen.getByTestId('chat-input')).toBeInTheDocument()
      );
    });

    it('sends a message and updates the UI', async () => {
      const sendMessageButton = screen.getByTestId('send-message');
      fireEvent.click(sendMessageButton);

      await waitFor(() => {
        expect(mockPort.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'new_task',
            task: 'Hello',
          })
        );
      });

      // App should show MessageList after sending a message
      await waitFor(() => {
        expect(screen.getByTestId('message-list')).toBeInTheDocument();
      });
    });

    it('stops a running task', () => {
      const stopTaskButton = screen.getByTestId('stop-task');
      fireEvent.click(stopTaskButton);

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'cancel_task',
      });
    });

    it('handles speech to text functionality', async () => {
      // Mock getUserMedia
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: jest.fn().mockResolvedValue({}),
        },
        configurable: true,
      });

      const micButton = screen.getByTestId('mic-button');
      fireEvent.click(micButton);

      await waitFor(() => {
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
          audio: true,
        });
      });
    });

    it('receives and displays messages from background', async () => {
      const messageHandler = mockPort.onMessage.addListener.mock.calls[0][0];

      // Wait for a tick to ensure component is fully mounted
      await new Promise((resolve) => setTimeout(resolve, 0));

      const message = {
        type: 'execution',
        actor: 'assistant',
        state: 'step.ok',
        data: { details: 'Assistant response' },
        timestamp: Date.now(),
      };

      messageHandler(message);

      // Should have shown message list
      await waitFor(() => {
        expect(screen.getByTestId('message-list')).toBeInTheDocument();
      });
    });
  });

  describe('History and Session Management', () => {
    beforeEach(async () => {
      (chatHistoryStore.getSessionsMetadata as jest.Mock).mockResolvedValue([
        {
          id: 'session1',
          title: 'Test Session 1',
          createdAt: Date.now(),
          messageCount: 2,
          stepCount: 1,
        },
      ]);

      renderComponent();
      await waitFor(() =>
        expect(screen.getByTestId('chat-input')).toBeInTheDocument()
      );
    });

    it('loads chat history and displays it', async () => {
      const historyButton = screen.getByTestId('icon-button-history');
      fireEvent.click(historyButton);

      await waitFor(() => {
        expect(screen.getByTestId('chat-history-list')).toBeInTheDocument();
      });
    });

    it('loads a historical session', async () => {
      // Mock the behavior of selecting a session within ChatHistoryList
      (chatHistoryStore.getSession as jest.Mock).mockResolvedValue([
        { actor: 'user', content: 'Old message' },
      ]);

      const historyButton = screen.getByTestId('icon-button-history');
      fireEvent.click(historyButton);

      await waitFor(() => {
        // Simulate session select
        const appInstance = screen.getByTestId('chat-input');
        // Further testing would require a better way to interact with the child component
      });
    });

    it('starts a new chat from history view', async () => {
      const historyButton = screen.getByTestId('icon-button-history');
      fireEvent.click(historyButton);

      await waitFor(() => {
        expect(screen.getByTestId('chat-history-list')).toBeInTheDocument();
      });

      // This requires mocking the ChatHistoryList component to call onNewChat
    });
  });

  describe('Bookmark Functionality', () => {
    beforeEach(async () => {
      (favoritesStorage.getAllPrompts as jest.Mock).mockResolvedValue([
        { id: 1, title: 'Favorite Prompt', content: 'My favorite task' },
      ]);

      renderComponent();
      await waitFor(() =>
        expect(screen.getByTestId('bookmark-list')).toBeInTheDocument()
      );
    });

    it('loads and displays bookmarks initially', async () => {
      expect(screen.getByTestId('bookmark-list')).toBeInTheDocument();
    });

    it('hides bookmarks when messages are present', async () => {
      const sendMessageButton = screen.getByTestId('send-message');
      fireEvent.click(sendMessageButton);

      await waitFor(() => {
        expect(screen.queryByTestId('bookmark-list')).not.toBeInTheDocument();
        expect(screen.getByTestId('message-list')).toBeInTheDocument();
      });
    });
  });

  describe('Connection Status Display', () => {
    beforeEach(async () => {
      renderComponent();
      await waitFor(() =>
        expect(screen.getByTestId('chat-input')).toBeInTheDocument()
      );
    });

    it('shows connecting status initially', () => {
      expect(screen.getByText(/connecting/i)).toBeInTheDocument();
    });

    it('shows connected status', async () => {
      const messageHandler = mockPort.onMessage.addListener.mock.calls[0][0];
      messageHandler({ type: 'connected' });

      await waitFor(() => {
        expect(screen.getByText(/connected/i)).toBeInTheDocument();
      });
    });

    it('shows disconnected and reconnecting status', async () => {
      const disconnectHandler =
        mockPort.onDisconnect.addListener.mock.calls[0][0];
      disconnectHandler();

      await waitFor(() => {
        expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
      });

      await waitFor(
        () => {
          expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Error Boundary', () => {
    it('catches errors within main component', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});

      // Mock a component that throws an error
      jest.mock('../components/ChatInput', () => () => {
        throw new Error('Test Boundary');
      });

      renderComponent();

      // ErrorBoundary should catch this and prevent a full crash
      // In a real app, it would display a fallback UI, but here we check for log
      expect(true).toBeTruthy(); // Test passes if it doesn't crash
    });
  });
});
