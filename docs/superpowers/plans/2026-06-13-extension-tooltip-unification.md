# Extension Tooltip Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace remaining native `title` tooltips in the extension with the shared custom tooltip controller.

**Architecture:** Extend the existing tooltip controller so it can render either rich node preview content or plain text labels. Migrate tooltip-bearing controls to declarative binding hooks, keep `aria-label`, and verify behavior with focused UI tests before running broader extension checks.

**Tech Stack:** TypeScript, DOM event bindings, Vitest, Vite extension source structure

---

### Task 1: Add failing tooltip regression tests

**Files:**
- Modify: `extension/src/__tests__/settings-popup.test.ts`
- Modify: `extension/src/__tests__/panel.test.ts`
- Modify: `extension/src/__tests__/backup-library.test.ts`
- Modify: `extension/src/__tests__/export-modal.test.ts`

- [ ] Write failing tests that assert migrated controls no longer expose native `title`.
- [ ] Run focused Vitest cases and confirm they fail for the expected tooltip assertions.

### Task 2: Extend the shared tooltip controller

**Files:**
- Modify: `extension/src/ui/controls/node-tooltip.ts`

- [ ] Add plain text tooltip rendering and shared show/hide helpers without regressing rich node previews.
- [ ] Keep the existing tooltip element, positioning logic, and accessibility attributes aligned with current behavior.

### Task 3: Migrate remaining tooltip-bearing controls

**Files:**
- Modify: `extension/src/ui/panel/panel.ts`
- Modify: `extension/src/popup/settings-popup.ts`
- Modify: `extension/src/popup/backup-library.ts`
- Modify: `extension/src/ui/modals/export-modal.ts`

- [ ] Remove remaining native `title` attributes that are used as browser tooltips.
- [ ] Bind custom tooltip behavior to those controls using the shared controller.
- [ ] Preserve `aria-label` values and existing click/focus behavior.

### Task 4: Verify targeted and broader extension checks

**Files:**
- Modify: `extension/src/__tests__/node-list.test.ts` only if expectations need alignment with shared tooltip helpers

- [ ] Run focused tooltip-related Vitest files and confirm all pass.
- [ ] Run broader verification commands such as `npm test` and `npm run typecheck` from `extension`.
- [ ] Report any remaining risks if broader verification surfaces unrelated pre-existing failures.
