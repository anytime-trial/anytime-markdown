/**
 * 脱React の vanilla DOM フロントマターブロック「FrontmatterBlock」。
 *
 * React 原版 `components/FrontmatterBlock.tsx`（MUI IconButton / Text・useState(collapsed)・
 * useConfirm 消費）の素 DOM 版。エディタ本文の上に表示され、YAML フロントマターを
 * 折りたたみヘッダ（▶/▼）で開閉し、textarea で編集、✕ で削除（確認付き）できる。
 *
 * React 除去（G4-B）で本コンポーネントは削除され、`host/vanillaMarkdownEditor.ts` 内の
 * 読み取り専用 `<pre>`（表示/非表示のみ）に置き換わって開閉・編集・削除が失われていた。
 * 本ファイルはその機能パリティを vanilla で復元する。
 *
 * 変換規約（既存 components-vanilla 群に準拠）:
 * - React props → opts。戻り値は { el, setValue, setReadOnly, expandAndFocus, destroy }。
 * - useIsDark は不要（`--am-color-*` CSS 変数でテーマ追従）。
 *   React 原版が getDivider / getActionHover / getTextSecondary / DEFAULT_*_CODE_BG で
 *   当てていた色は `--am-color-divider` / `--am-color-action-hover` /
 *   `--am-color-text-secondary` / `--am-color-bg-default` / `--am-color-text-primary` に置換。
 * - useState(collapsed) → closure 変数 + 明示的 re-render（body の生成/破棄）。
 * - useConfirm → opts.confirm?: (message)=>Promise<boolean>（未指定時は確認なしで削除）。
 */

import { FRONTMATTER_CODE_FONT_SIZE } from "../constants/dimensions";
import type { TranslationFn } from "../types";
import { createIconButton, type IconButtonHandle } from "@anytime-markdown/ui-core";

/** {@link createFrontmatterBlock} のオプション（React `FrontmatterBlockProps` の vanilla 再現）。 */
export interface CreateFrontmatterBlockOptions {
  /** 初期フロントマター（null なら非表示）。 */
  initial: string | null;
  /** 編集・削除を無効化する（readonly / review モード）。 */
  readOnly?: boolean;
  /** 初期状態で折りたたむか（既定 true・React 原版の EditorContentArea 準拠）。 */
  defaultCollapsed?: boolean;
  /** i18n 翻訳関数。 */
  t: TranslationFn;
  /** 削除時の確認（未指定なら確認なしで削除）。 */
  confirm?: (message: string) => Promise<boolean>;
  /** 値変更（編集）・削除（null）の通知。 */
  onChange: (value: string | null) => void;
}

/** FrontmatterBlock ファクトリの戻り値。 */
export interface FrontmatterBlockHandle {
  /** root 要素（frontmatter が null のときは display:none）。 */
  el: HTMLElement;
  /** 値を更新する（外部 setFrontmatter / スラッシュコマンドからの set 経由）。 */
  setValue: (value: string | null) => void;
  /** readOnly を切り替える（モード変更時）。 */
  setReadOnly: (readOnly: boolean) => void;
  /** 折りたたまれていれば展開し、textarea にフォーカスする（スラッシュコマンド用）。 */
  expandAndFocus: () => void;
  /** listener 削除。 */
  destroy: () => void;
}

const TRIANGLE_COLLAPSED = "▶"; // ▶
const TRIANGLE_EXPANDED = "▼"; // ▼

/**
 * vanilla フロントマターブロックを生成する。
 */
