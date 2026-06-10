import { createCapturedNetworkEventFactory } from "./captured-events";
import type { CapturedNetworkEvent } from "../shared/types";

const INJECTED_MESSAGE_SOURCE = "ai-chat-helper:injected";
const createCapturedNetworkEvent = createCapturedNetworkEventFactory();

function parseHeadersObject(headersLike: HeadersInit | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headersLike) return out;

  if (typeof Headers === "function" && headersLike instanceof Headers) {
    headersLike.forEach((value, key) => {
      out[String(key).toLowerCase()] = String(value);
    });
    return out;
  }

  if (Array.isArray(headersLike)) {
    headersLike.forEach((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) return;
      out[String(pair[0]).toLowerCase()] = String(pair[1]);
    });
    return out;
  }

  Object.entries(headersLike).forEach(([key, value]) => {
    if (value == null) return;
    out[String(key).toLowerCase()] = String(value);
  });
  return out;
}

function getFetchRequestHeaders(input: RequestInfo | URL, init?: RequestInit): Record<string, string> {
  const inputHeaders = typeof Request === "function" && input instanceof Request
    ? parseHeadersObject(input.headers)
    : {};
  return {
    ...inputHeaders,
    ...parseHeadersObject(init?.headers)
  };
}

function nonEmptyHeaders(headers: Record<string, string>): Record<string, string> | undefined {
  return Object.keys(headers).length ? headers : undefined;
}

function emitInjectedMessage(type: "injected-ready", payload: { href: string }): void;
function emitInjectedMessage(type: "captured-network-event", payload: CapturedNetworkEvent): void;
function emitInjectedMessage(type: "injected-ready" | "captured-network-event", payload: { href: string } | CapturedNetworkEvent): void {
  window.postMessage({
    source: INJECTED_MESSAGE_SOURCE,
    type,
    payload
  }, window.location.origin);
}

function installFetchHook(): void {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || (input instanceof Request ? input.method : "GET");
    const url = input instanceof Request ? input.url : String(input);
    const requestHeaders = getFetchRequestHeaders(input, init);
    const response = await nativeFetch(input, init);

    response.clone().text().then((responseText) => {
      emitInjectedMessage("captured-network-event", createCapturedNetworkEvent("fetch", {
        url,
        method,
        status: response.status,
        requestHeaders: nonEmptyHeaders(requestHeaders),
        requestBody: typeof init?.body === "string" ? init.body : undefined,
        responseText
      }));
    }).catch(() => undefined);

    return response;
  };
}

function installXhrHook(): void {
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const nativeSend = XMLHttpRequest.prototype.send;
  type XhrWithMeta = XMLHttpRequest & {
    __aiChatHelperMeta?: {
      method: string;
      url: string;
      requestHeaders: Record<string, string>;
    };
  };

  XMLHttpRequest.prototype.open = function open(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
    (this as XhrWithMeta).__aiChatHelperMeta = {
      method,
      url: String(url),
      requestHeaders: {}
    };
    return nativeOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
  };

  XMLHttpRequest.prototype.setRequestHeader = function setRequestHeader(name: string, value: string) {
    const meta = (this as XhrWithMeta).__aiChatHelperMeta;
    if (meta && name) {
      meta.requestHeaders[String(name).toLowerCase()] = String(value);
    }
    return nativeSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function send(body?: Document | XMLHttpRequestBodyInit | null) {
    this.addEventListener("load", () => {
      const meta = (this as XhrWithMeta).__aiChatHelperMeta;
      if (!meta) return;

      emitInjectedMessage("captured-network-event", createCapturedNetworkEvent("xhr", {
        url: meta.url,
        method: meta.method,
        status: this.status,
        requestHeaders: nonEmptyHeaders(meta.requestHeaders),
        requestBody: typeof body === "string" ? body : undefined,
        responseText: typeof this.responseText === "string" ? this.responseText : undefined
      }));
    });

    return nativeSend.call(this, body);
  };
}

function readBlobText(blob: Blob): Promise<string> {
  const blobWithText = blob as Blob & { text?: () => Promise<string> };
  if (typeof blobWithText.text === "function") {
    return blobWithText.text.call(blob);
  }

  if (typeof FileReader === "function") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsText(blob);
    });
  }

  if (typeof Response === "function") {
    return new Response(blob).text();
  }

  return Promise.resolve("");
}

function installBlobUrlHook(): void {
  const nativeCreateObjectURL = URL.createObjectURL.bind(URL);
  const nativeRevokeObjectURL = typeof URL.revokeObjectURL === "function"
    ? URL.revokeObjectURL.bind(URL)
    : undefined;
  const nativeAnchorClick = HTMLAnchorElement.prototype.click;

  type BlobUrlMeta = {
    mimeType?: string;
    responseText?: string;
    fileName?: string;
    textPromise?: Promise<void>;
  };

  const objectUrlMeta = new Map<string, BlobUrlMeta>();

  const emitBlobUrlEvent = (url: string, meta: BlobUrlMeta) => {
    emitInjectedMessage("captured-network-event", createCapturedNetworkEvent("blob-url", {
      url,
      mimeType: meta.mimeType,
      fileName: meta.fileName,
      responseText: meta.responseText
    }));
  };

  URL.createObjectURL = (object: Blob | MediaSource) => {
    const url = nativeCreateObjectURL(object);
    if (object instanceof Blob) {
      const meta: BlobUrlMeta = {
        mimeType: object.type || undefined
      };
      const isHtmlBlob = String(object.type || "").toLowerCase().includes("html");

      if (isHtmlBlob) {
        meta.textPromise = readBlobText(object)
          .then((text) => {
            const responseText = String(text || "").trim();
            if (!responseText) return;
            meta.responseText = responseText;
            if (meta.fileName) emitBlobUrlEvent(url, meta);
          })
          .catch(() => undefined);
      }

      objectUrlMeta.set(url, meta);
      emitBlobUrlEvent(url, meta);
    }
    return url;
  };

  if (nativeRevokeObjectURL) {
    URL.revokeObjectURL = (url: string) => {
      objectUrlMeta.delete(String(url || ""));
      return nativeRevokeObjectURL(url);
    };
  }

  HTMLAnchorElement.prototype.click = function click() {
    try {
      const href = String(this.href || this.getAttribute("href") || "").trim();
      const downloadName = String(this.download || this.getAttribute("download") || "").trim();
      if (href.startsWith("blob:") && /\.html?$/i.test(downloadName)) {
        const meta = objectUrlMeta.get(href);
        if (meta) {
          meta.fileName = downloadName;
          if (meta.responseText) {
            emitBlobUrlEvent(href, meta);
          } else {
            meta.textPromise?.then(() => {
              if (meta.responseText) emitBlobUrlEvent(href, meta);
            }).catch(() => undefined);
          }
        }
      }
    } catch {
      // Preserve native click behavior if capture metadata is unavailable.
    }

    return nativeAnchorClick.call(this);
  };
}

installFetchHook();
installXhrHook();
installBlobUrlHook();

emitInjectedMessage("injected-ready", { href: window.location.href });
