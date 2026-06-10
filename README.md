# AI-Chat-Helper

一个用于主流 AI 聊天网站的用户脚本，提供对话节点导航、阅读定位、搜索与对话导出能力。

## 功能简介

- 对话节点导航（快速定位问答轮次）
- 对话导出（HTML / Markdown / TXT）
- 批量导出历史会话，按会话标题打包为 ZIP
- 自动检查更新，并在更新弹窗中查看版本日志
- 支持多平台页面适配：ChatGPT、通义千问、豆包、DeepSeek、Claude

## 导出说明

当前导出格式统一为：

- HTML：直接生成可打开的 `.html` 文件，不再通过浏览器打印模拟 PDF。
- Markdown：适合归档、二次编辑或放入知识库。
- TXT：纯文本备份。

Claude 导出已做专项适配：

- 支持从 Claude API 消息结构中提取文本、图片、工具调用和文件附件。
- 支持 `visualize:show_widget` 这类 HTML Widget 的静态快照导出。
- Markdown 导出会尽量内嵌 Widget 快照，同时保留 HTML 附件链接。
- ZIP 导出中，Markdown 对 HTML 附件使用 `files/xxx.html` 相对路径。
- 导出前会移除 Claude 建议提示词按钮，例如 `sendPrompt(...)` 触发的快捷提问按钮。

## 安装教程（Tampermonkey）

### 1. 安装 Tampermonkey 扩展

1. 通过对应浏览器商店安装 Tampermonkey：
   - <img src="./assets/microsoft-edge.svg" alt="Microsoft Edge" width="18" /> [![Microsoft Edge | 安装 Tampermonkey](https://img.shields.io/badge/Microsoft%20Edge%C2%A0-%E5%AE%89%E8%A3%85%20Tampermonkey-0078D4?style=for-the-badge)](https://microsoftedge.microsoft.com/addons/detail/%E7%AF%A1%E6%94%B9%E7%8C%B4/iikmkjmpaadaobahmlepeloendndfphd?hl=zh-CN)
   - <img src="./assets/google-chrome.svg" alt="Google Chrome" width="18" /> [![Google Chrome | 安装 Tampermonkey](https://img.shields.io/badge/Google%20Chrome%C2%A0%C2%A0-%E5%AE%89%E8%A3%85%20Tampermonkey-4285F4?style=for-the-badge)](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=zh-CN&utm_source=ext_sidebar)
   - <img src="./assets/mozilla-firefox.svg" alt="Mozilla Firefox" width="18" /> [![Mozilla Firefox | 安装 Tampermonkey](https://img.shields.io/badge/Mozilla%20Firefox-%E5%AE%89%E8%A3%85%20Tampermonkey-FF7139?style=for-the-badge)](https://addons.mozilla.org/zh-CN/firefox/addon/tampermonkey/?utm_source=addons.mozilla.org&utm_medium=referral&utm_content=search)

2. 安装完成后，在扩展管理页面确认 Tampermonkey 已启用。

### 2. 在 Edge / Chrome 中开启开发者模式（重要）

Tampermonkey 在 Microsoft Edge 和 Chrome 中要正常生效，通常需要在浏览器扩展页启用 **开发者模式**：

1. Microsoft Edge：打开 `edge://extensions/`，开启页面中的 **开发人员模式** 开关。
2. Google Chrome：打开 `chrome://extensions/`，开启页面中的 **开发者模式** 开关。

### 3. 启用“允许用户脚本”（重要）

在 Edge 扩展管理中，找到 Tampermonkey，并启用“允许用户脚本”。

请注意以下风险提示（请原文阅读）：

> 此扩展能运行未经 Microsoft Edge 评审的代码，可能会使你的设备或数据面临风险。仅在你完全信任此扩展的情况下启用此扩展。

### 4. 安装本脚本

1. 安装并启用 Tampermonkey 后，直接访问：

   [![安装 AI-Chat-Helper 脚本](https://img.shields.io/badge/GitHub-一键安装%20AI--Chat--Helper-1E80FF?style=for-the-badge&logo=github&logoColor=white)](https://github.com/yixing233/AIChat-Helper/raw/master/AIChat-Helper.user.js)

2. 浏览器会自动唤起 Tampermonkey 安装页面，点击“安装”即可。
3. 刷新目标 AI 聊天页面，确认脚本已生效。

## 常见问题

- 脚本未生效：
  - 检查 Tampermonkey 扩展是否启用。
  - 检查 Edge 是否已开启开发者模式。
  - 检查 Tampermonkey 是否已开启“允许用户脚本”。
  - 检查脚本匹配站点（`@match`）是否包含当前页面。

- Claude 流程图或交互演示没有出现在导出内容中：
  - 优先刷新页面后重新导出，确保脚本能重新读取 Claude API 消息。
  - 如果 Widget 只以 HTML 附件形式存在，脚本会尝试从附件 URL 或近期下载缓存恢复内容。
  - 跨域 iframe 内容无法直接读取时，导出会优先使用 API 中的 `widget_code` 或已缓存 HTML。

- 为什么不再提供 PDF / JSON / CSV：
  - 原 PDF 入口实际是可打印 HTML，现已改为直接导出 HTML。
  - JSON / CSV 已移除，避免平台差异导致结构丢失或内容不可读。

## 免责声明

本项目仅供学习与效率提升使用。请遵守目标网站服务条款与相关法律法规。
