// Stub storage implementation to avoid complex dependencies

export interface StorageOptions {
  isPersistant?: boolean;
}

export interface Storage<T> {
  get(): Promise<T>;
  set(data: T): Promise<void>;
  clear(): Promise<void>;
}

export function createStorage<T>(
  key: string,
  defaultValue: T,
  options?: StorageOptions
): Storage<T> {
  const storage: Storage<T> = {
    async get(): Promise<T> {
      try {
        const result = await chrome.storage.local.get(key);
        return result[key] || defaultValue;
      } catch (error) {
        console.warn(`Failed to get storage for key ${key}:`, error);
        return defaultValue;
      }
    },

    async set(data: T): Promise<void> {
      try {
        await chrome.storage.local.set({ [key]: data });
      } catch (error) {
        console.error(`Failed to set storage for key ${key}:`, error);
        throw error;
      }
    },

    async clear(): Promise<void> {
      try {
        await chrome.storage.local.remove(key);
      } catch (error) {
        console.error(`Failed to clear storage for key ${key}:`, error);
        throw error;
      }
    },
  };

  return storage;
}
