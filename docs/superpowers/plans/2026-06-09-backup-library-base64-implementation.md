# Backup Library Base64 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the dedicated backup library management page and base64 image retention described in `docs/superpowers/specs/2026-06-09-backup-library-base64-design.md`.

**Architecture:** Keep the extension's vanilla TypeScript and DOM rendering style. Add backup storage helpers for base64 serialization and preview snapshot creation, then replace the popup-like backup library markup with a full-page workbench that still exposes compatible create/bind entry points.

**Tech Stack:** TypeScript, Vite, Vitest, JSDOM, Chrome extension storage/download bridge.

---

### Task 1: Base64 Backup Storage

**Files:**
- Modify: `extension/src/__tests__/backup-store.test.ts`
- Modify: `extension/src/backup/backup-store.ts`

- [ ] Write failing tests proving `Uint8Array` files serialize as `encoding: "base64"` and old `encoding: "bytes"` records still download.
- [ ] Run `npm test -- --run src/__tests__/backup-store.test.ts` from `extension` and confirm the new tests fail for the expected reason.
- [ ] Implement base64 encode/decode helpers and update `getBackupExportFiles` compatibility.
- [ ] Re-run the targeted test until it passes.

### Task 2: Preview Snapshot Image Retention

**Files:**
- Modify: `extension/src/__tests__/backup-store.test.ts`
- Modify: `extension/src/__tests__/auto-backup.test.ts`
- Modify: `extension/src/backup/backup-store.ts`
- Modify: `extension/src/content/auto-backup.ts`

- [ ] Write failing tests proving backup records can include `previewSnapshot`, image attachment content becomes data URL, remote image fetch failures do not block backup creation, and auto backup uses the async record builder.
- [ ] Run targeted backup store and auto backup tests and confirm failures.
- [ ] Add `createConversationBackupRecord` and preview snapshot helpers.
- [ ] Update auto backup runner to call the async builder.
- [ ] Re-run targeted tests until they pass.

### Task 3: Backup Library Workbench UI

**Files:**
- Modify: `extension/src/__tests__/backup-library.test.ts`
- Modify: `extension/src/popup/backup-library.ts`
- Modify: `extension/src/popup/styles.css`

- [ ] Write failing tests proving the page renders summary, platform navigation, selectable record list, persistent preview pane, image thumbnails, image overlay, loading state, and empty state.
- [ ] Run the backup library test and confirm failures.
- [ ] Replace popup-like markup with a page workbench while preserving exported API names used by `backup/main.ts`.
- [ ] Add event handling for platform selection, record selection, image overlay, download loading, and delete confirmation.
- [ ] Add responsive CSS for the dedicated backup page.
- [ ] Re-run backup library tests until they pass.

### Task 4: Integration Verification

**Files:**
- Check: `extension/src/backup/main.ts`
- Check: `extension/src/popup/main.ts`
- Check: `extension/vite.config.ts`

- [ ] Run `npm run typecheck` from `extension`.
- [ ] Run `npm test -- --run` from `extension`.
- [ ] Run `npm run build` from `extension`.
- [ ] Run `git diff --check` from repo root.
- [ ] Report any remaining risk or manual reload notes.
