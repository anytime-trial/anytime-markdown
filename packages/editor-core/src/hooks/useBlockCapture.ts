import type { NodeViewProps } from "@tiptap/react";
import { useCallback } from "react";

import { CAPTURE_BG } from "../constants/colors";

/**
 * ブロック要素を PNG としてキャプチャしてダウンロードするフック。
 * getPos からエディタ内の NodeView DOM を特定し、コンテンツ部分をキャプチャする。
 */
export function useBlockCapture(editor: NodeViewProps["editor"], getPos: NodeViewProps["getPos"], fileName = "block.png") {
  return useCallback(async () => {
    if (!editor || typeof getPos !== "function") return;
    const pos = getPos();
    if (pos == null) return;

    const dom = editor.view.nodeDOM(pos);
    const el = dom instanceof HTMLElement ? dom : null;
    if (!el) return;

    try {
      // キャプチャ対象を決定
      // img: 画像ブロック（AnnotationOverlay の SVG より優先）
      // [role="document"]: HTML プレビュー（pre コードより優先）
      // pre: コードブロック
      // svg: ダイアグラム
      const img = el.querySelector("img:not([data-block-toolbar] img)");
      const htmlPreview = el.querySelector('[role="document"]');
      const pre = el.querySelector("pre");
      const svg = el.querySelector("svg");
      const target = img ?? htmlPreview ?? pre ?? svg ?? el;

      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const scale = 2;
      const w = rect.width;
      const h = rect.height;

      // --- SVG 要素: SVG をそのまま PNG 化 ---
      if (target instanceof SVGElement) {
        await captureSvgElement(target, w, h, scale, fileName);
        return;
      }

      // --- img 要素: Canvas に直接描画 ---
      if (target instanceof HTMLImageElement) {
        await captureImgElement(target, w, h, scale, fileName);
        return;
      }

      // --- HTML プレビュー: インラインスタイル付き HTML を foreignObject でキャプチャ ---
      if (target === htmlPreview && target instanceof HTMLElement) {
        await captureHtmlPreview(target, w, h, scale, fileName);
        return;
      }

      // --- その他 (pre 等): テキスト直接描画 ---
      await captureHtmlElement(target as HTMLElement, w, h, scale, fileName);
    } catch (err) {
      console.error("Block capture failed:", err);
    }
  }, [editor, getPos, fileName]);
}

/** SVG 要素を PNG としてキャプチャ */
async function captureSvgElement(svg: SVGElement, w: number, h: number, scale: number, fileName: string) {
  // SVG を文字列化して Image 経由で Canvas に描画
  const serialized = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(url);
    const canvas = createScaledCanvas(w, h, scale);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.fillStyle = CAPTURE_BG;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    await downloadCanvas(canvas, fileName);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** img 要素を PNG としてキャプチャ */
async function captureImgElement(imgEl: HTMLImageElement, w: number, h: number, scale: number, fileName: string) {
  if (!imgEl.complete) {
    await new Promise<void>((resolve) => {
      imgEl.onload = () => resolve();
      imgEl.onerror = () => resolve();
    });
  }

  const canvas = createScaledCanvas(w, h, scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = CAPTURE_BG;
  ctx.fillRect(0, 0, w, h);

  try {
    ctx.drawImage(imgEl, 0, 0, w, h);
    await downloadCanvas(canvas, fileName);
  } catch {
    // tainted canvas (cross-origin/blob 画像) → 元画像を直接保存
    try {
      const res = await fetch(imgEl.src);
      const blob = await res.blob();
      // PNG でない場合もそのまま保存（GIF, JPEG 等）
      const ext = blob.type.split("/")[1] || "png";
      const adjustedName = fileName.replace(/\.png$/, `.${ext}`);
      await saveBlob(blob, adjustedName);
    } catch {
      console.warn("Image capture: unable to fetch image for save");
    }
  }
}

/**
 * HTML プレビュー要素を foreignObject 経由で PNG としてキャプチャ。
 * プレビューにはインラインスタイルが含まれているため、外部CSS不要で動作する。
 */
async function captureHtmlPreview(el: HTMLElement, w: number, h: number, scale: number, fileName: string) {
  // innerHTML を取得（インラインスタイル付き）
  const html = el.innerHTML;

  // 背景色を要素から取得
  const bgColor = findBackgroundColor(el);

  const svgNs = "http://www.w3.org/2000/svg";
  const xhtml = "http://www.w3.org/1999/xhtml";
  const svgStr = `<svg xmlns="${svgNs}" width="${w}" height="${h}">
    <foreignObject width="100%" height="100%">
      <div xmlns="${xhtml}" style="width:${w}px;height:${h}px;background:${bgColor};overflow:hidden;font-family:sans-serif;font-size:14px;color:inherit;padding:0;margin:0">
        ${html}
      </div>
    </foreignObject>
  </svg>`;

  const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(url);
    const canvas = createScaledCanvas(w, h, scale);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    await downloadCanvas(canvas, fileName);
  } catch {
    URL.revokeObjectURL(url);
    // foreignObject 失敗時: テキスト描画方式にフォールバック
    await captureHtmlElement(el, w, h, scale, fileName);
  }
}

/**
 * HTML/コード要素を PNG としてキャプチャ。
 * Canvas 2D API でテキストを直接描画する方式（foreignObject 不使用）。
 */
async function captureHtmlElement(el: HTMLElement, _w: number, _h: number, scale: number, fileName: string) {
  const text = el.innerText || el.textContent || "";
  if (!text.trim()) return;

  const lines = text.split("\n");
  const fontSize = 14;
  const lineHeight = fontSize * 1.5;
  const padding = 16;
  const maxWidth = Math.max(_w, 600);

  // Canvas でテキストの実際の幅を計測
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d")!;
  measureCtx.font = `${fontSize}px monospace`;

  let textMaxWidth = 0;
  for (const line of lines) {
    const m = measureCtx.measureText(line);
    if (m.width > textMaxWidth) textMaxWidth = m.width;
  }

  const w = Math.min(Math.max(textMaxWidth + padding * 2, 300), maxWidth);
  const h = lines.length * lineHeight + padding * 2;

  const canvas = createScaledCanvas(w, h, scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  // 背景色を要素から遡って探す（透明の場合は親を辿る）
  const bgColor = findBackgroundColor(el);
  const computed = getComputedStyle(el);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);

  // テキスト描画
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = computed.color || "#333";
  ctx.textBaseline = "top";

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], padding, padding + i * lineHeight);
  }

  await downloadCanvas(canvas, fileName);
}

/** 要素の背景色を取得。透明の場合は親要素を遡る */
function findBackgroundColor(el: HTMLElement): string {
  let current: HTMLElement | null = el;
  while (current) {
    const bg = getComputedStyle(current).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
      return bg;
    }
    current = current.parentElement;
  }
  return CAPTURE_BG;
}

function createScaledCanvas(w: number, h: number, scale: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  return canvas;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function downloadCanvas(canvas: HTMLCanvasElement, fileName: string) {
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, "image/png");
    } catch {
      resolve(null);
    }
  });
  if (!blob) return;
  await saveBlob(blob, fileName);
}

/** showSaveFilePicker が使えればネイティブ保存ダイアログ、なければ従来のダウンロード */
async function saveBlob(blob: Blob, suggestedName: string) {
  if ("showSaveFilePicker" in window) {
    try {
      const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
        suggestedName,
        types: [{
          description: "PNG Image",
          accept: { "image/png": [".png"] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(a.href);
}
