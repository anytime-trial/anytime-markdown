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
      // キャプチャ対象を決定（img を svg より優先: AnnotationOverlay の SVG を避ける）
      const img = el.querySelector("img:not([data-block-toolbar] img)");
      const pre = el.querySelector("pre");
      const svg = el.querySelector("svg");
      const target = img ?? pre ?? svg ?? el;

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

      // --- その他 (pre, div 等): html2canvas 代替として
      //     対象要素のスクリーンショットを Canvas で取得 ---
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

/** HTML 要素を PNG としてキャプチャ（foreignObject 方式） */
async function captureHtmlElement(el: HTMLElement, w: number, h: number, scale: number, fileName: string) {
  const canvas = createScaledCanvas(w, h, scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = CAPTURE_BG;
  ctx.fillRect(0, 0, w, h);

  // 要素のクローンを作成し、外部リソース参照を除去
  const clone = el.cloneNode(true) as HTMLElement;
  // img 要素を除去（taint 防止）
  clone.querySelectorAll("img").forEach((img) => img.remove());
  // インラインスタイルをコピー
  const computed = getComputedStyle(el);
  clone.style.cssText = computed.cssText;
  clone.style.margin = "0";
  clone.style.position = "static";
  clone.style.width = `${w}px`;
  clone.style.height = `${h}px`;

  const svgNs = "http://www.w3.org/2000/svg";
  const xhtml = "http://www.w3.org/1999/xhtml";
  const svgStr = [
    `<svg xmlns="${svgNs}" width="${w}" height="${h}">`,
    `<foreignObject width="100%" height="100%">`,
    `<div xmlns="${xhtml}" style="width:${w}px;height:${h}px;background:${CAPTURE_BG};overflow:hidden">`,
    new XMLSerializer().serializeToString(clone),
    `</div></foreignObject></svg>`,
  ].join("");

  const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(url);
    ctx.drawImage(img, 0, 0, w, h);
    await downloadCanvas(canvas, fileName);
  } catch {
    console.warn("HTML capture via foreignObject failed");
  } finally {
    URL.revokeObjectURL(url);
  }
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
