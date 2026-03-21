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
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
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

// ============================================================
// メインスレッド GIF エンコーダー（Worker 不要）
// GIF89a 仕様に従い、NeuQuant 色量子化 + LZW 圧縮で生成
// ============================================================

/** 色成分の絶対値距離を計算する */
function colorDistance(p: Float64Array, b: number, g: number, r: number): number {
  return Math.abs(p[0] - b) + Math.abs(p[1] - g) + Math.abs(p[2] - r);
}

/** NeuQuant の learn() で使用するステップ幅を決定する */
function determineLearnStep(lengthcount: number): number {
  if (lengthcount < 3 * 503) return 3;
  if (lengthcount % (3 * 499) !== 0) return 3 * 499;
  if (lengthcount % (3 * 491) !== 0) return 3 * 491;
  if (lengthcount % (3 * 487) !== 0) return 3 * 487;
  return 3 * 503;
}

/** ラジアスパワーテーブルを更新する */
function updateRadpower(radpower: Int32Array, alpha: number, rad: number): void {
  for (let i = 0; i < rad; i++) {
    radpower[i] = (alpha * ((rad * rad - i * i) * 256 / (rad * rad))) | 0;
  }
}

/** lookupRGB の前方探索 */
function searchForward(
  network: Float64Array[], startIdx: number,
  r: number, g: number, b: number, bestd: number,
): { bestd: number; best: number } {
  let bd = bestd;
  let best = -1;
  for (let i = startIdx; i < 256; i++) {
    const p = network[i];
    let dist = (p[1] | 0) - g;
    if (dist >= bd) break;
    if (dist < 0) dist = -dist;
    let a = (p[0] | 0) - b; if (a < 0) a = -a; dist += a;
    if (dist < bd) {
      a = (p[2] | 0) - r; if (a < 0) a = -a; dist += a;
      if (dist < bd) { bd = dist; best = p[3] | 0; }
    }
  }
  return { bestd: bd, best };
}

/** lookupRGB の後方探索 */
function searchBackward(
  network: Float64Array[], startIdx: number,
  r: number, g: number, b: number, bestd: number,
): { bestd: number; best: number } {
  let bd = bestd;
  let best = -1;
  for (let j = startIdx; j >= 0; j--) {
    const p = network[j];
    let dist = g - (p[1] | 0);
    if (dist >= bd) break;
    if (dist < 0) dist = -dist;
    let a = (p[0] | 0) - b; if (a < 0) a = -a; dist += a;
    if (dist < bd) {
      a = (p[2] | 0) - r; if (a < 0) a = -a; dist += a;
      if (dist < bd) { bd = dist; best = p[3] | 0; }
    }
  }
  return { bestd: bd, best };
}

/** NeuQuant Neural-Net quantization algorithm (Anthony Dekker, 1994) */
class NeuQuant {
  private network: Float64Array[];
  private netindex = new Int32Array(256);
  private bias = new Int32Array(256);
  private freq = new Int32Array(256);
  private radpower = new Int32Array(32);
  private pixels: Uint8Array;
  private samplefac: number;

  constructor(pixels: Uint8Array, samplefac: number) {
    this.pixels = pixels;
    this.samplefac = samplefac;
    this.network = [];
    for (let i = 0; i < 256; i++) {
      const v = ((i << 12) / 256) | 0;
      this.network[i] = new Float64Array([v, v, v, 0]);
      this.freq[i] = (65536 / 256) | 0;
      this.bias[i] = 0;
    }
  }

  buildColormap(): void {
    this.learn();
    this.unbiasnet();
    this.inxbuild();
  }

  getColormap(): number[] {
    const map: number[] = [];
    const index: number[] = [];
    for (let i = 0; i < 256; i++) index[this.network[i][3] | 0] = i;
    for (let l = 0; l < 256; l++) {
      const j = index[l];
      map.push(this.network[j][0] | 0, this.network[j][1] | 0, this.network[j][2] | 0);
    }
    return map;
  }

  lookupRGB(r: number, g: number, b: number): number {
    let bestd = 1000;
    let best = -1;
    const startIdx = this.netindex[g] | 0;

    const fwd = searchForward(this.network, startIdx, r, g, b, bestd);
    if (fwd.best >= 0) { bestd = fwd.bestd; best = fwd.best; }

    const bwd = searchBackward(this.network, startIdx - 1, r, g, b, bestd);
    if (bwd.best >= 0) { bestd = bwd.bestd; best = bwd.best; }

    return best;
  }

