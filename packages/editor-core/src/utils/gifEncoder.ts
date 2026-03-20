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
    let i = this.netindex[g] | 0;
    let j = i - 1;
    while (i < 256 || j >= 0) {
      if (i < 256) {
        const p = this.network[i];
        let dist = (p[1] | 0) - g;
        if (dist >= bestd) { i = 256; }
        else {
          i++;
          if (dist < 0) dist = -dist;
          let a = (p[0] | 0) - b; if (a < 0) a = -a; dist += a;
          if (dist < bestd) {
            a = (p[2] | 0) - r; if (a < 0) a = -a; dist += a;
            if (dist < bestd) { bestd = dist; best = p[3] | 0; }
          }
        }
      }
      if (j >= 0) {
        const p = this.network[j];
        let dist = g - (p[1] | 0);
        if (dist >= bestd) { j = -1; }
        else {
          j--;
          if (dist < 0) dist = -dist;
          let a = (p[0] | 0) - b; if (a < 0) a = -a; dist += a;
          if (dist < bestd) {
            a = (p[2] | 0) - r; if (a < 0) a = -a; dist += a;
            if (dist < bestd) { bestd = dist; best = p[3] | 0; }
          }
        }
      }
    }
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
    for (let i = 0; i < rad; i++)
      this.radpower[i] = (alpha * ((rad * rad - i * i) * 256 / (rad * rad))) | 0;
    let step: number;
    if (lengthcount < 3 * 503) { this.samplefac = 1; step = 3; }
    else if (lengthcount % (3 * 499) !== 0) step = 3 * 499;
    else if (lengthcount % (3 * 491) !== 0) step = 3 * 491;
    else if (lengthcount % (3 * 487) !== 0) step = 3 * 487;
    else step = 3 * 503;
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
        for (let k = 0; k < rad; k++)
          this.radpower[k] = (alpha * ((rad * rad - k * k) * 256 / (rad * rad))) | 0;
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
      const dist = Math.abs(n[0] - b) + Math.abs(n[1] - g) + Math.abs(n[2] - r);
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

  private inxbuild(): void {
    let previouscol = 0, startpos = 0;
    for (let i = 0; i < 256; i++) {
      let smallpos = i, smallval = this.network[i][1] | 0;
      for (let j = i + 1; j < 256; j++) {
        if ((this.network[j][1] | 0) < smallval) { smallpos = j; smallval = this.network[j][1] | 0; }
      }
      if (i !== smallpos) {
        // swap
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

/** LZW encoder for GIF */
function lzwEncode(width: number, height: number, pixels: Uint8Array, colorDepth: number): Uint8Array {
  const initCodeSize = Math.max(2, colorDepth);
  const out: number[] = [];
  out.push(initCodeSize);

  const HSIZE = 5003;
  const masks = [0, 1, 3, 7, 15, 31, 63, 127, 255, 511, 1023, 2047, 4095, 8191, 16383, 32767, 65535];
  const htab = new Int32Array(HSIZE);
  const codetab = new Int32Array(HSIZE);
  const accum = new Uint8Array(256);
  let cur_accum = 0, cur_bits = 0, a_count = 0;
  let free_ent: number, n_bits: number, maxcode: number;
  let clear_flg = false; const g_init_bits = initCodeSize + 1;
  let remaining = width * height, curPixel = 0;

  function MAXCODE(nb: number) { return (1 << nb) - 1; }
  function flush_char() {
    if (a_count > 0) { out.push(a_count); for (let i = 0; i < a_count; i++) out.push(accum[i]); a_count = 0; }
  }
  function char_out(c: number) { accum[a_count++] = c; if (a_count >= 254) flush_char(); }
  function cl_hash() { for (let i = 0; i < HSIZE; ++i) htab[i] = -1; }
  function nextPixel() { if (remaining === 0) return -1; --remaining; return pixels[curPixel++] & 0xff; }
  function output(code: number) {
    cur_accum &= masks[cur_bits];
    cur_accum = cur_bits > 0 ? cur_accum | (code << cur_bits) : code;
    cur_bits += n_bits;
    while (cur_bits >= 8) { char_out(cur_accum & 0xff); cur_accum >>= 8; cur_bits -= 8; }
    if (free_ent > maxcode || clear_flg) {
      if (clear_flg) { maxcode = MAXCODE(n_bits = g_init_bits); clear_flg = false; }
      else { ++n_bits; maxcode = n_bits === 12 ? (1 << 12) : MAXCODE(n_bits); }
    }
    if (code === (1 << (initCodeSize)) + 1) { // EOFCode
      while (cur_bits > 0) { char_out(cur_accum & 0xff); cur_accum >>= 8; cur_bits -= 8; }
      flush_char();
    }
  }

  // compress
  const ClearCode = 1 << initCodeSize;
  const EOFCode = ClearCode + 1;
  n_bits = g_init_bits;
  maxcode = MAXCODE(n_bits);
  free_ent = ClearCode + 2;
  a_count = 0;
  cl_hash();
  let ent = nextPixel();
  output(ClearCode);
  let c: number;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    c = nextPixel();
    if (c === -1) break;
    const fcode = (c << 12) + ent;
    let i = (c << 4) ^ ent;
    if (htab[i] === fcode) { ent = codetab[i]; continue; }
    if (htab[i] >= 0) {
      let disp = HSIZE - i; if (i === 0) disp = 1;
      let found = false;
      do { i -= disp; if (i < 0) i += HSIZE; if (htab[i] === fcode) { ent = codetab[i]; found = true; break; } } while (htab[i] >= 0);
      if (found) continue;
    }
    output(ent); ent = c;
    if (free_ent < (1 << 12)) { codetab[i] = free_ent++; htab[i] = fcode; }
    else { cl_hash(); free_ent = ClearCode + 2; clear_flg = true; output(ClearCode); }
  }
  output(ent);
  output(EOFCode);
  out.push(0); // block terminator
  return new Uint8Array(out);
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
  // Logical Screen Descriptor
  writeShort(width);
  writeShort(height);
  writeBytes(0x87, 0, 0); // GCT flag, color res 8, sort=0, GCT size 256

  // --- Process frames ---
  let globalPalette: number[] | null = null;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    // RGBA → RGB
    const rgb = new Uint8Array(frame.width * frame.height * 3);
    for (let p = 0, q = 0; p < frame.data.length; p += 4, q += 3) {
      rgb[q] = frame.data[p];
      rgb[q + 1] = frame.data[p + 1];
      rgb[q + 2] = frame.data[p + 2];
    }

    // Quantize colors
    const nq = new NeuQuant(rgb, 10);
    nq.buildColormap();
    const colorTab = nq.getColormap();

    if (i === 0) {
      // Write Global Color Table
      globalPalette = colorTab;
      parts.push(new Uint8Array(colorTab));
      const pad = 3 * 256 - colorTab.length;
      if (pad > 0) parts.push(new Uint8Array(pad));

      // Netscape Extension (loop forever)
      writeBytes(0x21, 0xff, 0x0b);
      parts.push(new TextEncoder().encode("NETSCAPE2.0"));
      writeBytes(0x03, 0x01);
      writeShort(0); // loop count = 0 (infinite)
      writeBytes(0x00);
    }

    // Graphic Control Extension
    writeBytes(0x21, 0xf9, 0x04, 0x00);
    writeShort(delay);
    writeBytes(0x00, 0x00);

    // Image Descriptor
    writeBytes(0x2c);
    writeShort(0); writeShort(0);
    writeShort(width); writeShort(height);
    if (i === 0) {
      writeBytes(0x00); // use global color table
    } else {
      writeBytes(0x87); // local color table, 256 colors
      parts.push(new Uint8Array(colorTab));
      const pad = 3 * 256 - colorTab.length;
      if (pad > 0) parts.push(new Uint8Array(pad));
    }

    // Index pixels
    const nPix = frame.width * frame.height;
    const indexedPixels = new Uint8Array(nPix);
    const palette = (i === 0 && globalPalette) ? globalPalette : colorTab;
    const useNq = nq;
    for (let p = 0, k = 0; p < nPix; p++, k += 3) {
      indexedPixels[p] = useNq.lookupRGB(rgb[k + 2], rgb[k + 1], rgb[k]);
    }

    // LZW encode
    const lzwData = lzwEncode(width, height, indexedPixels, 8);
    parts.push(lzwData);

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
