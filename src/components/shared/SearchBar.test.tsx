import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchBar } from "./SearchBar";

describe("SearchBar", () => {
  it("只保留搜索输入和清空动作，不再显示说明文案和结果统计", () => {
    const html = renderToStaticMarkup(
      <SearchBar
        value="会议"
        onChange={() => {}}
        onClear={() => {}}
        onCommit={() => {}}
      />,
    );

    expect(html).toContain("按标题和正文搜索笔记");
    expect(html).toContain("清空");
    expect(html).not.toContain("快速搜索");
    expect(html).not.toContain("标题和正文一起筛选");
    expect(html).not.toContain("找到 3 / 12 条");
    expect(html).not.toContain("全部笔记");
  });
});