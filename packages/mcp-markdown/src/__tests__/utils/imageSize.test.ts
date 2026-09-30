import { readImageSize } from '../../utils/imageSize';

function png(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function gif(width: number, height: number): Buffer {
  const buf = Buffer.alloc(13);
  buf.write('GIF89a', 0, 'ascii');
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

function jpeg(width: number, height: number): Buffer {
  // SOI → APP0（長さ 16）→ SOF0
  const app0 = Buffer.alloc(18);
  app0[0] = 0xff; app0[1] = 0xe0; app0.writeUInt16BE(16, 2);
  const sof = Buffer.alloc(10);
  sof[0] = 0xff; sof[1] = 0xc0; sof.writeUInt16BE(17, 2); sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}

function webpVp8x(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8X', 12, 'ascii');
  buf.writeUIntLE(width - 1, 24, 3);
  buf.writeUIntLE(height - 1, 27, 3);
  return buf;
}

function webpVp8l(width: number, height: number): Buffer {
  const buf = Buffer.alloc(25);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8L', 12, 'ascii');
  buf[20] = 0x2f;
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  buf.writeUInt32LE(bits, 21);
  return buf;
}

function webpVp8(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8 ', 12, 'ascii');
  buf[23] = 0x9d; buf[24] = 0x01; buf[25] = 0x2a;
  buf.writeUInt16LE(width, 26);
  buf.writeUInt16LE(height, 28);
  return buf;
}

describe('readImageSize', () => {
  it.each([
    ['PNG', png(640, 480)],
    ['GIF', gif(640, 480)],
    ['JPEG', jpeg(640, 480)],
    ['WebP VP8X', webpVp8x(640, 480)],
    ['WebP VP8L', webpVp8l(640, 480)],
    ['WebP VP8', webpVp8(640, 480)],
  ])('%s のヘッダから縦横を読む', (_label, buf) => {
    expect(readImageSize(buf)).toEqual({ width: 640, height: 480 });
  });

  it('未対応形式（SVG 等）は null', () => {
    expect(readImageSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });

  it('途中で切れたヘッダは null（例外にしない）', () => {
    expect(readImageSize(png(1, 1).subarray(0, 18))).toBeNull();
    expect(readImageSize(jpeg(1, 1).subarray(0, 10))).toBeNull();
    expect(readImageSize(Buffer.alloc(0))).toBeNull();
  });
});
