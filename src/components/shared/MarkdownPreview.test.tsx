import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownPreview } from "./MarkdownPreview";

describe("MarkdownPreview 目录", () => {
  it("开启目录时会提取标题、保留跳转目标，并默认高亮第一节", () => {
    const html = renderToStaticMarkup(
      <MarkdownPreview
        content={`# Java 入门\n\n## 基本语法\n\n### 变量\n\n\
\
\
\`\`\`md\n# 代码里的标题不应进入目录\n\`\`\``}
        showOutline
      />,
    );

    expect(html).toContain('data-outline="true"');
    expect(html).toContain('data-outline-item="java-入门"');
    expect(html).toContain('data-outline-target="#java-入门"');
    expect(html).toContain('data-outline-active="true"');
    expect(html).toContain('data-outline-item="基本语法"');
    expect(html).toContain('data-outline-target="#基本语法"');
    expect(html).toContain('data-outline-item="变量"');
    expect(html).toContain('data-outline-target="#变量"');
    expect(html).not.toContain('data-outline-item="代码里的标题不应进入目录"');
  });

  it("关闭目录时不渲染目录区", () => {
    const html = renderToStaticMarkup(
      <MarkdownPreview content={`# Java 入门\n\n## 基本语法`} showOutline={false} />,
    );

    expect(html).not.toContain('data-outline="true"');
    expect(html).not.toContain('data-outline-item=');
  });
});