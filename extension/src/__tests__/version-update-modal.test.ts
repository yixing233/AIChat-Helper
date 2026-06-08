import { describe, expect, it, vi } from "vitest";
import { createVersionUpdateModal } from "../ui/modals/version-update-modal";

describe("createVersionUpdateModal", () => {
  it("renders userscript-style update details and invokes update action", () => {
    const onUpdate = vi.fn();
    const modal = createVersionUpdateModal({
      currentVersion: "3.0.0",
      latestVersion: "3.1.0",
      changelogEntries: [
        { version: "3.1.0", date: "2026-06-08", changes: ["Panel parity"] }
      ],
      onUpdate
    });

    expect(modal.id).toBe("ai-chat-helper-update-modal");
    expect(modal.textContent).toContain("Update available");
    expect(modal.textContent).toContain("Current version:");
    expect(modal.textContent).toContain("3.0.0");
    expect(modal.textContent).toContain("Latest version:");
    expect(modal.textContent).toContain("3.1.0");
    expect(modal.textContent).toContain("Panel parity");
    expect(modal.querySelector(".ai-chat-helper-update-modal__box")).toBeTruthy();

    modal.querySelector<HTMLButtonElement>("[data-ai-chat-helper-update-confirm]")?.click();

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});
