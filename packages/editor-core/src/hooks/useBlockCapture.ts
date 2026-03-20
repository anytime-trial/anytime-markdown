import type { NodeViewProps } from "@tiptap/react";
import { useCallback } from "react";

import { CAPTURE_BG } from "../constants/colors";
import { saveBlob } from "../utils/clipboardHelpers";

export { saveBlob } from "../utils/clipboardHelpers";

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
 * HTML プレビュー要素をキャプチャ。
 * SVG（foreignObject でレンダリング忠実再現）と PNG（テキスト描画）の両方を選択可能。
 */
async function captureHtmlPreview(el: HTMLElement, w: number, h: number, scale: number, fileName: string) {
  // el は div[role="document"] コンテナ。CSS クラスのスタイルは SVG に含まれないため、
  // 子要素を XMLSerializer で valid XHTML にシリアライズして使う
  const serializer = new XMLSerializer();
  const childrenXhtml = Array.from(el.childNodes)
    .map((child) => serializer.serializeToString(child))
    .join("");
  const bgColor = findBackgroundColor(el);

  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;overflow:hidden;padding:0;margin:0">
      ${childrenXhtml}
    </div>
  </foreignObject>
</svg>`;

  const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });

  // showSaveFilePicker で SVG / PNG を選択可能にする
  if ("showSaveFilePicker" in window) {
    try {
      const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
        suggestedName: fileName.replace(/\.png$/, ".svg"),
        types: [
          { description: "SVG Image (styled)", accept: { "image/svg+xml": [".svg"] } },
          { description: "PNG Image (text only)", accept: { "image/png": [".png"] } },
        ],
      });
      const chosenName = handle.name;
      if (chosenName.endsWith(".png")) {
        // PNG: テキスト描画方式で Canvas → Blob
        const pngBlob = await renderTextToPngBlob(el, w, h, scale);
        if (pngBlob) {
          const writable = await handle.createWritable();
          await writable.write(pngBlob);
          await writable.close();
        }
      } else {
        // SVG: foreignObject 付き SVG をそのまま保存
        const writable = await handle.createWritable();
        await writable.write(svgBlob);
        await writable.close();
      }
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }

  // フォールバック: SVG としてダウンロード
  const a = document.createElement("a");
  a.href = URL.createObjectURL(svgBlob);
  a.download = fileName.replace(/\.png$/, ".svg");
  a.click();
  URL.revokeObjectURL(a.href);
}

/** テキストを Canvas に描画して PNG Blob を生成 */
async function renderTextToPngBlob(el: HTMLElement, w: number, h: number, scale: number): Promise<Blob | null> {
  const text = el.innerText || el.textContent || "";
  if (!text.trim()) return null;

  const lines = text.split("\n");
  const fontSize = 14;
  const lineHeight = fontSize * 1.5;
  const padding = 16;
  const canvasH = lines.length * lineHeight + padding * 2;

  const canvas = createScaledCanvas(Math.max(w, 300), canvasH, scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  const computed = getComputedStyle(el);
  // 背景色: 要素自身 → 子要素 → 親要素の順で探索
  const bgColor = findContentBackgroundColor(el);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, Math.max(w, 300), canvasH);

  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = computed.color || "#333";
  ctx.textBaseline = "top";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], padding, padding + i * lineHeight);
  }

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png");
  });
}

/**
 * HTML/コード要素を PNG としてキャプチャ（テキスト直接描画方式）。
 */
async function captureHtmlElement(el: HTMLElement, w: number, _h: number, scale: number, fileName: string) {
  const blob = await renderTextToPngBlob(el, w, _h, scale);
  if (!blob) {
    console.warn("captureHtmlElement: no text content found");
    return;
  }
  await saveBlob(blob, fileName);
}

/** 要素の背景色を取得。自身 → 子要素 → 親要素の順で探索 */
function findContentBackgroundColor(el: HTMLElement): string {
  // 自身をチェック
  const own = getEffectiveBackground(el);
  if (own) return own;
  // 子要素をチェック（HTML プレビューの内側にスタイルがある場合）
  for (const child of el.children) {
    if (child instanceof HTMLElement) {
      const childBg = getEffectiveBackground(child);
      if (childBg) return childBg;
    }
  }
  // 親要素を遡る
  return findBackgroundColor(el);
}

/** 要素の background-color または background（グラデーション開始色）を取得 */
function getEffectiveBackground(el: HTMLElement): string | null {
  const style = getComputedStyle(el);
  // background-color が不透明ならそれを使う
  const bg = style.backgroundColor;
  if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
  // background-image（グラデーション）から最初の色を抽出
  const bgImage = style.backgroundImage;
  if (bgImage && bgImage !== "none") {
    const colorMatch = bgImage.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/);
    if (colorMatch) return colorMatch[0];
  }
  return null;
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
      canvas.toBlob((b) => resolve(b), "image/png");
    } catch (err) {
      console.warn("canvas.toBlob failed (tainted?):", err);
      resolve(null);
    }
  });
  if (!blob) {
    console.warn("downloadCanvas: toBlob returned null (canvas may be tainted)");
    return;
  }
  await saveBlob(blob, fileName);
}

