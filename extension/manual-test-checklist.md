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
- [ ] Refresh updates the node list.
- [ ] Export HTML triggers a browser download.
- [ ] Export Markdown triggers a browser download.
- [ ] Export TXT triggers a browser download.
- [ ] Export ZIP triggers a browser download.
- [ ] Current conversation export uses API-hydrated messages after the page has loaded network responses.
- [ ] ChatGPT page shows the Batch action.
- [ ] Claude page shows the Batch action when `lastActiveOrg` is available.
- [ ] DeepSeek page shows the Batch action.
- [ ] ChatGPT Batch export downloads one ZIP containing recent conversations.
- [ ] Claude Batch export downloads one ZIP containing recent conversations.
- [ ] DeepSeek Batch export downloads one ZIP containing recent conversations.
- [ ] Tongyi Qianwen and Doubao do not show Batch until list/detail adapters are added.
- [ ] Extension service worker logs no uncaught errors during export.
