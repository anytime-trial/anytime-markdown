/**
 * 脱React の vanilla DOM「FrontmatterCompareRow」。
 *
 * WYSIWYG 比較モード（InlineMergeView）で、左=比較ファイル / 右=本ファイルの
 * フロントマターを行差分付きで並置表示する。エディタ本文は frontmatter を
 * `preprocessMarkdown` で切り離して扱うため、frontmatter は body の diff には
 * 含まれない。本コンポーネントがその差分表示を補い、比較ビューに内蔵される。
 *
 * 規約（既存 components-vanilla 群に準拠）:
 * - React props → opts。戻り値は { el, update, destroy }。
 * - 色は `--am-color-*` CSS 変数でテーマ追従（ダーク/ライト両対応）。
 * - 状態スタイル（フォーカスリング）はインライン style でなく注入スタイルシート + 擬似クラスで表現
 *   （vanilla-ui-conventions.md §3）。
 * - 折りたたみ state は closure 変数 + 明示 re-render。内容変化時のみ DOM を再構築し、開閉/隠蔽は
 *   display 切り替えで行う。
 * - 単一の「Frontmatter」ヘッダで両カラムの本文を同時に開閉する（画面上の単一バーに合わせる）。
 * - 表示は読み取り専用（編集は非比較時のホスト FrontmatterBlock が担う）。
 */

import { computeDiff, type DiffLine } from "@anytime-markdown/markdown-engine";

import { FRONTMATTER_CODE_FONT_SIZE } from "../constants/dimensions";
import type { TranslationFn } from "../types";
import { ensureStyle } from "@anytime-markdown/ui-core";

/** {@link createFrontmatterCompareRow} のオプション。 */
export interface CreateFrontmatterCompareRowOptions {
  /** i18n 翻訳関数。 */
  t: TranslationFn;
  /** 比較ファイル（左カラム）の frontmatter（null/空なら無し）。 */
  compareFrontmatter: string | null;
  /** 本ファイル（右カラム）の frontmatter（null/空なら無し）。 */
  mainFrontmatter: string | null;
  /** 初期状態で折りたたむか（既定 true）。 */
  defaultCollapsed?: boolean;
}

/** FrontmatterCompareRow ファクトリの戻り値。 */
export interface FrontmatterCompareRowHandle {
  /** root 要素（隠蔽中・両 frontmatter とも無いときは display:none）。 */
  el: HTMLElement;
  /** frontmatter / 表示状態を差し替える。`hidden=true` で行ごと非表示（ソースモード用）。 */
  update: (next: {
    compareFrontmatter?: string | null;
    mainFrontmatter?: string | null;
    hidden?: boolean;
  }) => void;
  /** listener 削除。 */
  destroy: () => void;
}

const TRIANGLE_COLLAPSED = "▶";
const TRIANGLE_EXPANDED = "▼";

const STYLE_ID = "am-frontmatter-compare";
const FOCUS_CSS = `[data-am-frontmatter-compare] [role="button"]:focus-visible{outline:2px solid var(--am-color-primary-main);outline-offset:-2px;}`;

// インスタンスごとに一意な body id（aria-controls 関連付け用）。
let instanceSeq = 0;

/** DiffLine の種別に応じた行背景色（MergeEditorPanel.lineBgColor と同配色）。 */
function lineBgColor(type: DiffLine["type"] | undefined): string {
  switch (type) {
    case "added":
    case "modified-new":
      return "color-mix(in srgb, var(--am-color-success-main) 18%, transparent)";
    case "removed":
    case "modified-old":
      return "color-mix(in srgb, var(--am-color-error-main) 18%, transparent)";
    default:
      return "transparent";
  }
}

/** 1 カラム分の diff 行リストを構築する。 */
function buildColumn(lines: DiffLine[]): HTMLElement {
  const col = document.createElement("div");
  col.style.cssText =
    "flex:1;min-width:0;padding:8px 12px;overflow:auto;max-height:300px;" +
    "background:var(--am-color-bg-default);font-family:monospace;" +
    "font-size:0.8125rem;line-height:1.5;";
  for (const line of lines) {
    const row = document.createElement("div");
    row.setAttribute("data-fm-diff-line", "");
    row.textContent = line.text === "" ? " " : line.text;
    row.style.cssText =
      "white-space:pre-wrap;word-break:break-word;" +
      `background-color:${lineBgColor(line.type)};` +
      "color:var(--am-color-text-primary);";
    col.appendChild(row);
  }
  return col;
}

/**
 * vanilla フロントマター比較行を生成する。
 */
