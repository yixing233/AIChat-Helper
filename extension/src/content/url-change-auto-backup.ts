export interface UrlChangeAutoBackupSchedulerOptions {
  getDelaySeconds: () => number;
  isEnabled: () => boolean;
  onTrigger: () => void;
  setTimeoutFn?: typeof window.setTimeout;
  clearTimeoutFn?: typeof window.clearTimeout;
}

export interface UrlChangeAutoBackupScheduler {
  sync: (href: string, conversationId: string) => void;
  handleNavigation: (href: string, conversationId: string) => void;
  dispose: () => void;
}

export function createUrlChangeAutoBackupScheduler(
  options: UrlChangeAutoBackupSchedulerOptions
): UrlChangeAutoBackupScheduler {
  const setTimeoutFn = options.setTimeoutFn || window.setTimeout.bind(window);
  const clearTimeoutFn = options.clearTimeoutFn || window.clearTimeout.bind(window);
  let currentHref = "";
  let currentConversationId = "";
  let timer = 0;

  const clearPending = () => {
    if (!timer) return;
    clearTimeoutFn(timer);
    timer = 0;
  };

  const sync = (href: string, conversationId: string) => {
    currentHref = String(href || "");
    currentConversationId = normalizeConversationId(conversationId);
  };

  const handleNavigation = (href: string, conversationId: string) => {
    const nextHref = String(href || "");
    const nextConversationId = normalizeConversationId(conversationId);
    if (!nextHref || nextHref === currentHref) return;

    currentHref = nextHref;
    if (!nextConversationId || nextConversationId === "current" || nextConversationId === currentConversationId) {
      currentConversationId = nextConversationId || currentConversationId;
      return;
    }

    currentConversationId = nextConversationId;
    clearPending();
    if (!options.isEnabled()) return;

    const delayMs = Math.max(0, Math.round(options.getDelaySeconds() || 0)) * 1000;
    if (delayMs <= 0) {
      options.onTrigger();
      return;
    }

    timer = setTimeoutFn(() => {
      timer = 0;
      if (!options.isEnabled()) return;
      options.onTrigger();
    }, delayMs);
  };

  return {
    sync,
    handleNavigation,
    dispose() {
      clearPending();
    }
  };
}

function normalizeConversationId(value: string): string {
  return String(value || "").trim();
}
