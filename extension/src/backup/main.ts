import { createBackupStore, getBackupExportFiles } from "./backup-store";
import { downloadExportFiles } from "../content/export-downloads";
import { sendBackgroundRequest } from "../messaging/bridge";
import { createExtensionStorage } from "../storage/extension-storage";
import { bindBackupLibraryPopup, createBackupLibraryPopup } from "../popup/backup-library";

const backupStore = createBackupStore(createExtensionStorage("backups"));

void bootBackupPage();

async function bootBackupPage(): Promise<void> {
  const host = document.getElementById("ai-chat-helper-backup-page-root");
  if (!host) return;

  try {
    const records = await backupStore.list();
    const page = createBackupLibraryPopup(records, { showBack: false });
    page.classList.add("ai-chat-helper-popup--backup-page");
    host.replaceChildren(page);
    bindBackupLibraryPopup(page, records, {
      onBack() {
        window.close();
      },
      async onDownload(id) {
        const record = (await backupStore.list()).find((item) => item.id === id);
        if (!record) throw new Error("备份不存在");
        await downloadExportFiles(getBackupExportFiles(record), sendBackgroundRequest);
      },
      async onDelete(id) {
        await backupStore.remove(id);
        await bootBackupPage();
      }
    });
  } catch (error) {
    host.textContent = error instanceof Error ? error.message : String(error);
  }
}
