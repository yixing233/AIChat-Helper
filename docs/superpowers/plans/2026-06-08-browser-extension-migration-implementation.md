# Browser Extension Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome/Edge Manifest V3 extension under `extension/` that replaces the Tampermonkey userscript as the active local development target.

**Architecture:** The extension is split into content-script UI code, page-world injected hooks, a background service worker, platform adapters, exporters, typed messaging, and storage wrappers. The first implementation preserves behavior while moving complex existing logic from `AIChat-Helper.user.js` into focused modules.

**Tech Stack:** TypeScript, Vite, Manifest V3, Chrome Extension APIs, Vitest, markdown-it.

---

## Scope Check

The approved spec covers one product migration: Tampermonkey userscript to Chrome/Edge Manifest V3 extension. It includes several subsystems, but they are tightly coupled around one shippable extension target. This plan keeps those subsystems in separate tasks so each task can be built, tested, and committed independently.

## File Structure

Create the new extension project under `extension/`.

- `extension/package.json`: npm scripts and extension dependencies.
- `extension/tsconfig.json`: TypeScript compiler settings for extension source and tests.
- `extension/vite.config.ts`: multi-entry build for content, injected, and background bundles.
- `extension/vitest.config.ts`: unit test config using jsdom.
- `extension/manifest.json`: Manifest V3 extension definition used as build input.
- `extension/public/icons/icon.svg`: local extension icon.
- `extension/src/shared/types.ts`: normalized conversation, export, platform, and captured-event types.
- `extension/src/shared/platform-detection.ts`: URL detection and current platform selection.
- `extension/src/messaging/protocol.ts`: typed message contracts.
- `extension/src/messaging/bridge.ts`: content/background request helpers and injected event validation.
- `extension/src/storage/extension-storage.ts`: `chrome.storage.local` wrapper and legacy localStorage migration helper.
- `extension/src/background/service-worker.ts`: request, download, and version-message handling.
- `extension/src/injected/page-hooks.ts`: page-world `fetch`, `XMLHttpRequest`, `Blob`, and `URL.createObjectURL` hooks.
- `extension/src/content/main.ts`: content entrypoint, injected script insertion, adapter bootstrapping, and UI bootstrap.
- `extension/src/content/styles.css`: extension page UI styles.
- `extension/src/ui/panel/panel.ts`: minimal in-page panel shell.
- `extension/src/ui/controls/node-list.ts`: node navigation rendering.
- `extension/src/ui/modals/export-modal.ts`: export action surface.
- `extension/src/platforms/*/adapter.ts`: one adapter per supported platform.
- `extension/src/platforms/index.ts`: adapter registry.
- `extension/src/exporters/html.ts`: HTML exporter.
- `extension/src/exporters/markdown.ts`: Markdown exporter.
- `extension/src/exporters/txt.ts`: TXT exporter.
- `extension/src/exporters/zip.ts`: ZIP builder.
- `extension/src/exporters/index.ts`: exporter registry.
- `extension/src/__tests__/*.test.ts`: unit tests for core boundaries.

No existing userscript file should be deleted in this plan. `AIChat-Helper.user.js` remains as migration reference.

---

### Task 1: Scaffold Extension Workspace

**Files:**
- Create: `extension/package.json`
- Create: `extension/tsconfig.json`
- Create: `extension/vitest.config.ts`
- Create: `extension/vite.config.ts`
- Create: `extension/src/env.d.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Create `extension/package.json`**

```json
{
  "name": "ai-chat-helper-extension",
  "version": "3.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "markdown-it": "^14.1.0"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "@types/markdown-it": "^14.1.2",
    "typescript": "^5.4.5",
    "vite": "^5.4.11",
    "vitest": "^1.6.0",
    "jsdom": "^24.1.1"
  }
}
```

- [ ] **Step 2: Create `extension/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["chrome", "vitest/globals"]
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create `extension/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts"]
  }
});
```

- [ ] **Step 4: Create `extension/vite.config.ts`**

```ts
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        "content/main": resolve(__dirname, "src/content/main.ts"),
        "injected/page-hooks": resolve(__dirname, "src/injected/page-hooks.ts"),
        "background/service-worker": resolve(__dirname, "src/background/service-worker.ts")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
```

- [ ] **Step 5: Create `extension/src/env.d.ts`**

```ts
/// <reference types="chrome" />
```

- [ ] **Step 6: Add extension build output to `.gitignore`**

Append this exact line:

```gitignore
extension/dist/
```

- [ ] **Step 7: Install dependencies**

Run:

```powershell
Set-Location E:\Code\AI-Chat-Nodes\extension
npm install
```

Expected: `package-lock.json` is created and npm exits with code 0.

- [ ] **Step 8: Defer workspace compilation until Task 3**

Task 1 creates build configuration before entry files exist. The first required compile check is Task 3 Step 8:

```powershell
npm run typecheck
```

Expected after Task 3: `tsc --noEmit` exits with code 0.

- [ ] **Step 9: Commit**

```powershell
git add .gitignore extension/package.json extension/package-lock.json extension/tsconfig.json extension/vitest.config.ts extension/vite.config.ts extension/src/env.d.ts
git commit -m "chore: scaffold extension workspace"
```

---

### Task 2: Add Shared Types and Platform Detection

**Files:**
- Create: `extension/src/shared/types.ts`
- Create: `extension/src/shared/platform-detection.ts`
- Create: `extension/src/__tests__/platform-detection.test.ts`

- [ ] **Step 1: Write platform detection tests**

```ts
import { describe, expect, it } from "vitest";
import { detectPlatform } from "../shared/platform-detection";

describe("detectPlatform", () => {
  it.each([
    ["https://chatgpt.com/c/abc", "chatgpt"],
    ["https://claude.ai/chat/123e4567-e89b-12d3-a456-426614174000", "claude"],
    ["https://www.qianwen.com/chat/abcdefghi", "qwen"],
    ["https://www.doubao.com/chat/123", "doubao"],
    ["https://chat.deepseek.com/a/chat/s/123e4567-e89b-12d3-a456-426614174000", "deepseek"]
  ])("detects %s as %s", (url, expected) => {
    expect(detectPlatform(new URL(url))?.id).toBe(expected);
  });

  it("returns null for unsupported pages", () => {
    expect(detectPlatform(new URL("https://example.com/"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
Set-Location E:\Code\AI-Chat-Nodes\extension
npm test -- src/__tests__/platform-detection.test.ts
```

Expected: FAIL because `../shared/platform-detection` does not exist.

- [ ] **Step 3: Create shared types**

