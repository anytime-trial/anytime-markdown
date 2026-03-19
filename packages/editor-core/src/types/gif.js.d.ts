declare module "gif.js" {
  interface GIFOptions {
    workers?: number;
    quality?: number;
    width?: number;
    height?: number;
    workerScript?: string;
    repeat?: number;
    background?: string;
    transparent?: string | null;
    dither?: boolean | string;
  }

  interface AddFrameOptions {
    delay?: number;
    copy?: boolean;
    dispose?: number;
  }

  class GIF {
    constructor(options?: GIFOptions);
    addFrame(
      element: CanvasRenderingContext2D | HTMLCanvasElement | HTMLImageElement | ImageData,
      options?: AddFrameOptions,
    ): void;
    on(event: "finished", callback: (blob: Blob) => void): this;
    on(event: "progress", callback: (progress: number) => void): this;
    on(event: "abort", callback: () => void): this;
    render(): void;
    abort(): void;
    running: boolean;
  }

  export default GIF;
}
