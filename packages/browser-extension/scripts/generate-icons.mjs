/**
 * プレースホルダのアイコン PNG を生成する（16 / 32 / 48 / 128 px）。
 *
 * 外部依存なしの純 Node PNG エンコーダ（RGBA / filter 0 / zlib deflate）。
 * アクセント色の角丸正方形に "M" を白で描く簡易デザイン。本番公開前に
 * 正式なアイコンへ差し替えること。
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const ACCENT = [58, 123, 213]; // #3A7BD5 — 暫定アクセント。design.md 確定後に差し替える。
const SIZES = [16, 32, 48, 128];

/** CRC32（PNG チャンク用）。 */
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** 太さ込みで点 (x,y) が文字 "M" のストロークに乗るか（size 正規化座標）。 */
function isGlyph(x, y, size) {
  const t = size * 0.13; // ストローク太さ
  const left = size * 0.28;
  const right = size * 0.72;
  const top = size * 0.3;
  const bottom = size * 0.7;
  // 左右の縦棒
  if (Math.abs(x - left) <= t && y >= top && y <= bottom) return true;
  if (Math.abs(x - right) <= t && y >= top && y <= bottom) return true;
  // 中央の V（2 本の斜め）
  const mid = size * 0.5;
  const apex = size * 0.56;
  if (y >= top && y <= apex) {
    const onLeftDiag = Math.abs((x - left) - ((y - top) * (mid - left)) / (apex - top)) <= t;
    const onRightDiag = Math.abs((right - x) - ((y - top) * (right - mid)) / (apex - top)) <= t;
    if (onLeftDiag || onRightDiag) return true;
  }
  return false;
}

function encodePng(size) {
  const radius = size * 0.18;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // 角丸の外側は透明
      const inCorner =
        (x < radius && y < radius && Math.hypot(radius - x, radius - y) > radius) ||
        (x > size - radius && y < radius && Math.hypot(x - (size - radius), radius - y) > radius) ||
        (x < radius && y > size - radius && Math.hypot(radius - x, y - (size - radius)) > radius) ||
        (x > size - radius && y > size - radius && Math.hypot(x - (size - radius), y - (size - radius)) > radius);
      if (inCorner) {
        raw[p++] = 0;
        raw[p++] = 0;
        raw[p++] = 0;
        raw[p++] = 0;
        continue;
      }
      if (isGlyph(x, y, size)) {
        raw[p++] = 255;
        raw[p++] = 255;
        raw[p++] = 255;
        raw[p++] = 255;
      } else {
        raw[p++] = ACCENT[0];
        raw[p++] = ACCENT[1];
        raw[p++] = ACCENT[2];
        raw[p++] = 255;
      }
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public/icons", { recursive: true });
for (const size of SIZES) {
  writeFileSync(`public/icons/icon-${size}.png`, encodePng(size));
}
console.log(`[browser-extension] icons generated: ${SIZES.join(", ")}`);
