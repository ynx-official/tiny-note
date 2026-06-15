export type SidebarSelectableKind = "folder" | "note";

export interface SidebarSelectionState {
  kind: SidebarSelectableKind | null;
  ids: Set<string>;
  anchorId: string | null;
}

interface ApplySidebarSelectionInput {
  selection: SidebarSelectionState;
  clickedId: string;
  clickedKind: SidebarSelectableKind;
  visibleIds: string[];
  additive: boolean;
  range: boolean;
}

interface ResolveSidebarDeletionIdsInput {
  selection: SidebarSelectionState;
  clickedId: string;
  clickedKind: SidebarSelectableKind;
}

const createSingleSelection = (clickedId: string, clickedKind: SidebarSelectableKind): SidebarSelectionState => ({
  kind: clickedKind,
  ids: new Set([clickedId]),
  anchorId: clickedId,
});

export function applySidebarSelection(input: ApplySidebarSelectionInput): SidebarSelectionState {
  const { selection, clickedId, clickedKind, visibleIds, additive, range } = input;

  if (range) {
    if (selection.kind !== clickedKind || !selection.anchorId) {
      return createSingleSelection(clickedId, clickedKind);
    }

    const anchorIndex = visibleIds.indexOf(selection.anchorId);
    const clickedIndex = visibleIds.indexOf(clickedId);
    if (anchorIndex === -1 || clickedIndex === -1) {
      return createSingleSelection(clickedId, clickedKind);
    }

    const start = Math.min(anchorIndex, clickedIndex);
    const end = Math.max(anchorIndex, clickedIndex);
    return {
      kind: clickedKind,
      ids: new Set(visibleIds.slice(start, end + 1)),
      anchorId: selection.anchorId,
    };
  }

  if (additive) {
    if (selection.kind !== clickedKind) {
      return createSingleSelection(clickedId, clickedKind);
    }

    const nextIds = new Set(selection.ids);
    if (nextIds.has(clickedId)) {
      nextIds.delete(clickedId);
    } else {
      nextIds.add(clickedId);
    }

    return {
      kind: nextIds.size > 0 ? clickedKind : null,
      ids: nextIds,
      anchorId: nextIds.size > 0 ? clickedId : null,
    };
  }

  return createSingleSelection(clickedId, clickedKind);
}

export function resolveSidebarDeletionIds(input: ResolveSidebarDeletionIdsInput): string[] {
  const { selection, clickedId, clickedKind } = input;

  if (selection.kind === clickedKind && selection.ids.has(clickedId) && selection.ids.size > 1) {
    return [...selection.ids];
  }

  return [clickedId];
}
