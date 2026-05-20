import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveDbPath } from '../dbPath';

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
