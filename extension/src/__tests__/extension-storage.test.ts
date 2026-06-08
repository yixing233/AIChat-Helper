import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExtensionStorage } from "../storage/extension-storage";

describe("createExtensionStorage", () => {
  const store = new Map<string, unknown>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn((key: string, cb: (items: Record<string, unknown>) => void) => cb({ [key]: store.get(key) })),
          set: vi.fn((items: Record<string, unknown>, cb: () => void) => {
            Object.entries(items).forEach(([key, value]) => store.set(key, value));
            cb();
          }),
          remove: vi.fn((key: string, cb: () => void) => {
            store.delete(key);
            cb();
          })
        }
      },
      runtime: { lastError: undefined }
    });
  });

  it("stores and reads values", async () => {
    const storage = createExtensionStorage("test");
    await storage.set("visible-limit", 20);
    await expect(storage.get("visible-limit", 10)).resolves.toBe(20);
  });

  it("returns defaults for missing values", async () => {
    const storage = createExtensionStorage("test");
    await expect(storage.get("missing", true)).resolves.toBe(true);
  });

  it("removes scoped values", async () => {
    const storage = createExtensionStorage("test");
    await storage.set("reading-line", "42");
    await storage.remove("reading-line");
    await expect(storage.get("reading-line", "0")).resolves.toBe("0");
  });
});
