/**
 * Phase 5 S4 (FR-S4-2): 確定セクションロックの編集ブロック + 視覚表示 Plugin。
 *
 * ロックの正本は frontmatter `lockedSections`（section-lock-core）。ホスト
 * （vanillaMarkdownEditor）が serialize 済み markdown から見出しインデックスへ
 * 対応づけた UI 状態を保持し、本 Plugin は getter 経由で都度参照する
 * （vanilla-ui-conventions: モードフラグの静的キャプチャ禁止と同じ原則）。
 *
 * - filterTransaction: ロック節（見出し行含む・下位見出し含む範囲）に交差する
 *   docChanged トランザクションを拒否する。
 * - decorations: ロック節の各トップレベルノードに `data-am-section-lock` を付与
 *   （locked / tampered）。見た目は注入スタイルシート側（inline style 禁止）。
 */

import type { Editor } from "@anytime-markdown/markdown-core";
import { Plugin, PluginKey } from "@anytime-markdown/markdown-pm/state";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";
import { Decoration, DecorationSet } from "@anytime-markdown/markdown-pm/view";
import {
  computeSectionHash,
  listSections,
  parseLockedSections,
  type LockedSectionEntry,
} from "@anytime-markdown/section-lock-core";
import { getSectionRange } from "../utils/sectionHelpers";

export const sectionLockKey = new PluginKey("sectionLock");

/** 状態更新（frontmatter 変更）後に装飾を再計算させる transaction meta。 */
export const SECTION_LOCK_REFRESH_META = "sectionLock:refresh";

/**
 * ホスト起点のコンテンツ差し替え（VS Code 外部変更反映・Undo/Redo・Git revert・
 * インポート / スニペットのパース退避と復元）を編集ブロックの対象外にする meta。
 * これらは doc 全域 ReplaceStep のためロック範囲に常に交差し、meta 無しでは
 * 黙って破棄されて表示と実ファイルが乖離する（cross-review 合意 #1）。
 * ロック外経路の実変更は tamper 検知（不整合表示 + section_lock_tamper 記録）が受け持つ。
 */
export const SECTION_LOCK_ALLOW_META = "sectionLock:allowContentReplace";

/** ロックエントリを doc の見出し出現順インデックスへ対応づけた UI 状態。 */
export interface SectionLockUiEntry {
  /** serialize 済み markdown の見出し出現順（= doc のトップレベル heading 出現順）。節消失時は -1 */
  headingIndex: number;
  path: string;
  occurrence: number;
  /** ロック外経路で本文が変わっている（hash 不一致・節消失）。表示は警告系に切替 */
  tampered: boolean;
}

export interface SectionLockState {
  entries: LockedSectionEntry[];
  ui: SectionLockUiEntry[];
}

/**
 * frontmatter 付き markdown 全文からロック UI 状態を計算する。
 * 見出しの対応づけは「出現順インデックス」で行う（doc の heading テキストは
 * インラインマーク記法が落ちるため、パス文字列の直接照合はしない）。
 */
export function computeSectionLockState(fullMarkdown: string): SectionLockState {
  const entries = parseLockedSections(fullMarkdown);
  if (entries.length === 0) return { entries, ui: [] };
  const sections = listSections(fullMarkdown);
  const ui = entries.map((entry) => {
    const index = sections.findIndex(
      (s) => s.path === entry.path && s.occurrence === entry.occurrence,
    );
    const section = index >= 0 ? sections[index] : null;
    const tampered =
      section === null || computeSectionHash(fullMarkdown, section) !== entry.hash;
    return { headingIndex: index, path: entry.path, occurrence: entry.occurrence, tampered };
  });
  return { entries, ui };
}

interface LockedRange {
  from: number;
  to: number;
  tampered: boolean;
}

/** doc のトップレベル heading を出現順に集め、ロック UI 状態を doc 範囲へ解決する。 */
function resolveLockedRanges(doc: PMNode, ui: SectionLockUiEntry[]): LockedRange[] {
  if (ui.length === 0) return [];
  const headings: Array<{ pos: number; level: number }> = [];
  doc.forEach((node, offset) => {
    if (node.type.name === "heading") {
      headings.push({ pos: offset, level: (node.attrs.level as number) ?? 1 });
    }
  });
  const ranges: LockedRange[] = [];
  for (const entry of ui) {
    const heading = entry.headingIndex >= 0 ? headings[entry.headingIndex] : undefined;
    if (!heading) continue;
    const { from, to } = getSectionRange(doc, heading.pos, heading.level);
    ranges.push({ from, to, tampered: entry.tampered });
  }
  return ranges;
}

