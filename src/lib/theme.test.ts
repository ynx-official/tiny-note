import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, saveAccent, savePaper } from "./theme";

function createStyleStore() {
  const values = new Map<string, string>();
  return {
    setProperty: (key: string, value: string) => {
      values.set(key, value);
    },
    getPropertyValue: (key: string) => values.get(key) ?? "",
    removeProperty: (key: string) => {
      values.delete(key);
    },
  };
}

describe("applyTheme semantic surface vars", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    const style = createStyleStore();

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
        clear: () => {
          storage.clear();
        },
      },
    });

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        documentElement: {
          style,
          setAttribute: () => {},
          removeAttribute: () => {},
        },
      },
    });
  });

  it("在浅色主题下同步生成页面语义层级变量", () => {
    savePaper("light", "#faf9f5");
    saveAccent("light", "#2d5a3d");

    applyTheme("light");

    const rootStyle = document.documentElement.style;
    expect(rootStyle.getPropertyValue("--surface-app")).toBeTruthy();
    expect(rootStyle.getPropertyValue("--surface-panel")).toBeTruthy();
    expect(rootStyle.getPropertyValue("--surface-panel-muted")).toBeTruthy();
    expect(rootStyle.getPropertyValue("--surface-hover")).toBeTruthy();
    expect(rootStyle.getPropertyValue("--surface-active")).toBeTruthy();
    expect(rootStyle.getPropertyValue("--border-soft")).toBeTruthy();
    expect(rootStyle.getPropertyValue("--border-strong")).toBeTruthy();
  });

  it("在深色主题下也生成同一组语义变量", () => {
    savePaper("dark", "#1a1a1e");
    saveAccent("dark", "#4ade80");

    applyTheme("dark");

    const rootStyle = document.documentElement.style;
    expect(rootStyle.getPropertyValue("--surface-app")).toBeTruthy();
    expect(rootStyle.getPropertyValue("--surface-panel")).toBeTruthy();
    expect(rootStyle.getPropertyValue("--surface-panel-muted")).toBeTruthy();
    expect(rootStyle.getPropertyValue("--surface-hover")).toBeTruthy();
    expect(rootStyle.getPropertyValue("--surface-active")).toBeTruthy();
    expect(rootStyle.getPropertyValue("--border-soft")).toBeTruthy();
    expect(rootStyle.getPropertyValue("--border-strong")).toBeTruthy();
  });
});