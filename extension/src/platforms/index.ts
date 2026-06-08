import type { PlatformAdapter } from "../shared/types";
import { chatgptAdapter } from "./chatgpt/adapter";
import { claudeAdapter } from "./claude/adapter";
import { deepseekAdapter } from "./deepseek/adapter";
import { doubaoAdapter } from "./doubao/adapter";
import { qwenAdapter } from "./qwen/adapter";

export const platformAdapters: PlatformAdapter[] = [
  chatgptAdapter,
  claudeAdapter,
  qwenAdapter,
  doubaoAdapter,
  deepseekAdapter
];

export function getPlatformAdapter(url: URL): PlatformAdapter | null {
  return platformAdapters.find((adapter) => adapter.matches(url)) || null;
}