  private learn(): void {
    const lengthcount = this.pixels.length;
    const alphadec = 30 + ((this.samplefac - 1) / 3) | 0;
    const samplepixels = (lengthcount / (3 * this.samplefac)) | 0;
    let delta = (samplepixels / 100) | 0;
    if (delta === 0) delta = 1;
    let alpha = 1024;
    let radius = (256 >> 3) * 64;
    let rad = radius >> 6;
    if (rad <= 1) rad = 0;
    updateRadpower(this.radpower, alpha, rad);
    let step: number;
    if (lengthcount < 3 * 503) { this.samplefac = 1; step = 3; }
    else { step = determineLearnStep(lengthcount); }
    let pix = 0;
    for (let i = 0; i < samplepixels; i++) {
      const b = (this.pixels[pix] & 0xff) << 4;
      const g = (this.pixels[pix + 1] & 0xff) << 4;
      const r = (this.pixels[pix + 2] & 0xff) << 4;
      const j = this.contest(b, g, r);
      this.altersingle(alpha, j, b, g, r);
      if (rad !== 0) this.alterneigh(rad, j, b, g, r);
      pix += step;
      if (pix >= lengthcount) pix -= lengthcount;
      if (i % delta === 0) {
        alpha -= (alpha / alphadec) | 0;
        radius -= (radius / 30) | 0;
        rad = radius >> 6;
        if (rad <= 1) rad = 0;
        updateRadpower(this.radpower, alpha, rad);
      }
    }
  }

  private unbiasnet(): void {
    for (let i = 0; i < 256; i++) {
      this.network[i][0] = (this.network[i][0] + (1 << 3)) >> 4;
      this.network[i][1] = (this.network[i][1] + (1 << 3)) >> 4;
      this.network[i][2] = (this.network[i][2] + (1 << 3)) >> 4;
      this.network[i][3] = i;
    }
  }

  private altersingle(alpha: number, i: number, b: number, g: number, r: number): void {
    this.network[i][0] -= (alpha * (this.network[i][0] - b)) / 1024;
    this.network[i][1] -= (alpha * (this.network[i][1] - g)) / 1024;
    this.network[i][2] -= (alpha * (this.network[i][2] - r)) / 1024;
  }

  private alterneigh(rad: number, i: number, b: number, g: number, r: number): void {
    const lo = Math.max(i - rad, 0);
    const hi = Math.min(i + rad, 256);
    let j = i + 1, k = i - 1, m = 1;
    while (j < hi || k > lo) {
      const a = this.radpower[m++];
      if (j < hi) {
        const p = this.network[j++];
        p[0] -= (a * (p[0] - b)) / (1024 * 256);
        p[1] -= (a * (p[1] - g)) / (1024 * 256);
        p[2] -= (a * (p[2] - r)) / (1024 * 256);
      }
      if (k > lo) {
        const p = this.network[k--];
        p[0] -= (a * (p[0] - b)) / (1024 * 256);
        p[1] -= (a * (p[1] - g)) / (1024 * 256);
        p[2] -= (a * (p[2] - r)) / (1024 * 256);
      }
    }
  }

  private contest(b: number, g: number, r: number): number {
    let bestd = ~(1 << 31), bestbiasd = bestd, bestpos = -1, bestbiaspos = -1;
    for (let i = 0; i < 256; i++) {
      const n = this.network[i];
      const dist = colorDistance(n, b, g, r);
      if (dist < bestd) { bestd = dist; bestpos = i; }
      const biasdist = dist - (this.bias[i] >> 12);
      if (biasdist < bestbiasd) { bestbiasd = biasdist; bestbiaspos = i; }
      const betafreq = this.freq[i] >> 10;
      this.freq[i] -= betafreq;
      this.bias[i] += betafreq << 10;
    }
    this.freq[bestpos] += 64;
    this.bias[bestpos] -= 64 << 10;
    return bestbiaspos;
  }

  /** Selection-sort network by green channel and find the entry with smallest green value from position i onward */
  private findSmallest(i: number): { pos: number; val: number } {
    let smallpos = i, smallval = this.network[i][1] | 0;
    for (let j = i + 1; j < 256; j++) {
      const v = this.network[j][1] | 0;
      if (v < smallval) { smallpos = j; smallval = v; }
    }
    return { pos: smallpos, val: smallval };
  }

  private inxbuild(): void {
    let previouscol = 0, startpos = 0;
    for (let i = 0; i < 256; i++) {
      const { pos: smallpos, val: smallval } = this.findSmallest(i);
      if (i !== smallpos) {
        const tmp = this.network[smallpos];
        this.network[smallpos] = this.network[i];
        this.network[i] = tmp;
      }
      if (smallval !== previouscol) {
        this.netindex[previouscol] = ((previouscol === startpos ? i : (startpos + i)) >> 1) | 0;
        for (let j = previouscol + 1; j < smallval; j++) this.netindex[j] = i;
        previouscol = smallval;
        startpos = i;
      }
    }
    this.netindex[previouscol] = ((startpos + 255) >> 1) | 0;
    for (let j = previouscol + 1; j < 256; j++) this.netindex[j] = 255;
  }
}

