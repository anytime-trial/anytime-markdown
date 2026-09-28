import type { Editor } from "@anytime-markdown/markdown-core";
import {
  AGENT_EDIT_REFRESH_META, agentEditKey, createAgentEditPlugin, ensureAgentEditStyles,
  type AgentEditUiEntry,
} from "../../extensions/agentEditPlugin";

export interface AgentEditTarget { heading: string; occurrence?: number }
export interface AgentEditController {
  getUi: () => AgentEditUiEntry[];
  set: (targets: AgentEditTarget[]) => void;
  acknowledge: (headingIndex: number) => void;
  clear: () => void;
  dispose: () => void;
}

export function installAgentEdits({ editor }: { editor: Editor }): AgentEditController {
  let ui: AgentEditUiEntry[] = [];
  let applying = false;
  let pendingRefresh = false;
  let disposed = false;
  ensureAgentEditStyles(editor.view.dom.ownerDocument);
  const refresh = (): void => {
    if (disposed || editor.isDestroyed) return;
    if (applying) { pendingRefresh = true; return; }
    editor.view.dispatch(editor.state.tr.setMeta(AGENT_EDIT_REFRESH_META, true));
  };
  const acknowledge = (headingIndex: number): void => {
    if (disposed || !ui.some(entry => entry.headingIndex === headingIndex)) return;
    ui = ui.filter(entry => entry.headingIndex !== headingIndex);
    refresh();
  };
  // Registration initializes decorations without dispatch during chrome construction (TDZ).
  editor.registerPlugin(createAgentEditPlugin({
    getUiState: () => ui,
    onHumanEdit: headingIndex => {
      applying = true;
      try { acknowledge(headingIndex); } finally { applying = false; }
    },
  }));
  const onTransaction = (): void => {
    // apply runs before EditorView installs the new state: dispatch only after that completes.
    if (!pendingRefresh) return;
    pendingRefresh = false;
    refresh();
  };
  editor.on("transaction", onTransaction);
  return {
    getUi: () => ui.map(entry => ({ ...entry })),
    set(targets) {
      if (disposed) return;
      const headings: Array<{ level: number; text: string }> = [];
      editor.state.doc.forEach(node => {
        if (node.type.name === "heading") headings.push({ level: node.attrs.level, text: node.textContent });
      });
      const indices = new Set<number>();
      for (const target of targets) {
        const match = /^(#{1,6})\s+(.*?)\s*$/.exec(target.heading);
        const occurrence = target.occurrence ?? 1;
        if (!match || !Number.isInteger(occurrence) || occurrence < 1) continue;
        let count = 0;
        const headingIndex = headings.findIndex(heading =>
          heading.level === match[1].length && heading.text === match[2] && ++count === occurrence);
        if (headingIndex >= 0) indices.add(headingIndex);
      }
      ui = Array.from(indices, headingIndex => ({ headingIndex }));
      refresh();
    },
    acknowledge,
    clear() { if (!disposed) { ui = []; refresh(); } },
    dispose() {
      if (disposed) return;
      disposed = true;
      pendingRefresh = false;
      ui = [];
      editor.off("transaction", onTransaction);
      if (!editor.isDestroyed) editor.unregisterPlugin(agentEditKey);
    },
  };
}
