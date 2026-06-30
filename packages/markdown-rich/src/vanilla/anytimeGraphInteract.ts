/**
 * 思考法ダイアグラム（anytime-thinking-model）プレビューの WYSIWYG 操作層（DOM 配線）。
 *
 * 再描画後の SVG 内 `[data-metadata]` ノードに対し:
 *  - ノードの文字をクリック → その文字の位置に重ねたインライン入力欄でラベル/項目を直接編集。
 *  - ノードに hover → 隅に出る極小「…」ボタン → 追加/削除など構造操作のポップオーバー。
 * いずれの確定操作も「parse → mutate（applyAnytimeGraphOp）→ setCode」で DSL へ書き戻す。
 *
 * 座標は `getBoundingClientRect()`（レイアウト後のスクリーン座標）で取得するため、SVG の
 * viewBox スケーリング（レスポンシブ）に追従し、重ね合わせが堅牢に成立する。
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
const HIDE_DELAY_MS = 160;

function ensureInteractStyle(isDark: boolean): void {
  const fg = isDark ? "#e6e6e6" : "#1a1a1a";
  const bg = isDark ? "#2b2b2b" : "#ffffff";
  const border = isDark ? "#555" : "#ccc";
  const hover = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
  const accent = isDark ? "#5b9dff" : "#3b82f6";
  const danger = isDark ? "#e57373" : "#c0392b";
  ensureStyle(STYLE_ID, `
.am-atm-interactive [data-metadata]{cursor:pointer;}
.am-atm-interactive [data-metadata]:hover{opacity:0.85;}
.am-atm-inline{position:fixed;z-index:2147483601;box-sizing:border-box;resize:none;overflow:auto;
  background:var(--am-color-bg-paper, ${bg});color:var(--am-color-text-primary, ${fg});
  border:2px solid var(--am-color-primary-main, ${accent});border-radius:6px;
  box-shadow:0 4px 16px rgba(0,0,0,0.25);padding:4px 6px;font-size:14px;line-height:1.3;
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;}
.am-atm-inline.am-atm-inline--list{text-align:left;}
.am-atm-more{position:fixed;z-index:2147483600;display:flex;align-items:center;justify-content:center;
  width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:15px;line-height:1;padding:0;
  background:var(--am-color-bg-paper, ${bg});color:var(--am-color-text-primary, ${fg});
  border:1px solid var(--am-color-divider, ${border});box-shadow:0 2px 8px rgba(0,0,0,0.25);}
.am-atm-more:hover{background:var(--am-color-action-hover, ${hover});}
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

/** ノードが構造操作（追加/削除・causes/desc 管理）を持つか。持つノードだけ「…」を出す。 */
function hasStructuralActions(d: NodeDescriptor): boolean {
  return (
    d.canAddChild ||
    d.canAddSibling ||
    d.canRemove ||
    d.desc !== null ||
    // fishbone カテゴリ等、ラベルはインライン編集しつつ causes をポップオーバーで管理する場合。
    (d.items !== null && d.label !== null)
  );
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

  let activeInline: HTMLTextAreaElement | null = null;
  let activeMore: HTMLButtonElement | null = null;
  let activePopover: HTMLElement | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  function clearHideTimer(): void {
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function closeMore(): void {
    clearHideTimer();
    if (activeMore) {
      activeMore.remove();
      activeMore = null;
    }
  }

  function closePopover(): void {
    if (activePopover) {
      activePopover.remove();
      activePopover = null;
    }
  }

  function closeInline(): void {
    if (activeInline) {
      const el = activeInline;
      activeInline = null; // blur ハンドラの再入を防ぐ
      el.remove();
    }
  }

  /** 操作を適用して書き戻す（再描画 → 再装着が走る）。失敗はログして破棄。 */
  function applyOp(op: AnytimeGraphOp): void {
    try {
      const next = applyAnytimeGraphOp(getCode(), op);
      closePopover();
      closeMore();
      setCode(next);
    } catch (err) {
      console.warn(
        `[anytimeGraphInteract] 操作の適用に失敗しました (op=${op.kind}, path=${op.path}):`,
        err,
      );
    }
  }

  // ── インライン編集（文字をクリック → その場で直接編集） ──────────────────

  /**
   * ノード rect 上にテキストエリアを重ねて直接編集する。
   * mode='label': Enter=確定 / Shift+Enter=改行。mode='list': Enter=改行 / Ctrl(⌘)+Enter=確定。
   * いずれも blur=確定 / Escape=取消。
   */
  function openInlineEditor(
    anchor: Element,
    mode: "label" | "list",
    initial: string,
    onConfirm: (value: string) => void,
  ): void {
    closeInline();
    closePopover();
    closeMore();

    const rect = anchor.getBoundingClientRect();
    const ta = document.createElement("textarea");
    ta.className = mode === "list" ? "am-atm-inline am-atm-inline--list" : "am-atm-inline";
    ta.value = initial;
    ta.setAttribute("aria-label", mode === "list" ? t("anytimeGraphItems") : t("anytimeGraphEditLabel"));
    if (mode === "list") ta.title = t("anytimeGraphItemsPerLineHint");

    const w = Math.max(96, Math.round(rect.width));
    const h = Math.max(mode === "list" ? 72 : 30, Math.round(rect.height));
    ta.style.width = `${w}px`;
    ta.style.height = `${h}px`;
    ta.style.left = `${Math.round(rect.left + rect.width / 2 - w / 2)}px`;
    ta.style.top = `${Math.round(rect.top + rect.height / 2 - h / 2)}px`;

    document.body.appendChild(ta);
    activeInline = ta;

    let settled = false;
    const confirm = (): void => {
      if (settled) return;
      settled = true;
      const value = ta.value;
      closeInline();
      onConfirm(value);
    };
    const cancel = (): void => {
      if (settled) return;
      settled = true;
      closeInline();
    };

    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
        return;
      }
      if (e.key === "Enter") {
        if (mode === "label" && !e.shiftKey) {
          e.preventDefault();
          confirm();
        } else if (mode === "list" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          confirm();
        }
        // それ以外の Enter は改行（既定動作）。
      }
    });
    ta.addEventListener("blur", () => confirm());

    queueMicrotask(() => {
      ta.focus();
      ta.select();
    });
  }

  function startInlineEdit(anchor: Element, path: string, d: NodeDescriptor): void {
    if (d.label !== null) {
      const current = d.label;
      openInlineEditor(anchor, "label", current, (value) => {
        if (value !== current) applyOp({ kind: "setLabel", path, value });
      });
      return;
    }
    if (d.items !== null) {
      const current = d.items;
      openInlineEditor(anchor, "list", current.join("\n"), (value) => {
        const next = value.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
        if (next.length !== current.length || next.some((s, i) => s !== current[i])) {
          applyOp({ kind: "setItems", path, values: value.split("\n") });
        }
      });
    }
  }

  // ── 構造操作ポップオーバー（「…」から開く・ラベル行は持たない） ─────────────

  function makeButton(text: string, cls: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if (cls) b.className = cls;
    b.addEventListener("click", onClick);
    return b;
  }

  /** 「入力 + 確定（+ 削除）」の 1 行（causes・desc 用）。 */
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

  function buildStructuralPopover(path: string, d: NodeDescriptor): HTMLElement {
    const pop = document.createElement("div");
    pop.className = "am-atm-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", t("anytimeGraphMoreActions"));

    let firstControl: HTMLElement | null = null;

    // pyramid の説明
    if (d.desc !== null) {
      const row = makeEditRow(t("anytimeGraphDesc"), d.desc, (value) => applyOp({ kind: "setDesc", path, value }));
      pop.appendChild(row);
      firstControl = row.querySelector("input");
    }

    // 集約リーフ（fishbone causes）の管理
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
      if (!firstControl) firstControl = section.querySelector("input");
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

    queueMicrotask(() => firstControl?.focus());
    return pop;
  }

  function positionFixed(el: HTMLElement, rect: DOMRect, preferBelow: boolean): void {
    const margin = 8;
    const pw = el.offsetWidth;
    const ph = el.offsetHeight;
    let left = rect.left;
    let top = preferBelow ? rect.bottom + 6 : rect.top;
    if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
    if (left < margin) left = margin;
    if (top + ph > window.innerHeight - margin) top = Math.max(margin, rect.top - ph - 6);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  function openPopover(anchor: Element, path: string, d: NodeDescriptor): void {
    closePopover();
    const pop = buildStructuralPopover(path, d);
    document.body.appendChild(pop);
    positionFixed(pop, anchor.getBoundingClientRect(), true);
    activePopover = pop;
  }

  // ── 「…」ボタン（hover で出現 → 構造操作ポップオーバーを開く） ─────────────

  function scheduleHideMore(): void {
    clearHideTimer();
    hideTimer = setTimeout(() => {
      if (!activePopover) closeMore();
    }, HIDE_DELAY_MS);
  }

  function showMore(anchor: Element, path: string, d: NodeDescriptor): void {
    // インライン編集中・既に同ノードのポップオーバー表示中は出さない。
    if (activeInline) return;
    clearHideTimer();
    closeMore();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "am-atm-more";
    btn.textContent = "…";
    btn.setAttribute("aria-label", t("anytimeGraphMoreActions"));
    btn.title = t("anytimeGraphMoreActions");
    btn.addEventListener("mouseenter", clearHideTimer);
    btn.addEventListener("mouseleave", scheduleHideMore);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openPopover(anchor, path, d);
    });
    document.body.appendChild(btn);
    const rect = anchor.getBoundingClientRect();
    const size = 22;
    btn.style.left = `${Math.round(Math.min(rect.right - size / 2, window.innerWidth - size - 4))}px`;
    btn.style.top = `${Math.round(Math.max(4, rect.top - size / 2))}px`;
    activeMore = btn;
  }

  // ── ノードへハンドラ装着 ────────────────────────────────────────────────

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

    // 文字（ラベル/項目）を持つノードはクリックでインライン編集。
    if (descriptor.label !== null || descriptor.items !== null) {
      g.addEventListener(
        "click",
        (e) => {
          e.stopPropagation();
          startInlineEdit(g, nodePath, descriptor);
        },
        { signal },
      );
    }

    // 構造操作を持つノードは hover で「…」ボタンを出す。
    if (hasStructuralActions(descriptor)) {
      g.addEventListener("mouseenter", () => showMore(g, nodePath, descriptor), { signal });
      g.addEventListener("mouseleave", scheduleHideMore, { signal });
    }
  });

  // 外側クリック・Escape でポップオーバーを閉じる（インライン編集は blur/Escape で自己完結）。
  document.addEventListener(
    "pointerdown",
    (e) => {
      const target = e.target as Node;
      if (activePopover && !activePopover.contains(target) && activeMore !== target) {
        closePopover();
        closeMore();
      }
    },
    { signal, capture: true },
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && activePopover) {
        e.stopPropagation();
        closePopover();
        closeMore();
      }
    },
    { signal, capture: true },
  );

  return () => {
    controller.abort();
    clearHideTimer();
    closeInline();
    closePopover();
    closeMore();
    previewEl.classList.remove("am-atm-interactive");
  };
}