// ============================================================
// LZW encoder for GIF
// ============================================================

const LZW_HSIZE = 5003;
const LZW_MASKS = [0, 1, 3, 7, 15, 31, 63, 127, 255, 511, 1023, 2047, 4095, 8191, 16383, 32767, 65535];

interface LzwState {
  htab: Int32Array;
  codetab: Int32Array;
  accum: Uint8Array;
  out: number[];
  cur_accum: number;
  cur_bits: number;
  a_count: number;
  free_ent: number;
  n_bits: number;
  maxcode: number;
  clear_flg: boolean;
  g_init_bits: number;
  remaining: number;
  curPixel: number;
  pixels: Uint8Array;
  initCodeSize: number;
}

function lzwMaxcode(nb: number): number { return (1 << nb) - 1; }

function lzwFlushChar(s: LzwState): void {
  if (s.a_count > 0) {
    s.out.push(s.a_count);
    for (let i = 0; i < s.a_count; i++) s.out.push(s.accum[i]);
    s.a_count = 0;
  }
}

function lzwCharOut(s: LzwState, c: number): void {
  s.accum[s.a_count++] = c;
  if (s.a_count >= 254) lzwFlushChar(s);
}

function lzwClHash(htab: Int32Array): void {
  for (let i = 0; i < LZW_HSIZE; ++i) htab[i] = -1;
}

function lzwNextPixel(s: LzwState): number {
  if (s.remaining === 0) return -1;
  --s.remaining;
  return s.pixels[s.curPixel++] & 0xff;
}

function lzwOutput(s: LzwState, code: number): void {
  s.cur_accum &= LZW_MASKS[s.cur_bits];
  s.cur_accum = s.cur_bits > 0 ? s.cur_accum | (code << s.cur_bits) : code;
  s.cur_bits += s.n_bits;
  while (s.cur_bits >= 8) { lzwCharOut(s, s.cur_accum & 0xff); s.cur_accum >>= 8; s.cur_bits -= 8; }
  if (s.free_ent > s.maxcode || s.clear_flg) {
    if (s.clear_flg) { s.maxcode = lzwMaxcode(s.n_bits = s.g_init_bits); s.clear_flg = false; }
    else { ++s.n_bits; s.maxcode = s.n_bits === 12 ? (1 << 12) : lzwMaxcode(s.n_bits); }
  }
  if (code === (1 << s.initCodeSize) + 1) { // EOFCode
    while (s.cur_bits > 0) { lzwCharOut(s, s.cur_accum & 0xff); s.cur_accum >>= 8; s.cur_bits -= 8; }
    lzwFlushChar(s);
  }
}

/** ハッシュテーブルを探索して既存エントリを検索する */
function lzwProbe(s: LzwState, fcode: number, startIdx: number): { found: boolean; ent: number; idx: number } {
  let i = startIdx;
  let disp = LZW_HSIZE - i;
  if (i === 0) disp = 1;
  do {
    i -= disp;
    if (i < 0) i += LZW_HSIZE;
    if (s.htab[i] === fcode) return { found: true, ent: s.codetab[i], idx: i };
  } while (s.htab[i] >= 0);
  return { found: false, ent: 0, idx: i };
}

/** LZW 圧縮のメインループ */
function lzwCompress(s: LzwState): void {
  const ClearCode = 1 << s.initCodeSize;
  const EOFCode = ClearCode + 1;
  s.n_bits = s.g_init_bits;
  s.maxcode = lzwMaxcode(s.n_bits);
  s.free_ent = ClearCode + 2;
  s.a_count = 0;
  lzwClHash(s.htab);
  let ent = lzwNextPixel(s);
  lzwOutput(s, ClearCode);

  while (true) {
    const c = lzwNextPixel(s);
    if (c === -1) break;
    const fcode = (c << 12) + ent;
    let i = (c << 4) ^ ent;
    if (s.htab[i] === fcode) { ent = s.codetab[i]; continue; }
    if (s.htab[i] >= 0) {
      const probe = lzwProbe(s, fcode, i);
      if (probe.found) { ent = probe.ent; continue; }
      i = probe.idx;
    }
    lzwOutput(s, ent);
    ent = c;
    if (s.free_ent < (1 << 12)) { s.codetab[i] = s.free_ent++; s.htab[i] = fcode; }
    else { lzwClHash(s.htab); s.free_ent = ClearCode + 2; s.clear_flg = true; lzwOutput(s, ClearCode); }
  }
  lzwOutput(s, ent);
  lzwOutput(s, EOFCode);
}

