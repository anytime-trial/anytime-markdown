/**
 * 画像ファイル先頭のヘッダから縦横の画素数を読む（PNG / JPEG / GIF / WebP）。
 * 読めない・未対応の形式は null を返し、例外を投げない。
 *
 * Why not: 画像処理ライブラリ（sharp 等）を使わない。縦横だけのためにネイティブ依存を足さない。
 */

export interface ImageSize {
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(buf: Buffer, bytes: readonly number[]): boolean {
  return buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);
}

function ascii(buf: Buffer, offset: number, length: number): string {
  return buf.length >= offset + length ? buf.toString('ascii', offset, offset + length) : '';
}

function readPng(buf: Buffer): ImageSize | null {
  if (buf.length < 24 || ascii(buf, 12, 4) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function readGif(buf: Buffer): ImageSize | null {
  if (buf.length < 10) return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

// SOF マーカー（C0〜CF のうち DHT=C4・JPG=C8・DAC=CC を除く）
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function readJpeg(buf: Buffer): ImageSize | null {
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    if (isStartOfFrame(marker)) {
      if (offset + 9 > buf.length) return null;
      return { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return null;
}

function readWebp(buf: Buffer): ImageSize | null {
  const chunk = ascii(buf, 12, 4);
  if (chunk === 'VP8X' && buf.length >= 30) {
    return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  }
  if (chunk === 'VP8L' && buf.length >= 25) {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ' && buf.length >= 30) {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

export function readImageSize(buf: Buffer): ImageSize | null {
  if (startsWith(buf, PNG_SIGNATURE)) return readPng(buf);
  if (ascii(buf, 0, 6) === 'GIF87a' || ascii(buf, 0, 6) === 'GIF89a') return readGif(buf);
  if (startsWith(buf, [0xff, 0xd8])) return readJpeg(buf);
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 4) === 'WEBP') return readWebp(buf);
  return null;
}
