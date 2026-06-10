import type { SnapshotExportFormat } from "../exporters/snapshot-export";
import type { ConversationSnapshot, ExportAttachment, ExportFile, PlatformId } from "../shared/types";
import type { ExtensionStorage } from "../storage/extension-storage";

export type BackupSource = "auto" | "manual";

export interface StoredBackupFile {
  path: string;
  mimeType: string;
  content: string | number[];
  encoding: "text" | "base64" | "bytes";
}

export interface ConversationBackupRecord {
  id: string;
  platformId: PlatformId;
  platformName: string;
  conversationId: string;
  title: string;
  format: SnapshotExportFormat;
  source: BackupSource;
  digest: string;
  createdAt: string;
  updatedAt?: string;
  messageCount: number;
  snapshot: ConversationSnapshot;
  previewSnapshot?: ConversationSnapshot;
  assetStatus?: BackupAssetStatus;
  files: StoredBackupFile[];
}

export interface BackupPlatformGroup {
  platformId: PlatformId;
  platformName: string;
  records: ConversationBackupRecord[];
}

export interface ConversationBackupEntry {
  id: string;
  platformId: PlatformId;
  platformName: string;
  conversationId: string;
  title: string;
  latest: ConversationBackupRecord;
  versions: ConversationBackupRecord[];
  versionCount: number;
}

export interface BuildBackupRecordOptions {
  createdAt?: string;
  source?: BackupSource;
}

export interface BackupAssetStatus {
  cachedImages: number;
  failedImages: number;
}

export interface CreateBackupRecordOptions extends BuildBackupRecordOptions {
  fetchImage?: PreviewImageFetcher;
}

export type PreviewImageFetcher = (url: string, attachment?: ExportAttachment) => Promise<PreviewImageResource>;

export interface PreviewImageResource {
  bytes: Uint8Array;
  mimeType?: string;
}

export interface BackupSaveResult {
  record: ConversationBackupRecord;
  created: boolean;
}

export interface BackupStore {
  list(): Promise<ConversationBackupRecord[]>;
  save(record: ConversationBackupRecord): Promise<BackupSaveResult>;
  remove(id: string): Promise<void>;
}

const backupRecordsKey = "records";
const defaultMaxBackups = 500;
const platformNames: Record<PlatformId, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  qwen: "通义千问",
  doubao: "豆包",
  deepseek: "DeepSeek"
};
const platformOrder: PlatformId[] = ["chatgpt", "qwen", "doubao", "deepseek", "claude"];

export function createBackupStore(storage: ExtensionStorage, maxBackups = defaultMaxBackups): BackupStore {
  return {
    async list(): Promise<ConversationBackupRecord[]> {
      return normalizeBackupRecords(await storage.get<unknown[]>(backupRecordsKey, []));
    },

    async save(record: ConversationBackupRecord): Promise<BackupSaveResult> {
      const records = normalizeBackupRecords(await storage.get<unknown[]>(backupRecordsKey, []));
      const duplicateIndex = records.findIndex((item) => isSameBackupRevision(item, record));
      if (duplicateIndex >= 0) {
        const duplicate = records[duplicateIndex];
        if (!shouldUpgradeBackupRevision(duplicate, record)) return { record: duplicate, created: false };

        const nextRecords = [...records];
        nextRecords[duplicateIndex] = record;
        await storage.set(backupRecordsKey, nextRecords.sort(sortBackupsNewestFirst));
        return { record, created: false };
      }

      const nextRecords = [record, ...records]
        .sort(sortBackupsNewestFirst)
        .slice(0, Math.max(1, maxBackups));
      await storage.set(backupRecordsKey, nextRecords);
      return { record, created: true };
    },

    async remove(id: string): Promise<void> {
      const records = normalizeBackupRecords(await storage.get<unknown[]>(backupRecordsKey, []));
      await storage.set(backupRecordsKey, records.filter((record) => record.id !== id));
    }
  };
}

