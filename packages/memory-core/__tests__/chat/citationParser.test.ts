import { CitationStreamParser } from '../../src/chat/citationParser';
import type { ChatChunk } from '../../src/chat/types';

describe('CitationStreamParser', () => {
  function collectAll(input: string[]): ChatChunk[] {
    const parser = new CitationStreamParser();
    const out: ChatChunk[] = [];
    for (const part of input) parser.feed(part, (c) => out.push(c));
    parser.flush((c) => out.push(c));
    return out;
  }

  test('完全な citation を 1 チャンクで検出', () => {
    const chunks = collectAll(['answer text [^entity:abc] more text']);
    const citations = chunks.filter((c) => c.type === 'citation');
    expect(citations).toEqual([
      { type: 'citation', payload: { tag: 'entity:abc', sourceId: 'abc' } },
    ]);
  });

  test('チャンク跨ぎの citation を結合検出', () => {
    const chunks = collectAll(['answer [^enti', 'ty:xyz123] tail']);
    const citations = chunks.filter((c) => c.type === 'citation');
    expect(citations).toEqual([
      { type: 'citation', payload: { tag: 'entity:xyz123', sourceId: 'xyz123' } },
    ]);
  });

  test('episode / drift も検出', () => {
    const chunks = collectAll(['a [^episode:s1] b [^drift:d1] c']);
    const citations = chunks.filter((c) => c.type === 'citation').map((c) => c.payload);
    expect(citations).toEqual([
      { tag: 'episode:s1', sourceId: 's1' },
      { tag: 'drift:d1', sourceId: 'd1' },
    ]);
  });

  test('citation を含まないトークンはそのまま emit', () => {
    const chunks = collectAll(['hello world']);
    const tokens = chunks
      .filter((c) => c.type === 'token')
      .map((c) => c.payload.delta)
      .join('');
    expect(tokens).toBe('hello world');
  });

  test('citation の前後テキストはトークンとして残る', () => {
    const chunks = collectAll(['head [^entity:e1] tail']);
    const tokens = chunks
      .filter((c) => c.type === 'token')
      .map((c) => c.payload.delta)
      .join('');
    expect(tokens).toBe('head  tail');
  });

  test('不正な形式 ([^foo:bar/baz]) は素通し (citation 扱いしない)', () => {
    const chunks = collectAll(['x [^foo:bar/baz] y']);
    const citations = chunks.filter((c) => c.type === 'citation');
    expect(citations).toEqual([]);
  });

  test('flush で不完全な buffer を吐き出す', () => {
    const parser = new CitationStreamParser();
    const out: ChatChunk[] = [];
    parser.feed('partial text [^ent', (c) => out.push(c));
    // 中途半端な "[^ent" は flush 時に token として残る
    parser.flush((c) => out.push(c));
    const tokens = out
      .filter((c) => c.type === 'token')
      .map((c) => c.payload.delta)
      .join('');
    expect(tokens).toContain('partial text');
    expect(tokens).toContain('[^ent');
  });

  test('複数 citation を続けて検出', () => {
    const chunks = collectAll(['[^entity:a][^entity:b]']);
    const tags = chunks.filter((c) => c.type === 'citation').map((c) => c.payload.tag);
    expect(tags).toEqual(['entity:a', 'entity:b']);
  });
});
