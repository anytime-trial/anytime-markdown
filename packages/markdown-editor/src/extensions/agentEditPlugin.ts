import { Plugin, PluginKey } from "@anytime-markdown/markdown-pm/state";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";
import { Decoration, DecorationSet } from "@anytime-markdown/markdown-pm/view";
import { SECTION_LOCK_ALLOW_META } from "./sectionLockPlugin";
import { getSectionRange } from "../utils/sectionHelpers";

/**
 * AI 編集の表示対象は「見出しの同一性」（レベル・正規化テキスト・出現順）で持つ。
 * heading-only index で持つと、上に見出しが増減したとき別の節へ表示が移り、
 * 人の書いた節を AI 編集と偽る（レビュー指摘 #1）。index は描画のたびに解決し直す。
 */
export interface AgentEditUiEntry {
  readonly level: number;
  /** normalizeHeadingText 済み */
  readonly text: string;
  readonly occurrence: number;
}
export const AGENT_EDIT_REFRESH_META = "am-agent-edit-refresh";
export const agentEditKey = new PluginKey<DecorationSet>("agentEdit");

/**
 * 見出しテキストの突合用正規化。台帳の見出し行は markdown（`` `code` `` / `*強調*`）を含むが、
 * ProseMirror の textContent はマーカーを持たないため、両側からインラインマーカーを落として
 * 空白を畳む（レビュー指摘 #5）。
 */
export function normalizeHeadingText(text: string): string {
  return text.replace(/[`*_~]/g, "").replace(/\s+/g, " ").trim();
}

export function agentEditEntryKey(entry: AgentEditUiEntry): string {
  return `${entry.level}\u0000${entry.occurrence}\u0000${entry.text}`;
}

interface HeadingSlot { pos: number; level: number; text: string; occurrence: number; headingIndex: number }

function listHeadings(doc: PMNode): HeadingSlot[] {
  const counts = new Map<string, number>();
  const headings: HeadingSlot[] = [];
  doc.forEach((node, pos) => {
    if (node.type.name !== "heading") return;
    const level = (node.attrs.level as number) ?? 1;
    const text = normalizeHeadingText(node.textContent);
    const key = `${level}\u0000${text}`;
    const occurrence = (counts.get(key) ?? 0) + 1;
    counts.set(key, occurrence);
    headings.push({ pos, level, text, occurrence, headingIndex: headings.length });
  });
  return headings;
}

/** 現在の doc で各エントリが指す heading-only index。解決できないエントリは含めない。 */
export function resolveAgentEditHeadingIndices(
  doc: PMNode,
  ui: readonly AgentEditUiEntry[],
): Array<{ entry: AgentEditUiEntry; headingIndex: number }> {
  const headings = listHeadings(doc);
  return ui.flatMap((entry) => {
    const hit = headings.find(
      (h) => h.level === entry.level && h.text === entry.text && h.occurrence === entry.occurrence,
    );
    return hit ? [{ entry, headingIndex: hit.headingIndex }] : [];
  });
}

function resolveRanges(doc: PMNode, ui: readonly AgentEditUiEntry[]) {
  const headings = listHeadings(doc);
  return ui.flatMap((entry) => {
    const hit = headings.find(
      (h) => h.level === entry.level && h.text === entry.text && h.occurrence === entry.occurrence,
    );
    return hit ? [{ entry, ...getSectionRange(doc, hit.pos, hit.level) }] : [];
  });
}

function decorations(doc: PMNode, ui: readonly AgentEditUiEntry[]): DecorationSet {
  const ranges = resolveRanges(doc, ui);
  const result: Decoration[] = [];
  doc.forEach((node, pos) => {
    if (ranges.some((range) => pos >= range.from && pos < range.to)) {
      result.push(Decoration.node(pos, pos + node.nodeSize, { "data-am-agent-edit": "recent" }));
    }
  });
  return DecorationSet.create(doc, result);
}

export function createAgentEditPlugin(opts: {
  getUiState: () => readonly AgentEditUiEntry[];
  onHumanEdit: (entry: AgentEditUiEntry) => void;
}): Plugin {
  return new Plugin<DecorationSet>({
    key: agentEditKey,
    state: {
      init: (_config, state) => decorations(state.doc, opts.getUiState()),
      apply(tr, value, oldState, newState) {
        if (tr.docChanged && tr.getMeta(SECTION_LOCK_ALLOW_META) !== true) {
          const ranges = resolveRanges(oldState.doc, opts.getUiState());
          const touched = new Map<string, AgentEditUiEntry>();
          tr.steps.forEach((step, index) => {
            // 各ステップは直前ステップ後の doc 座標を持つ。元の doc 座標へ戻して範囲と突合する
            const inverse = tr.mapping.slice(0, index).invert();
            const visit = (from: number, to: number): void => {
              const start = inverse.map(from, 1);
              const end = inverse.map(to, -1);
              for (const range of ranges) {
                const hit = from === to
                  ? start >= range.from && start < range.to
                  : start < range.to && end > range.from;
                if (hit) touched.set(agentEditEntryKey(range.entry), range.entry);
              }
            };
            let mapped = false;
            step.getMap().forEach((from, to) => { mapped = true; visit(from, to); });
            // マーク・属性のステップは位置を変えず StepMap が空になり得る
            if (!mapped) {
              if ("from" in step && "to" in step && typeof step.from === "number" && typeof step.to === "number") {
                visit(step.from, step.to);
              } else if ("pos" in step && typeof step.pos === "number") {
                visit(step.pos, step.pos);
              }
            }
          });
          for (const entry of touched.values()) opts.onHumanEdit(entry);
        }
        return tr.docChanged || tr.getMeta(AGENT_EDIT_REFRESH_META) === true
          ? decorations(newState.doc, opts.getUiState())
          : value;
      },
    },
    props: { decorations: (state) => agentEditKey.getState(state) },
  });
}

export function ensureAgentEditStyles(doc: Document): void {
  if (doc.getElementById("am-agent-edit-styles")) return;
  const style = doc.createElement("style");
  style.id = "am-agent-edit-styles";
  style.textContent = `
[data-am-agent-edit] { border-left: 3px solid var(--am-color-agent-main, #1F6FEB); padding-left: 8px; background: var(--am-color-agent-alpha, rgba(31,111,235,0.10)); }
h1[data-am-agent-edit]::after, h2[data-am-agent-edit]::after, h3[data-am-agent-edit]::after,
h4[data-am-agent-edit]::after, h5[data-am-agent-edit]::after, h6[data-am-agent-edit]::after {
  content: "🤖"; font-size: 0.7em; margin-left: 8px;
}
h1[data-am-agent-edit][data-am-section-lock]::after, h2[data-am-agent-edit][data-am-section-lock]::after,
h3[data-am-agent-edit][data-am-section-lock]::after, h4[data-am-agent-edit][data-am-section-lock]::after,
h5[data-am-agent-edit][data-am-section-lock]::after, h6[data-am-agent-edit][data-am-section-lock]::after { content: "🔒 🤖"; }
h1[data-am-agent-edit][data-am-section-lock="tampered"]::after, h2[data-am-agent-edit][data-am-section-lock="tampered"]::after,
h3[data-am-agent-edit][data-am-section-lock="tampered"]::after, h4[data-am-agent-edit][data-am-section-lock="tampered"]::after,
h5[data-am-agent-edit][data-am-section-lock="tampered"]::after, h6[data-am-agent-edit][data-am-section-lock="tampered"]::after { content: "⚠️ 🔒 🤖"; }
`;
  doc.head.appendChild(style);
}