export function buildConversationBackupRecord(
  snapshot: ConversationSnapshot,
  format: SnapshotExportFormat,
  files: ExportFile[],
  options: BuildBackupRecordOptions = {}
): ConversationBackupRecord {
  const createdAt = options.createdAt || new Date().toISOString();
  const platformName = getPlatformName(snapshot.platformId);
  const conversationId = snapshot.conversationId || "current";
  const digest = createSnapshotDigest(snapshot);
  return {
    id: buildBackupRecordId(snapshot.platformId, conversationId, format, digest, createdAt),
    platformId: snapshot.platformId,
    platformName,
    conversationId,
    title: snapshot.title || conversationId,
    format,
    source: options.source || "auto",
    digest,
    createdAt,
    updatedAt: snapshot.updatedAt || snapshot.updatedAtText || snapshot.createdAt || snapshot.createdAtText,
    messageCount: snapshot.messages.length,
    snapshot: cloneSnapshot(snapshot),
    files: files.map(serializeBackupFile)
  };
}

export async function createConversationBackupRecord(
  snapshot: ConversationSnapshot,
  format: SnapshotExportFormat,
  files: ExportFile[],
  options: CreateBackupRecordOptions = {}
): Promise<ConversationBackupRecord> {
  const record = buildConversationBackupRecord(snapshot, format, files, options);
  const preview = await buildPreviewSnapshot(snapshot, options.fetchImage || fetchPreviewImage);
  return {
    ...record,
    previewSnapshot: preview.snapshot,
    assetStatus: preview.assetStatus
  };
}

export function getBackupExportFiles(record: ConversationBackupRecord): ExportFile[] {
  return record.files.map((file) => ({
    path: file.path,
    mimeType: file.mimeType,
    content: restoreBackupFileContent(file)
  }));
}

export function groupBackupsByPlatform(records: ConversationBackupRecord[]): BackupPlatformGroup[] {
  const grouped = new Map<PlatformId, ConversationBackupRecord[]>();
  normalizeBackupRecords(records).forEach((record) => {
    const list = grouped.get(record.platformId) || [];
    list.push(record);
    grouped.set(record.platformId, list);
  });

  return Array.from(grouped.entries())
    .sort(([left], [right]) => getPlatformOrderIndex(left) - getPlatformOrderIndex(right))
    .map(([platformId, platformRecords]) => ({
      platformId,
      platformName: getPlatformName(platformId),
      records: platformRecords.sort(sortBackupsNewestFirst)
    }));
}

export function groupBackupRecordsByConversation(records: ConversationBackupRecord[]): ConversationBackupEntry[] {
  const grouped = new Map<string, ConversationBackupRecord[]>();
  normalizeBackupRecords(records).forEach((record) => {
    const key = getConversationBackupEntryId(record);
    const versions = grouped.get(key) || [];
    versions.push(record);
    grouped.set(key, versions);
  });

  return Array.from(grouped.entries())
    .map(([id, versions]) => {
      const sortedVersions = versions.sort(sortBackupsNewestFirst);
      const latest = sortedVersions[0];
      return {
        id,
        platformId: latest.platformId,
        platformName: latest.platformName || getPlatformName(latest.platformId),
        conversationId: latest.conversationId,
        title: latest.title || latest.conversationId,
        latest,
        versions: sortedVersions,
        versionCount: sortedVersions.length
      };
    })
    .sort((left, right) => sortBackupsNewestFirst(left.latest, right.latest));
}

export function getPlatformName(platformId: PlatformId): string {
  return platformNames[platformId] || platformId;
}

function serializeBackupFile(file: ExportFile): StoredBackupFile {
  if (file.content instanceof Uint8Array) {
    return {
      path: file.path,
      mimeType: file.mimeType,
      content: bytesToBase64(file.content),
      encoding: "base64"
    };
  }
  return {
    path: file.path,
    mimeType: file.mimeType,
    content: String(file.content || ""),
    encoding: "text"
  };
}

