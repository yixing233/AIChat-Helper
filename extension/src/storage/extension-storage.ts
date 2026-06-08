export interface ExtensionStorage {
  get<T>(key: string, defaultValue: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

function scopedKey(scope: string, key: string): string {
  return `ai-chat-helper:${scope}:${key}`;
}

function readLastError(): string | null {
  return chrome.runtime.lastError?.message || null;
}

export function createExtensionStorage(scope: string): ExtensionStorage {
  return {
    get<T>(key: string, defaultValue: T): Promise<T> {
      const fullKey = scopedKey(scope, key);
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(fullKey, (items) => {
          const error = readLastError();
          if (error) {
            reject(new Error(error));
            return;
          }
          const value = items[fullKey];
          resolve(value === undefined ? defaultValue : (value as T));
        });
      });
    },

    set<T>(key: string, value: T): Promise<void> {
      const fullKey = scopedKey(scope, key);
      return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [fullKey]: value }, () => {
          const error = readLastError();
          if (error) {
            reject(new Error(error));
            return;
          }
          resolve();
        });
      });
    },

    remove(key: string): Promise<void> {
      const fullKey = scopedKey(scope, key);
      return new Promise((resolve, reject) => {
        chrome.storage.local.remove(fullKey, () => {
          const error = readLastError();
          if (error) {
            reject(new Error(error));
            return;
          }
          resolve();
        });
      });
    }
  };
}

export async function migrateLocalStorageKey(storage: ExtensionStorage, legacyKey: string, targetKey: string): Promise<boolean> {
  const value = window.localStorage.getItem(legacyKey);
  if (value === null) return false;
  await storage.set(targetKey, value);
  window.localStorage.removeItem(legacyKey);
  return true;
}
