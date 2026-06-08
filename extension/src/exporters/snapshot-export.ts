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

export async function exportBatchSnapshots(snapshots: ConversationSnapshot[], format: SnapshotExportFormat): Promise<ExportFile[]> {
  const entries: ExportFile[] = [];

  for (const snapshot of snapshots) {
    const folder = safeFileName(snapshot.title
      ? `${snapshot.title} - ${snapshot.conversationId}`
      : snapshot.conversationId);
    const files = format === "zip"
      ? [
        ...(await exporters.html.export(snapshot)),
        ...(await exporters.markdown.export(snapshot)),
        ...(await exporters.txt.export(snapshot))
      ]
      : await exporters[format].export(snapshot);

    files.forEach((file) => {
      entries.push({
        ...file,
        path: `${folder}/${file.path}`
      });
    });
  }

  return [{
    path: "AI Chat Helper Batch Export.zip",
    mimeType: "application/zip",
    content: createZip(entries)
  }];
}
