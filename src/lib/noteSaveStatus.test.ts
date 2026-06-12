import { describe, expect, it } from "vitest";
import { resolveNoteSaveStatus } from "./noteSaveStatus";

describe("resolveNoteSaveStatus", () => {
  it("在有未保存改动时返回未保存状态", () => {
    expect(resolveNoteSaveStatus({ isDirty: true, saveState: "idle", saveError: null })).toMatchObject({
      phase: "dirty",
      shortLabel: "未保存",
      longLabel: "有未保存更改",
      tone: "warning",
      canRetry: false,
    });
  });

  it("在保存进行中时优先返回保存中状态", () => {
    expect(resolveNoteSaveStatus({ isDirty: true, saveState: "saving", saveError: null })).toMatchObject({
      phase: "saving",
      shortLabel: "保存中",
      longLabel: "正在保存更改",
      tone: "warning",
      canRetry: false,
    });
  });

  it("在保存失败时保留重试语义和错误详情", () => {
    expect(resolveNoteSaveStatus({ isDirty: true, saveState: "failed", saveError: "网络异常" })).toMatchObject({
      phase: "failed",
      shortLabel: "保存失败",
      longLabel: "保存失败，请重试",
      detail: "网络异常",
      tone: "danger",
      canRetry: true,
    });
  });

  it("在没有改动且无错误时返回已保存状态", () => {
    expect(resolveNoteSaveStatus({ isDirty: false, saveState: "idle", saveError: null })).toMatchObject({
      phase: "saved",
      shortLabel: "已保存",
      longLabel: "内容已保存",
      tone: "success",
      canRetry: false,
    });
  });
});