```ts
export type PlatformId = "chatgpt" | "claude" | "qwen" | "doubao" | "deepseek";

export interface PlatformMatch {
  id: PlatformId;
  name: string;
}

export interface ConversationNode {
  id: string;
  title: string;
  index: number;
  role?: "user" | "assistant" | "system" | "tool";
  elementSelector?: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  createdAt?: string;
  attachments?: ExportAttachment[];
}

export interface ExportAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  content?: string;
  url?: string;
}

export interface ConversationSnapshot {
  platformId: PlatformId;
  conversationId: string;
  title: string;
  messages: ConversationMessage[];
  attachments: ExportAttachment[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ConversationSummary {
  platformId: PlatformId;
  conversationId: string;
  title: string;
  updatedAt?: string;
  messageCount?: number;
}

export interface BatchListOptions {
  limit: number;
  cursor?: string;
}

export interface CapturedNetworkEvent {
  id: string;
  platformId?: PlatformId;
  kind: "fetch" | "xhr" | "blob-url";
  url: string;
  method?: string;
  status?: number;
  requestBody?: string;
  responseText?: string;
  fileName?: string;
  mimeType?: string;
  createdAt: number;
}

export interface ExportFile {
  path: string;
  mimeType: string;
  content: string | Uint8Array;
}

export interface Exporter {
  format: "html" | "markdown" | "txt";
  export(snapshot: ConversationSnapshot): Promise<ExportFile[]>;
}

export interface PlatformAdapter {
  id: PlatformId;
  name: string;
  matches(url: URL): boolean;
  getConversationId(url?: URL): string;
  scanDomNodes(root?: ParentNode): ConversationNode[];
  hydrateFromCapturedApi?(events: CapturedNetworkEvent[]): Promise<ConversationSnapshot>;
  fetchConversationList?(options: BatchListOptions): Promise<ConversationSummary[]>;
  fetchConversationDetail?(id: string): Promise<ConversationSnapshot>;
}
```

- [ ] **Step 4: Create platform detection**

```ts
import type { PlatformId, PlatformMatch } from "./types";

const platformNames: Record<PlatformId, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  qwen: "Tongyi Qianwen",
  doubao: "Doubao",
  deepseek: "DeepSeek"
};

export function detectPlatform(url: URL): PlatformMatch | null {
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  if ((host === "chatgpt.com" || host.endsWith(".chatgpt.com")) && /^\/(?:$|c\/[a-z0-9-]+\/?)$/i.test(path)) {
    return { id: "chatgpt", name: platformNames.chatgpt };
  }

  if (host === "claude.ai" && /^\/chat(?:\/[0-9a-f-]{36})?\/?$/i.test(path)) {
    return { id: "claude", name: platformNames.claude };
  }

  if (host === "www.qianwen.com" && /^\/(?:$|chat(?:\/[a-z0-9_-]{8,})?\/?)$/i.test(path)) {
    return { id: "qwen", name: platformNames.qwen };
  }

  if (host === "www.doubao.com" && /^\/chat(?:\/[^/?#]+)?\/?$/i.test(path)) {
    return { id: "doubao", name: platformNames.doubao };
  }

  if (host === "chat.deepseek.com" && /^\/(?:$|a\/chat\/s(?:\/[0-9a-f-]{36})?\/?|chat(?:\/[0-9a-f-]{36})?\/?)$/i.test(path)) {
    return { id: "deepseek", name: platformNames.deepseek };
  }

  return null;
}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
npm test -- src/__tests__/platform-detection.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add extension/src/shared/types.ts extension/src/shared/platform-detection.ts extension/src/__tests__/platform-detection.test.ts
git commit -m "feat: add extension platform detection"
```

---

### Task 3: Add Manifest, Icons, and Minimal Entrypoints

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/public/icons/icon.svg`
- Create: `extension/src/background/service-worker.ts`
- Create: `extension/src/content/main.ts`
- Create: `extension/src/content/styles.css`
- Create: `extension/src/injected/page-hooks.ts`
- Modify: `extension/vite.config.ts`

- [ ] **Step 1: Create `extension/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "AI Chat Helper",
  "version": "3.0.0",
  "description": "Conversation navigation, search, reading helpers, and exports for AI chat websites.",
  "icons": {
    "128": "icons/icon.svg"
  },
  "permissions": ["storage", "downloads", "scripting"],
  "host_permissions": [
    "https://chatgpt.com/*",
    "https://www.qianwen.com/*",
    "https://www.doubao.com/*",
    "https://chat.deepseek.com/*",
    "https://claude.ai/*",
    "https://github.com/*",
    "https://raw.githubusercontent.com/*"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "https://chatgpt.com/*",
        "https://www.qianwen.com/*",
        "https://www.doubao.com/chat*",
        "https://chat.deepseek.com/*",
        "https://claude.ai/chat/*"
      ],
      "js": ["content/main.js"],
      "css": ["content/styles.css"],
      "run_at": "document_start"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["injected/page-hooks.js"],
      "matches": [
        "https://chatgpt.com/*",
        "https://www.qianwen.com/*",
        "https://www.doubao.com/*",
        "https://chat.deepseek.com/*",
        "https://claude.ai/*"
      ]
    }
  ]
}
```

- [ ] **Step 2: Create a simple local SVG icon**

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="AI Chat Helper">
  <rect width="128" height="128" rx="24" fill="#1457d9"/>
  <path fill="#ffffff" d="M30 35a13 13 0 0 1 13-13h42a13 13 0 0 1 13 13v32a13 13 0 0 1-13 13H62L42 99V80a13 13 0 0 1-12-13V35Z"/>
  <circle cx="50" cy="51" r="6" fill="#1457d9"/>
  <circle cx="64" cy="51" r="6" fill="#1457d9"/>
  <circle cx="78" cy="51" r="6" fill="#1457d9"/>
</svg>
```

- [ ] **Step 3: Create minimal service worker**

```ts
chrome.runtime.onInstalled.addListener(() => {
  console.info("[AI Chat Helper] extension installed");
});
```

- [ ] **Step 4: Create minimal injected script**

```ts
window.postMessage(
  {
    source: "ai-chat-helper:injected",
    type: "injected-ready",
    payload: { href: window.location.href }
  },
  window.location.origin
);
```

- [ ] **Step 5: Create minimal content script**

```ts
import { detectPlatform } from "../shared/platform-detection";

function injectPageHooks(): void {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("injected/page-hooks.js");
  script.async = false;
  script.dataset.aiChatHelper = "page-hooks";
  (document.documentElement || document.head).appendChild(script);
  script.remove();
}

const platform = detectPlatform(new URL(window.location.href));

if (platform) {
  injectPageHooks();
  document.documentElement.dataset.aiChatHelperPlatform = platform.id;
}
```

- [ ] **Step 6: Create minimal content stylesheet**

```css
:root[data-ai-chat-helper-platform] {
  --ai-chat-helper-accent: #1457d9;
}
```

- [ ] **Step 7: Copy manifest and icon during build**

Update `extension/vite.config.ts`:

```ts
import { copyFileSync, mkdirSync, cpSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

function copyStaticExtensionFiles() {
  return {
    name: "copy-static-extension-files",
    closeBundle() {
      mkdirSync(resolve(__dirname, "dist"), { recursive: true });
      copyFileSync(resolve(__dirname, "manifest.json"), resolve(__dirname, "dist/manifest.json"));
      cpSync(resolve(__dirname, "public/icons"), resolve(__dirname, "dist/icons"), { recursive: true });
    }
  };
}

export default defineConfig({
  plugins: [copyStaticExtensionFiles()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        "content/main": resolve(__dirname, "src/content/main.ts"),
        "injected/page-hooks": resolve(__dirname, "src/injected/page-hooks.ts"),
        "background/service-worker": resolve(__dirname, "src/background/service-worker.ts")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
```

