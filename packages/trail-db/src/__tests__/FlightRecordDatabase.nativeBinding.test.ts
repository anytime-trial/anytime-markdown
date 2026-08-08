/**
 * native binary の解決経路（distPath → nativeBinding）の回帰テスト。
 *
 * 配布物でだけ壊れる欠陥を、配布物を作らずに検知するためのテスト。webpack-bundled 拡張では
 * bindings が .node を推測できず `new Ctor(path)` が必ず throw するため、trail-db は distPath
 * 配下のバンドル済み .node を明示的に渡す必要がある。ソース実行では bindings の通常解決が
 * 成功してしまい「渡していない」ことが症状として現れないので、渡した .node が実際に使われる
 * ことを、壊れた .node を渡して失敗するかで検査する（渡っていなければ成功してしまう＝落ちる）。
 *
 * 2026-08-08: FlightRecordDatabase がこの手当てを欠き、配布済み拡張 0.43.0 で
 * flight 系エンドポイントが全滅した（viewer は「Trail サーバー停止の可能性」と表示）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FlightRecordDatabase } from '../FlightRecordDatabase';
import { openBetterSqlite3, resolveBundledNativeBinding } from '../internal/loadBetterSqlite3';

/** dist レイアウトを模した一時ディレクトリ。`content` が壊れた .node の中身になる。 */
function createFakeDist(tempDir: string, content: string): string {
  const distPath = path.join(tempDir, 'dist');
  const releaseDir = path.join(distPath, 'node_modules', 'better-sqlite3', 'build', 'Release');
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.writeFileSync(path.join(releaseDir, 'better_sqlite3.node'), content);
  return distPath;
}

describe('better-sqlite3 native binding resolution', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-record-native-binding-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves the bundled .node under distPath when it exists', () => {
    const distPath = createFakeDist(tempDir, 'not-a-real-addon');
    expect(resolveBundledNativeBinding(distPath)).toBe(
      path.join(distPath, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
    );
  });

  it.each([[null], [undefined], ['']])(
    'falls back to the default bindings resolution when distPath is %p',
    (distPath) => {
      expect(resolveBundledNativeBinding(distPath)).toBeNull();
    },
  );

  it('returns null when distPath exists but the bundled .node was not copied', () => {
    const distPath = path.join(tempDir, 'dist-without-binary');
    fs.mkdirSync(distPath, { recursive: true });
    expect(resolveBundledNativeBinding(distPath)).toBeNull();
  });

  it('passes the resolved binding to better-sqlite3 (a broken .node must fail the open)', () => {
    const distPath = createFakeDist(tempDir, 'not-a-real-addon');
    // 種類を問わない toThrow だと、将来 init が別の理由で落ちるようになったときに
    // 「distPath が届いていない」欠陥を検知しないまま緑になる。対象 .node のパスで縛る。
    expect(() => openBetterSqlite3(path.join(tempDir, 'probe.db'), { distPath })).toThrow(/better_sqlite3\.node/);
  });

  it('reports a missing bundled binding when distPath is given but the .node was not copied', () => {
    const distPath = path.join(tempDir, 'dist-without-binary');
    fs.mkdirSync(distPath, { recursive: true });
    const missing: string[] = [];
    const db = openBetterSqlite3(path.join(tempDir, 'reported.db'), {
      distPath,
      onBundledBindingMissing: (p) => missing.push(p),
    });
    try {
      // 配置漏れは bindings の通常解決へ黙って落ちる。バンドル実行では必ず失敗する経路なので、
      // 「未指定（テスト・ソース実行）」と区別できる信号を残す。
      expect(missing).toEqual([
        path.join(distPath, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
      ]);
    } finally {
      db.close();
    }
  });

  it('does not report anything when distPath is not given', () => {
    const missing: string[] = [];
    const db = openBetterSqlite3(path.join(tempDir, 'silent.db'), {
      onBundledBindingMissing: (p) => missing.push(p),
    });
    try {
      expect(missing).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('opens normally when distPath is not given', () => {
    const db = openBetterSqlite3(path.join(tempDir, 'plain.db'));
    try {
      expect(db.prepare('SELECT 1 AS one').get()).toEqual({ one: 1 });
    } finally {
      db.close();
    }
  });

  it('FlightRecordDatabase forwards distPath to the connection', () => {
    const distPath = createFakeDist(tempDir, 'not-a-real-addon');
    const db = new FlightRecordDatabase(path.join(tempDir, 'memory-core.db'), { distPath });
    try {
      expect(() => db.init()).toThrow(/better_sqlite3\.node/);
    } finally {
      db.close();
    }
  });

  it('FlightRecordDatabase still initializes without distPath', () => {
    const db = new FlightRecordDatabase(path.join(tempDir, 'memory-core.db'));
    try {
      expect(() => db.init()).not.toThrow();
      expect(db.listInstructionRecords({ limit: 1 })).toEqual([]);
    } finally {
      db.close();
    }
  });
});
