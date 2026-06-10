import {
  supportedPlatforms,
  type NormalizedConversation,
  type UpsertConversationRequest,
} from "@remote/shared";

export function badRequestError(message: string) {
  return {
    ok: false as const,
    code: "INVALID_PAYLOAD",
    message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalAttachmentArray(value: unknown) {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!isRecord(item)) return false;
    return ["name", "url", "mimeType"].every((key) =>
      item[key] === undefined || typeof item[key] === "string",
    );
  });
}

function isOptionalToolCallArray(value: unknown) {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!isRecord(item)) return false;
    if (!isString(item.type)) return false;
    return item.name === undefined || typeof item.name === "string";
  });
}

export function parsePositiveInteger(
  value: unknown,
  fallback: number,
  max: number,
) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function isNormalizedConversation(
  value: unknown,
): value is NormalizedConversation {
  if (!isRecord(value)) return false;
  if (!supportedPlatforms.includes(value.platform as never)) return false;
  if (!isString(value.sourceConversationId)) return false;
  if (!isString(value.title)) return false;
  if (!isOptionalString(value.url)) return false;
  if (!isOptionalString(value.createdAt)) return false;
  if (!isOptionalString(value.updatedAt)) return false;
  const messageCount = value.messageCount;
  if (typeof messageCount !== "number") return false;
  if (!Number.isInteger(messageCount) || messageCount < 0) return false;
  if (!Array.isArray(value.messages)) return false;

  return value.messages.every((message, index) => {
    if (!isRecord(message)) return false;
    if (!isString(message.id)) return false;
    if (!["system", "user", "assistant", "tool"].includes(String(message.role))) {
      return false;
    }
    if (!isOptionalString(message.text)) return false;
    if (!isOptionalString(message.html)) return false;
    if (!isOptionalString(message.parentId)) return false;
    if (!isOptionalString(message.createdAt)) return false;
    if (!isOptionalAttachmentArray(message.attachments)) return false;
    if (!isOptionalToolCallArray(message.toolCalls)) return false;
    const sequence = message.sequence;
    if (typeof sequence !== "number") return false;
    if (!Number.isInteger(sequence)) return false;
    return sequence >= 0 || sequence === index + 1;
  });
}

export function isUpsertConversationRequest(
  value: unknown,
): value is UpsertConversationRequest {
  if (!isRecord(value)) return false;
  if (!isString(value.deviceId)) return false;
  if (!isString(value.deviceName)) return false;
  if (!isString(value.contentHash)) return false;
  return isNormalizedConversation(value.conversation);
}