async function buildPreviewSnapshot(
  snapshot: ConversationSnapshot,
  fetchImage: PreviewImageFetcher
): Promise<{ snapshot: ConversationSnapshot; assetStatus: BackupAssetStatus }> {
  const previewSnapshot = cloneSnapshot(snapshot);
  const urlMap: Record<string, string> = {};
  const failedUrls = new Set<string>();
  const cachedImageKeys = new Set<string>();
  const failedImageKeys = new Set<string>();

  const inlineAttachment = (attachment: ExportAttachment, ownerId: string): ExportAttachment => {
    if (!isImageAttachment(attachment)) return { ...attachment };
    if (isDataUrl(attachment.url)) return { ...attachment };

    if (typeof attachment.content === "string" && attachment.content.length > 0) {
      cachedImageKeys.add(getPreviewImageKey("inline", attachment, ownerId));
      return {
        ...attachment,
        url: stringToDataUrl(attachment.content, attachment.mimeType || guessImageMimeType(attachment.url || attachment.fileName))
      };
    }

    return { ...attachment };
  };

  previewSnapshot.attachments = previewSnapshot.attachments.map((attachment) => inlineAttachment(attachment, "global"));

  for (const message of previewSnapshot.messages) {
    if (message.attachments?.length) {
      message.attachments = message.attachments.map((attachment) => inlineAttachment(attachment, message.id));
    }

    const remoteAttachments = message.attachments?.filter((attachment) => {
      return isImageAttachment(attachment) && isHttpUrl(attachment.url || "") && !isDataUrl(attachment.url);
    }) || [];
    for (const attachment of remoteAttachments) {
      const url = attachment.url || "";
      const dataUrl = await resolveRemoteImageDataUrl(url, attachment, fetchImage, urlMap, failedUrls);
      if (dataUrl) {
        attachment.url = dataUrl;
        cachedImageKeys.add(`url:${url}`);
      } else if (failedUrls.has(url)) {
        failedImageKeys.add(`url:${url}`);
      }
    }

    const textUrls = collectImageUrlsFromText(message.text);
    for (const url of textUrls) {
      const dataUrl = await resolveRemoteImageDataUrl(url, undefined, fetchImage, urlMap, failedUrls);
      if (dataUrl) {
        cachedImageKeys.add(`url:${url}`);
        message.text = replaceAllText(message.text, url, dataUrl);
      } else if (failedUrls.has(url)) {
        failedImageKeys.add(`url:${url}`);
      }
    }
  }

  return {
    snapshot: previewSnapshot,
    assetStatus: {
      cachedImages: cachedImageKeys.size,
      failedImages: failedImageKeys.size
    }
  };
}

function getPreviewImageKey(kind: string, attachment: ExportAttachment, ownerId: string): string {
  return [
    kind,
    ownerId || "unknown",
    attachment.id || "",
    attachment.fileName || "",
    attachment.url || ""
  ].join("\u0000");
}

async function resolveRemoteImageDataUrl(
  url: string,
  attachment: ExportAttachment | undefined,
  fetchImage: PreviewImageFetcher,
  urlMap: Record<string, string>,
  failedUrls: Set<string>
): Promise<string> {
  if (!isHttpUrl(url)) return "";
  if (urlMap[url]) return urlMap[url];
  if (failedUrls.has(url)) return "";

  try {
    const resource = await fetchImage(url, attachment);
    const dataUrl = bytesToDataUrl(resource.bytes, resource.mimeType || attachment?.mimeType || guessImageMimeType(url));
    urlMap[url] = dataUrl;
    return dataUrl;
  } catch {
    failedUrls.add(url);
    return "";
  }
}

