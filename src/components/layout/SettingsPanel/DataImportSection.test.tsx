import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataImportSection } from "./DataImportSection";

describe("DataImportSection", () => {
  it("在设置页提供导入笔记入口和格式提示", () => {
    const html = renderToStaticMarkup(
      <DataImportSection onImported={() => {}} onMessage={() => {}} />,
    );

    expect(html).toContain("导入笔记");
    expect(html).toContain("支持 .md .txt .html 文件");
  });
});