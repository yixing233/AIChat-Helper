# AI Chat Helper Extension

This is the active Chrome and Microsoft Edge Manifest V3 version of AI Chat Helper.

## Development

```powershell
npm install
npm test
npm run typecheck
npm run build
```

Load `E:\Code\AI-Chat-Nodes\extension\dist` as an unpacked extension from `chrome://extensions` or `edge://extensions`.

## Current Migration State

The extension currently includes:

- Manifest V3 build output
- content script injection
- page-world network capture hooks
- background request and download handlers
- platform adapter registry for ChatGPT, Claude, Tongyi Qianwen, Doubao, and DeepSeek
- an in-page panel with current-conversation export
- HTML, Markdown, TXT, and stored ZIP export modules
- captured API hydration for current conversations on ChatGPT, Claude, Tongyi Qianwen, Doubao, and DeepSeek
- a minimal batch export entry point for adapters that expose conversation list/detail APIs

Current batch coverage:

- ChatGPT: recent conversation list and detail fetching through `/backend-api/conversations` and `/backend-api/conversation/:id`
- Claude: recent conversation list and detail fetching through `/api/organizations/{org}/chat_conversations_v2` and `/chat_conversations/:id`
- DeepSeek: recent conversation list and detail fetching through `/api/v0/chat_session/fetch_page` and `/api/v0/chat/history_messages`
- Tongyi Qianwen and Doubao: current conversation export only until list/detail adapters are added

The old Tampermonkey userscript remains as migration reference material.
