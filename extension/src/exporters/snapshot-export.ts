import type { ConversationSnapshot, ExportFile } from "../shared/types";
import { exporters } from ".";
import { safeFileName } from "./shared";
import { createZip } from "./zip";

export type SnapshotExportFormat = keyof typeof exporters | "zip";

export async function exportSnapshot(snapshot: ConversationSnapshot, format: SnapshotExportFormat): Promise<ExportFile[]> {
  if (format !== "zip") {
    return exporters[format].export(snapshot);
  }

  const files = [
    ...(await exporters.html.export(snapshot)),
    ...(await exporters.markdown.export(snapshot)),
    ...(await exporters.txt.export(snapshot))
  ];

  return [{
    path: `${safeFileName(snapshot.title)}.zip`,
    mimeType: "application/zip",
    content: createZip(files)
  }];
}
