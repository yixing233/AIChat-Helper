import MarkdownIt from "markdown-it";
import type { ConversationMessage, ConversationSnapshot, Exporter } from "../shared/types";
import { escapeHtml, formatAssistantName, formatAttachmentHtml, formatDeepSeekMetadataHtml, formatMessageExportText, formatRepresentedAttachmentHtmlBlock, formatRepresentedClaudeImageHtmlBlock, getChatGPTImagePreviewModel, getMessageAttachmentsForExport, isAttachmentRepresentedInText, isClaudeImageAttachmentRepresentedInText, replaceClaudeImageAttachmentBlock, replaceRepresentedAttachmentBlock, safeFileName } from "./shared";

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});
const defaultValidateLink = markdown.validateLink.bind(markdown);
markdown.validateLink = (url) => {
  const value = String(url || "").trim();
  if (/^(?:javascript|data|vbscript):/i.test(value)) return false;
  return defaultValidateLink(value);
};

const defaultLinkOpen = markdown.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noreferrer");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

const defaultTableOpen = markdown.renderer.rules.table_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
markdown.renderer.rules.table_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrJoin("class", "m-md-table");
  return defaultTableOpen(tokens, idx, options, env, self);
};

const defaultImage = markdown.renderer.rules.image || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet("loading", "lazy");
  return defaultImage(tokens, idx, options, env, self);
};

export const htmlExporter: Exporter = {
  format: "html",
  async export(snapshot) {
    const assistantName = formatAssistantName(snapshot);
    const groups = groupMessagesForPrintableHtml(snapshot.messages);
    const pages = groups.map((group, index) => {
      const deepSeekMeta = index === 0 ? formatDeepSeekMetadataHtml(snapshot) : "";
      const messages = group.map((message) => renderPrintableMessage(snapshot, message, assistantName)).join("\n");
      return `
        <div class="page">
          <div class="header">
            <div class="title">第 ${index + 1} 轮对话</div>
            <div class="platform">${escapeHtml(assistantName)}</div>
            <div class="ver">AI Chat Helper Exporter v1.0.0</div>
          </div>
          ${deepSeekMeta}
          <div style="flex:1;">
            ${messages}
          </div>
          <div class="footer">Exported via AI-Chat-Helper - ${escapeHtml(new Date().toLocaleString())}</div>
        </div>
      `.trim();
    }).join("\n");
    const globalAttachments = snapshot.attachments.length
      ? `<div class="page"><div class="header"><div class="title">附件</div><div class="platform">${escapeHtml(assistantName)}</div><div class="ver">AI Chat Helper Exporter v1.0.0</div></div><div class="msg assistant"><div class="role-badge">附件</div><div class="text"><ul>${snapshot.attachments.map(formatAttachmentHtml).join("")}</ul></div></div></div>`
      : "";
    const content = [pages, globalAttachments].filter(Boolean).join("\n") || `<div class="page"><div class="header"><div class="title">第 1 轮对话</div><div class="platform">${escapeHtml(assistantName)}</div><div class="ver">AI Chat Helper Exporter v1.0.0</div></div><div class="footer">Exported via AI-Chat-Helper - ${escapeHtml(new Date().toLocaleString())}</div></div>`;
    const mathScripts = `<script>window.MathJax={tex:{inlineMath:[["\\\\(","\\\\)"],["$","$"]],displayMath:[["\\\\[","\\\\]"],["$$","$$"]]},options:{skipHtmlTags:["script","noscript","style","textarea","pre","code"]}};</script><script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>`;

    return [{
      path: `${safeFileName(snapshot.title)}.html`,
      mimeType: "text/html;charset=utf-8",
      content: `<html><head><meta charset="utf-8"><title>对话记录导出 - ${escapeHtml(assistantName)}</title><style>${printableExportCss()}</style></head><body>${content}${mathScripts}</body></html>`
    }];
  }
};

function groupMessagesForPrintableHtml(messages: ConversationMessage[]): ConversationMessage[][] {
  const groups: ConversationMessage[][] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const turn = [messages[index]];
    if (messages[index].role === "user") {
      while (index + 1 < messages.length && messages[index + 1].role === "assistant") {
        turn.push(messages[index + 1]);
        index += 1;
      }
    }
    groups.push(turn);
  }
  return groups;
}

