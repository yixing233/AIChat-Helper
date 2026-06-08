import { describe, expect, it, vi } from "vitest";
import { createExportModal } from "../ui/modals/export-modal";

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
});
