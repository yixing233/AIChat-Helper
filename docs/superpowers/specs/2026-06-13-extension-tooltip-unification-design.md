# Extension Tooltip Unification Design

**Date:** 2026-06-13

## Goal

Replace remaining native browser `title` tooltips inside the browser extension with the extension's custom tooltip behavior, while preserving `aria-label` for accessibility.

## Design

Use the existing custom tooltip implementation in `extension/src/ui/controls/node-tooltip.ts` as the single tooltip controller.

The controller will support two presentation modes:

- Rich node tooltip mode for node/message previews, including image thumbnails and truncated text.
- Plain text tooltip mode for icon buttons and other controls that currently rely on native `title`.

## Scope

Update the following extension areas to stop depending on native `title`:

- Page panel controls
- Popup header controls
- Backup library action buttons and preview controls
- Export modal preview and close buttons

## Constraints

- Keep existing tooltip styling and positioning behavior consistent with the current node tooltip.
- Do not remove `aria-label` attributes that are used for accessibility and tests.
- Do not introduce a second tooltip system.
- Do not change unrelated modal, panel, or backup workflows.

## Testing

Add regression tests that verify:

- Buttons no longer render native `title` attributes.
- Hovering or focusing migrated controls shows the custom tooltip element.
- Existing node tooltip behavior continues to work for node rails and backup preview rails.