- [ ] **Step 8: Verify typecheck and build**

Run:

```powershell
Set-Location E:\Code\AI-Chat-Nodes\extension
npm run typecheck
npm run build
```

Expected: both commands exit with code 0 and `extension/dist/manifest.json` exists.

- [ ] **Step 9: Commit**

```powershell
git add extension/manifest.json extension/public/icons/icon.svg extension/src/background/service-worker.ts extension/src/content/main.ts extension/src/content/styles.css extension/src/injected/page-hooks.ts extension/vite.config.ts
git commit -m "feat: add loadable mv3 extension shell"
```

---

### Task 4: Add Typed Messaging Protocol

**Files:**
- Create: `extension/src/messaging/protocol.ts`
- Create: `extension/src/messaging/bridge.ts`
- Create: `extension/src/__tests__/messaging.test.ts`
- Modify: `extension/src/content/main.ts`
- Modify: `extension/src/injected/page-hooks.ts`

- [ ] **Step 1: Write message validation tests**

```ts
import { describe, expect, it } from "vitest";
import { isInjectedMessage } from "../messaging/bridge";

describe("isInjectedMessage", () => {
  it("accepts injected messages from the page bridge", () => {
    expect(
      isInjectedMessage({
        source: "ai-chat-helper:injected",
        type: "injected-ready",
        payload: { href: "https://chatgpt.com/" }
      })
    ).toBe(true);
  });

  it("rejects unrelated messages", () => {
    expect(isInjectedMessage({ source: "other", type: "injected-ready" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
Set-Location E:\Code\AI-Chat-Nodes\extension
npm test -- src/__tests__/messaging.test.ts
```

Expected: FAIL because messaging files do not exist.

- [ ] **Step 3: Create protocol types**

```ts
import type { CapturedNetworkEvent, ExportFile } from "../shared/types";

export const INJECTED_MESSAGE_SOURCE = "ai-chat-helper:injected";

export type InjectedToContentMessage =
  | {
      source: typeof INJECTED_MESSAGE_SOURCE;
      type: "injected-ready";
      payload: { href: string };
    }
  | {
      source: typeof INJECTED_MESSAGE_SOURCE;
      type: "captured-network-event";
      payload: CapturedNetworkEvent;
    };

export type BackgroundRequest =
  | {
      type: "http-request";
      payload: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      };
    }
  | {
      type: "download-file";
      payload: ExportFile & { fileName: string };
    }
  | {
      type: "get-version";
    };

export type BackgroundResponse<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: string };
```

- [ ] **Step 4: Create bridge helpers**

```ts
import { INJECTED_MESSAGE_SOURCE, type BackgroundRequest, type BackgroundResponse, type InjectedToContentMessage } from "./protocol";

export function isInjectedMessage(value: unknown): value is InjectedToContentMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { source?: unknown; type?: unknown; payload?: unknown };
  return candidate.source === INJECTED_MESSAGE_SOURCE && typeof candidate.type === "string" && "payload" in candidate;
}

export function sendBackgroundRequest<T>(request: BackgroundRequest): Promise<BackgroundResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(request, (response: BackgroundResponse<T> | undefined) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message || "Unknown runtime error" });
        return;
      }
      resolve(response || { ok: false, error: "Empty background response" });
    });
  });
}
```

- [ ] **Step 5: Update injected script to use protocol source**

```ts
import { INJECTED_MESSAGE_SOURCE } from "../messaging/protocol";

window.postMessage(
  {
    source: INJECTED_MESSAGE_SOURCE,
    type: "injected-ready",
    payload: { href: window.location.href }
  },
  window.location.origin
);
```

- [ ] **Step 6: Update content script to validate injected messages**

Add this to `extension/src/content/main.ts` after platform detection:

```ts
import { isInjectedMessage } from "../messaging/bridge";

window.addEventListener("message", (event) => {
  if (event.source !== window || !isInjectedMessage(event.data)) return;
  console.debug("[AI Chat Helper] injected message", event.data.type);
});
```

- [ ] **Step 7: Run tests and typecheck**

```powershell
npm test -- src/__tests__/messaging.test.ts
npm run typecheck
```

Expected: PASS and typecheck exits with code 0.

- [ ] **Step 8: Commit**

```powershell
git add extension/src/messaging/protocol.ts extension/src/messaging/bridge.ts extension/src/__tests__/messaging.test.ts extension/src/content/main.ts extension/src/injected/page-hooks.ts
git commit -m "feat: add extension messaging protocol"
```

---

### Task 5: Add Extension Storage Wrapper

**Files:**
- Create: `extension/src/storage/extension-storage.ts`
- Create: `extension/src/__tests__/extension-storage.test.ts`

- [ ] **Step 1: Write storage wrapper tests**

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
Set-Location E:\Code\AI-Chat-Nodes\extension
npm test -- src/__tests__/extension-storage.test.ts
```

Expected: FAIL because `extension-storage.ts` does not exist.

- [ ] **Step 3: Create storage wrapper**

```ts
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
```

- [ ] **Step 4: Run tests**

```powershell
npm test -- src/__tests__/extension-storage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add extension/src/storage/extension-storage.ts extension/src/__tests__/extension-storage.test.ts
git commit -m "feat: add extension storage wrapper"
```

---

### Task 6: Implement Background Request and Download Handling

**Files:**
- Modify: `extension/src/background/service-worker.ts`
- Create: `extension/src/__tests__/background-message-shapes.test.ts`

- [ ] **Step 1: Write message shape tests**

```ts
import { describe, expect, it } from "vitest";
import type { BackgroundRequest } from "../messaging/protocol";

describe("BackgroundRequest", () => {
  it("supports http-request messages", () => {
    const request: BackgroundRequest = {
      type: "http-request",
      payload: { url: "https://raw.githubusercontent.com/yixing233/AIChat-Helper/master/update.json" }
    };
    expect(request.type).toBe("http-request");
  });

  it("supports download-file messages", () => {
    const request: BackgroundRequest = {
      type: "download-file",
      payload: {
        fileName: "conversation.txt",
        path: "conversation.txt",
        mimeType: "text/plain;charset=utf-8",
        content: "hello"
      }
    };
    expect(request.type).toBe("download-file");
  });
});
```

- [ ] **Step 2: Run message shape tests**

```powershell
Set-Location E:\Code\AI-Chat-Nodes\extension
npm test -- src/__tests__/background-message-shapes.test.ts
```

Expected: PASS because protocol types already exist.

- [ ] **Step 3: Replace service worker with message handlers**

```ts
import type { BackgroundRequest, BackgroundResponse } from "../messaging/protocol";

chrome.runtime.onInstalled.addListener(() => {
  console.info("[AI Chat Helper] extension installed");
});

chrome.runtime.onMessage.addListener((request: BackgroundRequest, _sender, sendResponse) => {
  handleBackgroundRequest(request)
    .then((response) => sendResponse(response))
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies BackgroundResponse);
    });

  return true;
});