function renderPrintableMessage(snapshot: ConversationSnapshot, message: ConversationMessage, assistantName: string): string {
  const roleBadge = message.role === "user" ? "🧑 USER QUESTION" : `🤖 ${assistantName.toUpperCase()} RESPONSE`;
  return `
    <div class="msg ${escapeHtml(message.role)}">
      <div class="role-badge">${escapeHtml(roleBadge)}</div>
      <div class="text">${renderMessageExportHtml(snapshot, message)}</div>
    </div>
  `.trim();
}

export function renderMessageExportHtml(snapshot: ConversationSnapshot, message: ConversationMessage): string {
  const chatgptImageHtml = renderChatGPTImageMessageHtml(snapshot, message);
  if (chatgptImageHtml) {
    const exportAttachments = getMessageAttachmentsForExport(snapshot, message, "html");
    const attachments = exportAttachments.length
      ? `<ul>${exportAttachments.map(formatAttachmentHtml).join("")}</ul>`
      : "";
    return `${chatgptImageHtml}${attachments}`;
  }

  const replacements: Array<{ token: string; html: string }> = [];
  let text = formatMessageExportText(snapshot, message, "html");
  let imageSerial = 0;

  (message.attachments || []).forEach((attachment, index) => {
    if (snapshot.platformId !== "claude") return;
    if (!isClaudeImageAttachmentRepresentedInText(message.text, attachment, imageSerial + 1)) return;
    imageSerial += 1;
    if (!isClaudeImageAttachmentRepresentedInText(text, attachment, imageSerial)) return;
    const token = `AI_CHAT_HELPER_CLAUDE_IMAGE_HTML_${index}`;
    text = replaceClaudeImageAttachmentBlock(text, attachment, token, imageSerial);
    replacements.push({ token, html: formatRepresentedClaudeImageHtmlBlock(message.text, attachment, imageSerial) });
  });

  (message.attachments || []).forEach((attachment, index) => {
    if (snapshot.platformId !== "claude" || !isAttachmentRepresentedInText(text, attachment)) return;
    const token = `AI_CHAT_HELPER_ATTACHMENT_HTML_${index}`;
    text = replaceRepresentedAttachmentBlock(text, attachment, token);
    replacements.push({ token, html: formatRepresentedAttachmentHtmlBlock(attachment) });
  });

  let html = renderMessageMarkdown(text, snapshot.platformId);
  replacements.forEach(({ token, html: replacementHtml }) => {
    html = html
      .replace(new RegExp(`<p>\\s*${token}\\s*</p>`, "g"), replacementHtml)
      .split(token)
      .join(replacementHtml);
  });

  const exportAttachments = getMessageAttachmentsForExport(snapshot, message, "html");
  const attachments = exportAttachments.length
    ? `<ul>${exportAttachments.map(formatAttachmentHtml).join("")}</ul>`
    : "";
  return `${html}${attachments}`;
}

function renderChatGPTImageMessageHtml(snapshot: ConversationSnapshot, message: ConversationMessage): string {
  if (snapshot.platformId !== "chatgpt") return "";
  if (message.role !== "assistant" && message.role !== "user") return "";

  const preview = getChatGPTImagePreviewModel(message);
  if (!preview) return "";

  const textBlock = message.role === "user" && preview.text
    ? `<div style="margin-top:8px;font-size:13px;line-height:1.6;color:#334155;">${renderMessageMarkdown(preview.text, snapshot.platformId)}</div>`
    : "";
  return `<div class="m-preview-media"><img src="${escapeHtml(preview.url)}" alt="${escapeHtml(preview.alt)}" loading="lazy" style="max-width:100%;max-height:320px;border-radius:12px;display:block;margin-bottom:8px;">${textBlock}</div>`;
}

