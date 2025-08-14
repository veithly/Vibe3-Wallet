const AGENT_STORAGE_PREFIX = 'rabby-agent-';

export const createAgentStorage = <T>(key: string, defaultValue: T) => {
  const prefixedKey = `${AGENT_STORAGE_PREFIX}${key}`;

  return {
    async get(): Promise<T> {
      const result = await chrome.storage.local.get([prefixedKey]);
      return result[prefixedKey] ?? defaultValue;
    },

    async set(value: T): Promise<void> {
      await chrome.storage.local.set({ [prefixedKey]: value });
    },
  };
};
