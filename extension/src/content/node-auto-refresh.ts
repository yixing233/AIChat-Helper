export interface NodeAutoRefreshOptions {
  refresh: () => void;
  root?: Node | null;
  debounceMs?: number;
  fallbackMs?: number;
}

export interface NodeAutoRefreshController {
  schedule(delayMs?: number): void;
  disconnect(): void;
}

const EXTENSION_OWNED_SELECTOR = [
  "#ai-chat-helper-panel",
  "#ai-chat-helper-reading-line",
  "#ai-chat-helper-export-modal",
  "#ai-chat-helper-update-modal",
  "[data-ai-chat-helper]",
  "[class^=\"ai-chat-helper-\"]",
  "[class*=\" ai-chat-helper-\"]"
].join(",");

export function installNodeAutoRefresh(options: NodeAutoRefreshOptions): NodeAutoRefreshController {
  const root = options.root || document.body || document.documentElement;
  const debounceMs = options.debounceMs ?? 120;
  const fallbackMs = options.fallbackMs ?? 1200;
  let disposed = false;
  let refreshTimer = 0;

  const runRefresh = () => {
    refreshTimer = 0;
    if (document.hidden) return;
    options.refresh();
  };

  const schedule = (delayMs = debounceMs) => {
    if (disposed) return;
    if (refreshTimer) window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(runRefresh, Math.max(0, delayMs));
  };

  const observer = typeof MutationObserver === "function" && root
    ? new MutationObserver((mutations) => {
        if (mutations.some(isPageMutation)) schedule();
      })
    : null;

  observer?.observe(root, {
    childList: true,
    subtree: true,
    characterData: true
  });

  const fallbackTimer = fallbackMs > 0
    ? window.setInterval(() => {
        schedule(0);
      }, fallbackMs)
    : 0;

  return {
    schedule,
    disconnect() {
      disposed = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      if (fallbackTimer) window.clearInterval(fallbackTimer);
      observer?.disconnect();
    }
  };
}

function isPageMutation(mutation: MutationRecord): boolean {
  if (mutation.type === "childList" && (mutation.addedNodes.length || mutation.removedNodes.length)) {
    const changedNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
    return changedNodes.some((node) => !isExtensionOwnedNode(node));
  }

  return !isExtensionOwnedNode(mutation.target);
}

function isExtensionOwnedNode(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE
    ? node as Element
    : node.parentElement || (node.parentNode instanceof Element ? node.parentNode : null);
  return Boolean(element?.closest(EXTENSION_OWNED_SELECTOR));
}
