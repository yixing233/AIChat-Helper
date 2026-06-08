# Browser Extension Migration Design

## Overview

This document defines the migration of `AIChat-Helper.user.js` from a Tampermonkey userscript into a Chrome and Microsoft Edge browser extension.

The new extension will become the only active distribution target. The existing userscript will remain in the repository as migration reference material, but it will not remain a maintained release artifact.

The first implementation target is a local development extension loaded through Chrome or Edge developer mode. Store publication, Firefox compatibility, and continued userscript generation are out of scope for the first version.

## Scope

### In Scope

- Create a new `extension` project in the existing repository.
- Build a Manifest V3 extension for Chrome and Microsoft Edge.
- Support all current platforms in the first extension version:
  - ChatGPT
  - Claude
  - Tongyi Qianwen
  - Doubao
  - DeepSeek
- Replace Tampermonkey-specific APIs with browser extension APIs.
- Preserve the core current features:
  - Conversation node navigation
  - Search
  - Reading position helpers
  - HTML export
  - Markdown export
  - TXT export
  - ZIP batch export
- Split page logic, injected page hooks, background extension capabilities, platform adapters, exporters, storage, and messaging into separate modules.
- Use TypeScript and a bundler so third-party dependencies are packaged locally.
- Load the built extension from `extension/dist` during development.

### Out of Scope

- Chrome Web Store or Edge Add-ons publication materials.
- Firefox support.
- Continued `.user.js` generation.
- Remote-code loading.
- A full options page in the first version.
- A popup UI in the first version.
- Rewriting every existing platform parser from scratch before the extension can run.

## Goals and Non-Goals

### Goals

- Move away from Tampermonkey permission and runtime limitations.
- Build a maintainable browser extension architecture.
- Keep platform-specific code isolated so upstream site changes are easier to fix.
- Preserve the current user-facing feature set during migration.
- Give privileged work such as cross-origin requests and managed downloads a clear background-service boundary.
- Keep the first version focused on local development loading so the migration can be validated quickly.

### Non-Goals

- Producing the cleanest possible final implementation in one pass.
- Solving store review requirements in the first milestone.
- Adding new major user-facing features during the migration.
- Maintaining two parallel products after the migration.

## Recommended Architecture

The extension should live under `extension`:

```text
extension/
  package.json
  vite.config.ts
  tsconfig.json
  manifest.json
  public/
    icons/
  src/
    background/
      service-worker.ts
    content/
      main.ts
      styles.css
    injected/
      page-hooks.ts
    platforms/
      chatgpt/
      claude/
      qwen/
      doubao/
      deepseek/
    exporters/
      html.ts
      markdown.ts
      txt.ts
      zip.ts
    storage/
      extension-storage.ts
    messaging/
      protocol.ts
      bridge.ts
    ui/
      panel/
      modals/
      controls/
    shared/
      dom.ts
      url.ts
      errors.ts
```

The central separation is:

- `content`: extension isolated-world code that manages DOM UI and page interaction.
- `injected`: page-world code that hooks page APIs such as `fetch`, `XMLHttpRequest`, `Blob`, and `URL.createObjectURL`.
- `background`: Manifest V3 service worker for cross-origin requests, downloads, and extension lifecycle work.
- `platforms`: one adapter per AI chat platform.
- `exporters`: format-specific export code that consumes normalized conversation data.
- `storage`: a wrapper around `chrome.storage.local`.
- `messaging`: typed message contracts between injected scripts, content scripts, and the background service worker.

## Why This Approach

Three migration approaches were considered:

1. Wrap the existing userscript almost as-is in a content script.
2. Create an extension shell and replace only the Tampermonkey API layer.
3. Build a real extension project and modularize the userscript into extension boundaries.

Option 3 is recommended.

The existing userscript depends on Tampermonkey APIs such as `GM_addStyle`, `GM_getValue`, `GM_setValue`, `GM_xmlhttpRequest`, `unsafeWindow`, `@require`, and `document-start` page hooks. A direct wrapper would leave too much hidden coupling and would make future changes harder.

The modular extension design costs more up front, but it gives the project durable boundaries for platform changes, export formats, privileged extension operations, and future UI additions.

## Manifest and Permissions

The first extension version should use Manifest V3.

Recommended initial permissions:

```json
{
  "permissions": ["storage", "downloads", "scripting"],
  "host_permissions": [
    "https://chatgpt.com/*",
    "https://www.qianwen.com/*",
    "https://www.doubao.com/*",
    "https://chat.deepseek.com/*",
    "https://claude.ai/*",
    "https://github.com/*",
    "https://raw.githubusercontent.com/*"
  ]
}
```

Recommended content script matches:

```json
[
  "https://chatgpt.com/*",
  "https://www.qianwen.com/*",
  "https://www.doubao.com/chat*",
  "https://chat.deepseek.com/*",
  "https://claude.ai/chat/*"
]
```