function buildDecorations(doc: PMNode, ranges: LockedRange[]): DecorationSet {
  if (ranges.length === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.forEach((node, offset) => {
    const range = ranges.find((r) => offset >= r.from && offset < r.to);
    if (!range) return;
    decorations.push(
      Decoration.node(offset, offset + node.nodeSize, {
        "data-am-section-lock": range.tampered ? "tampered" : "locked",
      }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

/** tr が変更する範囲（旧 doc 座標）がロック範囲に交差するか。 */
function touchesLockedRange(
  tr: { docChanged: boolean; steps: Array<{ getMap: () => unknown }> },
  ranges: LockedRange[],
): boolean {
  if (!tr.docChanged || ranges.length === 0) return false;
  let touched = false;
  for (const step of tr.steps) {
    const map = step.getMap() as {
      forEach: (fn: (fromA: number, toA: number) => void) => void;
    };
    map.forEach((fromA, toA) => {
      if (touched) return;
      if (ranges.some((r) => fromA < r.to && toA > r.from)) touched = true;
    });
    if (touched) return true;
  }
  return touched;
}

/**
 * Section Lock Plugin を生成する。`getUiState` は都度評価（ホスト側の最新状態を参照）。
 */
export function createSectionLockPlugin(getUiState: () => SectionLockUiEntry[]): Plugin {
  return new Plugin({
    key: sectionLockKey,
    filterTransaction(tr, state) {
      if (tr.getMeta(SECTION_LOCK_ALLOW_META) === true) return true;
      const ranges = resolveLockedRanges(state.doc, getUiState());
      return !touchesLockedRange(tr as never, ranges);
    },
    state: {
      init(_config, state) {
        return buildDecorations(state.doc, resolveLockedRanges(state.doc, getUiState()));
      },
      apply(tr, value, _oldState, newState) {
        if (tr.docChanged || tr.getMeta(SECTION_LOCK_REFRESH_META) === true) {
          return buildDecorations(newState.doc, resolveLockedRanges(newState.doc, getUiState()));
        }
        return value;
      },
    },
    props: {
      decorations(state) {
        return sectionLockKey.getState(state) as DecorationSet;
      },
    },
  });
}

/**
 * ホスト起点のコンテンツ差し替えをロック対象外 meta 付きで実行する共通ヘルパー。
 * `editor.commands.setContent` の直接呼び出しはロック存在時に黙って破棄されるため、
 * 外部変更反映・パース退避 / 復元の経路は必ずこちらを使う。
 */
export function setContentBypassingSectionLock(
  editor: Editor,
  content: Parameters<Editor["commands"]["setContent"]>[0],
  options?: Parameters<Editor["commands"]["setContent"]>[1],
): void {
  editor.chain().setMeta(SECTION_LOCK_ALLOW_META, true).setContent(content, options).run();
}

const STYLE_ID = "am-section-lock-styles";

/**
 * ロック表示のスタイルシートを注入する（冪等）。色はデザインシステムの共通トークン
 * （accent-amber-alpha / adm-caution）で、ダーク / ライト両モードで機能する。
 * 色だけに依存しない: 見出しに 🔒（tampered は ⚠）を併記する。
 */
export function ensureSectionLockStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
[data-am-section-lock] { border-left: 3px solid rgba(232,160,18,0.55); padding-left: 8px; }
[data-am-section-lock="locked"] { background: rgba(232,160,18,0.07); }
[data-am-section-lock="tampered"] { border-left-color: #DA3633; border-left-style: dashed; background: rgba(218,54,51,0.07); }
h1[data-am-section-lock]::after, h2[data-am-section-lock]::after, h3[data-am-section-lock]::after,
h4[data-am-section-lock]::after, h5[data-am-section-lock]::after, h6[data-am-section-lock]::after {
  content: "\\1F512"; font-size: 0.7em; margin-left: 8px; opacity: 0.75;
}
h1[data-am-section-lock="tampered"]::after, h2[data-am-section-lock="tampered"]::after,
h3[data-am-section-lock="tampered"]::after, h4[data-am-section-lock="tampered"]::after,
h5[data-am-section-lock="tampered"]::after, h6[data-am-section-lock="tampered"]::after {
  content: "\\26A0\\FE0F \\1F512";
}
`;
  doc.head.appendChild(style);
}
