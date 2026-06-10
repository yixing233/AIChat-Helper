import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(resolve(process.cwd(), "src/content/main.ts"), "utf8");

describe("content main toast feedback", () => {
  it("uses the shared toast component for visible operation feedback", () => {
    expect(mainSource).toContain('from "../ui/toast/toast"');
    expect(mainSource).toContain('showToast("正在检查更新"');
    expect(mainSource).toContain('showToast("正在准备导出当前对话"');
    expect(mainSource).toContain('showToast("正在导出当前对话"');
    expect(mainSource).toContain('showToast("正在获取近期对话"');
    expect(mainSource).toContain('showToast(`正在导出 ${index + 1}/${total}');
    expect(mainSource).toContain('showToast("正在准备立即备份"');
    expect(mainSource).toContain('showToast("正在备份当前对话"');
    expect(mainSource).toContain('showToast("自动备份中，请勿退出当前页面，图片缓存完成后会自动保存。"');
    expect(mainSource).toContain('showToast(`自动备份已检查：${result.record.title} 内容未变化`');
    expect(mainSource).toContain('showToast(`正在备份 ${index + 1}/${total}');
    expect(mainSource).toContain('backup-current-now');
    expect(mainSource).toContain('backup-platform-now');
  });
});
