# AI-Chat-Helper

一个用于主流 AI 聊天网站的用户脚本，提供对话节点导航与多格式导出能力。

## 功能简介

- 对话节点导航（快速定位问答轮次）
- 对话导出（PDF / Markdown / JSON / CSV / TXT）
- 支持多平台页面适配（如 ChatGPT、通义千问、豆包、DeepSeek）

## 安装教程（Tampermonkey）

### 1. 安装 Tampermonkey 扩展

1. 通过对应浏览器商店安装 Tampermonkey：
   - Microsoft Edge: [https://microsoftedge.microsoft.com/addons/detail/%E7%AF%A1%E6%94%B9%E7%8C%B4/iikmkjmpaadaobahmlepeloendndfphd?hl=zh-CN](https://microsoftedge.microsoft.com/addons/detail/%E7%AF%A1%E6%94%B9%E7%8C%B4/iikmkjmpaadaobahmlepeloendndfphd?hl=zh-CN)
   - Chrome: [https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=zh-CN&utm_source=ext_sidebar](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=zh-CN&utm_source=ext_sidebar)
   - Firefox: [https://addons.mozilla.org/zh-CN/firefox/addon/tampermonkey/?utm_source=addons.mozilla.org&utm_medium=referral&utm_content=search](https://addons.mozilla.org/zh-CN/firefox/addon/tampermonkey/?utm_source=addons.mozilla.org&utm_medium=referral&utm_content=search)
2. 安装完成后，在扩展管理页面确认 Tampermonkey 已启用。

### 2. 在 Edge 中开启开发者模式（重要）

Tampermonkey 在 Microsoft Edge 中要正常生效，通常需要在浏览器扩展页启用 **开发者模式**：

1. 打开 `edge://extensions/`
2. 打开右下角（或页面内）的 **开发人员模式 / 开发者模式** 开关。

### 3. 启用“允许用户脚本”（重要）

在 Edge 扩展管理中，找到 Tampermonkey，并启用“允许用户脚本”。

请注意以下风险提示（请原文阅读）：

> 此扩展能运行未经 Microsoft Edge 评审的代码，可能会使你的设备或数据面临风险。仅在你完全信任此扩展的情况下启用此扩展。

### 4. 安装本脚本

1. 安装并启用 Tampermonkey 后，直接访问：
   - [https://gitee.com/xcb157342/AI-Chat-Helper/raw/master/AIChat-Helper.user.js](https://gitee.com/xcb157342/AI-Chat-Helper/raw/master/AIChat-Helper.user.js)
2. 浏览器会自动唤起 Tampermonkey 安装页面，点击“安装”即可。
3. 刷新目标 AI 聊天页面，确认脚本已生效。

## 常见问题

- 脚本未生效：
  - 检查 Tampermonkey 扩展是否启用。
  - 检查 Edge 是否已开启开发者模式。
  - 检查 Tampermonkey 是否已开启“允许用户脚本”。
  - 检查脚本匹配站点（`@match`）是否包含当前页面。

- 导出 PDF 出现异常：
  - 确认浏览器未拦截弹窗。
  - 尝试刷新页面后重新导出。

## 免责声明

本项目仅供学习与效率提升使用。请遵守目标网站服务条款与相关法律法规。
