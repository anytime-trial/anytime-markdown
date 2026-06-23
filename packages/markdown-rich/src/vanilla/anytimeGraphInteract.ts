/**
 * 思考法ダイアグラム（anytime-thinking-model）プレビューの WYSIWYG 操作層（DOM 配線）。
 *
 * 再描画後の SVG 内 `[data-metadata]` ノードにクリックハンドラを装着し、ノードに
 * アンカーした小ポップオーバーでラベル編集・要素の追加/削除を行う。確定操作は
 * 「parse → mutate（applyAnytimeGraphOp）→ setCode」で書き戻す。
 *
 * 設計メモ: 設計書はインライン編集 / ホバーボタン / ポップオーバーの 3 機構を挙げていたが、
 * SVG（zoom/pan transform 配下）上に input を正確に重ねる方式は座標計算が脆く実機検証も
 * 困難なため、堅牢性・アクセシビリティを優先して「クリックでアンカー型ポップオーバーを開く」
 * 単一機構へ統合した。ラベル編集・追加・削除という WYSIWYG の能力は同等に提供する。
 */

import { parseGraphDsl } from "@anytime-markdown/graph-core";
import { applyAnytimeGraphOp, describeNode, type AnytimeGraphOp, type NodeDescriptor } from "./anytimeGraphMutate";
import { ensureStyle } from "./dialogHelpers";

interface AttachAnytimeGraphInteractionsOptions {
  /** SVG を内包する要素（= プレビュー innerHTML 先）。 */
  previewEl: HTMLElement;
  /** 現在の DSL を返す。 */
  getCode: () => string;
  /** 新しい DSL を書き戻す（= state.onFsTextChange）。 */
  setCode: (dsl: string) => void;
  isDark: boolean;
  t: (key: string) => string;
}

const STYLE_ID = "am-atm-interact";

function ensureInteractStyle(isDark: boolean): void {
  const fg = isDark ? "#e6e6e6" : "#1a1a1a";
  const bg = isDark ? "#2b2b2b" : "#ffffff";
  const border = isDark ? "#555" : "#ccc";
  const hover = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
  const danger = isDark ? "#e57373" : "#c0392b";
  ensureStyle(STYLE_ID, `
.am-atm-interactive [data-metadata]{cursor:pointer;}
.am-atm-interactive [data-metadata]:hover{opacity:0.85;}
.am-atm-pop{position:fixed;z-index:2147483600;min-width:200px;max-width:300px;
  background:var(--am-color-bg-paper, ${bg});color:var(--am-color-text-primary, ${fg});
  border:1px solid var(--am-color-divider, ${border});border-radius:8px;
  box-shadow:0 6px 20px rgba(0,0,0,0.28);padding:10px;font-size:13px;
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;}
.am-atm-pop label{display:block;font-size:11px;opacity:0.7;margin:0 0 3px;}
.am-atm-pop input{box-sizing:border-box;width:100%;padding:4px 6px;font-size:13px;
  color:var(--am-color-text-primary, ${fg});background:transparent;
  border:1px solid var(--am-color-input-border, ${border});border-radius:4px;}
.am-atm-pop .am-atm-row{display:flex;align-items:center;gap:6px;margin-bottom:6px;}
.am-atm-pop .am-atm-row input{flex:1 1 auto;}
.am-atm-pop button{cursor:pointer;border:1px solid var(--am-color-divider, ${border});
  background:transparent;color:inherit;border-radius:4px;padding:3px 8px;font-size:12px;}
.am-atm-pop button:hover{background:var(--am-color-action-hover, ${hover});}
.am-atm-pop .am-atm-icon{padding:3px 7px;line-height:1;}
.am-atm-pop .am-atm-del{color:var(--am-color-error-main, ${danger});border-color:var(--am-color-error-main, ${danger});}
.am-atm-pop .am-atm-section{margin-top:8px;border-top:1px solid var(--am-color-divider, ${border});padding-top:8px;}
.am-atm-pop .am-atm-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
`);
}

