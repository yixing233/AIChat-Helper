import type { ConversationSnapshot, ExportAttachment, ExportFile } from "../shared/types";
import { exporters } from ".";
import { safeFileName } from "./shared";
import { createZip } from "./zip";

export type SnapshotExportFormat = keyof typeof exporters | "zip";

export async function exportSnapshot(snapshot: ConversationSnapshot, format: SnapshotExportFormat): Promise<ExportFile[]> {
  const attachmentFiles = collectAttachmentFiles(snapshot);

  if (format !== "zip") {
    return [
      ...(await exporters[format].export(snapshot)),
      ...attachmentFiles
    ];
  }

  const files = [
    ...(await exporters.html.export(snapshot)),
    ...(await exporters.markdown.export(snapshot)),
    ...(await exporters.txt.export(snapshot)),
    ...attachmentFiles
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
        ...(await exporters.txt.export(snapshot)),
        ...collectAttachmentFiles(snapshot)
      ]
      : [
        ...(await exporters[format].export(snapshot)),
        ...collectAttachmentFiles(snapshot)
      ];

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

function collectAttachmentFiles(snapshot: ConversationSnapshot): ExportFile[] {
  const files: ExportFile[] = [];
  const usedPaths = new Set<string>();

  snapshot.attachments.forEach((attachment) => {
    pushAttachmentFile(files, usedPaths, "global", attachment);
  });

  snapshot.messages.forEach((message) => {
    message.attachments?.forEach((attachment) => {
      pushAttachmentFile(files, usedPaths, message.id, attachment);
    });
  });

  return files;
}

function pushAttachmentFile(files: ExportFile[], usedPaths: Set<string>, ownerId: string, attachment: ExportAttachment): void {
  if (attachment.content === undefined) return;

  const folder = safeFileName(ownerId || attachment.id || "attachment");
  const fileName = safeFileName(baseName(attachment.fileName || attachment.id || "attachment"));
  const path = uniquePath(`attachments/${folder}/${fileName}`, usedPaths);
  files.push({
    path,
    mimeType: attachment.mimeType || "application/octet-stream",
    content: attachment.content
  });
}

function baseName(path: string): string {
  return path.split(/[\\/]+/).filter(Boolean).pop() || "attachment";
}

function uniquePath(path: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(path)) {
    usedPaths.add(path);
    return path;
  }

  const slashIndex = path.lastIndexOf("/");
  const folder = slashIndex >= 0 ? `${path.slice(0, slashIndex + 1)}` : "";
  const name = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
  const dotIndex = name.lastIndexOf(".");
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const ext = dotIndex > 0 ? name.slice(dotIndex) : "";

  let index = 2;
  let candidate = `${folder}${base}-${index}${ext}`;
  while (usedPaths.has(candidate)) {
    index += 1;
    candidate = `${folder}${base}-${index}${ext}`;
  }
  usedPaths.add(candidate);
  return candidate;
}
