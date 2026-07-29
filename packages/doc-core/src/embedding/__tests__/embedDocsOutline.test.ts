/**
 * FR-1 / AC-5: doc 埋め込み入力は title + excerpt + 見出しアウトライン + body 先頭の
 * 連結で、総量は maxChars で切り詰められる。切り詰めで本文から溢れる後半の見出しも
 * アウトライン経由で埋め込み入力に乗ることを固定する。
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openDocDb, type DocDb } from '../../db/open';
import { ingestDocs } from '../../ingest/ingestDocs';
import { embedDocs, type EmbedFn } from '../embedDocs';

describe('embedDocs 入力の見出しアウトライン', () => {
  let dir: string;
  let db: DocDb;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-core-outline-'));
    db = openDocDb(':memory:');
  });

  afterEach(() => {
    db?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function ingest(body: string): Promise<void> {
    const abs = path.join(dir, 'spec/x.ja.md');
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `---\ntitle: 表題\nexcerpt: 要約\n---\n\n${body}\n`, 'utf8');
    await ingestDocs(db, dir, { updatedAt: '2026-07-24T00:00:00.000Z' });
  }

  test('本文切り詰めで溢れる後半の見出しがアウトライン経由で入力に乗る', async () => {
    await ingest(['# 冒頭章', 'x'.repeat(500), '## 後半終盤見出し', '終盤本文'].join('\n'));
    const seen: string[] = [];
    const spy: EmbedFn = (text: string) => {
      seen.push(text);
      return Promise.resolve([1, 0, 0]);
    };
    await embedDocs(db, spy, { model: 'test-model', maxChars: 120 });
    expect(seen).toHaveLength(1);
    expect(seen[0].length).toBeLessThanOrEqual(120);
    expect(seen[0]).toContain('後半終盤見出し'); // 本文先頭 120 文字には含まれない
    expect(seen[0].startsWith('表題')).toBe(true);
    expect(seen[0]).toContain('要約');
  });

  test('見出しの無い doc は従来どおり title + excerpt + body になる', async () => {
    await ingest('見出しなし本文');
    const seen: string[] = [];
    const spy: EmbedFn = (text: string) => {
      seen.push(text);
      return Promise.resolve([1, 0, 0]);
    };
    await embedDocs(db, spy, { model: 'test-model' });
    expect(seen[0]).toBe('表題\n\n要約\n\n見出しなし本文');
  });
});
