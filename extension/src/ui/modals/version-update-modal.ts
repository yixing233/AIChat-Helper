import { escapeHtml } from "../shared/escape-html";
import type { ChangelogEntry } from "../../content/version-check";

export interface VersionUpdateModalOptions {
  currentVersion: string;
  latestVersion: string;
  changelogEntries?: ChangelogEntry[];
  onUpdate?: () => void;
}

export function createVersionUpdateModal(options: VersionUpdateModalOptions): HTMLElement {
  const modal = document.createElement("div");
  modal.id = "ai-chat-helper-update-modal";
  modal.className = "ai-chat-helper-update-modal";
  modal.innerHTML = `
    <div class="ai-chat-helper-update-modal__box">
      <div class="ai-chat-helper-update-modal__title">Update available</div>
      <div class="ai-chat-helper-update-modal__meta">
        <div>Current version: <b>${escapeHtml(options.currentVersion || "-")}</b></div>
        <div>Latest version: <b>${escapeHtml(options.latestVersion || "-")}</b></div>
      </div>
      <div class="ai-chat-helper-update-modal__section">
        <div class="ai-chat-helper-update-modal__label">Changelog</div>
        <div class="ai-chat-helper-update-modal__log">
          ${renderChangelog(options.changelogEntries || [])}
        </div>
      </div>
      <div class="ai-chat-helper-update-modal__actions">
        <button type="button" class="ai-chat-helper-update-modal__cancel" data-ai-chat-helper-update-cancel>Cancel</button>
        <button type="button" class="ai-chat-helper-update-modal__confirm" data-ai-chat-helper-update-confirm>Update</button>
      </div>
    </div>
  `;

  const close = () => modal.remove();
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  modal.querySelector("[data-ai-chat-helper-update-cancel]")?.addEventListener("click", close);
  modal.querySelector("[data-ai-chat-helper-update-confirm]")?.addEventListener("click", () => {
    close();
    options.onUpdate?.();
  });

  return modal;
}

export function openVersionUpdateModal(options: VersionUpdateModalOptions): void {
  document.getElementById("ai-chat-helper-update-modal")?.remove();
  document.body.appendChild(createVersionUpdateModal(options));
}

function renderChangelog(entries: ChangelogEntry[]): string {
  if (!entries.length) {
    return '<div class="ai-chat-helper-update-modal__empty">No changelog entries available.</div>';
  }

  return entries.map((entry) => {
    const version = escapeHtml(String(entry.version || "-").trim() || "-");
    const date = escapeHtml(String(entry.date || "").trim());
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    const items = changes
      .map((item) => `<li>${escapeHtml(String(item || "").trim())}</li>`)
      .join("");

    return `
      <div class="ai-chat-helper-update-modal__entry">
        <div class="ai-chat-helper-update-modal__entry-head">
          <span>v${version}</span>
          ${date ? `<small>${date}</small>` : ""}
        </div>
        ${items ? `<ul>${items}</ul>` : '<div class="ai-chat-helper-update-modal__empty">No notes.</div>'}
      </div>
    `;
  }).join("");
}
