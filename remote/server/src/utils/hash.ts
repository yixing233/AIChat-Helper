import { createHash } from "node:crypto";
import type { NormalizedConversation } from "@remote/shared";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function hashConversationPayload(conversation: NormalizedConversation) {
  return createHash("sha256").update(stableStringify(conversation)).digest("hex");
}
