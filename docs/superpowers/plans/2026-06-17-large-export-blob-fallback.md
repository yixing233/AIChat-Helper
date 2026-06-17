# Large Export Blob Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avoid `runtime.sendMessage` size failures by sending oversized export files through direct page-side Blob downloads.

**Architecture:** Keep the existing background download path for normal-sized files. Add a size gate in the page-side download helper so very large `ExportFile` payloads bypass extension messaging and are downloaded directly in the page. Preserve the current behavior for small files and existing fallback handling.

**Tech Stack:** TypeScript, Vitest, Chrome extension messaging, Blob/Object URL downloads

---

### Task 1: Add a large-file Blob fallback test

**Files:**
- Modify: `src/__tests__/export-downloads.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("uses Blob downloads for large binary export files to avoid runtime message size limits", async () => {
  const largeContent = new Uint8Array(65 * 1024 * 1024);
  const send = vi.fn(async (): Promise<BackgroundResponse> => ({ ok: true, value: { downloadId: 9 } }));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn() });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:ai-chat-helper-large-export");

  await downloadExportFiles([{ path: "large.zip", mimeType: "application/zip", content: largeContent }], send);

  expect(send).not.toHaveBeenCalled();
  expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  expect(click).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/__tests__/export-downloads.test.ts`
Expected: FAIL because large files still go through `runtime.sendMessage`.

- [ ] **Step 3: Leave implementation for the next task**

No production code in this task.

- [ ] **Step 4: Re-run the test after implementation**

Run: `npm test -- --run src/__tests__/export-downloads.test.ts`
Expected: PASS after the fallback is added.

### Task 2: Add the Blob fallback in the page-side download helper

**Files:**
- Modify: `src/content/export-downloads.ts`

- [ ] **Step 1: Implement the size gate**

```ts
export async function downloadExportFiles(files: ExportFile[], send: BackgroundSender): Promise<void> {
  for (const file of files) {
    if (shouldUseDirectBlobDownload(file)) {
      downloadFileInPage(file);
      continue;
    }

    const request: BackgroundRequest = {
      type: "download-file",
      payload: {
        ...file,
        content: serializeDownloadContent(file.content),
        fileName: file.path
      }
    };
    // keep existing background path and fallback behavior
  }
}

function shouldUseDirectBlobDownload(file: ExportFile): boolean {
  if (file.content instanceof Uint8Array) return file.content.byteLength >= 60 * 1024 * 1024;
  if (typeof file.content === "string") return file.content.length >= 60 * 1024 * 1024;
  return false;
}
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- --run src/__tests__/export-downloads.test.ts`
Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

### Task 3: Verify the full extension still builds

**Files:**
- Modify: none

- [ ] **Step 1: Run the full build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 2: Run the impacted export modal tests**

Run: `npm test -- --run src/__tests__/export-modal.test.ts src/__tests__/export-downloads.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit the fix**

```bash
git add src/content/export-downloads.ts src/__tests__/export-downloads.test.ts docs/superpowers/plans/2026-06-17-large-export-blob-fallback.md
git commit -m "fix: bypass runtime messaging for large exports"
```

