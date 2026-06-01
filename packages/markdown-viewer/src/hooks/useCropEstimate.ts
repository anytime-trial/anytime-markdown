import { useEffect, useState } from "react";

import type { CropRect } from "../utils/cropGeometry";

interface UseCropEstimateParams {
  cropRect: CropRect | null;
  drawing: boolean;
  imgRef: React.RefObject<HTMLImageElement | null>;
}

export function useCropEstimate({
  cropRect, drawing, imgRef,
}: Readonly<UseCropEstimateParams>): string | null {
  const [cropEstimate, setCropEstimate] = useState<string | null>(null);

  useEffect(() => {
    if (!cropRect || cropRect.width < 0.01 || cropRect.height < 0.01 || drawing) {
      setCropEstimate(null);
      return;
    }
    const img = imgRef.current;
    if (!img) return;
    const w = Math.round(cropRect.width * img.naturalWidth);
    const h = Math.round(cropRect.height * img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setCropEstimate(`${w}x${h}`); return; }
    ctx.drawImage(img, Math.round(cropRect.x * img.naturalWidth), Math.round(cropRect.y * img.naturalHeight), w, h, 0, 0, w, h);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const bytes = Math.ceil(base64.length * 3 / 4);
      let sizeStr: string;
      if (bytes < 1024) sizeStr = `${bytes}B`;
      else if (bytes < 1024 * 1024) sizeStr = `${(bytes / 1024).toFixed(1)}KB`;
      else sizeStr = `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
      setCropEstimate(`${w}x${h} / ${sizeStr}`);
    } catch {
      setCropEstimate(`${w}x${h}`);
    }
  }, [cropRect, drawing, imgRef]);

  return cropEstimate;
}