The injected script should be exposed through `web_accessible_resources` and inserted at `document_start` by the content script.

## Injection Model

The current userscript relies on page-world access through `unsafeWindow` and early hooks. The extension should replace that with a three-layer model:

1. The content script starts at `document_start`.
2. The content script injects `injected/page-hooks.js` into the real page context.
3. The injected script posts captured events back through `window.postMessage`.
4. The content script validates and normalizes those events.
5. The content script calls the background service worker when privileged extension APIs are needed.

This model preserves early capture behavior while avoiding `unsafeWindow`.

## Platform Adapter Design

Each platform should implement a shared adapter interface:

```ts
export interface PlatformAdapter {
  id: "chatgpt" | "claude" | "qwen" | "doubao" | "deepseek";
  name: string;
  matches(url: URL): boolean;
  getConversationId(): string;
  scanDomNodes(): ConversationNode[];
  hydrateFromCapturedApi?(events: CapturedNetworkEvent[]): Promise<ConversationSnapshot>;
  fetchConversationList?(options: BatchListOptions): Promise<ConversationSummary[]>;
  fetchConversationDetail?(id: string): Promise<ConversationSnapshot>;
}
```

Platform adapters should own site-specific URL matching, DOM selectors, API payload interpretation, conversation list fetching, and conversation detail fetching.

The shared UI should never need to know whether a node came from ChatGPT DOM, Claude captured API data, or Qwen history hydration. It should receive normalized conversation data.

## Normalized Export Data

Exporters should consume a normalized conversation snapshot:

```ts
export interface ConversationSnapshot {
  platformId: string;
  conversationId: string;
  title: string;
  messages: ConversationMessage[];
  attachments: ExportAttachment[];
  createdAt?: string;
  updatedAt?: string;
}
```

Format exporters should implement:

```ts
export interface Exporter {
  format: "html" | "markdown" | "txt";
  export(snapshot: ConversationSnapshot): Promise<ExportFile[]>;
}
```

ZIP batch export should be a composition layer that packages exported files from one or more snapshots.

This keeps platform parsing separate from export rendering.

## Storage Design

`storage/extension-storage.ts` should be the only direct wrapper around `chrome.storage.local`.

It should support:

- Global settings.
- Platform-specific settings.
- Conversation node caches.
- Captured API event caches where useful.
- Batch-export transient state.
- One-time migration from old page `localStorage` keys when possible.

The first extension version should keep the current in-page settings panel instead of building a dedicated options page.

## Background Service Worker Responsibilities

The Manifest V3 service worker should handle:

- Cross-origin requests that replace `GM_xmlhttpRequest`.
- Managed downloads when browser download APIs are preferable to anchor-triggered downloads.
- Version metadata checks.
- Future extension lifecycle work.

The background worker should communicate only through typed messages defined in `messaging/protocol.ts`.

## Third-Party Dependencies

The userscript currently loads `markdown-it` through `@require`. The extension must package dependencies locally through the bundler.

No remote executable code should be required for the first extension version.

## Migration Strategy

The migration should happen in phases:

1. Create the extension project, Manifest V3 build, content script, injected script, background worker, messaging protocol, and storage wrapper.
2. Move shared utilities and UI shell code from `AIChat-Helper.user.js` into extension modules.
3. Move platform detection and DOM scanning into platform adapters.
4. Move page-world fetch, XHR, Blob, and object URL hooks into `injected/page-hooks.ts`.
5. Replace `GM_xmlhttpRequest` with background-worker message calls.
6. Replace `GM_getValue` and `GM_setValue` with `chrome.storage.local`.
7. Move HTML, Markdown, TXT, and ZIP export logic into exporters.
8. Validate each platform in Chrome or Edge developer mode.
9. Freeze the userscript as a migration reference and make `extension/dist` the active local build output.

Existing complex functions can be moved before they are deeply refactored. Behavioral preservation matters more than perfect internal shape during the first pass.

## Verification Plan

The first version should be considered successful when:

- `extension/dist` can be loaded as an unpacked extension in Chrome or Edge.
- The extension injects automatically on all five supported platforms.
- Conversation node navigation works on all five platforms.
- Search and reading-position helpers work on all five platforms.
- HTML, Markdown, and TXT export work for a single current conversation.
- ZIP batch export remains available where it is currently supported.
- Cross-origin request paths work through the background service worker.
- Stored settings survive page reloads.
- The extension build includes packaged dependencies and does not rely on Tampermonkey metadata.

## First-Version Constraints

- The first version is for local developer-mode loading.
- Permissions may be broader than the eventual store-ready version.
- The extension should be structured so permissions can be narrowed later.
- Store publication copy, privacy review, screenshots, and listing assets are deferred.
- Firefox compatibility is deferred.
- Userscript release generation is removed from the active workflow.