/** LZW encoder for GIF */
function lzwEncode(width: number, height: number, pixels: Uint8Array, colorDepth: number): Uint8Array {
  const initCodeSize = Math.max(2, colorDepth);
  const s: LzwState = {
    htab: new Int32Array(LZW_HSIZE),
    codetab: new Int32Array(LZW_HSIZE),
    accum: new Uint8Array(256),
    out: [initCodeSize],
    cur_accum: 0,
    cur_bits: 0,
    a_count: 0,
    free_ent: 0,
    n_bits: 0,
    maxcode: 0,
    clear_flg: false,
    g_init_bits: initCodeSize + 1,
    remaining: width * height,
    curPixel: 0,
    pixels,
    initCodeSize,
  };

  lzwCompress(s);
  s.out.push(0); // block terminator
  return new Uint8Array(s.out);
}

// ============================================================
// GIF encoder helpers
// ============================================================

/** RGBA ImageData を RGB Uint8Array に変換する */
function imageDataToRgb(frame: ImageData): Uint8Array {
  const rgb = new Uint8Array(frame.width * frame.height * 3);
  for (let p = 0, q = 0; p < frame.data.length; p += 4, q += 3) {
    rgb[q] = frame.data[p];
    rgb[q + 1] = frame.data[p + 1];
    rgb[q + 2] = frame.data[p + 2];
  }
  return rgb;
}

/** パレットをカラーテーブルとして parts に書き込む */
function writeColorTable(parts: Uint8Array[], colorTab: number[]): void {
  parts.push(new Uint8Array(colorTab));
  const pad = 3 * 256 - colorTab.length;
  if (pad > 0) parts.push(new Uint8Array(pad));
}

/** GIF ヘッダーとグローバルカラーテーブルを書き込む */
function writeGifHeader(
  parts: Uint8Array[], width: number, height: number, colorTab: number[],
  writeBytes: (...bytes: number[]) => void, writeShort: (val: number) => void,
): void {
  // Logical Screen Descriptor (already has GIF89a header)
  writeShort(width);
  writeShort(height);
  writeBytes(0x87, 0, 0); // GCT flag, color res 8, sort=0, GCT size 256

  // Write Global Color Table
  writeColorTable(parts, colorTab);

  // Netscape Extension (loop forever)
  writeBytes(0x21, 0xff, 0x0b);
  parts.push(new TextEncoder().encode("NETSCAPE2.0"));
  writeBytes(0x03, 0x01);
  writeShort(0); // loop count = 0 (infinite)
  writeBytes(0x00);
}

/** 1フレーム分の GIF イメージデータを書き込む */
function writeFrameData(
  parts: Uint8Array[], frame: ImageData, rgb: Uint8Array, nq: NeuQuant,
  colorTab: number[], width: number, height: number, delay: number,
  isFirst: boolean,
  writeBytes: (...bytes: number[]) => void, writeShort: (val: number) => void,
): void {
  // Graphic Control Extension
  writeBytes(0x21, 0xf9, 0x04, 0x00);
  writeShort(delay);
  writeBytes(0x00, 0x00);

  // Image Descriptor
  writeBytes(0x2c);
  writeShort(0); writeShort(0);
  writeShort(width); writeShort(height);
  if (isFirst) {
    writeBytes(0x00); // use global color table
  } else {
    writeBytes(0x87); // local color table, 256 colors
    writeColorTable(parts, colorTab);
  }

  // Index pixels
  const nPix = frame.width * frame.height;
  const indexedPixels = new Uint8Array(nPix);
  for (let p = 0, k = 0; p < nPix; p++, k += 3) {
    indexedPixels[p] = nq.lookupRGB(rgb[k + 2], rgb[k + 1], rgb[k]);
  }

  // LZW encode
  const lzwData = lzwEncode(width, height, indexedPixels, 8);
  parts.push(lzwData);
}

/** メインスレッドで GIF バイナリを生成する */
export async function encodeGif(
  frames: ImageData[],
  width: number,
  height: number,
  fps: number,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const delay = Math.round(100 / fps); // GIF delay in 1/100 sec
  const parts: Uint8Array[] = [];

  function writeBytes(...bytes: number[]) { parts.push(new Uint8Array(bytes)); }
  function writeShort(val: number) { writeBytes(val & 0xff, (val >> 8) & 0xff); }

  // --- Header ---
  parts.push(new TextEncoder().encode("GIF89a"));

  // --- Process frames ---
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const rgb = imageDataToRgb(frame);

    // Quantize colors
    const nq = new NeuQuant(rgb, 10);
    nq.buildColormap();
    const colorTab = nq.getColormap();

    if (i === 0) {
      writeGifHeader(parts, width, height, colorTab, writeBytes, writeShort);
    }

    writeFrameData(parts, frame, rgb, nq, colorTab, width, height, delay, i === 0, writeBytes, writeShort);

    onProgress?.((i + 1) / frames.length);

    // yield to UI thread every 5 frames
    if (i % 5 === 4) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  // Trailer
  writeBytes(0x3b);

  return new Blob(parts as BlobPart[], { type: "image/gif" });
}
