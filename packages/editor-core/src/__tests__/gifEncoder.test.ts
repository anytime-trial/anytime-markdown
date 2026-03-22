/**
 * gifEncoder.ts のユニットテスト
 *
 * GifRecorderState, extractFrameFromCanvas, encodeGif の検証。
 * NeuQuant 色量子化 + LZW 圧縮が有効な GIF バイナリを生成することを確認する。
 */

import {
  CropRect,
  GifRecorderState,
  extractFrameFromCanvas,
  encodeGif,
} from "../utils/gifEncoder";

// jsdom には TextEncoder/TextDecoder が存在しない場合があるためポリフィル
if (typeof globalThis.TextEncoder === "undefined") {
  const { TextEncoder, TextDecoder } = require("util");
  (globalThis as any).TextEncoder = TextEncoder;
  (globalThis as any).TextDecoder = TextDecoder;
}

// jsdom には ImageData が存在しないためポリフィル
if (typeof globalThis.ImageData === "undefined") {
  (globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace: string = "srgb";
    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
      if (typeof dataOrWidth === "number") {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height!;
      }
    }
  };
}

// jsdom does not implement canvas getContext, so we mock it globally
const mockCtx = {
  fillStyle: "",
  fillRect: jest.fn(),
  getImageData: jest.fn().mockImplementation((_x: number, _y: number, w: number, h: number) => {
    const data = new Uint8ClampedArray(w * h * 4);
    // 赤ピクセルで埋める（エンコーダーが実データを処理できるように）
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;     // R
      data[i + 1] = 0;   // G
      data[i + 2] = 0;   // B
      data[i + 3] = 255; // A
    }
    return new ImageData(data, w, h);
  }),
  drawImage: jest.fn(),
};

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue(mockCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

// ============================================================
// ヘルパー
// ============================================================

/** jsdom の Blob は arrayBuffer() をサポートしないため FileReader で代替 */
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

function createSmallImageData(w: number, h: number, r = 255, g = 0, b = 0): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return new ImageData(data, w, h);
}

// ============================================================
// GifRecorderState
// ============================================================

