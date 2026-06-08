export interface DownloadOptions {
  url: string;
  filename: string;
  saveAs: boolean;
}

export function createDownloadOptions(url: string, filename: string): DownloadOptions {
  return {
    url,
    filename,
    saveAs: false
  };
}

export function createDownloadDataUrl(content: string | Uint8Array | number[], mimeType: string): string {
  const bytes = normalizeBytes(content);
  return `data:${mimeType || "application/octet-stream"};base64,${toBase64(bytes)}`;
}

function normalizeBytes(content: string | Uint8Array | number[]): Uint8Array {
  if (typeof content === "string") return new TextEncoder().encode(content);
  if (content instanceof Uint8Array) return content;
  return new Uint8Array(content);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