export function attachAnytimeGraphInteractions(opts: AttachAnytimeGraphInteractionsOptions): () => void {
  const { previewEl, getCode, setCode, isDark, t } = opts;

  const noop = (): void => {};

  // パース不能なら操作層を装着しない（エラー表示は既存挙動に委ねる）。
  let spec;
  try {
    spec = parseGraphDsl(getCode());
  } catch {
    return noop;
  }

  const svg = previewEl.querySelector("svg");
  if (!svg) return noop;

  ensureInteractStyle(isDark);
  previewEl.classList.add("am-atm-interactive");

  const controller = new AbortController();
  const { signal } = controller;
  let activePopover: HTMLElement | null = null;

  function closePopover(): void {
    if (activePopover) {
      activePopover.remove();
      activePopover = null;
    }
  }

  /** 操作を適用して書き戻す（再描画 → 再装着が走る）。失敗はログして破棄。 */
  function applyOp(op: AnytimeGraphOp): void {
    try {
      const next = applyAnytimeGraphOp(getCode(), op);
      closePopover();
      setCode(next);
    } catch (err) {
      console.warn(
        `[anytimeGraphInteract] 操作の適用に失敗しました (op=${op.kind}, path=${op.path}):`,
        err,
      );
    }
  }

  function makeButton(text: string, cls: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if (cls) b.className = cls;
    b.addEventListener("click", onClick);
    return b;
  }

  /** ラベル/説明など「入力 + 確定」の 1 行を作る。 */
  function makeEditRow(
    labelText: string,
    initial: string,
    onConfirm: (value: string) => void,
    withDelete?: () => void,
  ): HTMLElement {
    const wrap = document.createElement("div");
    const lbl = document.createElement("label");
    lbl.textContent = labelText;
    wrap.appendChild(lbl);
    const row = document.createElement("div");
    row.className = "am-atm-row";
    const input = document.createElement("input");
    input.type = "text";
    input.value = initial;
    input.setAttribute("aria-label", labelText);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm(input.value);
      }
    });
    row.appendChild(input);
    row.appendChild(makeButton("✓", "am-atm-icon", () => onConfirm(input.value)));
    if (withDelete) {
      row.appendChild(makeButton("✕", "am-atm-icon am-atm-del", withDelete));
    }
    wrap.appendChild(row);
    return wrap;
  }

  function buildPopover(path: string, d: NodeDescriptor): HTMLElement {
    const pop = document.createElement("div");
    pop.className = "am-atm-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", t("anytimeGraphEditLabel"));

    let firstInput: HTMLInputElement | null = null;

    // ラベル編集
    if (d.label !== null) {
      const row = makeEditRow(t("anytimeGraphEditLabel"), d.label, (value) =>
        applyOp({ kind: "setLabel", path, value }),
      );
      pop.appendChild(row);
      firstInput = row.querySelector("input");
    }

    // pyramid の説明
    if (d.desc !== null) {
      pop.appendChild(
        makeEditRow(t("anytimeGraphDesc"), d.desc, (value) => applyOp({ kind: "setDesc", path, value })),
      );
    }

    // 集約リーフ（fishbone causes・double-diamond/swot 項目）
    if (d.items !== null) {
      const section = document.createElement("div");
      section.className = "am-atm-section";
      const head = document.createElement("label");
      head.textContent = t("anytimeGraphItems");
      section.appendChild(head);
      d.items.forEach((item, index) => {
        section.appendChild(
          makeEditRow(
            `${t("anytimeGraphItems")} ${index + 1}`,
            item,
            (value) => applyOp({ kind: "setItem", path, index, value }),
            () => applyOp({ kind: "removeItem", path, index }),
          ),
        );
      });
      const addRow = document.createElement("div");
      addRow.className = "am-atm-actions";
      addRow.appendChild(
        makeButton(`+ ${t("anytimeGraphAddItem")}`, "", () =>
          applyOp({ kind: "addItem", path, value: t("anytimeGraphNewLabel") }),
        ),
      );
      section.appendChild(addRow);
      pop.appendChild(section);
      if (!firstInput) firstInput = section.querySelector("input");
    }

    // 構造操作（兄弟/子の追加・削除）
    const actions = document.createElement("div");
    actions.className = "am-atm-actions";
    if (d.canAddChild) {
      actions.appendChild(
        makeButton(`+ ${t("anytimeGraphAddChild")}`, "", () =>
          applyOp({ kind: "addChild", path, value: t("anytimeGraphNewLabel") }),
        ),
      );
    }
    if (d.canAddSibling) {
      actions.appendChild(
        makeButton(`+ ${t("anytimeGraphAddSibling")}`, "", () =>
          applyOp({ kind: "addSibling", path, value: t("anytimeGraphNewLabel") }),
        ),
      );
    }
    if (d.canRemove) {
      actions.appendChild(makeButton(t("anytimeGraphRemove"), "am-atm-del", () => applyOp({ kind: "remove", path })));
    }
    if (actions.childElementCount > 0) pop.appendChild(actions);

    // フォーカス（開いた直後に最初の入力へ）
    queueMicrotask(() => firstInput?.focus());
    return pop;
  }

  function positionPopover(pop: HTMLElement, anchor: Element): void {
    const rect = anchor.getBoundingClientRect();
    document.body.appendChild(pop);
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const margin = 8;
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
    if (left < margin) left = margin;
    if (top + ph > window.innerHeight - margin) top = Math.max(margin, rect.top - ph - 6);
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  function openPopover(anchor: Element, path: string, d: NodeDescriptor): void {
    closePopover();
    const pop = buildPopover(path, d);
    positionPopover(pop, anchor);
    activePopover = pop;
  }

  // ノードへハンドラ装着
  const groups = previewEl.querySelectorAll<SVGGElement>("svg [data-metadata]");
  groups.forEach((g) => {
    const raw = g.getAttribute("data-metadata");
    if (!raw) return;
    let path: string | undefined;
    try {
      const meta = JSON.parse(raw) as { path?: unknown };
      if (typeof meta.path === "string") path = meta.path;
    } catch {
      // data-metadata が JSON でない場合はスキップ（操作対象外）。
      return;
    }
    if (!path) return;
    const descriptor = describeNode(spec, path);
    if (!descriptor) return;
    const nodePath = path; // ガード後の string をクロージャへ束縛（非ヌルアサーション回避）
    g.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        openPopover(g, nodePath, descriptor);
      },
      { signal },
    );
  });

  // ポップオーバー外クリック・Escape で閉じる
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (activePopover && !activePopover.contains(e.target as Node)) closePopover();
    },
    { signal, capture: true },
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && activePopover) {
        e.stopPropagation();
        closePopover();
      }
    },
    { signal, capture: true },
  );

  return () => {
    controller.abort();
    closePopover();
    previewEl.classList.remove("am-atm-interactive");
  };
}