function printableExportCss(): string {
  return `
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 0; margin: 0; color: #1a202c; background: #f8fafc; }
    .page { padding: 50px 60px; page-break-after: always; min-height: 90vh; display: flex; flex-direction: column; max-width: 900px; margin: 0 auto; background: #fff; box-shadow: 0 0 40px rgba(0,0,0,0.05); }
    .page:last-child { page-break-after: auto; }
    .header { border-bottom: 3px solid #3b82f6; padding-bottom: 16px; margin-bottom: 40px; color: #1e40af; display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; column-gap: 12px; }
    .header .title { font-size: 24px; font-weight: 800; letter-spacing: 0; }
    .header .platform { justify-self: center; font-size: 12px; font-weight: 700; color: #1d4ed8; letter-spacing: 0; padding: 4px 10px; border-radius: 999px; background: #eff6ff; border: 1px solid #bfdbfe; white-space: nowrap; }
    .header .ver { justify-self: end; font-size:12px; color:#94a3b8; font-weight:500; text-align: right; }
    .msg { margin-bottom: 25px; padding: 24px; border-radius: 16px; line-height: 1.6; position: relative; border: 1px solid #e2e8f0; }
    .user { background: #f0f9ff; border-color: #bae6fd; }
    .assistant { background: #ffffff; border-color: #f1f5f9; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .role-badge { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; margin-bottom: 14px; text-transform: uppercase; color: #64748b; }
    .user .role-badge { color: #0369a1; }
    .assistant .role-badge { color: #4b5563; }
    .text { font-size: 14px; color: #334155; line-height: 1.7; word-break: break-word; }
    .text h1, .text h2, .text h3, .text h4, .text h5, .text h6 { margin: 16px 0 10px; color: #0f172a; line-height: 1.35; }
    .text h1 { font-size: 22px; }
    .text h2 { font-size: 20px; }
    .text h3 { font-size: 18px; }
    .text h4 { font-size: 16px; }
    .text h5 { font-size: 15px; }
    .text h6 { font-size: 14px; }
    .text hr { border: none; border-top: 1px solid #cbd5e1; margin: 16px 0; }
    pre, .qk-markdown pre, .markdown-body pre, [class*="code-block"] pre { background: #1e1e1e !important; color: #d4d4d4 !important; padding: 16px; border-radius: 10px; overflow-x: auto; font-family: "Consolas", "Monaco", "Courier New", monospace; margin: 15px 0; border: 1px solid #333; display: block; font-size: 13px; }
    code { background: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-family: "Consolas", "Monaco", "Courier New", monospace; color: #e11d48; }
    pre code { background: none; padding: 0; color: inherit; }
    .text a { color: #1d4ed8; text-decoration: underline; }
    .math-inline { white-space: normal; max-width: 100%; }
    .math-display { margin: 8px 0; padding: 0; background: transparent; border-left: none; overflow-x: auto; text-align: left; }
    table, .pdf-table { border-collapse: collapse; width: 100%; max-width: 100%; border: 1px solid #e2e8f0; font-size: 13px; table-layout: fixed; }
    th, td { border: 1px solid #e2e8f0; padding: 9px 10px; text-align: left; vertical-align: top; white-space: normal; word-break: break-word; overflow-wrap: anywhere; line-height: 1.55; }
    th { background: #f8fafc; font-weight: 700; }
    ul, ol { padding-left: 24px; margin: 10px 0; }
    p { margin: 12px 0; }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    figure { margin: 14px 0 18px; }
    figcaption { margin-top: 8px; font-size: 12px; color: #475569; text-align: center; }
    .m-preview-media img { max-width: 100%; max-height: 320px; width: auto; height: auto; object-fit: contain; }
    .claude-image-block { margin: 14px 0 18px; padding: 12px; border: 1px solid #dbeafe; border-radius: 12px; background: #f8fbff; }
    .claude-image-block img { display: block; max-width: 100%; max-height: 480px; width: auto; height: auto; margin: 0 auto; border-radius: 8px; border: 1px solid #dbeafe; background: #fff; object-fit: contain; }
    .claude-image-block figcaption { margin-top: 8px; font-size: 12px; color: #475569; text-align: center; }
    .claude-inline-svg { display: flex; justify-content: center; overflow-x: auto; }
    .claude-inline-svg svg { max-width: 100%; height: auto; }
    .footer { margin-top: auto; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: right; font-size: 11px; color: #94a3b8; }
    @page { margin: 10mm; }
    @media print {
      html, body { background: #fff; margin: 0; padding: 0; }
      .page { box-shadow: none; padding: 24px; margin: 0 auto; width: 100%; max-width: 185mm; }
      table, .pdf-table { width: 100%; min-width: 0; max-width: 100%; table-layout: fixed; font-size: 12px; }
    }
  `;
}

