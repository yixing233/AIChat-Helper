import type { PlatformId, PlatformMatch } from "./types";

const platformNames: Record<PlatformId, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  qwen: "Tongyi Qianwen",
  doubao: "Doubao",
  deepseek: "DeepSeek"
};

export function detectPlatform(url: URL): PlatformMatch | null {
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  if ((host === "chatgpt.com" || host.endsWith(".chatgpt.com")) && /^\/(?:$|c\/[a-z0-9-]+\/?)$/i.test(path)) {
    return { id: "chatgpt", name: platformNames.chatgpt };
  }

  if (host === "claude.ai" && /^\/chat(?:\/[0-9a-f-]{36})?\/?$/i.test(path)) {
    return { id: "claude", name: platformNames.claude };
  }

  if (host === "www.qianwen.com" && /^\/(?:$|chat(?:\/[a-z0-9_-]{8,})?\/?)$/i.test(path)) {
    return { id: "qwen", name: platformNames.qwen };
  }

  if (host === "www.doubao.com" && /^\/chat(?:\/[^/?#]+)?\/?$/i.test(path)) {
    return { id: "doubao", name: platformNames.doubao };
  }

  if (host === "chat.deepseek.com" && /^\/(?:$|a\/chat\/s(?:\/[0-9a-f-]{36})?\/?|chat(?:\/[0-9a-f-]{36})?\/?)$/i.test(path)) {
    return { id: "deepseek", name: platformNames.deepseek };
  }

  return null;
}
