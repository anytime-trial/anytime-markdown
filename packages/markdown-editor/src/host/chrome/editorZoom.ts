import type { Editor } from "@anytime-markdown/markdown-core";

/**
 * Ctrl/Cmd + ホイールでの全体ズーム（本文テキスト + 図を一括拡縮）。
 *
 * 文字だけを変える `settings.fontSize` と直交する「ブラウザズーム」。wysiwyg/review は
 * `editor.view.dom`（.tiptap）へ CSS zoom を掛け本文・画像・mermaid を一律スケールし、
 * source はコントローラの zoom レイヤへ委譲する。step / bounds は VS Code のエディタ
 * ズームに倣う。jsdom は zoom を computed へ反映しないため、観測用に
 * `root[data-am-zoom]` も併記する。
 */

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;

/** 浮動小数の累積誤差（1.0999999…）を防ぐため小数第 2 位で丸める。 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface EditorZoomOptions {
  readonly root: HTMLElement;
  /** 全モードで安定なスクロールコンテナ（source は配下に sourceWrap を append）。 */
  readonly contentEl: HTMLElement;
  readonly editor: Editor;
  /** source モードの zoom レイヤ。mount 後に確定するため getter で受ける。 */
  readonly sourceZoomTarget: () => { setZoom: (factor: number) => void } | null;
  /** 比較（merge）モードかどうか。開いている間はズームしない。 */
  readonly isMergeOpen: () => boolean;
}

/** ズームを装着し、解除する dispose を返す。 */
export function installEditorZoom(options: EditorZoomOptions): () => void {
  const { root, contentEl, editor, sourceZoomTarget, isMergeOpen } = options;
  let zoomFactor = 1;

  const applyZoom = (): void => {
    const rounded = round2(zoomFactor);
    root.dataset.amZoom = String(rounded);
    // wysiwyg/review 実体（source 中は display:none だが値は保持され復帰時に効く）。
    editor.view.dom.style.zoom = rounded === 1 ? "" : String(rounded);
    // source 実体（gutter + textarea を包む zoom レイヤ）。
    sourceZoomTarget()?.setZoom(rounded);
  };

  const nudgeZoom = (delta: number): void => {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, round2(zoomFactor + delta)));
    if (next === zoomFactor) return;
    zoomFactor = next;
    applyZoom();
  };

  const onWheelZoom = (event: WheelEvent): void => {
    // 修飾なしは通常スクロール。Ctrl（win/linux）/ Cmd（mac）併用時のみズーム。
    if (!(event.ctrlKey || event.metaKey)) return;
    // 水平ホイール（deltaY===0）は else 側へ落ちてズームアウトするため対象外。
    if (event.deltaY === 0) return;
    // 比較（merge）モードは片ペインしかスケールできず中途半端になるため対象外
    // （通常スクロールへ委ねる。zoomFactor は保持され比較終了後に効く）。
    if (isMergeOpen()) return;
    event.preventDefault(); // ブラウザ既定のページズームを抑止し本文のみズームする
    nudgeZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  };

  contentEl.addEventListener("wheel", onWheelZoom, { passive: false });
  applyZoom(); // 初期倍率（1）を data 属性へ反映

  return () => contentEl.removeEventListener("wheel", onWheelZoom);
}
