import { ArticleAIChatPanel } from "./ArticleAIChatPanel";
import { GlobalAIChatPanel } from "./GlobalAIChatPanel";
import type { AIChatPanelProps } from "./types";

export type { AIChatPanelProps, AIContextAttachment, PendingAIContext } from "./types";

export function AIChatPanel(props: AIChatPanelProps) {
  if (props.scope === "article") {
    return <ArticleAIChatPanel {...props} />;
  }

  return <GlobalAIChatPanel {...props} />;
}