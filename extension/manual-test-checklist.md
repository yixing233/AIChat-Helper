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
- [ ] Clicking a node scrolls the matching conversation message into view.
- [ ] Search filters the node list by typed text.
- [ ] Search matches are highlighted, and the current Prev/Next result has a distinct active state.
- [ ] Search Prev/Next cycles through matching nodes and scrolls each result to the reading line.
- [ ] Visible node limit setting filters the rendered node count and survives reload.
- [ ] Existing `ai-nodes-visible-limit` localStorage value migrates to extension storage once.
- [ ] Reading line setting moves the on-page reading guide and survives reload.
- [ ] Existing `ai-nodes-reading-line` localStorage value migrates to extension storage once.
- [ ] Refresh updates the node list.
- [ ] Export HTML triggers a browser download.
- [ ] Export Markdown triggers a browser download.
- [ ] Export TXT triggers a browser download.
- [ ] Export ZIP triggers a browser download.
- [ ] Current conversation export shows progress or failure status in the panel.
- [ ] Current conversation export uses API-hydrated messages after the page has loaded network responses.
- [ ] ChatGPT page shows the Batch action.
- [ ] Claude page shows the Batch action when `lastActiveOrg` is available.
- [ ] DeepSeek page shows the Batch action.
- [ ] Tongyi Qianwen page shows the Batch action.
- [ ] Doubao page shows the Batch action.
- [ ] ChatGPT Batch export downloads one ZIP containing recent conversations.
- [ ] Claude Batch export downloads one ZIP containing recent conversations.
- [ ] DeepSeek Batch export downloads one ZIP containing recent conversations.
- [ ] Tongyi Qianwen Batch export downloads one ZIP containing recent conversations.
- [ ] Doubao Batch export downloads one ZIP containing recent conversations.
- [ ] Batch export shows progress or failure status in the panel.
- [ ] Extension service worker logs no uncaught errors during export.