export function createFrontmatterCompareRow(
  opts: Readonly<CreateFrontmatterCompareRowOptions>,
): FrontmatterCompareRowHandle {
  ensureStyle(STYLE_ID, FOCUS_CSS);

  let compareFm: string | null = opts.compareFrontmatter;
  let mainFm: string | null = opts.mainFrontmatter;
  let collapsed = opts.defaultCollapsed ?? true;
  let hidden = false;
  // 直近に DOM を構築した内容シグネチャ（変化時のみ再構築する）。null = 未構築。
  let builtSig: string | null = null;

  const bodyId = `am-fm-compare-body-${(instanceSeq += 1)}`;

  const root = document.createElement("div");
  root.setAttribute("data-am-frontmatter-compare", "");
  root.style.cssText =
    "flex-shrink:0;margin:0 0 8px;border:1px solid var(--am-color-divider);" +
    "border-radius:4px;overflow:hidden;";

  // ヘッダ（単一バー・両カラム同時開閉）。a11y: role=button + tabindex + aria-controls。
  const header = document.createElement("div");
  header.setAttribute("role", "button");
  header.tabIndex = 0;
  header.setAttribute("aria-controls", bodyId);
  header.style.cssText =
    "display:flex;align-items:center;gap:4px;padding:2px 6px;" +
    "background:var(--am-color-action-hover);cursor:pointer;user-select:none;";
  const triangle = document.createElement("span");
  triangle.style.cssText =
    "font-family:monospace;font-weight:600;color:var(--am-color-text-secondary);" +
    `font-size:${FRONTMATTER_CODE_FONT_SIZE};`;
  header.appendChild(triangle);
  root.appendChild(header);

  // 本文行（2 カラム + 中央 divider）。collapsed で display を切り替える。
  const bodyRow = document.createElement("div");
  bodyRow.id = bodyId;
  bodyRow.setAttribute("data-fm-compare-body", "");
  bodyRow.style.cssText = "display:flex;align-items:stretch;";
  root.appendChild(bodyRow);

  const hasContent = (): boolean => (compareFm ?? "") !== "" || (mainFm ?? "") !== "";
  const contentSig = (): string => `${mainFm ?? ""} ${compareFm ?? ""}`;

  // 内容（compareFm / mainFm）変化時のみ body DOM を再構築する。開閉・隠蔽では再構築しない。
  function rebuildBodyIfNeeded(): void {
    if (!hasContent()) {
      if (builtSig !== null) {
        bodyRow.replaceChildren();
        builtSig = null;
      }
      return;
    }
    const sig = contentSig();
    if (sig === builtSig) return;
    // body 構築規約は InlineMergeView 本文と合わせる:
    //   computeDiff(main, compare) → leftLines=本文(右) / rightLines=比較(左)。
    const diff = computeDiff(mainFm ?? "", compareFm ?? "", {});
    const leftColEl = buildColumn(diff.rightLines); // 左カラム = 比較ファイル
    const divider = document.createElement("div");
    divider.style.cssText = "width:1px;align-self:stretch;background-color:var(--am-color-divider);";
    const rightColEl = buildColumn(diff.leftLines); // 右カラム = 本ファイル
    bodyRow.replaceChildren(leftColEl, divider, rightColEl);
    builtSig = sig;
  }

  function render(): void {
    rebuildBodyIfNeeded();
    if (hidden || !hasContent()) {
      root.style.display = "none";
      return;
    }
    root.style.display = "";
    triangle.textContent = `${collapsed ? TRIANGLE_COLLAPSED : TRIANGLE_EXPANDED} Frontmatter`;
    header.setAttribute("aria-expanded", collapsed ? "false" : "true");
    bodyRow.style.display = collapsed ? "none" : "flex";
  }

  const toggleCollapsed = (): void => {
    collapsed = !collapsed;
    render();
  };
  const onHeaderClick = (): void => toggleCollapsed();
  const onHeaderKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleCollapsed();
    }
  };
  header.addEventListener("click", onHeaderClick);
  header.addEventListener("keydown", onHeaderKeyDown);

  render();

  return {
    el: root,
    update(next): void {
      if ("compareFrontmatter" in next) compareFm = next.compareFrontmatter ?? null;
      if ("mainFrontmatter" in next) mainFm = next.mainFrontmatter ?? null;
      if ("hidden" in next) hidden = next.hidden === true;
      render();
    },
    destroy(): void {
      header.removeEventListener("click", onHeaderClick);
      header.removeEventListener("keydown", onHeaderKeyDown);
      root.remove();
    },
  };
}
