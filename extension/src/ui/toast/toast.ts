export type ToastTone = "info" | "success" | "warn" | "error";

export interface ToastOptions {
  id?: string;
  title?: string;
  tone?: ToastTone;
  duration?: number;
  loading?: boolean;
}

const defaultToastDuration = 2600;
const leaveDuration = 220;
const toastTimers = new WeakMap<HTMLElement, number>();

export function showToast(message: string, options: ToastOptions = {}): HTMLElement {
  const toast = getOrCreateToast(options.id);
  const tone = options.tone || "info";
  toast.dataset.aiChatHelperToastTone = tone;
  toast.className = "ai-chat-helper-toast";
  toast.classList.toggle("is-loading", Boolean(options.loading));
  toast.setAttribute("role", tone === "warn" || tone === "error" ? "alert" : "status");
  toast.setAttribute("aria-live", tone === "warn" || tone === "error" ? "assertive" : "polite");
  toast.innerHTML = "";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "ai-chat-helper-toast__close";
  closeButton.title = "关闭提示";
  closeButton.setAttribute("aria-label", "关闭提示");
  closeButton.innerHTML = closeIcon;
  closeButton.addEventListener("click", () => hideToast(toast, true));

  const spinner = document.createElement("span");
  spinner.className = "ai-chat-helper-toast__spinner";
  spinner.setAttribute("aria-hidden", "true");

  const titleEl = document.createElement("span");
  titleEl.className = "ai-chat-helper-toast__title";
  titleEl.textContent = String(options.title || getDefaultTitle(tone)).trim();

  const messageEl = document.createElement("span");
  messageEl.className = "ai-chat-helper-toast__message";
  messageEl.textContent = String(message || "").trim();

  toast.append(closeButton, spinner, titleEl, messageEl);
  if (!toast.isConnected) document.body.appendChild(toast);
  window.requestAnimationFrame(() => {
    if (toast.isConnected) toast.classList.add("is-visible");
  });
  scheduleToastHide(toast, options.duration, Boolean(options.loading));
  return toast;
}

export function hideToast(toastOrId: HTMLElement | string, immediate = false): void {
  const toast = typeof toastOrId === "string"
    ? document.querySelector<HTMLElement>(`[data-ai-chat-helper-toast-id="${escapeSelector(toastOrId)}"]`)
    : toastOrId;
  if (!toast) return;

  clearToastTimer(toast);
  toast.classList.remove("is-visible");
  if (immediate) {
    toast.remove();
    return;
  }

  window.setTimeout(() => {
    if (!toast.classList.contains("is-visible")) toast.remove();
  }, leaveDuration);
}

function getOrCreateToast(id: string | undefined): HTMLElement {
  const normalizedId = String(id || "default").trim() || "default";
  const existing = document.querySelector<HTMLElement>(`[data-ai-chat-helper-toast-id="${escapeSelector(normalizedId)}"]`);
  if (existing) return existing;

  const toast = document.createElement("div");
  toast.dataset.aiChatHelperToastId = normalizedId;
  return toast;
}

function scheduleToastHide(toast: HTMLElement, duration: number | undefined, loading: boolean): void {
  clearToastTimer(toast);
  if (loading || duration === 0) return;
  const timer = window.setTimeout(() => hideToast(toast), duration ?? defaultToastDuration);
  toastTimers.set(toast, timer);
}

function clearToastTimer(toast: HTMLElement): void {
  const timer = toastTimers.get(toast);
  if (!timer) return;
  window.clearTimeout(timer);
  toastTimers.delete(toast);
}

function getDefaultTitle(tone: ToastTone): string {
  if (tone === "success") return "完成";
  if (tone === "warn") return "提示";
  if (tone === "error") return "失败";
  return "AI Chat Helper";
}

function escapeSelector(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const closeIcon = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
`;
