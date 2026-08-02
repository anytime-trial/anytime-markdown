import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveDbPath, resolveMemoryDbPath } from '../dbPath';

describe('resolveDbPath', () => {
  let tmpDir: string;
  let savedEnv: NodeJS.ProcessEnv;
  let savedCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbpath-'));
    savedEnv = { ...process.env };
    savedCwd = process.cwd();
    delete process.env.TRAIL_HOME;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // process.chdir が使われた場合のリセット
    try {
      process.chdir(savedCwd);
    } catch {
      // cwd が消えていた場合は無視
    }
  });

  it('workspacePath/.anytime/trail/db/trail.db が存在する場合それを返す', () => {
    const dbDir = path.join(tmpDir, '.anytime', 'trail', 'db');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbFile = path.join(dbDir, 'trail.db');
    fs.writeFileSync(dbFile, '');
    expect(resolveDbPath({ workspacePath: tmpDir })).toBe(dbFile);
  });

  it('候補が存在しない場合 Error を throw する', () => {
    const notExistWs = path.join(tmpDir, 'ghost-ws');
    expect(() => resolveDbPath({ workspacePath: notExistWs }))
      .toThrow(/trail\.db not found at/);
  });

  it('TRAIL_HOME 環境変数を尊重する', () => {
    const dbDir = path.join(tmpDir, 'custom-home', 'db');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbFile = path.join(dbDir, 'trail.db');
    fs.writeFileSync(dbFile, '');
    process.env.TRAIL_HOME = path.join(tmpDir, 'custom-home');
    expect(resolveDbPath({ workspacePath: path.join(tmpDir, 'unused') })).toBe(dbFile);
  });

  it('workspacePath 省略時は process.cwd() をベースに解決する', () => {
    // tmpDir を cwd として設定し、DB ファイルを作成
    const dbDir = path.join(tmpDir, '.anytime', 'trail', 'db');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbFile = path.join(dbDir, 'trail.db');
    fs.writeFileSync(dbFile, '');

    process.chdir(tmpDir);
    const result = resolveDbPath({});
    expect(result).toBe(dbFile);
  });

  it('workspacePath 省略 + TRAIL_HOME 設定時は TRAIL_HOME を優先する', () => {
    const customHomeDbDir = path.join(tmpDir, 'trail-home', 'db');
    fs.mkdirSync(customHomeDbDir, { recursive: true });
    const dbFile = path.join(customHomeDbDir, 'trail.db');
    fs.writeFileSync(dbFile, '');
    process.env.TRAIL_HOME = path.join(tmpDir, 'trail-home');

    const result = resolveDbPath({});
    expect(result).toBe(dbFile);
  });
});

describe('resolveMemoryDbPath', () => {
  let tmpDir: string;
  let savedEnv: NodeJS.ProcessEnv;
  let savedCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memdbpath-'));
    savedEnv = { ...process.env };
    savedCwd = process.cwd();
    delete process.env.TRAIL_HOME;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    try {
      process.chdir(savedCwd);
    } catch {
      // cwd が消えていた場合は無視
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeDb(root: string): string {
    const dbDir = path.join(root, '.anytime', 'trail', 'db');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbFile = path.join(dbDir, 'memory-core.db');
    fs.writeFileSync(dbFile, '');
    return dbFile;
  }

  it('workspacePath 配下の memory-core.db を返す', () => {
    const dbFile = makeDb(tmpDir);
    expect(resolveMemoryDbPath({ workspacePath: tmpDir })).toBe(dbFile);
  });

  it('存在しない場合は throw し、ディレクトリも DB も作らない', () => {
    // 「無ければ作る」を選ぶと、スキーマ完備の空 DB ができて全クエリが 0 件を返す。
    // 呼び出し側からは「問題なし」と区別が付かない偽陰性になるため fail-closed とする。
    const ghost = path.join(tmpDir, 'ghost-ws');
    expect(() => resolveMemoryDbPath({ workspacePath: ghost })).toThrow(
      /memory-core\.db not found at/,
    );
    expect(fs.existsSync(path.join(ghost, '.anytime'))).toBe(false);
  });

  it('TRAIL_HOME を優先する', () => {
    const dbDir = path.join(tmpDir, 'custom-home', 'db');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbFile = path.join(dbDir, 'memory-core.db');
    fs.writeFileSync(dbFile, '');
    process.env.TRAIL_HOME = path.join(tmpDir, 'custom-home');
    expect(resolveMemoryDbPath({ workspacePath: path.join(tmpDir, 'unused') })).toBe(dbFile);
  });

  it('workspacePath 省略時は process.cwd() をベースに解決する', () => {
    const dbFile = makeDb(tmpDir);
    process.chdir(tmpDir);
    expect(resolveMemoryDbPath({})).toBe(dbFile);
  });
});
