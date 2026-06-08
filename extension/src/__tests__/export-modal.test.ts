import { describe, expect, it, vi } from "vitest";
import { createBatchExportModal, createExportModal } from "../ui/modals/export-modal";
import type { ConversationSummary } from "../shared/types";

describe("createExportModal", () => {
  it("renders format buttons", () => {
    const modal = createExportModal();

    expect(modal.querySelector("[data-format='html']")).toBeTruthy();
    expect(modal.querySelector("[data-format='markdown']")).toBeTruthy();
    expect(modal.querySelector("[data-format='txt']")).toBeTruthy();
  });

  it("calls format handler when a format is clicked", () => {
    const onExport = vi.fn();
    const modal = createExportModal(onExport);

    modal.querySelector<HTMLButtonElement>("[data-format='markdown']")?.click();

    expect(onExport).toHaveBeenCalledWith("markdown");
  });

  it("exports only selected batch conversations", () => {
    const summaries: ConversationSummary[] = [
      {
        platformId: "chatgpt",
        conversationId: "conv-1",
        title: "First conversation",
        updatedAt: "2026-06-08T01:00:00Z",
        messageCount: 3
      },
      {
        platformId: "chatgpt",
        conversationId: "conv-2",
        title: "Second conversation",
        messageCount: 5
      }
    ];
    const onExport = vi.fn();
    const modal = createBatchExportModal(summaries, onExport);
    const checkboxes = modal.querySelectorAll<HTMLInputElement>("[data-ai-chat-helper-batch-item]");

    expect(modal.textContent).toContain("First conversation");
    expect(modal.textContent).toContain("3 messages");
    expect(checkboxes).toHaveLength(2);
    expect(Array.from(checkboxes).every((item) => item.checked)).toBe(true);

    checkboxes[1].checked = false;
    checkboxes[1].dispatchEvent(new Event("change", { bubbles: true }));
    modal.querySelector<HTMLButtonElement>("[data-format='zip']")?.click();

    expect(onExport).toHaveBeenCalledWith("zip", [summaries[0]]);
  });

  it("disables batch export when no conversations are selected", () => {
    const modal = createBatchExportModal([
      { platformId: "claude", conversationId: "conv-1", title: "Only conversation" }
    ], vi.fn());
    const checkbox = modal.querySelector<HTMLInputElement>("[data-ai-chat-helper-batch-item]");
    const zipButton = modal.querySelector<HTMLButtonElement>("[data-format='zip']");

    expect(zipButton?.disabled).toBe(false);

    if (checkbox) {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }

    expect(zipButton?.disabled).toBe(true);
  });
});
