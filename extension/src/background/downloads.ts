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

export function createDownloadDataUrl(content: string | Uint8Array, mimeType: string): string {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  return `data:${mimeType || "application/octet-stream"};base64,${toBase64(bytes)}`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
