import { afterEach, describe, expect, it, vi } from "vitest";
import { hideToast, showToast } from "../ui/toast/toast";

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("toast", () => {
  it("renders a userscript-style toast and updates the same toast by id", () => {
    const first = showToast("正在检查更新", {
      id: "update",
      title: "检查更新",
      loading: true,
      duration: 0
    });
    const second = showToast("已是最新版本 v1.0.0", {
      id: "update",
      title: "检查更新",
      tone: "success"
    });

    expect(second).toBe(first);
    expect(document.querySelectorAll(".ai-chat-helper-toast")).toHaveLength(1);
    expect(second.dataset.aiChatHelperToastId).toBe("update");
    expect(second.dataset.aiChatHelperToastTone).toBe("success");
    expect(second.classList.contains("is-loading")).toBe(false);
    expect(second.querySelector(".ai-chat-helper-toast__title")?.textContent).toBe("检查更新");
    expect(second.querySelector(".ai-chat-helper-toast__message")?.textContent).toBe("已是最新版本 v1.0.0");
    expect(second.querySelector<HTMLButtonElement>(".ai-chat-helper-toast__close")?.getAttribute("aria-label")).toBe("关闭提示");
  });

  it("can hide a toast by id immediately", () => {
    showToast("导出完成", { id: "export", tone: "success", duration: 0 });

    hideToast("export", true);

    expect(document.querySelector("[data-ai-chat-helper-toast-id='export']")).toBeFalsy();
  });
});
