# AI Chat Helper Extension

This is the active Chrome and Microsoft Edge Manifest V3 version of AI Chat Helper.

## Development

```powershell
npm install
npm test
npm run typecheck
npm run build
npm run smoke:extension
```

Load `E:\Code\AI-Chat-Nodes\extension\dist` as an unpacked extension from `chrome://extensions` or `edge://extensions`.

`npm run smoke:extension` launches Microsoft Edge with `extension\dist`, serves mocked ChatGPT, Claude, Tongyi Qianwen, Doubao, and DeepSeek pages through Playwright, verifies that the content script renders each platform panel and node list with Tampermonkey-style panel tokens, and confirms ChatGPT HTML plus all supported batch ZIP exports reach Chrome's downloads API.

## Current Migration State

The extension currently includes:

- Manifest V3 build output
- content script injection
- page-world network capture hooks
- background request and automatic download handlers that work in Manifest V3 service workers
- platform adapter registry for ChatGPT, Claude, Tongyi Qianwen, Doubao, and DeepSeek
- an in-page panel with current-conversation export
- node search, reading line, draggable panel position, visible node limit, dot gap, and platform-specific settings controls
- HTML, Markdown, TXT, and stored ZIP export modules, including attachment metadata and inline attachment content files when available
- captured API hydration for current conversations on ChatGPT, Claude, Tongyi Qianwen, Doubao, and DeepSeek
- selectable, configurable batch export with selected-count and select-all controls for all supported adapters that expose conversation list/detail APIs
- per-conversation batch export failure isolation, so successful conversations still download when a selected item fails
- Tampermonkey-style main panel sizing, glass surface, platform favicon card, switch controls, and icon action colors
- Tampermonkey-style batch export modal sizing, selection controls, list framing, and overlay treatment

Current batch coverage:

- ChatGPT: recent conversation list and detail fetching through `/backend-api/conversations` and `/backend-api/conversation/:id`
- Claude: recent conversation list and detail fetching through `/api/organizations/{org}/chat_conversations_v2` and `/chat_conversations/:id`
- DeepSeek: recent conversation list and detail fetching through `/api/v0/chat_session/fetch_page` and `/api/v0/chat/history_messages`
- Tongyi Qianwen: recent conversation list and detail fetching through `https://chat2-api.qianwen.com/api/v2/session/page/list` and `https://chat2-api.qianwen.com/api/v1/session/msg/list`
- Doubao: recent conversation list and detail fetching through `/im/chain/recent_conv` and `/im/chain/single`

The old Tampermonkey userscript remains as migration reference material.
