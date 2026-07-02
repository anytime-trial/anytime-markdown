/**
 * 図キャプチャ・ソースエクスポートの plain 非同期関数群 — useDiagramCapture からの移植。
 * React 依存なし。内部ロジックは React 版から流用。
 */

import { CAPTURE_BG, FETCH_TIMEOUT, saveBlob, buildPlantUmlUrl } from "@anytime-markdown/markdown-viewer";
import DOMPurify from "dompurify";
import plantumlEncoder from "plantuml-encoder";

import { enqueueRender } from "../hooks/useMermaidRender";
import { buildPlantUmlImageUrl } from "../hooks/usePlantUmlRender";
import { extractDiagramAltText } from "../utils/diagramAltText";

export { buildPlantUmlImageUrl, extractDiagramAltText };

const SVG_NS = "http://www.w3.org/2000/svg";

function sanitizeSvgForCanvas(svgText: string): string {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const foreignObjects = doc.querySelectorAll("foreignObject");
  if (foreignObjects.length === 0) return svgText;

  foreignObjects.forEach((fo) => {
    const text = (fo.textContent || "").trim();
    if (!text) { fo.remove(); return; }

    const x = Number.parseFloat(fo.getAttribute("x") || "0");
    const y = Number.parseFloat(fo.getAttribute("y") || "0");
    const w = Number.parseFloat(fo.getAttribute("width") || "0");
    const h = Number.parseFloat(fo.getAttribute("height") || "0");

    const textEl = doc.createElementNS(SVG_NS, "text");
    textEl.setAttribute("x", String(x + w / 2));
    textEl.setAttribute("y", String(y + h / 2));
    textEl.setAttribute("text-anchor", "middle");
    textEl.setAttribute("dominant-baseline", "central");
    textEl.setAttribute("font-size", "14");
    textEl.textContent = text;

    fo.parentNode?.replaceChild(textEl, fo);
  });

  return new XMLSerializer().serializeToString(doc);
}

function getSvgDimensions(svgEl: Element): { w: number; h: number } {
  const viewBox = svgEl.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
      return { w: parts[2], h: parts[3] };
    }
  }
  const wAttr = svgEl.getAttribute("width");
  const hAttr = svgEl.getAttribute("height");
  const w = wAttr && !wAttr.includes("%") ? Number.parseFloat(wAttr) : 800;
  const h = hAttr && !hAttr.includes("%") ? Number.parseFloat(hAttr) : 600;
  return { w: w || 800, h: h || 600 };
}

async function downloadSvgAsPng(svgText: string, fileName = "diagram.png"): Promise<void> {
  const cleanSvg = sanitizeSvgForCanvas(svgText);
  const doc = new DOMParser().parseFromString(cleanSvg, "image/svg+xml");
  const svgEl = doc.documentElement;

  if (!svgEl.getAttribute("xmlns")) {
    svgEl.setAttribute("xmlns", SVG_NS);
  }

  const { w, h } = getSvgDimensions(svgEl);
  const serializedSvg = new XMLSerializer().serializeToString(doc);
  const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serializedSvg)}`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load SVG as image"));
    img.src = dataUri;
  });
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.fillStyle = CAPTURE_BG;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!pngBlob) return;
  await saveBlob(pngBlob, fileName);
}

async function renderMermaidLight(code: string): Promise<string> {
  const mod = await import("mermaid");
  const mermaid = mod.default;
  return enqueueRender(async () => {
    mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true, theme: "default" });
    const id = `mermaid-capture-${Date.now()}`;
    const container = document.createElement("div");
    container.id = `d${id}`;
    container.style.position = "absolute";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    document.body.appendChild(container);
    try {
      const { svg } = await mermaid.render(id, code, container);
      return svg;
    } finally {
      container.remove();
      document.querySelectorAll(`[id^="dmermaid-capture-"]`).forEach((el) => el.remove());
    }
  });
}

/** PlantUML ソースを encode してライトテーマ URL を構築する（usePlantUmlRender.ts と同パターン）。 */
export function buildPlantUmlLightUrl(code: string): string {
  const startMatch = /@start(uml|mindmap|wbs|json|yaml)/.exec(code);
  const diagramType = startMatch ? startMatch[1] : null;
  const src = diagramType ? code : `@startuml\n${code}\n@enduml`;
  const encoded = plantumlEncoder.encode(src);
  return buildPlantUmlUrl(encoded);
}

export interface CaptureDiagramPngOptions {
  isMermaid: boolean;
  isPlantUml: boolean;
  svg: string | undefined;
  plantUmlUrl: string | undefined;
  code: string;
  isDark: boolean;
}

/** 図を PNG としてダウンロードする */
export async function captureDiagramPng({
  isMermaid, isPlantUml, svg, plantUmlUrl, code, isDark,
}: CaptureDiagramPngOptions): Promise<void> {
  try {
    const diagramFileName = isMermaid ? "mermaid.png" : "plantuml.png";
    if (isMermaid && svg) {
      const captureSvg = isDark ? await renderMermaidLight(code) : svg;
      await downloadSvgAsPng(captureSvg, diagramFileName);
    } else if (isPlantUml && plantUmlUrl) {
      const url = isDark ? buildPlantUmlLightUrl(code) : plantUmlUrl;
      try {
        const controller = new AbortController();
        const timerId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timerId);
        const svgText = await res.text();
        await downloadSvgAsPng(svgText, diagramFileName);
      } catch {
        try {
          const pngUrl = url.replace("/svg/", "/png/");
          const res2 = await fetch(pngUrl);
          const pngBlob = await res2.blob();
          await saveBlob(pngBlob, diagramFileName);
        } catch {
          // 最終フォールバック
          const a = document.createElement("a");
          a.href = url.replace("/svg/", "/png/");
          a.download = diagramFileName;
          a.click();
        }
      }
    }
  } catch (err) {
    console.error("[diagramCapture] captureDiagramPng: failed to capture diagram", err);
  }
}

/** 図ソースファイル（.mmd / .puml）をダウンロードする */
export async function exportDiagramSource(code: string, isMermaid: boolean): Promise<void> {
  const sourceFileName = isMermaid ? "mermaid.mmd" : "plantuml.puml";
  try {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    await saveBlob(blob, sourceFileName);
  } catch (err) {
    console.error(`[diagramCapture] exportDiagramSource: failed to export ${sourceFileName}`, err);
  }
}

// DOMPurify は math preview で使用
export { DOMPurify };
