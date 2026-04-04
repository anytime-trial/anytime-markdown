import plantumlEncoder from "plantuml-encoder";
import { useCallback } from "react";

import { CAPTURE_BG } from "../constants/colors";
import { FETCH_TIMEOUT } from "../constants/timing";
import { saveBlob } from "../utils/clipboardHelpers";
import { buildPlantUmlUrl } from "../utils/plantumlHelpers";

interface UseDiagramCaptureParams {
  isMermaid: boolean;
  isPlantUml: boolean;
  svg: string;
  plantUmlUrl: string;
  code: string;
  isDark: boolean;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Replace foreignObject with SVG text to prevent canvas taint */
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

/** Extract dimensions from viewBox (reliable) with width/height fallback */
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

async function downloadSvgAsPng(svgText: string, fileName = "diagram.png") {
  const cleanSvg = sanitizeSvgForCanvas(svgText);
  const doc = new DOMParser().parseFromString(cleanSvg, "image/svg+xml");
  const svgEl = doc.documentElement;

  // xmlns がないと <img> での SVG 読み込みが失敗する
  if (!svgEl.getAttribute("xmlns")) {
    svgEl.setAttribute("xmlns", SVG_NS);
  }

  const { w, h } = getSvgDimensions(svgEl);

  // 再シリアライズして xmlns を保証した SVG 文字列を使用
  const serializedSvg = new XMLSerializer().serializeToString(doc);

  // Blob URL ではなく data URI を使用（ブラウザの SVG レンダリング互換性向上）
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

/** Render Mermaid code as light-mode SVG */
async function renderMermaidLight(code: string): Promise<string> {
  const mod = await import("mermaid");
  const mermaid = mod.default;
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
}

/** Build light-mode PlantUML SVG URL */
function buildPlantUmlLightUrl(code: string): string {
  const startMatch = /@start(uml|mindmap|wbs|json|yaml)/.exec(code);
  const diagramType = startMatch ? startMatch[1] : null;
  const src = diagramType ? code : `@startuml\n${code}\n@enduml`;
  return buildPlantUmlUrl(plantumlEncoder.encode(src));
}

/** ダイアグラムソースコードをテキストファイルとして保存 */
async function downloadDiagramSource(code: string, fileName: string) {
  const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
  await saveBlob(blob, fileName);
}

interface UseDiagramCaptureResult {
  handleCapture: () => Promise<void>;
  handleExportSource: (() => Promise<void>) | undefined;
}

export function useDiagramCapture({ isMermaid, isPlantUml, svg, plantUmlUrl, code, isDark }: UseDiagramCaptureParams): UseDiagramCaptureResult {
  const handleCapture = useCallback(async () => {
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
          // fetch 失敗時は PNG URL で保存ダイアログを表示
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
      console.error("useDiagramCapture: failed to capture diagram", err);
    }
  }, [isMermaid, isPlantUml, svg, plantUmlUrl, code, isDark]);

  const sourceFileName = isMermaid ? "mermaid.mmd" : "plantuml.puml";
  const handleExportSource = useCallback(async () => {
    try {
      await downloadDiagramSource(code, sourceFileName);
    } catch (err) {
      console.error(`useDiagramCapture: failed to export ${sourceFileName}`, err);
    }
  }, [code, sourceFileName]);

  const hasDiagram = isMermaid || isPlantUml;
  return { handleCapture, handleExportSource: hasDiagram ? handleExportSource : undefined };
}
