import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveDbPath, resolveCaravanDbPath, resolveCaravanDbPathForWrite, resolveWorkspacePath } from '../dbPath';

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

  it('workspacePath/.anytime/trail/db/activity.db が存在する場合それを返す', () => {
    const dbDir = path.join(tmpDir, '.anytime', 'trail', 'db');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbFile = path.join(dbDir, 'activity.db');
    fs.writeFileSync(dbFile, '');
    expect(resolveDbPath({ workspacePath: tmpDir })).toBe(dbFile);
  });

  it('候補が存在しない場合 Error を throw する', () => {
    const notExistWs = path.join(tmpDir, 'ghost-ws');
    expect(() => resolveDbPath({ workspacePath: notExistWs }))
      .toThrow(/activity\.db not found at/);
  });

  it('TRAIL_HOME 環境変数を尊重する', () => {
    const dbDir = path.join(tmpDir, 'custom-home', 'db');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbFile = path.join(dbDir, 'activity.db');
    fs.writeFileSync(dbFile, '');
    process.env.TRAIL_HOME = path.join(tmpDir, 'custom-home');
    expect(resolveDbPath({ workspacePath: path.join(tmpDir, 'unused') })).toBe(dbFile);
  });

  it('workspacePath 省略時は process.cwd() をベースに解決する', () => {
    // tmpDir を cwd として設定し、DB ファイルを作成
    const dbDir = path.join(tmpDir, '.anytime', 'trail', 'db');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbFile = path.join(dbDir, 'activity.db');
    fs.writeFileSync(dbFile, '');

    process.chdir(tmpDir);
    const result = resolveDbPath({});
    expect(result).toBe(dbFile);
  });

  it('workspacePath 省略 + TRAIL_HOME 設定時は TRAIL_HOME を優先する', () => {
    const customHomeDbDir = path.join(tmpDir, 'trail-home', 'db');
    fs.mkdirSync(customHomeDbDir, { recursive: true });
    const dbFile = path.join(customHomeDbDir, 'activity.db');
    fs.writeFileSync(dbFile, '');
    process.env.TRAIL_HOME = path.join(tmpDir, 'trail-home');

    const result = resolveDbPath({});
    expect(result).toBe(dbFile);
  });
});

describe('resolveCaravanDbPath', () => {
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
    const dbFile = path.join(dbDir, 'caravan-book.db');
    fs.writeFileSync(dbFile, '');
    return dbFile;
  }

  it('workspacePath 配下の caravan-book.db を返す', () => {
    const dbFile = makeDb(tmpDir);
    expect(resolveCaravanDbPath({ workspacePath: tmpDir })).toBe(dbFile);
  });

  it('存在しない場合は throw し、ディレクトリも DB も作らない', () => {
    // 「無ければ作る」を選ぶと、スキーマ完備の空 DB ができて全クエリが 0 件を返す。
    // 呼び出し側からは「問題なし」と区別が付かない偽陰性になるため fail-closed とする。
    const ghost = path.join(tmpDir, 'ghost-ws');
    expect(() => resolveCaravanDbPath({ workspacePath: ghost })).toThrow(
      /caravan-book\.db not found at/,
    );
    expect(fs.existsSync(path.join(ghost, '.anytime'))).toBe(false);
  });

  it('TRAIL_HOME を優先する', () => {
    const dbDir = path.join(tmpDir, 'custom-home', 'db');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbFile = path.join(dbDir, 'caravan-book.db');
    fs.writeFileSync(dbFile, '');
    process.env.TRAIL_HOME = path.join(tmpDir, 'custom-home');
    expect(resolveCaravanDbPath({ workspacePath: path.join(tmpDir, 'unused') })).toBe(dbFile);
  });

  it('workspacePath 省略時は process.cwd() をベースに解決する', () => {
    const dbFile = makeDb(tmpDir);
    process.chdir(tmpDir);
    expect(resolveCaravanDbPath({})).toBe(dbFile);
  });
});

