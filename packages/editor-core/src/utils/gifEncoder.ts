export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GifSettings {
  fps: number;
  width: number;
  duration: number;
}

export interface GifRecorderOptions {
  maxDuration?: number; // ms, default 30000
  fps?: number; // default 10
  outputWidth?: number; // default 800
}

export class GifRecorderState {
  status: "idle" | "selecting" | "recording" | "encoding" | "done" = "idle";
  frames: ImageData[] = [];
  elapsed = 0;
  readonly fps: number;
  readonly maxDuration: number;
  readonly outputWidth: number;
  readonly maxFrames: number;

  constructor(options?: GifRecorderOptions) {
    this.fps = options?.fps ?? 10;
    this.maxDuration = options?.maxDuration ?? 30000;
    this.outputWidth = options?.outputWidth ?? 800;
    this.maxFrames = Math.floor((this.maxDuration / 1000) * this.fps);
  }

  addFrame(canvas: HTMLCanvasElement): boolean {
    if (this.frames.length >= this.maxFrames) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    this.frames.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    this.elapsed = (this.frames.length / this.fps) * 1000;
    return true;
  }

  reset(): void {
    this.frames = [];
    this.elapsed = 0;
    this.status = "idle";
  }
}

/**
 * ソース Canvas から矩形領域を切り出し、指定幅にリサイズした Canvas を返す。
 */
export function extractFrameFromCanvas(
  source: HTMLCanvasElement,
  rect: CropRect,
  targetWidth: number,
): HTMLCanvasElement {
  const scale = targetWidth / rect.width;
  const targetHeight = Math.round(rect.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    source,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    targetWidth,
    targetHeight,
  );
  return canvas;
}

import { GIF_WORKER_SCRIPT } from "./gifWorkerScript";

/**
 * gif.js の Worker スクリプトを Blob URL として生成する。
 * webpack / Next.js 環境では node_modules のファイルに直接アクセスできないため、
 * Worker コードを文字列定数から Blob URL を生成する。
 */
let workerBlobUrl: string | null = null;

function getWorkerUrl(): string {
  if (workerBlobUrl) return workerBlobUrl;
  const blob = new Blob([GIF_WORKER_SCRIPT], { type: "application/javascript" });
  workerBlobUrl = URL.createObjectURL(blob);
  return workerBlobUrl;
}

/**
 * ImageData 配列から GIF Blob を生成する。
 * gif.js を動的インポートし Web Worker でエンコード。
 */
export async function encodeGif(
  frames: ImageData[],
  width: number,
  height: number,
  fps: number,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const GIF = (await import("gif.js")).default;
  const delay = Math.round(1000 / fps);
  const workerUrl = getWorkerUrl();

  return new Promise((resolve, reject) => {
    try {
      const gif = new GIF({
        workers: 2,
        quality: 10,
        width,
        height,
        workerScript: workerUrl,
      });

      // タイムアウト: 60秒でハング検知
      const timeout = setTimeout(() => {
        gif.abort();
        reject(new Error("GIF encoding timed out"));
      }, 60000);

      gif.on("finished", (blob: Blob) => {
        clearTimeout(timeout);
        resolve(blob);
      });
      gif.on("progress", (p: number) => onProgress?.(p));
      gif.render();
    } catch (err) {
      reject(err);
    }
  });
}
