import { describe, expect, it, vi } from "vitest";
import { createUrlChangeAutoBackupScheduler } from "../content/url-change-auto-backup";

describe("url change auto backup scheduler", () => {
  it("triggers only after the configured delay for a new conversation URL", () => {
    vi.useFakeTimers();
    const onTrigger = vi.fn();
    const scheduler = createUrlChangeAutoBackupScheduler({
      getDelaySeconds: () => 5,
      isEnabled: () => true,
      onTrigger
    });

    scheduler.sync("https://chatgpt.com/c/current", "current");
    scheduler.handleNavigation("https://chatgpt.com/c/conv-b", "conv-b");

    vi.advanceTimersByTime(4900);
    expect(onTrigger).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(onTrigger).toHaveBeenCalledTimes(1);

    scheduler.dispose();
    vi.useRealTimers();
  });

  it("resets the delay when navigation changes again before the timer fires", () => {
    vi.useFakeTimers();
    const onTrigger = vi.fn();
    const scheduler = createUrlChangeAutoBackupScheduler({
      getDelaySeconds: () => 5,
      isEnabled: () => true,
      onTrigger
    });

    scheduler.sync("https://chatgpt.com/c/current", "current");
    scheduler.handleNavigation("https://chatgpt.com/c/conv-b", "conv-b");
    vi.advanceTimersByTime(3000);
    scheduler.handleNavigation("https://chatgpt.com/c/conv-c", "conv-c");

    vi.advanceTimersByTime(4900);
    expect(onTrigger).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(onTrigger).toHaveBeenCalledTimes(1);

    scheduler.dispose();
    vi.useRealTimers();
  });

  it("does not trigger for the same conversation id or when disabled", () => {
    vi.useFakeTimers();
    const onTrigger = vi.fn();
    const scheduler = createUrlChangeAutoBackupScheduler({
      getDelaySeconds: () => 1,
      isEnabled: () => false,
      onTrigger
    });

    scheduler.sync("https://chatgpt.com/c/conv-a", "conv-a");
    scheduler.handleNavigation("https://chatgpt.com/c/conv-a?model=gpt-4", "conv-a");
    scheduler.handleNavigation("https://chatgpt.com/c/conv-b", "conv-b");
    vi.advanceTimersByTime(1000);

    expect(onTrigger).not.toHaveBeenCalled();

    scheduler.dispose();
    vi.useRealTimers();
  });
});
