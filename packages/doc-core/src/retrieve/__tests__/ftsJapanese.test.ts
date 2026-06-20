import { openDocDb, type DocDb } from '../../db/open';
import { persistDoc } from '../../ingest/persist';
import { searchFts, toFtsMatch } from '../fts';

// trigram tokenizer により日本語（CJK・空白なし）でも 3 文字以上の substring 一致で検索できる。
describe('Japanese FTS (trigram tokenizer)', () => {
  let db: DocDb;

  beforeAll(() => {
    db = openDocDb(':memory:');
    persistDoc(db, {
      path: 'spec/jp-a.ja.md',
      title: '型付きノート関連付け',
      excerpt: '関係グラフを型付きで表現する',
      body: 'frontmatter の related を型付き関係（depends-on 等）へ拡張する設計',
      related: [],
      contentHash: 'jp1',
    });
    persistDoc(db, {
      path: 'spec/jp-b.ja.md',
      title: 'スプレッドシート設計',
      excerpt: 'グリッドとセル編集',
      body: '表計算のグリッド描画とクリップボード対応',
      related: [],
      contentHash: 'jp2',
    });
  });

  afterAll(() => db?.close());

  it('builds a MATCH expr for CJK terms', () => {
    expect(toFtsMatch('関係グラフ')).toBe('"関係グラフ"');
  });

  it('matches a Japanese substring query (>=3 chars)', () => {
    const hits = searchFts(db, '型付き関係', 5).map((h) => h.path);
    expect(hits).toContain('spec/jp-a.ja.md');
    expect(hits).not.toContain('spec/jp-b.ja.md');
  });

  it('matches another doc by its distinct Japanese term', () => {
    const hits = searchFts(db, 'グリッド', 5).map((h) => h.path);
    expect(hits).toContain('spec/jp-b.ja.md');
  });
});