export function renderMessageMarkdown(text: string, platformId?: ConversationSnapshot["platformId"]): string {
  const tokens: Array<{ key: string; html: string; block: boolean }> = [];
  const source = platformId === "chatgpt"
    ? normalizeChatGPTMarkdownForHtml(text)
    : platformId
      ? normalizeNonChatGPTMarkdownForHtml(text)
      : text;
  const tokenized = tokenizeMath(source || "", tokens);
  let html = markdown.render(tokenized).trim();
  tokens.forEach((token) => {
    if (token.block) html = html.replace(`<p>${token.key}</p>`, token.html);
    html = html.split(token.key).join(token.html);
  });
  if (platformId === "chatgpt") {
    html = html.replace(/(<code\b[^>]*\bclass=")language-([^"]+)/g, "$1lang-$2");
  }
  return html;
}

function normalizeChatGPTMarkdownForHtml(text: string): string {
  return normalizeChatGPTMathText(normalizeMarkdownWhitespaceForHtml(text));
}

function normalizeMarkdownWhitespaceForHtml(text: string): string {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => String(line || "").replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeChatGPTMathText(text: string): string {
  return String(text || "")
    .replace(/\\\\\\\(/g, "\\(")
    .replace(/\\\\\\\)/g, "\\)")
    .replace(/\\\\\\\[/g, "\\[")
    .replace(/\\\\\\\]/g, "\\]")
    .replace(/\$\$\s*\n/g, () => "$$\n")
    .replace(/\n\s*\$\$/g, () => "\n$$");
}

function tokenizeMath(text: string, tokens: Array<{ key: string; html: string; block: boolean }>): string {
  const addToken = (html: string, block: boolean) => {
    const key = `AI_MATH_TOKEN_${tokens.length}`;
    tokens.push({ key, html, block });
    return key;
  };

  return String(text || "")
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, expression: string) => {
      return addToken(`<div class="math-display">\\[${escapeHtml(expression.trim())}\\]</div>`, true);
    })
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, expression: string) => {
      return addToken(`<div class="math-display">\\[${escapeHtml(expression.trim())}\\]</div>`, true);
    })
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, expression: string) => {
      return addToken(`<span class="math-inline">\\(${escapeHtml(expression.trim())}\\)</span>`, false);
    })
    .replace(/\$([^$\n]+)\$/g, (_, expression: string) => {
      return addToken(`<span class="math-inline">\\(${escapeHtml(expression.trim())}\\)</span>`, false);
    });
}

function normalizeNonChatGPTMarkdownForHtml(text: string): string {
  return normalizeMarkdownWhitespaceForHtml(text)
    .split("\n")
    .map(normalizeNonChatGPTMarkdownLine)
    .join("\n")
    .trim();
}

function normalizeNonChatGPTMarkdownLine(line: string): string {
  let out = String(line || "").replace(/[ \t]+$/g, "");
  out = repairSplitMarkdownHeadingMarkers(out);
  return out
    .replace(/^\s*(?:-\s+--+|--+)\s*$/g, "---")
    .replace(/^\s*(?:-\s*){2,}\s*$/g, "---")
    .replace(/^(\s*#{1,6})(?!#)(?=\S)/, "$1 ")
    .replace(/^(\s*[-*+])(?=\S)/, "$1 ")
    .replace(/^(\s*\d+[.)])(?=\S)/, "$1 ");
}

function repairSplitMarkdownHeadingMarkers(line: string): string {
  return String(line || "").replace(/^(\s*)((?:#\s*){2,6})(\S.*)$/, (_match, indent: string, marks: string, rest: string) => {
    const level = Math.min((marks.match(/#/g) || []).length, 6);
    return `${indent}${"#".repeat(level)} ${String(rest || "").trimStart()}`;
  });
}
