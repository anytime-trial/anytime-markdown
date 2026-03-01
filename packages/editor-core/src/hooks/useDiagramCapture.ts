import { useCallback } from "react";

interface UseDiagramCaptureParams {
  isMermaid: boolean;
  isPlantUml: boolean;
  svg: string;
  plantUmlUrl: string;
}

export function useDiagramCapture({ isMermaid, isPlantUml, svg, plantUmlUrl }: UseDiagramCaptureParams) {
  return useCallback(async () => {
    try {
      if (isMermaid && svg) {
        const svgEl = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
        const w = parseFloat(svgEl.getAttribute("width") || "800");
        const h = parseFloat(svgEl.getAttribute("height") || "600");
        const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const scale = 2;
          const canvas = document.createElement("canvas");
          canvas.width = w * scale;
          canvas.height = h * scale;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.scale(scale, scale);
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
      } else if (isPlantUml && plantUmlUrl) {
        const pngUrl = plantUmlUrl.replace("/svg/", "/png/");
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = "diagram.png";
        a.click();
      }
    } catch { /* ignore */ }
  }, [isMermaid, isPlantUml, svg, plantUmlUrl]);
}