async function handleBackgroundRequest(request: BackgroundRequest): Promise<BackgroundResponse> {
  if (request.type === "get-version") {
    return { ok: true, value: chrome.runtime.getManifest().version };
  }

  if (request.type === "http-request") {
    const response = await fetch(request.payload.url, {
      method: request.payload.method || "GET",
      headers: request.payload.headers,
      body: request.payload.body
    });
    return {
      ok: true,
      value: {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        text: await response.text()
      }
    };
  }

  if (request.type === "download-file") {
    const content = request.payload.content instanceof Uint8Array
      ? request.payload.content
      : new TextEncoder().encode(request.payload.content);
    const blob = new Blob([content], { type: request.payload.mimeType });
    const url = URL.createObjectURL(blob);
    const downloadId = await chrome.downloads.download({
      url,
      filename: request.payload.fileName,
      saveAs: true
    });
    return { ok: true, value: { downloadId } };
  }

  return { ok: false, error: "Unsupported background request" };
}
```

- [ ] **Step 4: Typecheck and build**

```powershell
npm run typecheck
npm run build
```

Expected: both commands exit with code 0.

- [ ] **Step 5: Commit**

```powershell
git add extension/src/background/service-worker.ts extension/src/__tests__/background-message-shapes.test.ts
git commit -m "feat: add background request handling"
```

---

### Task 7: Implement Injected Page Hooks

**Files:**
- Modify: `extension/src/injected/page-hooks.ts`
- Create: `extension/src/__tests__/captured-event.test.ts`

- [ ] **Step 1: Write captured event shape test**

```ts
import { describe, expect, it } from "vitest";
import type { CapturedNetworkEvent } from "../shared/types";

