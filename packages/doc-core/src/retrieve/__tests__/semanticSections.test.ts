/**
 * FR-5: 節ベース意味検索。節ベクトルの cosine top-k を返し、
 * 結果に path / heading / score を含める（該当節の pinpoint 参照）。
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openDocDb, type DocDb } from '../../db/open';
import { ingestDocs } from '../../ingest/ingestDocs';
import { embedSections } from '../../embedding/embedSections';
import type { EmbedFn } from '../../embedding/embedDocs';
import { searchSemanticSections } from '../semanticSections';

// 決定的な擬似 embedding: 「後半」を含むテキストだけ別方向のベクトルにする。
const fakeEmbed: EmbedFn = (text: string) =>
  Promise.resolve(text.includes('後半') ? [0, 1, 0] : [1, 0, 0]);

describe('searchSemanticSections', () => {
  let dir: string;
  let db: DocDb;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-core-sec-sem-'));
    const abs = path.join(dir, 'spec/long.ja.md');
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(
      abs,
      `---\ntitle: 長文\n---\n\n${['# 前半章', '前半の内容', '# 後半章', '後半の内容'].join('\n')}\n`,
      'utf8',
    );
    db = openDocDb(':memory:');
    await ingestDocs(db, dir, { updatedAt: '2026-07-24T00:00:00.000Z' });
  });

  afterEach(() => {
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('クエリに近い節が heading 付きで上位に返る', async () => {
    await embedSections(db, fakeEmbed, { model: 'test-model' });
    const hits = await searchSemanticSections(db, fakeEmbed, '後半の話題', 5);
    expect(hits.length).toBe(2);
    expect(hits[0].path).toBe('spec/long.ja.md');
    expect(hits[0].heading).toBe('後半章');
    expect(hits[0].score).toBeCloseTo(1);
    expect(hits[1].score ?? 0).toBeLessThan(hits[0].score ?? 0);
  });

  test('k で件数が制限される', async () => {
    await embedSections(db, fakeEmbed, { model: 'test-model' });
    const hits = await searchSemanticSections(db, fakeEmbed, '前半', 1);
    expect(hits).toHaveLength(1);
  });

  test('節埋め込みが無ければ空配列', async () => {
    const hits = await searchSemanticSections(db, fakeEmbed, '何か', 5);
    expect(hits).toEqual([]);
  });
});
