import type { Editor } from "@anytime-markdown/markdown-core";
import {
  AGENT_EDIT_REFRESH_META,
  agentEditEntryKey,
  agentEditKey,
  createAgentEditPlugin,
  ensureAgentEditStyles,
  normalizeHeadingText,
  resolveAgentEditHeadingIndices,
  type AgentEditUiEntry,
} from "../../extensions/agentEditPlugin";

/** heading は "## A" のような見出し行（# 付き・markdown 可）。occurrence は同一見出しの 1 始まり。 */
export interface AgentEditTarget { heading: string; occurrence?: number }
export interface AgentEditController {
  /** OutlinePanel が都度参照する、現在の doc で解決した heading-only index の一覧。 */
  getUi: () => Array<{ headingIndex: number }>;
  set: (targets: AgentEditTarget[]) => void;
  /** heading-only index で指定した節の表示を解除する（アウトラインの確認ボタン）。 */
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
  const removeEntry = (entry: AgentEditUiEntry): void => {
    const key = agentEditEntryKey(entry);
    if (disposed || !ui.some((e) => agentEditEntryKey(e) === key)) return;
    ui = ui.filter((e) => agentEditEntryKey(e) !== key);
    refresh();
  };
  // 登録は installSectionLocks と同じく初期 dispatch なし（chrome 構築中の TDZ 事故を避ける）
  editor.registerPlugin(createAgentEditPlugin({
    getUiState: () => ui,
    onHumanEdit: (entry) => {
      applying = true;
      try { removeEntry(entry); } finally { applying = false; }
    },
  }));
  const onTransaction = (): void => {
    // apply は EditorView が新 state を入れる前に走る。dispatch はその完了後に行う
    if (!pendingRefresh) return;
    pendingRefresh = false;
    refresh();
  };
  editor.on("transaction", onTransaction);
  return {
    getUi: () => resolveAgentEditHeadingIndices(editor.state.doc, ui).map(({ headingIndex }) => ({ headingIndex })),
    set(targets) {
      if (disposed) return;
      const seen = new Set<string>();
      const next: AgentEditUiEntry[] = [];
      for (const target of targets) {
        const match = /^(#{1,6})\s+(.*?)\s*$/.exec(target.heading);
        const occurrence = target.occurrence ?? 1;
        if (!match || !Number.isInteger(occurrence) || occurrence < 1) continue;
        const entry: AgentEditUiEntry = { level: match[1].length, text: normalizeHeadingText(match[2]), occurrence };
        const key = agentEditEntryKey(entry);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(entry);
      }
      ui = next;
      refresh();
    },
    acknowledge(headingIndex) {
      const hit = resolveAgentEditHeadingIndices(editor.state.doc, ui).find((r) => r.headingIndex === headingIndex);
      if (hit) removeEntry(hit.entry);
    },
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
