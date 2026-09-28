import { Plugin, PluginKey } from "@anytime-markdown/markdown-pm/state";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";
import { Decoration, DecorationSet } from "@anytime-markdown/markdown-pm/view";
import { SECTION_LOCK_ALLOW_META } from "./sectionLockPlugin";
import { getSectionRange } from "../utils/sectionHelpers";

export interface AgentEditUiEntry { headingIndex: number }
export const AGENT_EDIT_REFRESH_META = "am-agent-edit-refresh";
export const agentEditKey = new PluginKey<DecorationSet>("agentEdit");

function resolveRanges(doc: PMNode, ui: AgentEditUiEntry[]) {
  const headings: Array<{ pos: number; level: number }> = [];
  doc.forEach((node, pos) => {
    if (node.type.name === "heading") headings.push({ pos, level: node.attrs.level });
  });
  return ui.flatMap(({ headingIndex }) => {
    const heading = headings[headingIndex];
    return heading ? [{ headingIndex, ...getSectionRange(doc, heading.pos, heading.level) }] : [];
  });
}

function decorations(doc: PMNode, ui: AgentEditUiEntry[]): DecorationSet {
  const ranges = resolveRanges(doc, ui);
  const result: Decoration[] = [];
  doc.forEach((node, pos) => {
    if (ranges.some(range => pos >= range.from && pos < range.to)) {
      result.push(Decoration.node(pos, pos + node.nodeSize, { "data-am-agent-edit": "recent" }));
    }
  });
  return DecorationSet.create(doc, result);
}

export function createAgentEditPlugin(opts: {
  getUiState: () => AgentEditUiEntry[];
  onHumanEdit: (headingIndex: number) => void;
}): Plugin {
  return new Plugin<DecorationSet>({
    key: agentEditKey,
    state: {
      init: (_config, state) => decorations(state.doc, opts.getUiState()),
      apply(tr, value, oldState, newState) {
        if (tr.docChanged && tr.getMeta(SECTION_LOCK_ALLOW_META) !== true) {
          const ranges = resolveRanges(oldState.doc, opts.getUiState());
          const touched = new Set<number>();
          tr.steps.forEach((step, index) => {
            // Each step uses the preceding step's document; map back to the original document.
            const inverse = tr.mapping.slice(0, index).invert();
            const visit = (from: number, to: number): void => {
              const start = inverse.map(from, 1);
              const end = inverse.map(to, -1);
              for (const range of ranges) {
                if (from === to
                  ? start >= range.from && start < range.to
                  : start < range.to && end > range.from) touched.add(range.headingIndex);
              }
            };
            let mapped = false;
            step.getMap().forEach((from, to) => { mapped = true; visit(from, to); });
            // Mark/attribute steps do not change positions and can have an empty StepMap.
            if (!mapped) {
              if ('from' in step && 'to' in step && typeof step.from === 'number' && typeof step.to === 'number') {
                visit(step.from, step.to);
              } else if ('pos' in step && typeof step.pos === 'number') {
                visit(step.pos, step.pos);
              }
            }
          });
          for (const headingIndex of touched) opts.onHumanEdit(headingIndex);
        }
        return tr.docChanged || tr.getMeta(AGENT_EDIT_REFRESH_META) === true
          ? decorations(newState.doc, opts.getUiState()) : value;
      },
    },
    props: { decorations: state => agentEditKey.getState(state) },
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
