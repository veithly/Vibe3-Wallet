interface StorageOptions {
  isPersistant?: boolean;
}

export interface Storage<T> {
  get(): Promise<T>;
  set(value: T): Promise<void>;
  remove(): Promise<void>;
}

export function createStorage<T>(
  key: string,
  defaultValue: T,
  options: StorageOptions = {}
): Storage<T> {
  const prefixedKey = `rabby-agent-${key}`;
  const { isPersistant = true } = options;

  return {
    async get(): Promise<T> {
      try {
        const storageArea = isPersistant
          ? chrome.storage.local
          : chrome.storage.session;
        const result = await storageArea.get([prefixedKey]);
        return result[prefixedKey] !== undefined
          ? result[prefixedKey]
          : defaultValue;
      } catch (error) {
        console.error(`Failed to get storage for key ${prefixedKey}:`, error);
        return defaultValue;
      }
    },

    async set(value: T): Promise<void> {
      try {
        const storageArea = isPersistant
          ? chrome.storage.local
          : chrome.storage.session;
        await storageArea.set({ [prefixedKey]: value });
      } catch (error) {
        console.error(`Failed to set storage for key ${prefixedKey}:`, error);
        throw error;
      }
    },

    async remove(): Promise<void> {
      try {
        const storageArea = isPersistant
          ? chrome.storage.local
          : chrome.storage.session;
        await storageArea.remove([prefixedKey]);
      } catch (error) {
        console.error(
          `Failed to remove storage for key ${prefixedKey}:`,
          error
        );
        throw error;
      }
    },
  };
}
