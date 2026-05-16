import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveDbPath } from '../dbPath';

describe('resolveDbPath', () => {
  let tmpDir: string;
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbpath-'));
    savedEnv = { ...process.env };
    delete process.env.TRAIL_HOME;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
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
});
