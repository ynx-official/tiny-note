import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoteCollectionView } from "./NoteCollectionView";

describe("NoteCollectionView", () => {
  it("在列表页标题右侧提供新建文件夹和新建笔记入口", () => {
    const html = renderToStaticMarkup(
      <NoteCollectionView
        title="全部笔记"
        description="全部笔记总视图"
        notes={[]}
        selectedId={null}
        selectedIds={new Set()}
        onSelectedIdsChange={() => {}}
        onSelectNote={() => {}}
        onDeselectNote={() => {}}
        onDelete={() => {}}
        folders={[]}
        onMoveMultipleToFolder={() => {}}
        onAddToAIContext={() => {}}
        onAddToNewAIContext={() => {}}
        onCreateFolder={() => {}}
        onCreateNote={() => {}}
      />,
    );

    expect(html).toContain("全部笔记");
    expect(html).toContain("新建文件夹");
    expect(html).toContain("新建笔记");
  });
});