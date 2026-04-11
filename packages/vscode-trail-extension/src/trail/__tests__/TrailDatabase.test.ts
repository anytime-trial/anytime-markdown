// __non_webpack_require__ はwebpackグローバル。テスト環境ではsql-asm.jsを直接ロードするよう差し替え
const sqlAsmActual = require('/anytime-markdown/node_modules/sql.js/dist/sql-asm.js'); // eslint-disable-line @typescript-eslint/no-require-imports
(global as Record<string, unknown>).__non_webpack_require__ = (_path: string) => sqlAsmActual;

import { TrailDatabase, estimateCost } from '../TrailDatabase';

describe('estimateCost', () => {
  it('should calculate sonnet cost with all 4 token types', () => {
    // input: 1M, output: 1M, cacheRead: 1M, cacheCreation: 1M
    // cost = (1M * 3 + 1M * 15 + 1M * 0.3 + 1M * 3.75) / 1M = $22.05
    const result = estimateCost('claude-sonnet-4-6', 1_000_000, 1_000_000, 1_000_000, 1_000_000);
    expect(result).toBeCloseTo(22.05);
  });

  it('should calculate opus cost with model-specific rates', () => {
    const result = estimateCost('claude-opus-4-6', 1_000_000, 1_000_000, 1_000_000, 1_000_000);
    expect(result).toBeCloseTo(110.25); // 15 + 75 + 1.5 + 18.75
  });

  it('should calculate haiku cost with model-specific rates', () => {
    const result = estimateCost('claude-haiku-4-5', 1_000_000, 1_000_000, 1_000_000, 1_000_000);
    expect(result).toBeCloseTo(5.88); // 0.8 + 4 + 0.08 + 1.0
  });

  it('should fallback to sonnet rates for unknown models', () => {
    const result = estimateCost('unknown-model', 1_000_000, 0, 0, 0);
    expect(result).toBeCloseTo(3.0);
  });

  it('should match opus by partial name', () => {
    const result = estimateCost('some-opus-variant', 1_000_000, 0, 0, 0);
    expect(result).toBeCloseTo(15.0);
  });
});

describe('TrailDatabase.parseSessionIdFromBody', () => {
  let db: TrailDatabase;

  beforeAll(async () => {
    const initSqlJs = sqlAsmActual as typeof import('sql.js').default;
    const SQL = await initSqlJs();
    const inMemoryDb = new SQL.Database();
    db = new TrailDatabase('/tmp');
    (db as unknown as Record<string, unknown>).db = inMemoryDb;
  });

  afterAll(() => {
    db.close();
  });

  const parse = (body: string): string | null =>
    (db as unknown as Record<string, (b: string) => string | null>).parseSessionIdFromBody(body);

  it('正常な UUID を抽出する', () => {
    expect(parse('Session-Id: 550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('大文字小文字を区別しない', () => {
    expect(parse('session-id: 550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('複数トレーラーから Session-Id を抽出する', () => {
    const body = [
      'Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>',
      'Session-Id: abcdef01-2345-6789-abcd-ef0123456789',
    ].join('\n');
    expect(parse(body)).toBe('abcdef01-2345-6789-abcd-ef0123456789');
  });

  it('Session-Id がない場合は null を返す', () => {
    expect(parse('Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>')).toBeNull();
  });

  it('不正な形式は null を返す', () => {
    expect(parse('Session-Id: not-a-uuid')).toBeNull();
  });

  it('行頭でない場合は null を返す', () => {
    expect(parse('  Session-Id: 550e8400-e29b-41d4-a716-446655440000')).toBeNull();
  });

  it('空文字列は null を返す', () => {
    expect(parse('')).toBeNull();
  });
});

describe('TrailDatabase.getLastImportedAt', () => {
  it('セッションがない場合はnullを返す', async () => {
    // DB_PATH はハードコードされているため、init() をモックして空のインメモリDBを使用する
    const initSqlJs = sqlAsmActual as typeof import('sql.js').default;
    const SQL = await initSqlJs();
    const inMemoryDb = new SQL.Database();

    const db = new TrailDatabase('/tmp');
    // private フィールドに直接アクセスして空DBをセット
    (db as unknown as Record<string, unknown>).db = inMemoryDb;
    // createTables を呼び出すためにprotected メソッドにアクセス
    (db as unknown as Record<string, () => void>).createTables();

    const result = db.getLastImportedAt();
    expect(result).toBeNull();
    db.close();
  });
});
