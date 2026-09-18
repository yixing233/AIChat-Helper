# AI-Chat-Helper（已迁移归档）

> **本仓库已停止维护，请前往新仓库：[yixing233/GPTCraber](https://github.com/yixing233/GPTCraber)**

`master` 分支现已清空为指引页，历史代码保留在 [归档分支](#旧代码在哪里) 中。

## 新仓库：GPTCraber 🦀

**地址：<https://github.com/yixing233/GPTCraber>**

GPTCraber 是一组按平台拆分的 Tampermonkey / Violentmonkey 用户脚本，把 AI 对话导出为结构化 Markdown，图片与上传文档尽量保存到本地。各平台脚本相互独立，按需安装即可。

### 脚本列表

| 脚本 | 平台 | 匹配域名 |
| --- | --- | --- |
| [chatgpt-md-exporter.user.js](https://github.com/yixing233/GPTCraber/blob/main/chatgpt-md-exporter.user.js) | ChatGPT | `chatgpt.com`、`chat.openai.com` |
| [chatgpt-latex-smart-fix.user.js](https://github.com/yixing233/GPTCraber/blob/main/chatgpt-latex-smart-fix.user.js) | ChatGPT 公式渲染 | `chatgpt.com`、`chat.openai.com` |
| [doubao-md-exporter.user.js](https://github.com/yixing233/GPTCraber/blob/main/doubao-md-exporter.user.js) | 豆包 | `www.doubao.com` |
| [deepseek-md-exporter.user.js](https://github.com/yixing233/GPTCraber/blob/main/deepseek-md-exporter.user.js) | DeepSeek | `chat.deepseek.com` |
| [tongyi-md-exporter.user.js](https://github.com/yixing233/GPTCraber/blob/main/tongyi-md-exporter.user.js) | 通义千问 | `www.qianwen.com`、`www.tongyi.com`、`tongyi.aliyun.com` |
| [gemini-md-exporter.user.js](https://github.com/yixing233/GPTCraber/blob/main/gemini-md-exporter.user.js) | Gemini | `gemini.google.com` |

安装步骤、功能对照表与常见问题详见新仓库的 [README](https://github.com/yixing233/GPTCraber#readme)。

### 主要能力

- 勾选回合导出当前会话，导出前可预览渲染后的 Markdown
- 多会话批量导出并打包为 ZIP，支持近 7 / 15 / 30 天与自定义日期区间筛选
- 图片、上传文档本地化，联网引用来源保留
- 思考过程可选导出（豆包 / DeepSeek / 通义千问）
- 单条回复快捷导出（回复栏 🦀 按钮）
- 全部处理在本地浏览器完成，不上传第三方

## 旧代码在哪里

原 `master` 分支的完整内容已迁移至 `archive` 分支，历史提交与文件均保留。另有两个方向分支：

| 分支 | 内容 |
| --- | --- |
| [`archive`](https://github.com/yixing233/AIChat-Helper/tree/archive) | 原 `master` 快照：`AIChat-Helper.user.js`（v2.0.15 用户脚本）、`extension/`（MV3 扩展）、`remote/`（同步服务）、`assets/`、`docs/` |
| [`tampermonkey-script`](https://github.com/yixing233/AIChat-Helper/tree/tampermonkey-script) | 用户脚本方向的开发分支 |
| [`browser-extension`](https://github.com/yixing233/AIChat-Helper/tree/browser-extension) | 浏览器扩展方向的开发分支 |

查阅旧实现时检出归档分支即可：

```bash
git clone https://github.com/yixing233/AIChat-Helper.git
cd AIChat-Helper
git checkout archive
```

注意：原脚本 `AIChat-Helper.user.js` 的 `@updateURL` 指向本仓库 `master` 分支，该文件已不在 `master` 中，**已安装的旧脚本不会再收到更新**，请改用 GPTCraber 中的对应脚本。

## 为什么迁移

原 `AIChat-Helper.user.js` 由单个文件同时承担五个平台的适配，体积与维护成本持续上升；浏览器扩展与同步服务两条路线也未能落地为稳定的发布形态。GPTCraber 改为按平台拆分独立脚本，任一平台改版时只影响对应脚本，更易维护与验证。

## License

旧代码（`archive` 等分支）沿用 [GPL-3.0](./LICENSE)。新仓库 GPTCraber 使用 MIT 协议。
