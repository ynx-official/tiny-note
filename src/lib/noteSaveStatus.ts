export type NotePersistState = "idle" | "saving" | "failed";
export type NoteSavePhase = "saved" | "dirty" | "saving" | "failed";
export type NoteSaveTone = "success" | "warning" | "danger";

export interface NoteSaveStatusInput {
  isDirty: boolean;
  saveState: NotePersistState;
  saveError: string | null;
}

export interface NoteSaveStatus {
  phase: NoteSavePhase;
  shortLabel: string;
  longLabel: string;
  detail: string | null;
  tone: NoteSaveTone;
  canRetry: boolean;
}

export function resolveNoteSaveStatus({ isDirty, saveState, saveError }: NoteSaveStatusInput): NoteSaveStatus {
  if (saveState === "failed") {
    return {
      phase: "failed",
      shortLabel: "保存失败",
      longLabel: "保存失败，请重试",
      detail: saveError,
      tone: "danger",
      canRetry: true,
    };
  }

  if (saveState === "saving") {
    return {
      phase: "saving",
      shortLabel: "保存中",
      longLabel: "正在保存更改",
      detail: null,
      tone: "warning",
      canRetry: false,
    };
  }

  if (isDirty) {
    return {
      phase: "dirty",
      shortLabel: "未保存",
      longLabel: "有未保存更改",
      detail: null,
      tone: "warning",
      canRetry: false,
    };
  }

  return {
    phase: "saved",
    shortLabel: "已保存",
    longLabel: "内容已保存",
    detail: null,
    tone: "success",
    canRetry: false,
  };
}