describe("CapturedNetworkEvent", () => {
  it("records fetch events with stable ids and timestamps", () => {
    const event: CapturedNetworkEvent = {
      id: "fetch-1",
      kind: "fetch",
      url: "https://chatgpt.com/backend-api/conversation",
      method: "GET",
      status: 200,
      responseText: "{}",
      createdAt: 1710000000000
    };
    expect(event.kind).toBe("fetch");
    expect(event.createdAt).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run captured event test**

```powershell
Set-Location E:\Code\AI-Chat-Nodes\extension
npm test -- src/__tests__/captured-event.test.ts
```

Expected: PASS because shared types already exist.

- [ ] **Step 3: Replace injected script with hook implementation**

```ts
import { INJECTED_MESSAGE_SOURCE } from "../messaging/protocol";
import type { CapturedNetworkEvent } from "../shared/types";

let nextEventId = 1;

function emitCapturedEvent(payload: CapturedNetworkEvent): void {
  window.postMessage(
    {
      source: INJECTED_MESSAGE_SOURCE,
      type: "captured-network-event",
      payload
    },
    window.location.origin
  );
}

function createEventId(kind: CapturedNetworkEvent["kind"]): string {
  const id = `${kind}-${nextEventId}`;
  nextEventId += 1;
  return id;
}

function installFetchHook(): void {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || (input instanceof Request ? input.method : "GET");
    const url = input instanceof Request ? input.url : String(input);
    const response = await nativeFetch(input, init);
    const clone = response.clone();
    clone.text().then((responseText) => {
      emitCapturedEvent({
        id: createEventId("fetch"),
        kind: "fetch",
        url,
        method,
        status: response.status,
        responseText,
        requestBody: typeof init?.body === "string" ? init.body : undefined,
        createdAt: Date.now()
      });
    }).catch(() => undefined);
    return response;
  };
}

function installXhrHook(): void {
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function open(method: string, url: string | URL, ...rest: unknown[]) {
    this.setRequestHeader;
    (this as XMLHttpRequest & { __aiChatHelper?: { method: string; url: string } }).__aiChatHelper = {
      method,
      url: String(url)
    };
    return nativeOpen.call(this, method, url, ...(rest as [boolean?, string?, string?]));
  };

  XMLHttpRequest.prototype.send = function send(body?: Document | XMLHttpRequestBodyInit | null) {
    this.addEventListener("load", () => {
      const meta = (this as XMLHttpRequest & { __aiChatHelper?: { method: string; url: string } }).__aiChatHelper;
      if (!meta) return;
      emitCapturedEvent({
        id: createEventId("xhr"),
        kind: "xhr",
        url: meta.url,
        method: meta.method,
        status: this.status,
        responseText: typeof this.responseText === "string" ? this.responseText : undefined,
        requestBody: typeof body === "string" ? body : undefined,
        createdAt: Date.now()
      });
    });
    return nativeSend.call(this, body);
  };
}

function installBlobUrlHook(): void {
  const nativeCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (object: Blob | MediaSource) => {
    const url = nativeCreateObjectURL(object);
    if (object instanceof Blob) {
      emitCapturedEvent({
        id: createEventId("blob-url"),
        kind: "blob-url",
        url,
        mimeType: object.type,
        createdAt: Date.now()
      });
    }
    return url;
  };
}

installFetchHook();
installXhrHook();
installBlobUrlHook();

window.postMessage(
  {
    source: INJECTED_MESSAGE_SOURCE,
    type: "injected-ready",
    payload: { href: window.location.href }
  },
  window.location.origin
);
```

- [ ] **Step 4: Typecheck and build**

```powershell
npm run typecheck
npm run build
```

Expected: both commands exit with code 0.

- [ ] **Step 5: Commit**

```powershell
git add extension/src/injected/page-hooks.ts extension/src/__tests__/captured-event.test.ts
git commit -m "feat: add page-world network hooks"
```

---

### Task 8: Add Platform Adapter Registry and Initial Adapters

**Files:**
- Create: `extension/src/platforms/chatgpt/adapter.ts`
- Create: `extension/src/platforms/claude/adapter.ts`
- Create: `extension/src/platforms/qwen/adapter.ts`
- Create: `extension/src/platforms/doubao/adapter.ts`
- Create: `extension/src/platforms/deepseek/adapter.ts`
- Create: `extension/src/platforms/index.ts`
- Create: `extension/src/__tests__/platform-adapters.test.ts`

- [ ] **Step 1: Write adapter registry tests**

```ts
import { describe, expect, it } from "vitest";
import { getPlatformAdapter } from "../platforms";

describe("getPlatformAdapter", () => {
  it.each([
    ["https://chatgpt.com/c/abc", "chatgpt"],
    ["https://claude.ai/chat/123e4567-e89b-12d3-a456-426614174000", "claude"],
    ["https://www.qianwen.com/chat/abcdefghi", "qwen"],
    ["https://www.doubao.com/chat/abc", "doubao"],
    ["https://chat.deepseek.com/chat/123e4567-e89b-12d3-a456-426614174000", "deepseek"]
  ])("returns adapter for %s", (url, expected) => {
    expect(getPlatformAdapter(new URL(url))?.id).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
Set-Location E:\Code\AI-Chat-Nodes\extension
npm test -- src/__tests__/platform-adapters.test.ts
```

Expected: FAIL because adapter files do not exist.

- [ ] **Step 3: Create one adapter template and copy it per platform with platform-specific ids**

Use this exact ChatGPT adapter for `extension/src/platforms/chatgpt/adapter.ts`:

```ts
import type { ConversationNode, PlatformAdapter } from "../../shared/types";

export const chatgptAdapter: PlatformAdapter = {
  id: "chatgpt",
  name: "ChatGPT",
  matches(url) {
    return (url.hostname === "chatgpt.com" || url.hostname.endsWith(".chatgpt.com")) && /^\/(?:$|c\/[a-z0-9-]+\/?)$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    return url.pathname.split("/").filter(Boolean).pop() || "current";
  },
  scanDomNodes(root = document) {
    return Array.from(root.querySelectorAll<HTMLElement>("[data-message-author-role]")).map<ConversationNode>((element, index) => ({
      id: element.getAttribute("data-message-id") || `chatgpt-node-${index + 1}`,
      title: element.textContent?.trim().slice(0, 80) || `Message ${index + 1}`,
      index,
      role: element.getAttribute("data-message-author-role") === "user" ? "user" : "assistant"
    }));
  }
};
```

Use this exact Claude adapter for `extension/src/platforms/claude/adapter.ts`:

```ts
import type { ConversationNode, PlatformAdapter } from "../../shared/types";

export const claudeAdapter: PlatformAdapter = {
  id: "claude",
  name: "Claude",
  matches(url) {
    return url.hostname === "claude.ai" && /^\/chat(?:\/[0-9a-f-]{36})?\/?$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    return url.pathname.split("/").filter(Boolean).pop() || "current";
  },
  scanDomNodes(root = document) {
    return Array.from(root.querySelectorAll<HTMLElement>("[data-testid], article, [data-message-id]"))
      .filter((element) => (element.textContent || "").trim().length > 0)
      .map<ConversationNode>((element, index) => ({
        id: element.getAttribute("data-message-id") || `claude-node-${index + 1}`,
        title: element.textContent?.trim().slice(0, 80) || `Message ${index + 1}`,
        index
      }));
  }
};
```

Use this exact Qwen adapter for `extension/src/platforms/qwen/adapter.ts`:

```ts
import type { ConversationNode, PlatformAdapter } from "../../shared/types";

export const qwenAdapter: PlatformAdapter = {
  id: "qwen",
  name: "Tongyi Qianwen",
  matches(url) {
    return url.hostname === "www.qianwen.com" && /^\/(?:$|chat(?:\/[a-z0-9_-]{8,})?\/?)$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    return url.pathname.split("/").filter(Boolean).pop() || "current";
  },
  scanDomNodes(root = document) {
    return Array.from(root.querySelectorAll<HTMLElement>("[class*='message'], [data-testid*='message']"))
      .filter((element) => (element.textContent || "").trim().length > 0)
      .map<ConversationNode>((element, index) => ({
        id: `qwen-node-${index + 1}`,
        title: element.textContent?.trim().slice(0, 80) || `Message ${index + 1}`,
        index
      }));
  }
};
```

Use this exact Doubao adapter for `extension/src/platforms/doubao/adapter.ts`:

```ts
import type { ConversationNode, PlatformAdapter } from "../../shared/types";

export const doubaoAdapter: PlatformAdapter = {
  id: "doubao",
  name: "Doubao",
  matches(url) {
    return url.hostname === "www.doubao.com" && /^\/chat(?:\/[^/?#]+)?\/?$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    return url.pathname.split("/").filter(Boolean).pop() || "current";
  },
  scanDomNodes(root = document) {
    return Array.from(root.querySelectorAll<HTMLElement>("[class*='message'], [data-testid*='message']"))
      .filter((element) => (element.textContent || "").trim().length > 0)
      .map<ConversationNode>((element, index) => ({
        id: `doubao-node-${index + 1}`,
        title: element.textContent?.trim().slice(0, 80) || `Message ${index + 1}`,
        index
      }));
  }
};
```

Use this exact DeepSeek adapter for `extension/src/platforms/deepseek/adapter.ts`:

```ts
import type { ConversationNode, PlatformAdapter } from "../../shared/types";

export const deepseekAdapter: PlatformAdapter = {
  id: "deepseek",
  name: "DeepSeek",
  matches(url) {
    return url.hostname === "chat.deepseek.com" && /^\/(?:$|a\/chat\/s(?:\/[0-9a-f-]{36})?\/?|chat(?:\/[0-9a-f-]{36})?\/?)$/i.test(url.pathname);
  },
  getConversationId(url = new URL(window.location.href)) {
    return url.pathname.split("/").filter(Boolean).pop() || "current";
  },
  scanDomNodes(root = document) {
    return Array.from(root.querySelectorAll<HTMLElement>("[class*='message'], [data-testid*='message']"))
      .filter((element) => (element.textContent || "").trim().length > 0)
      .map<ConversationNode>((element, index) => ({
        id: `deepseek-node-${index + 1}`,
        title: element.textContent?.trim().slice(0, 80) || `Message ${index + 1}`,
        index
      }));
  }
};
```

- [ ] **Step 4: Create adapter registry**

```ts
import type { PlatformAdapter } from "../shared/types";
import { chatgptAdapter } from "./chatgpt/adapter";
import { claudeAdapter } from "./claude/adapter";
import { deepseekAdapter } from "./deepseek/adapter";
import { doubaoAdapter } from "./doubao/adapter";
import { qwenAdapter } from "./qwen/adapter";

export const platformAdapters: PlatformAdapter[] = [
  chatgptAdapter,
  claudeAdapter,
  qwenAdapter,
  doubaoAdapter,
  deepseekAdapter
];

export function getPlatformAdapter(url: URL): PlatformAdapter | null {
  return platformAdapters.find((adapter) => adapter.matches(url)) || null;
}
```

- [ ] **Step 5: Run tests**

```powershell
npm test -- src/__tests__/platform-adapters.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add extension/src/platforms extension/src/__tests__/platform-adapters.test.ts
git commit -m "feat: add platform adapter registry"
```

---

### Task 9: Add Minimal In-Page UI Shell

**Files:**
- Create: `extension/src/ui/panel/panel.ts`
- Create: `extension/src/ui/controls/node-list.ts`
- Create: `extension/src/ui/modals/export-modal.ts`
- Modify: `extension/src/content/main.ts`
- Modify: `extension/src/content/styles.css`
- Create: `extension/src/__tests__/panel.test.ts`

- [ ] **Step 1: Write panel test**

```ts
import { describe, expect, it } from "vitest";
import { createPanel } from "../ui/panel/panel";

describe("createPanel", () => {
  it("creates one root panel element", () => {
    const panel = createPanel({ platformName: "ChatGPT" });
    expect(panel.id).toBe("ai-chat-helper-panel");
    expect(panel.textContent).toContain("ChatGPT");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
Set-Location E:\Code\AI-Chat-Nodes\extension
npm test -- src/__tests__/panel.test.ts
```

Expected: FAIL because panel file does not exist.

- [ ] **Step 3: Create panel shell**

```ts
export interface PanelOptions {
  platformName: string;
}

export function createPanel(options: PanelOptions): HTMLElement {
  const root = document.createElement("aside");
  root.id = "ai-chat-helper-panel";
  root.className = "ai-chat-helper-panel";
  root.innerHTML = `
    <header class="ai-chat-helper-panel__header">
      <strong>AI Chat Helper</strong>
      <span>${escapeHtml(options.platformName)}</span>
    </header>
    <div class="ai-chat-helper-panel__nodes" data-ai-chat-helper-nodes></div>
    <footer class="ai-chat-helper-panel__actions">
      <button type="button" data-ai-chat-helper-export>Export</button>
    </footer>
  `;
  return root;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    };
    return entities[char];
  });
}
```

- [ ] **Step 4: Create node list renderer**

```ts
import type { ConversationNode } from "../../shared/types";

export function renderNodeList(container: HTMLElement, nodes: ConversationNode[]): void {
  container.replaceChildren(
    ...nodes.map((node) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-chat-helper-node";
      button.textContent = `${node.index + 1}. ${node.title}`;
      button.addEventListener("click", () => {
        if (!node.elementSelector) return;
        document.querySelector(node.elementSelector)?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      return button;
    })
  );
}
```

- [ ] **Step 5: Create export modal surface**

```ts
export function openExportModal(): void {
  const existing = document.getElementById("ai-chat-helper-export-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "ai-chat-helper-export-modal";
  modal.className = "ai-chat-helper-export-modal";
  modal.innerHTML = `
    <div class="ai-chat-helper-export-modal__box">
      <strong>Export</strong>
      <button type="button" data-ai-chat-helper-close-export>Close</button>
    </div>
  `;
  modal.querySelector("[data-ai-chat-helper-close-export]")?.addEventListener("click", () => modal.remove());
  document.body.appendChild(modal);
}
```

- [ ] **Step 6: Update content script to mount UI**

Replace `extension/src/content/main.ts` with:

```ts
import { isInjectedMessage } from "../messaging/bridge";
import { getPlatformAdapter } from "../platforms";
import { createPanel } from "../ui/panel/panel";
import { renderNodeList } from "../ui/controls/node-list";
import { openExportModal } from "../ui/modals/export-modal";

function injectPageHooks(): void {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("injected/page-hooks.js");
  script.async = false;
  script.dataset.aiChatHelper = "page-hooks";
  (document.documentElement || document.head).appendChild(script);
  script.remove();
}

function mountUi(): void {
  const adapter = getPlatformAdapter(new URL(window.location.href));
  if (!adapter || document.getElementById("ai-chat-helper-panel")) return;

  document.documentElement.dataset.aiChatHelperPlatform = adapter.id;
  const panel = createPanel({ platformName: adapter.name });
  document.body.appendChild(panel);
  const nodesContainer = panel.querySelector<HTMLElement>("[data-ai-chat-helper-nodes]");
  if (nodesContainer) {
    renderNodeList(nodesContainer, adapter.scanDomNodes(document));
  }
  panel.querySelector("[data-ai-chat-helper-export]")?.addEventListener("click", openExportModal);
}

const adapter = getPlatformAdapter(new URL(window.location.href));

if (adapter) {
  injectPageHooks();
  window.addEventListener("message", (event) => {
    if (event.source !== window || !isInjectedMessage(event.data)) return;
    console.debug("[AI Chat Helper] injected message", event.data.type);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountUi, { once: true });
  } else {
    mountUi();
  }
}
```

- [ ] **Step 7: Replace content styles**

```css
:root[data-ai-chat-helper-platform] {
  --ai-chat-helper-accent: #1457d9;
  --ai-chat-helper-bg: #ffffff;
  --ai-chat-helper-border: #d9e2f2;
  --ai-chat-helper-text: #172033;
}

.ai-chat-helper-panel {
  position: fixed;
  right: 16px;
  top: 96px;
  z-index: 2147483647;
  width: 260px;
  max-height: min(620px, calc(100vh - 128px));
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: var(--ai-chat-helper-bg);
  color: var(--ai-chat-helper-text);
  border: 1px solid var(--ai-chat-helper-border);
  border-radius: 8px;
  box-shadow: 0 16px 48px rgb(20 87 217 / 18%);
  font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.ai-chat-helper-panel__header,
.ai-chat-helper-panel__actions {
  padding: 10px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.ai-chat-helper-panel__nodes {
  overflow: auto;
  padding: 4px 8px;
}

.ai-chat-helper-node,
.ai-chat-helper-panel button {
  border: 1px solid var(--ai-chat-helper-border);
  background: #fff;
  color: var(--ai-chat-helper-text);
  border-radius: 6px;
  min-height: 32px;
}

.ai-chat-helper-node {
  width: 100%;
  display: block;
  text-align: left;
  margin: 4px 0;
  padding: 6px 8px;
}

.ai-chat-helper-export-modal {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 20%);
}

.ai-chat-helper-export-modal__box {
  width: 320px;
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
```

- [ ] **Step 8: Run tests and build**

```powershell
npm test -- src/__tests__/panel.test.ts
npm run typecheck
npm run build
```

Expected: tests, typecheck, and build pass.

- [ ] **Step 9: Commit**

```powershell
git add extension/src/ui extension/src/content/main.ts extension/src/content/styles.css extension/src/__tests__/panel.test.ts
git commit -m "feat: add extension in-page panel shell"
```

---

### Task 10: Add Exporters and ZIP Builder

**Files:**
- Create: `extension/src/exporters/html.ts`
- Create: `extension/src/exporters/markdown.ts`
- Create: `extension/src/exporters/txt.ts`
- Create: `extension/src/exporters/zip.ts`
- Create: `extension/src/exporters/index.ts`
- Create: `extension/src/__tests__/exporters.test.ts`

- [ ] **Step 1: Write exporter tests**

```ts
import { describe, expect, it } from "vitest";
import { htmlExporter } from "../exporters/html";
import { markdownExporter } from "../exporters/markdown";
import { txtExporter } from "../exporters/txt";
import type { ConversationSnapshot } from "../shared/types";

const snapshot: ConversationSnapshot = {
  platformId: "chatgpt",
  conversationId: "abc",
  title: "Sample Chat",
  attachments: [],
  messages: [
    { id: "1", role: "user", text: "Hello" },
    { id: "2", role: "assistant", text: "Hi there" }
  ]
};

describe("exporters", () => {
  it("exports html", async () => {
    const [file] = await htmlExporter.export(snapshot);
    expect(file.path).toBe("Sample Chat.html");
    expect(String(file.content)).toContain("<h1>Sample Chat</h1>");
  });

  it("exports markdown", async () => {
    const [file] = await markdownExporter.export(snapshot);
    expect(file.path).toBe("Sample Chat.md");
    expect(String(file.content)).toContain("# Sample Chat");
  });

  it("exports txt", async () => {
    const [file] = await txtExporter.export(snapshot);
    expect(file.path).toBe("Sample Chat.txt");
    expect(String(file.content)).toContain("user: Hello");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
Set-Location E:\Code\AI-Chat-Nodes\extension
npm test -- src/__tests__/exporters.test.ts
```

Expected: FAIL because exporter files do not exist.

- [ ] **Step 3: Create HTML exporter**

```ts
import type { Exporter } from "../shared/types";

export const htmlExporter: Exporter = {
  format: "html",
  async export(snapshot) {
    const body = snapshot.messages
      .map((message) => `<section><strong>${escapeHtml(message.role)}</strong><p>${escapeHtml(message.text)}</p></section>`)
      .join("\n");
    return [
      {
        path: `${safeFileName(snapshot.title)}.html`,
        mimeType: "text/html;charset=utf-8",
        content: `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(snapshot.title)}</title></head><body><h1>${escapeHtml(snapshot.title)}</h1>${body}</body></html>`
      }
    ];
  }
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char] || char));
}

function safeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*]+/g, "_").trim() || "conversation";
}
```

- [ ] **Step 4: Create Markdown exporter**

```ts
import type { Exporter } from "../shared/types";

export const markdownExporter: Exporter = {
  format: "markdown",
  async export(snapshot) {
    const lines = [`# ${snapshot.title}`, ""];
    snapshot.messages.forEach((message) => {
      lines.push(`## ${message.role}`, "", message.text, "");
    });
    return [
      {
        path: `${safeFileName(snapshot.title)}.md`,
        mimeType: "text/markdown;charset=utf-8",
        content: lines.join("\n")
      }
    ];
  }
};

function safeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*]+/g, "_").trim() || "conversation";
}
```

- [ ] **Step 5: Create TXT exporter**

```ts
import type { Exporter } from "../shared/types";