export function createFrontmatterBlock(
  opts: Readonly<CreateFrontmatterBlockOptions>,
): FrontmatterBlockHandle {
  let value: string | null = opts.initial;
  let collapsed = opts.defaultCollapsed ?? true;
  let readOnly = opts.readOnly ?? false;

  // root: 枠線付きコンテナ。
  const root = document.createElement("div");
  root.setAttribute("data-am-frontmatter", "");
  root.style.cssText =
    "flex-shrink:0;margin:0 0 8px;border:1px solid var(--am-color-divider);" +
    "border-radius:4px;overflow:hidden;";

  // ヘッダ行（クリック / Enter / Space で開閉）。a11y: role=button + tabindex で
  // キーボード操作可能にする（design.md のキーボード操作要件）。
  const header = document.createElement("div");
  header.setAttribute("role", "button");
  header.tabIndex = 0;
  header.style.cssText =
    "display:flex;align-items:center;gap:4px;padding:2px 6px;" +
    "background:var(--am-color-action-hover);cursor:pointer;user-select:none;";

  const triangle = document.createElement("span");
  triangle.style.cssText =
    "font-family:monospace;font-weight:600;color:var(--am-color-text-secondary);" +
    `font-size:${FRONTMATTER_CODE_FONT_SIZE};`;

  const spacer = document.createElement("div");
  spacer.style.flex = "1";

  // 削除ボタン（readOnly 時は非表示）。
  const deleteBtn: IconButtonHandle = createIconButton({
    size: "xs",
    title: opts.t("delete"),
    ariaLabel: opts.t("delete"),
    children: "✕", // ✕
    onClick: (e) => {
      e.stopPropagation(); // ヘッダ開閉と分離。
      void handleDelete();
    },
  });
  deleteBtn.el.style.color = "var(--am-color-text-secondary)";
  deleteBtn.el.style.fontSize = FRONTMATTER_CODE_FONT_SIZE;

  header.append(triangle, spacer, deleteBtn.el);
  root.appendChild(header);

  const toggleCollapsed = (): void => {
    collapsed = !collapsed;
    render();
  };
  const onHeaderClick = (): void => toggleCollapsed();
  const onHeaderKeyDown = (e: KeyboardEvent): void => {
    // Enter / Space で開閉（ネイティブ button 相当）。
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleCollapsed();
    }
  };
  header.addEventListener("click", onHeaderClick);
  header.addEventListener("keydown", onHeaderKeyDown);

  // body（textarea）は collapsed=false かつ value!=null のときのみ DOM に存在する（React 原版準拠）。
  let textarea: HTMLTextAreaElement | null = null;

  const buildTextarea = (): HTMLTextAreaElement => {
    const ta = document.createElement("textarea");
    ta.setAttribute("data-frontmatter-editor", "");
    ta.spellcheck = false;
    ta.value = value ?? "";
    ta.rows = (value?.split("\n").length ?? 1) + 1;
    ta.readOnly = readOnly;
    ta.style.cssText =
      "display:block;width:100%;box-sizing:border-box;margin:0;padding:12px;" +
      "border:none;outline:none;resize:vertical;font-family:monospace;" +
      "font-size:0.8125rem;line-height:1.5;max-height:300px;overflow:auto;" +
      "background:var(--am-color-bg-default);color:var(--am-color-text-primary);" +
      (readOnly ? "cursor:default;" : "cursor:text;");
    ta.addEventListener("input", onTextareaInput);
    return ta;
  };

  function onTextareaInput(this: HTMLTextAreaElement): void {
    if (readOnly) return;
    value = this.value || null;
    opts.onChange(value);
  }

  async function handleDelete(): Promise<void> {
    if (readOnly) return;
    if (opts.confirm) {
      const ok = await opts.confirm(opts.t("deleteFrontmatterConfirm"));
      if (!ok) return;
    }
    value = null;
    opts.onChange(null);
    render();
  }

  // 現在の state に合わせて DOM を再構築する。
  function render(): void {
    if (value == null) {
      root.style.display = "none";
      if (textarea) {
        textarea.removeEventListener("input", onTextareaInput);
        textarea.remove();
        textarea = null;
      }
      return;
    }
    root.style.display = "";
    triangle.textContent = `${collapsed ? TRIANGLE_COLLAPSED : TRIANGLE_EXPANDED} Frontmatter`;
    header.setAttribute("aria-expanded", collapsed ? "false" : "true");
    deleteBtn.el.style.display = readOnly ? "none" : "";

    if (collapsed) {
      if (textarea) {
        textarea.removeEventListener("input", onTextareaInput);
        textarea.remove();
        textarea = null;
      }
      return;
    }
    // 展開時: textarea を生成（既存なら値を同期）。
    if (!textarea) {
      textarea = buildTextarea();
      root.appendChild(textarea);
    } else if (textarea.value !== value) {
      textarea.value = value;
    }
  }

  render();

  return {
    el: root,
    setValue(next: string | null): void {
      const wasNull = value == null;
      value = next;
      // null → 値 への遷移（新規作成・スラッシュコマンド）は展開して即編集可能にする。
      if (wasNull && next != null) collapsed = false;
      render();
    },
    setReadOnly(next: boolean): void {
      if (readOnly === next) return;
      readOnly = next;
      if (textarea) textarea.readOnly = readOnly;
      render();
    },
    expandAndFocus(): void {
      if (value == null) return;
      collapsed = false;
      render();
      textarea?.focus();
    },
    destroy(): void {
      header.removeEventListener("click", onHeaderClick);
      header.removeEventListener("keydown", onHeaderKeyDown);
      deleteBtn.destroy();
      if (textarea) textarea.removeEventListener("input", onTextareaInput);
      root.remove();
    },
  };
}