describe("GifRecorderState", () => {
  it("デフォルトオプションで初期化される", () => {
    const state = new GifRecorderState();
    expect(state.status).toBe("idle");
    expect(state.frames).toHaveLength(0);
    expect(state.elapsed).toBe(0);
    expect(state.fps).toBe(10);
    expect(state.maxDuration).toBe(30000);
    expect(state.outputWidth).toBe(800);
    expect(state.maxFrames).toBe(300); // 30s * 10fps
  });

  it("カスタムオプションで初期化される", () => {
    const state = new GifRecorderState({ fps: 5, maxDuration: 10000, outputWidth: 400 });
    expect(state.fps).toBe(5);
    expect(state.maxDuration).toBe(10000);
    expect(state.outputWidth).toBe(400);
    expect(state.maxFrames).toBe(50); // 10s * 5fps
  });

  describe("addFrame", () => {
    it("フレームを追加し elapsed を更新する", () => {
      const state = new GifRecorderState({ fps: 10 });
      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;

      const result = state.addFrame(canvas);

      expect(result).toBe(true);
      expect(state.frames).toHaveLength(1);
      expect(state.elapsed).toBe(100); // 1/10 * 1000
    });

    it("複数フレームを追加すると elapsed が累積する", () => {
      const state = new GifRecorderState({ fps: 10 });
      const canvas = document.createElement("canvas");
      canvas.width = 10;
      canvas.height = 10;

      state.addFrame(canvas);
      state.addFrame(canvas);
      state.addFrame(canvas);

      expect(state.frames).toHaveLength(3);
      expect(state.elapsed).toBe(300); // 3/10 * 1000
    });

    it("maxFrames に達したら false を返す", () => {
      const state = new GifRecorderState({ maxDuration: 1000, fps: 2 }); // max 2 frames
      const canvas = document.createElement("canvas");
      canvas.width = 10;
      canvas.height = 10;

      expect(state.addFrame(canvas)).toBe(true);
      expect(state.addFrame(canvas)).toBe(true);
      expect(state.addFrame(canvas)).toBe(false);
      expect(state.frames).toHaveLength(2);
    });

    it("getContext が null を返したら false を返す", () => {
      const state = new GifRecorderState();
      const origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue(null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

      const canvas = document.createElement("canvas");
      canvas.width = 10;
      canvas.height = 10;

      expect(state.addFrame(canvas)).toBe(false);
      expect(state.frames).toHaveLength(0);

      HTMLCanvasElement.prototype.getContext = origGetContext;
    });
  });

  describe("reset", () => {
    it("フレームとステータスをリセットする", () => {
      const state = new GifRecorderState();
      const canvas = document.createElement("canvas");
      canvas.width = 10;
      canvas.height = 10;
      state.addFrame(canvas);
      state.status = "recording";

      state.reset();

      expect(state.frames).toEqual([]);
      expect(state.elapsed).toBe(0);
      expect(state.status).toBe("idle");
    });
  });
});

// ============================================================
// extractFrameFromCanvas
// ============================================================

describe("extractFrameFromCanvas", () => {
  it("指定した矩形でキャンバスを切り出し、リサイズする", () => {
    const source = document.createElement("canvas");
    source.width = 200;
    source.height = 200;

    const rect: CropRect = { x: 50, y: 50, width: 100, height: 100 };
    const result = extractFrameFromCanvas(source, rect, 80);
    expect(result.width).toBe(80);
    expect(result.height).toBe(80);
  });

  it("アスペクト比を維持する", () => {
    const source = document.createElement("canvas");
    source.width = 400;
    source.height = 300;

    const rect: CropRect = { x: 0, y: 0, width: 400, height: 200 };
    const result = extractFrameFromCanvas(source, rect, 800);
    expect(result.width).toBe(800);
    expect(result.height).toBe(400); // 400:200 = 2:1
  });

  it("getContext が null の場合でも canvas を返す", () => {
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue(null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    const source = document.createElement("canvas");
    source.width = 200;
    source.height = 200;

    const rect: CropRect = { x: 0, y: 0, width: 100, height: 100 };
    const result = extractFrameFromCanvas(source, rect, 50);
    expect(result).toBeDefined();
    expect(result.width).toBe(50);

    HTMLCanvasElement.prototype.getContext = origGetContext;
  });
});

// ============================================================
// encodeGif
// ============================================================

describe("encodeGif", () => {
  it("1フレームから有効な GIF バイナリを生成する", async () => {
    const frame = createSmallImageData(4, 4, 128, 64, 32);

    const blob = await encodeGif([frame], 4, 4, 10);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/gif");
    expect(blob.size).toBeGreaterThan(0);

    // GIF89a ヘッダーを検証
    const buffer = await blobToArrayBuffer(blob);
    const header = new TextDecoder().decode(new Uint8Array(buffer, 0, 6));
    expect(header).toBe("GIF89a");
  });

  it("複数フレームから GIF を生成する", async () => {
    const frame1 = createSmallImageData(4, 4, 255, 0, 0);
    const frame2 = createSmallImageData(4, 4, 0, 255, 0);
    const frame3 = createSmallImageData(4, 4, 0, 0, 255);

    const blob = await encodeGif([frame1, frame2, frame3], 4, 4, 10);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/gif");

    // 複数フレームのほうがサイズが大きいはず
    const singleBlob = await encodeGif([frame1], 4, 4, 10);
    expect(blob.size).toBeGreaterThan(singleBlob.size);
  });

  it("onProgress コールバックが呼ばれる", async () => {
    const frame1 = createSmallImageData(2, 2);
    const frame2 = createSmallImageData(2, 2);
    const progress = jest.fn();

    await encodeGif([frame1, frame2], 2, 2, 10, progress);

    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith(0.5);
    expect(progress).toHaveBeenCalledWith(1);
  });

  it("onProgress なしでもエラーにならない", async () => {
    const frame = createSmallImageData(2, 2);
    await expect(encodeGif([frame], 2, 2, 10)).resolves.toBeInstanceOf(Blob);
  });

  it("GIF バイナリが 0x3b (trailer) で終わる", async () => {
    const frame = createSmallImageData(2, 2);

    const blob = await encodeGif([frame], 2, 2, 10);
    const buffer = await blobToArrayBuffer(blob);
    const bytes = new Uint8Array(buffer);

    expect(bytes[bytes.length - 1]).toBe(0x3b);
  });

  it("GIF に NETSCAPE2.0 拡張が含まれる (ループアニメーション)", async () => {
    const frame = createSmallImageData(2, 2);

    const blob = await encodeGif([frame], 2, 2, 10);
    const buffer = await blobToArrayBuffer(blob);
    const bytes = new Uint8Array(buffer);

    // NETSCAPE2.0 の文字列を検索
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("NETSCAPE2.0");
  });

  it("異なる fps でも有効な GIF を生成する", async () => {
    const frame = createSmallImageData(2, 2);

    const blob5 = await encodeGif([frame], 2, 2, 5);
    const blob20 = await encodeGif([frame], 2, 2, 20);

    expect(blob5.type).toBe("image/gif");
    expect(blob20.type).toBe("image/gif");
  });

  it("さまざまな色のフレームでもエンコードできる", async () => {
    // グラデーション的なフレーム
    const frame = new ImageData(8, 8);
    for (let i = 0; i < frame.data.length; i += 4) {
      const pixel = i / 4;
      frame.data[i] = (pixel * 4) & 255;
      frame.data[i + 1] = (pixel * 2) & 255;
      frame.data[i + 2] = pixel & 255;
      frame.data[i + 3] = 255;
    }

    const blob = await encodeGif([frame], 8, 8, 10);
    expect(blob.type).toBe("image/gif");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("6フレーム以上で yield を含むエンコードが完了する", async () => {
    const frames = Array.from({ length: 6 }, (_, i) =>
      createSmallImageData(2, 2, i * 40, i * 20, i * 10),
    );
    const progress = jest.fn();

    const blob = await encodeGif(frames, 2, 2, 10, progress);

    expect(blob).toBeInstanceOf(Blob);
    expect(progress).toHaveBeenCalledTimes(6);
    expect(progress).toHaveBeenLastCalledWith(1);
  });
});
