export interface BatchTimestamp {
  value?: string;
  text?: string;
}

export function normalizeBatchTimestamp(raw: unknown): BatchTimestamp {
  if (raw == null || raw === "") return {};

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return timestampFromMillis(raw > 1e12 ? raw : raw * 1000);
  }

  const value = String(raw).trim();
  if (!value) return {};

  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const numeric = Number(value);
    const integerPart = value.split(".")[0] || "";
    const millis = integerPart.length <= 10 ? numeric * 1000 : numeric;
    const text = formatTimestampText(millis);
    return text ? { value, text } : { value, text: value };
  }

  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return { value, text: new Date(parsed).toLocaleString() };

  return { value, text: value };
}

function timestampFromMillis(millis: number): BatchTimestamp {
  const text = formatTimestampText(millis);
  if (!text) return {};
  return {
    value: new Date(millis).toISOString(),
    text
  };
}

function formatTimestampText(millis: number): string {
  const date = new Date(millis);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "";
}