describe('resolveWorkspacePath（解決元の一元化）', () => {
  let tmpDir: string;
  let savedEnv: NodeJS.ProcessEnv;
  let savedCwd: string;
  let warnings: string[];
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wspath-'));
    savedEnv = { ...process.env };
    savedCwd = process.cwd();
    delete process.env.TRAIL_WORKSPACE_PATH;
    warnings = [];
    errorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    errorSpy.mockRestore();
    process.env = { ...savedEnv };
    try {
      process.chdir(savedCwd);
    } catch {
      // cwd が消えていた場合は無視
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('引数 > TRAIL_WORKSPACE_PATH > cwd の順で解決し、解決元を返す', () => {
    process.env.TRAIL_WORKSPACE_PATH = path.join(tmpDir, 'from-env');

    expect(resolveWorkspacePath(path.join(tmpDir, 'from-arg')))
      .toEqual({ path: path.join(tmpDir, 'from-arg'), origin: 'argument' });
    expect(resolveWorkspacePath(undefined))
      .toEqual({ path: path.join(tmpDir, 'from-env'), origin: 'env' });

    delete process.env.TRAIL_WORKSPACE_PATH;
    process.chdir(tmpDir);
    expect(resolveWorkspacePath(undefined).origin).toBe('cwd');
  });

  it('cwd へ落ちたときは stderr に警告を出す（暗黙のフォールバックにしない）', () => {
    process.chdir(tmpDir);

    resolveWorkspacePath(undefined);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/TRAIL_WORKSPACE_PATH/);
    expect(warnings[0]).toContain('cwd');
  });

  it('引数・env で解決できたときは警告しない', () => {
    resolveWorkspacePath(path.join(tmpDir, 'explicit'));
    process.env.TRAIL_WORKSPACE_PATH = path.join(tmpDir, 'from-env');
    resolveWorkspacePath(undefined);

    expect(warnings).toEqual([]);
  });
});

describe('DB パス解決への TRAIL_WORKSPACE_PATH 反映', () => {
  let tmpDir: string;
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsenv-'));
    savedEnv = { ...process.env };
    delete process.env.TRAIL_HOME;
    delete process.env.TRAIL_WORKSPACE_PATH;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeDb(root: string, name: string): string {
    const dbDir = path.join(root, '.anytime', 'trail', 'db');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbFile = path.join(dbDir, name);
    fs.writeFileSync(dbFile, '');
    return dbFile;
  }

  it('workspacePath 省略時に TRAIL_WORKSPACE_PATH を使う（cwd へ落ちない）', () => {
    const memDb = makeDb(tmpDir, 'caravan-book.db');
    const trailDb = makeDb(tmpDir, 'activity.db');
    process.env.TRAIL_WORKSPACE_PATH = tmpDir;

    // cwd はリポジトリルートのまま。env が効いていなければ別の DB を指すか throw する。
    expect(resolveCaravanDbPath({})).toBe(memDb);
    expect(resolveDbPath({})).toBe(trailDb);
  });

  it('引数は TRAIL_WORKSPACE_PATH より優先する', () => {
    const argRoot = path.join(tmpDir, 'arg-ws');
    const memDb = makeDb(argRoot, 'caravan-book.db');
    process.env.TRAIL_WORKSPACE_PATH = path.join(tmpDir, 'env-ws');

    expect(resolveCaravanDbPath({ workspacePath: argRoot })).toBe(memDb);
  });
});

describe('DB ファイル名変更のレガシーフォールバック（サイドカーは物理リネームしない）', () => {
  let tmpDir: string;
  let dbDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbpath-legacy-'));
    dbDir = path.join(tmpDir, '.anytime', 'trail', 'db');
    fs.mkdirSync(dbDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolveDbPath: activity.db 不在で trail.db 実在なら旧名パスへ倒し、リネームしない', () => {
    const legacy = path.join(dbDir, 'trail.db');
    fs.writeFileSync(legacy, '');
    expect(resolveDbPath({ workspacePath: tmpDir })).toBe(legacy);
    expect(fs.existsSync(legacy)).toBe(true);
    expect(fs.existsSync(path.join(dbDir, 'activity.db'))).toBe(false);
  });

  it('resolveDbPath: 新旧両方実在なら新名を優先する', () => {
    const current = path.join(dbDir, 'activity.db');
    fs.writeFileSync(current, '');
    fs.writeFileSync(path.join(dbDir, 'trail.db'), '');
    expect(resolveDbPath({ workspacePath: tmpDir })).toBe(current);
  });

  it('resolveCaravanDbPath: caravan-book.db 不在で memory-core.db 実在なら旧名パスへ倒す', () => {
    const legacy = path.join(dbDir, 'memory-core.db');
    fs.writeFileSync(legacy, '');
    expect(resolveCaravanDbPath({ workspacePath: tmpDir })).toBe(legacy);
  });

  it('resolveCaravanDbPathForWrite: 旧名の実 DB が残る間は旧名へ直書きする（台帳の split-brain 防止）', () => {
    const legacy = path.join(dbDir, 'memory-core.db');
    fs.writeFileSync(legacy, '');
    fs.writeFileSync(path.join(dbDir, 'trail.db'), '');
    expect(resolveCaravanDbPathForWrite({ workspacePath: tmpDir })).toBe(legacy);
  });

  it('resolveCaravanDbPathForWrite: 旧名 trail.db しか無いワークスペースも初期化済みとして新名パスを返す', () => {
    fs.writeFileSync(path.join(dbDir, 'trail.db'), '');
    expect(resolveCaravanDbPathForWrite({ workspacePath: tmpDir })).toBe(
      path.join(dbDir, 'caravan-book.db'),
    );
  });
});
