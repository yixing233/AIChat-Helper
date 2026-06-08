import { createCapturedNetworkEventFactory } from "./captured-events";
import type { CapturedNetworkEvent } from "../shared/types";

const INJECTED_MESSAGE_SOURCE = "ai-chat-helper:injected";
const createCapturedNetworkEvent = createCapturedNetworkEventFactory();

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
    const response = await nativeFetch(input, init);

    response.clone().text().then((responseText) => {
      emitInjectedMessage("captured-network-event", createCapturedNetworkEvent("fetch", {
        url,
        method,
        status: response.status,
        requestBody: typeof init?.body === "string" ? init.body : undefined,
        responseText
      }));
    }).catch(() => undefined);

    return response;
  };
}

function installXhrHook(): void {
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function open(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
    (this as XMLHttpRequest & { __aiChatHelperMeta?: { method: string; url: string } }).__aiChatHelperMeta = {
      method,
      url: String(url)
    };
    return nativeOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
  };

  XMLHttpRequest.prototype.send = function send(body?: Document | XMLHttpRequestBodyInit | null) {
    this.addEventListener("load", () => {
      const meta = (this as XMLHttpRequest & { __aiChatHelperMeta?: { method: string; url: string } }).__aiChatHelperMeta;
      if (!meta) return;

      emitInjectedMessage("captured-network-event", createCapturedNetworkEvent("xhr", {
        url: meta.url,
        method: meta.method,
        status: this.status,
        requestBody: typeof body === "string" ? body : undefined,
        responseText: typeof this.responseText === "string" ? this.responseText : undefined
      }));
    });

    return nativeSend.call(this, body);
  };
}

function installBlobUrlHook(): void {
  const nativeCreateObjectURL = URL.createObjectURL.bind(URL);

  URL.createObjectURL = (object: Blob | MediaSource) => {
    const url = nativeCreateObjectURL(object);
    if (object instanceof Blob) {
      emitInjectedMessage("captured-network-event", createCapturedNetworkEvent("blob-url", {
        url,
        mimeType: object.type
      }));
    }
    return url;
  };
}

installFetchHook();
installXhrHook();
installBlobUrlHook();

emitInjectedMessage("injected-ready", { href: window.location.href });
