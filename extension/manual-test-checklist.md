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
- [ ] Extension service worker logs no uncaught errors during export.
