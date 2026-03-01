import { useCallback } from "react";
import plantumlEncoder from "plantuml-encoder";
import { PLANTUML_SERVER } from "../utils/plantumlHelpers";

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

    const x = parseFloat(fo.getAttribute("x") || "0");
    const y = parseFloat(fo.getAttribute("y") || "0");
    const w = parseFloat(fo.getAttribute("width") || "0");
    const h = parseFloat(fo.getAttribute("height") || "0");

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
  const w = wAttr && !wAttr.includes("%") ? parseFloat(wAttr) : 800;
  const h = hAttr && !hAttr.includes("%") ? parseFloat(hAttr) : 600;
  return { w: w || 800, h: h || 600 };
}

function downloadSvgAsPng(svgText: string) {
  const cleanSvg = sanitizeSvgForCanvas(svgText);
  const svgEl = new DOMParser().parseFromString(cleanSvg, "image/svg+xml").documentElement;
  const { w, h } = getSvgDimensions(svgEl);
  const blob = new Blob([cleanSvg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) { URL.revokeObjectURL(url); return; }
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "diagram.png";
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  };
  img.src = url;
}

/** Render Mermaid code as light-mode SVG */
async function renderMermaidLight(code: string): Promise<string> {
  const mod = await import("mermaid");
  const mermaid = mod.default;
  mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true, theme: "default" });
  const id = `mermaid-capture-${Date.now()}`;
  const { svg } = await mermaid.render(id, code);
  document.querySelectorAll(`[id^="dmermaid-capture-"]`).forEach((el) => el.remove());
  return svg;
}

/** Build light-mode PlantUML SVG URL */
function buildPlantUmlLightUrl(code: string): string {
  const startMatch = code.match(/@start(uml|mindmap|wbs|json|yaml)/);
  const diagramType = startMatch ? startMatch[1] : null;
  const src = diagramType ? code : `@startuml\n${code}\n@enduml`;
  return `${PLANTUML_SERVER}/svg/${plantumlEncoder.encode(src)}`;
}

export function useDiagramCapture({ isMermaid, isPlantUml, svg, plantUmlUrl, code, isDark }: UseDiagramCaptureParams) {
  return useCallback(async () => {
    try {
      if (isMermaid && svg) {
        const captureSvg = isDark ? await renderMermaidLight(code) : svg;
        downloadSvgAsPng(captureSvg);
      } else if (isPlantUml && plantUmlUrl) {
        const url = isDark ? buildPlantUmlLightUrl(code) : plantUmlUrl;
        try {
          const res = await fetch(url);
          const svgText = await res.text();
          downloadSvgAsPng(svgText);
        } catch {
          const a = document.createElement("a");
          a.href = url.replace("/svg/", "/png/");
          a.download = "diagram.png";
          a.click();
        }
      }
    } catch { /* ignore */ }
  }, [isMermaid, isPlantUml, svg, plantUmlUrl, code, isDark]);
}
