/**
 * ui-vanilla 共通の素 DOM ヘルパー（脱React UI プリミティブ層の基盤）。
 *
 * 各 `ui-vanilla/*.ts` ファクトリが共有する content 流し込み・style 適用・focusable
 * セレクタ・inline SVG を 1 箇所に集約する（重複実装を避ける）。React / chrome 層に依存しない
 * ため、依存方向は常に chrome → ui-vanilla → dom（逆流させない）。
 */

/** 受け入れ可能な content 形式（string / Node / その配列）。 */
export type VanillaContent = string | Node | readonly (string | Node)[];

/**
 * content を root へ流し込む。string は `<span>` でラップ（スタイル付与可能にするため統一）、
 * Node はそのまま append、配列は順次。null/undefined は no-op。
 */
export function appendContent(root: HTMLElement, content: VanillaContent | undefined): void {
  if (content == null) return;
  const items = Array.isArray(content) ? content : [content];
  for (const item of items) {
    if (typeof item === "string") {
      const span = document.createElement("span");
      span.textContent = item;
      root.appendChild(span);
    } else {
      root.appendChild(item as Node);
    }
  }
}

/** `Partial<CSSStyleDeclaration>` を要素へ適用する（null/undefined は no-op）。 */
export function applyStyle(el: HTMLElement, style: Partial<CSSStyleDeclaration> | undefined): void {
  if (!style) return;
  Object.assign(el.style, style);
}

/** Dialog / Drawer 共有のフォーカス可能要素セレクタ（ui/useModalFocusTrap と同一）。 */
export const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * currentColor で描く inline SVG（24x24 viewBox）。複数 path（fragment 相当）にも対応。
 * chrome/vanillaToolbar はこの実装を re-export する（svgIcon の唯一の定義元）。
 */
export function svgIcon(path: string | readonly string[], size = 16): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  for (const d of Array.isArray(path) ? path : [path]) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d as string);
    svg.appendChild(p);
  }
  return svg;
}

/**
 * 指定 id の `<style>` を `document.head` へ 1 度だけ注入する（pseudo-class / keyframe 用）。
 * 各 ui-vanilla ファクトリの `ensureXxxStyles()` ボイラープレートを集約する。SSR 安全。
 */
export function ensureStyle(id: string, css: string): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

let _idSeq = 0;

/** 一意な id を採番する（aria 連携等）。React useId 相当の vanilla 版。決定論的（テスト再現可）。 */
export function nextId(prefix: string): string {
  _idSeq += 1;
  return `${prefix}-${_idSeq}`;
}

/** 透明な click-away バックドロップの cssText（fixed 全面・z-index 1300）。overlay 共有。 */
export const TRANSPARENT_BACKDROP_CSS = "position:fixed;inset:0;z-index:1300;";
