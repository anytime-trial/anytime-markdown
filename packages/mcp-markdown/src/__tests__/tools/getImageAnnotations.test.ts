import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getImageAnnotations } from '../../tools/getImageAnnotations';

function png(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

const rect = (id: string, extra: Record<string, unknown> = {}) => ({
  id, type: 'rect', x1: 10, y1: 20, x2: 50, y2: 60, color: '#ef4444', ...extra,
});

function block(entries: Array<[string, unknown]>): string {
  return '\n<!-- image-comments\n' + entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n') + '\n-->';
}

describe('getImageAnnotations', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-img-annot-'));
    fs.mkdirSync(path.join(root, 'docs', 'images'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'images', 'a.png'), png(200, 100));
    fs.writeFileSync(path.join(root, 'docs', 'images', 'b.png'), png(400, 300));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function write(name: string, text: string): string {
    fs.writeFileSync(path.join(root, 'docs', name), text);
    return `docs/${name}`;
  }

  it('AC-01: 注記付き画像ごとに src・alt・行番号・見出し・注記を返す', async () => {
    const md = [
      '# 画面', '', '## ヘッダ', '', '![ヘッダ部](images/a.png)', '', '## フッタ', '', '![フッタ部](images/b.png "title")',
    ].join('\n') + block([
      ['img0:images/a.png', [rect('r1', { comment: 'ボタンがずれている' })]],
      ['img1:images/b.png', [rect('r2')]],
    ]);
    const result = await getImageAnnotations({ path: write('a.md', md) }, root);

    expect(result.images).toHaveLength(2);
    expect(result.images[0]).toMatchObject({
      index: 0, src: 'images/a.png', alt: 'ヘッダ部', line: 5, heading: '## ヘッダ',
      annotations: [{ id: 'r1', type: 'rect', percent: { x1: 10, y1: 20, x2: 50, y2: 60 }, color: '#ef4444', comment: 'ボタンがずれている', resolved: false }],
    });
    expect(result.images[1]).toMatchObject({ index: 1, src: 'images/b.png', alt: 'フッタ部', line: 9, heading: '## フッタ' });
    expect(result.unmatched).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('コードブロック内の画像記法とフロントマターは数えない', async () => {
    const md = ['---', 'title: x', '---', '```', '![no](images/b.png)', '```', '![yes](images/a.png)'].join('\n')
      + block([['img0:images/a.png', [rect('r1')]]]);
    const result = await getImageAnnotations({ path: write('code.md', md) }, root);
    expect(result.images.map((i) => i.src)).toEqual(['images/a.png']);
    expect(result.unmatched).toEqual([]);
  });

  it('gif-settings の付いた GIF は保存時と同じく通し番号に数えない', async () => {
    const md = ['![anim](images/x.gif)', '<!-- gif-settings: {"loop":true} -->', '![a](images/a.png)'].join('\n')
      + block([['img0:images/a.png', [rect('r1')]]]);
    const result = await getImageAnnotations({ path: write('gif.md', md) }, root);
    expect(result.images.map((i) => i.src)).toEqual(['images/a.png']);
  });

  it('AC-02: 並べ替えで src が一致しない注記は unmatched に入り、別の画像へ付かない', async () => {
    const md = ['![b](images/b.png)', '![a](images/a.png)'].join('\n')
      + block([['img0:images/a.png', [rect('r1')]]]);
    const result = await getImageAnnotations({ path: write('moved.md', md) }, root);
    expect(result.images).toEqual([]);
    expect(result.unmatched).toEqual([
      expect.objectContaining({ key: 'img0:images/a.png', reason: expect.stringContaining('src'), annotations: [expect.objectContaining({ id: 'r1' })] }),
    ]);
  });

  it('通し番号に当たる画像が無い注記も unmatched', async () => {
    const md = '![a](images/a.png)' + block([['img5:images/a.png', [rect('r1')]]]);
    const result = await getImageAnnotations({ path: write('missing.md', md) }, root);
    expect(result.unmatched[0].reason).toMatch(/index/);
  });

  it('AC-03: 100 文字を超える data URI の画像に注記が対応づき、src は切り詰めて返す', async () => {
    const dataUri = 'data:image/png;base64,' + png(10, 20).toString('base64') + 'A'.repeat(120);
    const md = `![inline](${dataUri})` + block([[`img0:${dataUri.slice(0, 20)}`, [rect('r1')]]]);
    const result = await getImageAnnotations({ path: write('data.md', md) }, root);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].src.length).toBeLessThan(dataUri.length);
    expect(result.images[0].src.startsWith('data:image/png')).toBe(true);
  });

  it('AC-04: 画像サイズが取れれば画素座標を四捨五入で返す', async () => {
    const md = '![a](images/a.png)' + block([['img0:images/a.png', [{ ...rect('r1'), x1: 12.345, y1: 33.3, x2: 50, y2: 99.9 }]]]);
    const result = await getImageAnnotations({ path: write('px.md', md) }, root);
    expect(result.images[0].size).toEqual({ width: 200, height: 100 });
    expect(result.images[0].annotations[0].pixels).toEqual({ x1: 25, y1: 33, x2: 100, y2: 100 });
  });

  it('AC-04: サイズが取れない画像は画素座標を省き、理由を返す', async () => {
    fs.writeFileSync(path.join(root, 'docs', 'images', 'c.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const md = '![c](images/c.svg)' + block([['img0:images/c.svg', [rect('r1')]]]);
    const result = await getImageAnnotations({ path: write('svg.md', md) }, root);
    expect(result.images[0].size).toBeUndefined();
    expect(result.images[0].sizeUnavailableReason).toBeDefined();
    expect(result.images[0].annotations[0].pixels).toBeUndefined();
  });

  it('AC-05: 既定は未解決のみ、includeResolved で全件', async () => {
    const md = '![a](images/a.png)' + block([['img0:images/a.png', [rect('open'), rect('done', { resolved: true })]]]);
    const p = write('resolved.md', md);
    const def = await getImageAnnotations({ path: p }, root);
    expect(def.images[0].annotations.map((a) => a.id)).toEqual(['open']);
    const all = await getImageAnnotations({ path: p, includeResolved: true }, root);
    expect(all.images[0].annotations.map((a) => a.id)).toEqual(['open', 'done']);
  });

  it('未解決が 0 件になった画像は一覧に出さない', async () => {
    const md = '![a](images/a.png)' + block([['img0:images/a.png', [rect('done', { resolved: true })]]]);
    const result = await getImageAnnotations({ path: write('allres.md', md) }, root);
    expect(result.images).toEqual([]);
  });

  it('FR-09: imageIndex を指定するとその画像だけを返す', async () => {
    const md = ['![a](images/a.png)', '![b](images/b.png)'].join('\n')
      + block([['img0:images/a.png', [rect('r1')]], ['img1:images/b.png', [rect('r2')]]]);
    const result = await getImageAnnotations({ path: write('pick.md', md), imageIndex: 1 }, root);
    expect(result.images.map((i) => i.index)).toEqual([1]);
  });

  it('AC-06: 既定では画像データを返さず、includeImages でワークスペース内の画像だけ返す', async () => {
    const md = ['![a](images/a.png)', '![ext](https://example.com/x.png)'].join('\n')
      + block([['img0:images/a.png', [rect('r1')]], ['img1:https://example.com/x.png', [rect('r2')]]]);
    const p = write('img.md', md);
    const def = await getImageAnnotations({ path: p }, root);
    expect(def.imageData).toEqual([]);

    const withImages = await getImageAnnotations({ path: p, includeImages: true }, root);
    expect(withImages.imageData).toEqual([
      { index: 0, mimeType: 'image/png', data: png(200, 100).toString('base64') },
    ]);
    expect(withImages.imageErrors).toEqual([{ index: 1, reason: expect.stringMatching(/external/i) }]);
  });

  it('NFR-02: 5 MB を超える画像と 6 枚目以降は本体を返さない', async () => {
    const big = Buffer.concat([png(1, 1), Buffer.alloc(5 * 1024 * 1024)]);
    fs.writeFileSync(path.join(root, 'docs', 'images', 'big.png'), big);
    const srcs = ['big.png', 'a.png', 'a.png', 'a.png', 'a.png', 'a.png', 'a.png'];
    const md = srcs.map((s) => `![x](images/${s})`).join('\n')
      + block(srcs.map((s, i) => [`img${i}:images/${s}`, [rect(`r${i}`)]] as [string, unknown]));
    const result = await getImageAnnotations({ path: write('limit.md', md), includeImages: true }, root);
    expect(result.imageData.map((d) => d.index)).toEqual([1, 2, 3, 4, 5]);
    expect(result.imageErrors).toEqual([
      { index: 0, reason: expect.stringMatching(/5 ?MB/) },
      { index: 6, reason: expect.stringMatching(/limit/i) },
    ]);
  });

  it('AC-07: ワークスペース外の Markdown は拒否する', async () => {
    await expect(getImageAnnotations({ path: '../outside.md' }, root)).rejects.toThrow(/outside/);
  });

  it('AC-07: シンボリックリンクでワークスペース外を指す画像は読まない', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-img-out-'));
    try {
      fs.writeFileSync(path.join(outside, 'secret.png'), png(1, 1));
      fs.symlinkSync(path.join(outside, 'secret.png'), path.join(root, 'docs', 'images', 'link.png'));
      const md = '![l](images/link.png)' + block([['img0:images/link.png', [rect('r1')]]]);
      const result = await getImageAnnotations({ path: write('link.md', md), includeImages: true }, root);
      expect(result.imageData).toEqual([]);
      expect(result.imageErrors[0].reason).toMatch(/outside/);
      expect(result.images[0].size).toBeUndefined();
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('AC-07: シンボリックリンクでワークスペース外を指す Markdown は拒否する', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-img-out-'));
    try {
      fs.writeFileSync(path.join(outside, 'x.md'), '![a](a.png)');
      fs.symlinkSync(path.join(outside, 'x.md'), path.join(root, 'docs', 'x.md'));
      await expect(getImageAnnotations({ path: 'docs/x.md' }, root)).rejects.toThrow(/outside/);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('AC-08: 注記ブロックが無ければ空の一覧', async () => {
    const result = await getImageAnnotations({ path: write('none.md', '![a](images/a.png)') }, root);
    expect(result).toMatchObject({ images: [], unmatched: [], skipped: [] });
  });

  it('AC-08: 壊れた行は skipped に理由付きで入る', async () => {
    const md = '![a](images/a.png)\n<!-- image-comments\nno-equal-line\nimg0:images/a.png=not json\nbad:key=[]\nimg0:images/a.png=[{"id":"x"}]\n-->';
    const result = await getImageAnnotations({ path: write('broken.md', md) }, root);
    expect(result.skipped.map((s) => s.reason)).toEqual([
      expect.stringMatching(/=/),
      expect.stringMatching(/JSON/),
      expect.stringMatching(/key/),
      expect.stringMatching(/required/),
    ]);
  });

  it('存在しないファイル・Markdown 以外はエラー', async () => {
    await expect(getImageAnnotations({ path: 'docs/nope.md' }, root)).rejects.toThrow();
    await expect(getImageAnnotations({ path: 'docs/images/a.png' }, root)).rejects.toThrow(/not allowed/);
  });

  it('AC-09: 呼び出しの前後でファイルの内容と更新時刻が変わらない', async () => {
    const p = write('ro.md', '![a](images/a.png)' + block([['img0:images/a.png', [rect('r1')]]]));
    const abs = path.join(root, p);
    const before = { text: fs.readFileSync(abs, 'utf8'), mtime: fs.statSync(abs).mtimeMs };
    await getImageAnnotations({ path: p, includeImages: true, includeResolved: true }, root);
    expect({ text: fs.readFileSync(abs, 'utf8'), mtime: fs.statSync(abs).mtimeMs }).toEqual(before);
  });
});
