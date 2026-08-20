/**
 * native binary の解決経路（baseDir → nativeBinding）の回帰テスト。
 *
 * 配布物でだけ壊れる欠陥を、配布物を作らずに検知するためのテスト。VSIX ビルドでは
 * CopyPlugin が配る bindings.js が minify されて getFileName が undefined を返し、
 * `new Ctor(path)` が `Cannot read properties of undefined (reading 'indexOf')` で
 * 必ず throw する。ソース実行では bindings の通常解決が成功してしまい「渡していない」ことが
 * 症状として現れないので、壊れた .node を渡して失敗するかで検査する
 * （渡っていなければ成功してしまう＝落ちる）。trail-db の同名テストと同じ方式。
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';

import { openBetterSqlite3, resolveBundledNativeBinding } from '../../internal/loadBetterSqlite3';
import { openCaravanDb, openTrailDb } from '../../sqlite/openDb';

const BINDING_SEGMENTS = ['node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'];

/** dist レイアウトを模した一時ディレクトリ。`content` が壊れた .node の中身になる。 */
function createFakeDist(tempDir: string, content: string): string {
  const distPath = path.join(tempDir, 'dist');
  fs.mkdirSync(path.join(distPath, ...BINDING_SEGMENTS.slice(0, -1)), { recursive: true });
  fs.writeFileSync(path.join(distPath, ...BINDING_SEGMENTS), content);
  return distPath;
}

describe('better-sqlite3 native binding resolution (mcp-trail)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-trail-native-binding-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves the bundled .node under baseDir when it exists', () => {
    const distPath = createFakeDist(tempDir, 'not-a-real-addon');
    expect(resolveBundledNativeBinding(distPath)).toBe(path.join(distPath, ...BINDING_SEGMENTS));
  });

  it('returns null when baseDir exists but the bundled .node was not copied', () => {
    const distPath = path.join(tempDir, 'dist-without-binary');
    fs.mkdirSync(distPath, { recursive: true });
    expect(resolveBundledNativeBinding(distPath)).toBeNull();
  });

  it('falls back to the default bindings resolution in a source checkout (no dist layout beside __dirname)', () => {
    expect(resolveBundledNativeBinding()).toBeNull();
  });

  it('passes the resolved binding to better-sqlite3 (a broken .node must fail the open)', () => {
    const distPath = createFakeDist(tempDir, 'not-a-real-addon');
    // 種類を問わない toThrow だと、将来 open が別の理由で落ちるようになったときに
    // 「baseDir が届いていない」欠陥を検知しないまま緑になる。対象 .node のパスで縛る。
    expect(() => openBetterSqlite3(path.join(tempDir, 'probe.db'), { baseDir: distPath })).toThrow(
      /better_sqlite3\.node/,
    );
  });

  it('opens normally when baseDir is not given', () => {
    const db = openBetterSqlite3(path.join(tempDir, 'plain.db'));
    try {
      expect(db.prepare('SELECT 1 AS one').get()).toEqual({ one: 1 });
    } finally {
      db.close();
    }
  });

  describe('openDb forwards the binding base to better-sqlite3', () => {
    let dbPath: string;

    beforeEach(() => {
      dbPath = path.join(tempDir, 'activity.db');
      const seed = new BetterSqlite3(dbPath);
      seed.exec('CREATE TABLE probe (id INTEGER PRIMARY KEY)');
      seed.close();
    });

    it('openTrailDb', async () => {
      const distPath = createFakeDist(tempDir, 'not-a-real-addon');
      await expect(openTrailDb(dbPath, 'readonly', { baseDir: distPath })).rejects.toThrow(
        /better_sqlite3\.node/,
      );
    });

    it('openCaravanDb', async () => {
      const distPath = createFakeDist(tempDir, 'not-a-real-addon');
      await expect(openCaravanDb(dbPath, 'readonly', { baseDir: distPath })).rejects.toThrow(
        /better_sqlite3\.node/,
      );
    });
  });
});