export const txtExporter: Exporter = {
  format: "txt",
  async export(snapshot) {
    const content = snapshot.messages.map((message) => `${message.role}: ${message.text}`).join("\n\n");
    return [
      {
        path: `${safeFileName(snapshot.title)}.txt`,
        mimeType: "text/plain;charset=utf-8",
        content
      }
    ];
  }
};

function safeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*]+/g, "_").trim() || "conversation";
}
```

- [ ] **Step 6: Create a stored ZIP builder**

```ts
import type { ExportFile } from "../shared/types";

export function createZip(files: ExportFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.path);
    const content = file.content instanceof Uint8Array ? file.content : encoder.encode(file.content);
    const crc = crc32(content);

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, content.length, true);
    localView.setUint32(22, content.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(local, content);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, content.length, true);
    centralView.setUint32(24, content.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);

    offset += local.length + content.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return concatUint8Arrays([...localParts, ...centralParts, end]);
}

function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    result.set(part, cursor);
    cursor += part.length;
  }
  return result;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
```

- [ ] **Step 7: Create exporter registry**

```ts
import { htmlExporter } from "./html";
import { markdownExporter } from "./markdown";
import { txtExporter } from "./txt";

export const exporters = {
  html: htmlExporter,
  markdown: markdownExporter,
  txt: txtExporter
};
```

- [ ] **Step 8: Run tests and build**

```powershell
npm test -- src/__tests__/exporters.test.ts
npm run typecheck
npm run build
```

Expected: tests, typecheck, and build pass.

- [ ] **Step 9: Commit**

```powershell
git add extension/src/exporters extension/src/__tests__/exporters.test.ts
git commit -m "feat: add normalized conversation exporters"
```

---

### Task 11: Wire Export Actions Through Background Downloads

**Files:**
- Modify: `extension/src/ui/modals/export-modal.ts`
- Modify: `extension/src/content/main.ts`
- Create: `extension/src/__tests__/export-modal.test.ts`

- [ ] **Step 1: Write export modal test**

```ts
import { describe, expect, it } from "vitest";
import { createExportModal } from "../ui/modals/export-modal";