async function fetchPreviewImage(url: string): Promise<PreviewImageResource> {
  if (typeof fetch !== "function") throw new Error("fetch is not available");
  const attempts: RequestInit[] = [
    { method: "GET", credentials: "include", cache: "no-store" },
    { method: "GET", credentials: "same-origin", cache: "no-store" },
    { method: "GET", cache: "no-store" }
  ];
  let lastError: unknown = null;

  for (const options of attempts) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        mimeType: response.headers.get("content-type") || guessImageMimeType(url)
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("图片下载失败");
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType || "image/png"};base64,${bytesToBase64(bytes)}`;
}

function stringToDataUrl(value: string, mimeType: string): string {
  return bytesToDataUrl(new TextEncoder().encode(value), mimeType);
}

function collectImageUrlsFromText(text: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const push = (raw: string) => {
    const url = String(raw || "").trim().replace(/[),.;，。；]+$/g, "");
    if (!isHttpUrl(url) || seen.has(url) || !isImageUrl(url)) return;
    seen.add(url);
    urls.push(url);
  };

  String(text || "").replace(/!\[[^\]]*]\((https?:\/\/[^\s)]+)\)/gi, (_, url: string) => {
    push(url);
    return "";
  });
  String(text || "").replace(/\[图片[^\]]*]\s+(https?:\/\/\S+)/gi, (_, url: string) => {
    push(url);
    return "";
  });
  return urls;
}

function isImageAttachment(attachment: ExportAttachment): boolean {
  const mimeType = String(attachment.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/")) return true;
  return isImageUrl(attachment.fileName || attachment.url || "");
}

function isDataUrl(value: string | undefined): boolean {
  return /^data:/i.test(String(value || "").trim());
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function isImageUrl(value: string): boolean {
  return /\.(?:png|jpe?g|gif|webp|svg|bmp|ico|avif)(?:$|[?#])/i.test(String(value || ""));
}

function guessImageMimeType(value = ""): string {
  const ext = String(value || "").split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || "";
  const byExt: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    ico: "image/x-icon",
    avif: "image/avif"
  };
  return byExt[ext] || "image/png";
}

function replaceAllText(value: string, from: string, to: string): string {
  return String(value || "").split(from).join(to);
}

function restoreBackupFileContent(file: StoredBackupFile): string | Uint8Array {
  if (file.encoding === "base64") {
    return base64ToBytes(String(file.content || ""));
  }
  if (file.encoding === "bytes") {
    return new Uint8Array(Array.isArray(file.content) ? file.content : []);
  }
  return String(file.content || "");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function cloneSnapshot(snapshot: ConversationSnapshot): ConversationSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as ConversationSnapshot;
}

function createSnapshotDigest(snapshot: ConversationSnapshot): string {
  return hashString(JSON.stringify({
    platformId: snapshot.platformId,
    conversationId: snapshot.conversationId,
    title: snapshot.title,
    updatedAt: snapshot.updatedAt,
    updatedAtText: snapshot.updatedAtText,
    createdAt: snapshot.createdAt,
    createdAtText: snapshot.createdAtText,
    messages: snapshot.messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      fullText: message.fullText,
      fragmentType: message.fragmentType,
      attachments: message.attachments?.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        content: attachment.content,
        url: attachment.url
      }))
    })),
    attachments: snapshot.attachments
  }));
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildBackupRecordId(
  platformId: PlatformId,
  conversationId: string,
  format: SnapshotExportFormat,
  digest: string,
  createdAt: string
): string {
  return [platformId, conversationId, format, digest, createdAt]
    .map((part) => String(part || "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase())
    .filter(Boolean)
    .join("-");
}

function isSameBackupRevision(left: ConversationBackupRecord, right: ConversationBackupRecord): boolean {
  return left.platformId === right.platformId
    && left.conversationId === right.conversationId
    && left.format === right.format
    && left.digest === right.digest;
}

function shouldUpgradeBackupRevision(existing: ConversationBackupRecord, candidate: ConversationBackupRecord): boolean {
  const existingStatus = existing.assetStatus || { cachedImages: 0, failedImages: 0 };
  const candidateStatus = candidate.assetStatus || { cachedImages: 0, failedImages: 0 };
  if (candidateStatus.cachedImages > existingStatus.cachedImages) return true;
  if (
    candidateStatus.cachedImages === existingStatus.cachedImages
    && candidateStatus.failedImages < existingStatus.failedImages
  ) {
    return true;
  }
  return false;
}

function getConversationBackupEntryId(record: ConversationBackupRecord): string {
  return `${record.platformId}::${record.conversationId || "current"}`;
}

function normalizeBackupRecords(value: unknown): ConversationBackupRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ConversationBackupRecord => isBackupRecord(item))
    .sort(sortBackupsNewestFirst);
}

function isBackupRecord(value: unknown): value is ConversationBackupRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ConversationBackupRecord>;
  return isPlatformId(record.platformId)
    && typeof record.id === "string"
    && typeof record.conversationId === "string"
    && typeof record.title === "string"
    && typeof record.digest === "string"
    && typeof record.createdAt === "string"
    && Array.isArray(record.files)
    && Boolean(record.snapshot);
}

function isPlatformId(value: unknown): value is PlatformId {
  return value === "chatgpt" || value === "claude" || value === "qwen" || value === "doubao" || value === "deepseek";
}

function sortBackupsNewestFirst(left: ConversationBackupRecord, right: ConversationBackupRecord): number {
  return Date.parse(right.createdAt) - Date.parse(left.createdAt);
}

function getPlatformOrderIndex(platformId: PlatformId): number {
  const index = platformOrder.indexOf(platformId);
  return index >= 0 ? index : platformOrder.length;
}