describe("createExportModal", () => {
  it("renders format buttons", () => {
    const modal = createExportModal();
    expect(modal.querySelector("[data-format='html']")).toBeTruthy();
    expect(modal.querySelector("[data-format='markdown']")).toBeTruthy();
    expect(modal.querySelector("[data-format='txt']")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
Set-Location E:\Code\AI-Chat-Nodes\extension
npm test -- src/__tests__/export-modal.test.ts
```

Expected: FAIL because `createExportModal` is not exported.

- [ ] **Step 3: Replace export modal implementation**

```ts
export type ExportFormat = "html" | "markdown" | "txt";

export function createExportModal(): HTMLElement {
  const modal = document.createElement("div");
  modal.id = "ai-chat-helper-export-modal";
  modal.className = "ai-chat-helper-export-modal";
  modal.innerHTML = `
    <div class="ai-chat-helper-export-modal__box">
      <strong>Export</strong>
      <div class="ai-chat-helper-export-modal__buttons">
        <button type="button" data-format="html">HTML</button>
        <button type="button" data-format="markdown">Markdown</button>
        <button type="button" data-format="txt">TXT</button>
      </div>
      <button type="button" data-ai-chat-helper-close-export>Close</button>
    </div>
  `;
  modal.querySelector("[data-ai-chat-helper-close-export]")?.addEventListener("click", () => modal.remove());
  return modal;
}

export function openExportModal(onExport?: (format: ExportFormat) => void): void {
  document.getElementById("ai-chat-helper-export-modal")?.remove();
  const modal = createExportModal();
  modal.querySelectorAll<HTMLButtonElement>("[data-format]").forEach((button) => {
    button.addEventListener("click", () => {
      const format = button.dataset.format as ExportFormat;
      onExport?.(format);
      modal.remove();
    });
  });
  document.body.appendChild(modal);
}
```

- [ ] **Step 4: Update content script export handling**

Add this import:

```ts
import { exporters } from "../exporters";
import { sendBackgroundRequest } from "../messaging/bridge";
import type { ConversationSnapshot } from "../shared/types";
```

Replace the export button listener with:

```ts
panel.querySelector("[data-ai-chat-helper-export]")?.addEventListener("click", () => {
  openExportModal(async (format) => {
    const nodes = adapter.scanDomNodes(document);
    const snapshot: ConversationSnapshot = {
      platformId: adapter.id,
      conversationId: adapter.getConversationId(),
      title: document.title || `${adapter.name} Conversation`,
      attachments: [],
      messages: nodes.map((node) => ({
        id: node.id,
        role: node.role || "assistant",
        text: node.title
      }))
    };
    const files = await exporters[format].export(snapshot);
    for (const file of files) {
      await sendBackgroundRequest({
        type: "download-file",
        payload: {
          ...file,
          fileName: file.path
        }
      });
    }
  });
});
```

- [ ] **Step 5: Run tests and build**

```powershell
npm test -- src/__tests__/export-modal.test.ts
npm run typecheck
npm run build
```

Expected: tests, typecheck, and build pass.

- [ ] **Step 6: Commit**

```powershell
git add extension/src/ui/modals/export-modal.ts extension/src/content/main.ts extension/src/__tests__/export-modal.test.ts
git commit -m "feat: wire extension export downloads"
```

---

### Task 12: Migrate High-Value Userscript Logic Incrementally

**Files:**
- Modify: `extension/src/platforms/chatgpt/adapter.ts`
- Modify: `extension/src/platforms/claude/adapter.ts`
- Modify: `extension/src/platforms/qwen/adapter.ts`
- Modify: `extension/src/platforms/doubao/adapter.ts`
- Modify: `extension/src/platforms/deepseek/adapter.ts`
- Modify: `extension/src/exporters/html.ts`
- Modify: `extension/src/exporters/markdown.ts`
- Modify: `extension/src/exporters/txt.ts`
- Modify: `extension/src/exporters/zip.ts`
- Add tests under: `extension/src/__tests__/`

- [ ] **Step 1: Extract current userscript reference locations**

Run:

```powershell
Set-Location E:\Code\AI-Chat-Nodes
rg -n "function .*ChatGPT|const .*ChatGPT|function .*Claude|const .*Claude|createZipBlob|downloadBlob|markdown|batch|DeepSeek|Doubao|Qwen|qwen|doubao|deepseek|claude" AIChat-Helper.user.js
```

Expected: command prints the migration source locations for platform parsing and export logic.

- [ ] **Step 2: For each platform, move selectors and conversation-id logic into its adapter**

Use the existing adapter method signatures:

```ts
getConversationId(url = new URL(window.location.href)): string
scanDomNodes(root = document): ConversationNode[]
```

Expected: each adapter returns at least the same node count as the userscript on the same loaded conversation page.

- [ ] **Step 3: For captured API hydration, add adapter tests before moving logic**

Use this test shape for each platform file that hydrates API events:

```ts
import { describe, expect, it } from "vitest";
import { chatgptAdapter } from "../platforms/chatgpt/adapter";
import type { CapturedNetworkEvent } from "../shared/types";

describe("chatgptAdapter hydrateFromCapturedApi", () => {
  it("creates a normalized snapshot from a captured response", async () => {
    const events: CapturedNetworkEvent[] = [
      {
        id: "fetch-1",
        kind: "fetch",
        url: "https://chatgpt.com/backend-api/conversation",
        method: "GET",
        status: 200,
        responseText: JSON.stringify({ title: "Captured Chat", messages: [] }),
        createdAt: Date.now()
      }
    ];
    const snapshot = await chatgptAdapter.hydrateFromCapturedApi?.(events);
    expect(snapshot?.title).toBe("Captured Chat");
  });
});
```

Expected before implementation: FAIL because `hydrateFromCapturedApi` is missing or incomplete.

- [ ] **Step 4: Move exporter rendering helpers into exporter modules**

Move behavior from `AIChat-Helper.user.js` without changing output contracts:

```ts
export interface Exporter {
  format: "html" | "markdown" | "txt";
  export(snapshot: ConversationSnapshot): Promise<ExportFile[]>;
}
```

Expected: existing exporter tests remain green and new fixture tests cover Claude widget content, attachments, and Markdown escaping.

- [ ] **Step 5: Expand ZIP builder fixture coverage**

Use the existing userscript ZIP implementation as the behavior reference and keep the public function:

```ts
export function createZip(files: ExportFile[]): Uint8Array
```

Expected: a test with two text files can inspect the resulting bytes, find both file names encoded in the archive, and confirm the result starts with ZIP local file header bytes `50 4b 03 04`.

- [ ] **Step 6: Run full extension verification after each platform migration**

```powershell
Set-Location E:\Code\AI-Chat-Nodes\extension
npm test
npm run typecheck
npm run build
```

Expected: all commands pass after each platform adapter migration.

- [ ] **Step 7: Commit after each platform or exporter slice**

Use one of these messages:

```powershell
git add extension/src/platforms/chatgpt extension/src/__tests__
git commit -m "feat: migrate chatgpt adapter logic"
```

```powershell
git add extension/src/exporters extension/src/__tests__
git commit -m "feat: migrate export rendering logic"
```

---

### Task 13: Add Manual Chrome/Edge Load Verification

**Files:**
- Create: `extension/README.md`
- Create: `extension/manual-test-checklist.md`
- Modify: `README.md`

- [ ] **Step 1: Create extension README**

```markdown
# AI Chat Helper Extension

This is the active Chrome and Microsoft Edge Manifest V3 version of AI Chat Helper.

## Development

```powershell
Set-Location E:\Code\AI-Chat-Nodes\extension
npm install
npm run build
```

Load `E:\Code\AI-Chat-Nodes\extension\dist` as an unpacked extension from `chrome://extensions` or `edge://extensions`.

## Verification

Run:

```powershell
npm test
npm run typecheck
npm run build
```
```

- [ ] **Step 2: Create manual checklist**

```markdown
# Manual Test Checklist

Build the extension with `npm run build`, then load `E:\Code\AI-Chat-Nodes\extension\dist` as an unpacked extension.

- [ ] Chrome loads the extension without manifest errors.
- [ ] Edge loads the extension without manifest errors.
- [ ] ChatGPT page shows the AI Chat Helper panel.
- [ ] Claude page shows the AI Chat Helper panel.
- [ ] Tongyi Qianwen page shows the AI Chat Helper panel.
- [ ] Doubao page shows the AI Chat Helper panel.
- [ ] DeepSeek page shows the AI Chat Helper panel.
- [ ] Node list renders on a loaded conversation page.
- [ ] Export HTML triggers a browser download.
- [ ] Export Markdown triggers a browser download.
- [ ] Export TXT triggers a browser download.
- [ ] Extension service worker logs no uncaught errors during export.
```

- [ ] **Step 3: Update root README migration note**

Add this near the installation section:

```markdown
## Browser Extension Migration

The project is moving from the Tampermonkey userscript to a Chrome and Microsoft Edge Manifest V3 extension. The extension source lives in `extension/` and is the active development target for new work.
```

- [ ] **Step 4: Run verification**

```powershell
Set-Location E:\Code\AI-Chat-Nodes\extension
npm test
npm run typecheck
npm run build
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

```powershell
git add extension/README.md extension/manual-test-checklist.md README.md
git commit -m "docs: add extension development verification"
```

---

## Final Verification

Run:

```powershell
Set-Location E:\Code\AI-Chat-Nodes\extension
npm test
npm run typecheck
npm run build
```

Expected:

- `npm test` exits with code 0.
- `npm run typecheck` exits with code 0.
- `npm run build` exits with code 0.
- `extension/dist/manifest.json` exists.
- `extension/dist/content/main.js` exists.
- `extension/dist/injected/page-hooks.js` exists.
- `extension/dist/background/service-worker.js` exists.

Then manually load:

```text
E:\Code\AI-Chat-Nodes\extension\dist
```

in Chrome or Edge developer mode and complete `extension/manual-test-checklist.md`.

## Implementation Notes

- Keep commits small and task-aligned.
- Do not delete `AIChat-Helper.user.js` during this migration.
- Keep old userscript behavior as the reference when moving platform and export logic.
- Prefer tests around normalized inputs and outputs before moving large blocks of parsing logic.
- When a platform page changes during migration, update only that platform adapter unless shared types need to change.
