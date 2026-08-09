/**
 * `ctx.dbPath` 省略時に「バックアップする DB」と「開く DB」が一致することの回帰テスト。
 *
 * 旧実装はバックアップ対象を `ctx.dbPath ?? getCaravanBookDbPath(ctx.gitRoot)`（gitRoot 基準）
 * で決める一方、open には `ctx.dbPath` をそのまま渡していた。`openCaravanBookDb` 側が省略時に
 * `process.cwd()` 基準へフォールバックしていたため、両者が別ファイルを指し得た。
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const mockOpenCaravanBookDb = jest.fn();
const mockBackupCaravanBookDbFile = jest.fn();

jest.mock('../../src/db/connection', () => ({
  openCaravanBookDb: (...args: unknown[]) => mockOpenCaravanBookDb(...args),
}));

jest.mock('../../src/db/backup', () => ({
  backupCaravanBookDbFile: (...args: unknown[]) => mockBackupCaravanBookDbFile(...args),
}));

jest.mock('../../src/db/attach', () => ({
  attachTrailDbReadOnly: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/ingest/review/agentRunWatchdog', () => ({
  runAgentRunWatchdog: jest.fn().mockReturnValue({ stale_count: 0 }),
}));

jest.mock('../../src/pipeline/pipelineWatchdog', () => ({
  runPipelineWatchdog: jest.fn().mockReturnValue({ stale_runs: 0, stale_states: 0 }),
}));

import { openCaravanDbSession } from '../../src/service/openCaravanDbSession';

function makeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

describe('openCaravanDbSession — caravan-book.db のパス解決', () => {
  let gitRoot: string;
  let trailDbPath: string;
  let savedCwd: string;
  let cwdDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    gitRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memdbsession-root-'));
    const dbDir = path.join(gitRoot, '.anytime', 'trail', 'db');
    fs.mkdirSync(dbDir, { recursive: true });
    trailDbPath = path.join(dbDir, 'activity.db');
    fs.writeFileSync(trailDbPath, '');

    // gitRoot とは別の cwd を用意する。両者が食い違っていても同じ DB を指すことを見る。
    cwdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memdbsession-cwd-'));
    savedCwd = process.cwd();
    process.chdir(cwdDir);

    mockOpenCaravanBookDb.mockResolvedValue({
      db: { run: jest.fn(), exec: jest.fn() },
      conn: { run: jest.fn(), exec: jest.fn() },
      save: jest.fn(),
      close: jest.fn(),
    });
  });

  afterEach(() => {
    try {
      process.chdir(savedCwd);
    } catch {
      // cwd が消えていた場合は無視
    }
    fs.rmSync(gitRoot, { recursive: true, force: true });
    fs.rmSync(cwdDir, { recursive: true, force: true });
  });

  it('dbPath 省略時、バックアップ対象と open 対象が同一パスになる', async () => {
    await openCaravanDbSession(
      { logger: makeLogger(), trailDbPath, gitRoot },
      { writeStatus: false, ollamaFactory: () => ({}) as never },
    );

    expect(mockBackupCaravanBookDbFile).toHaveBeenCalledTimes(1);
    expect(mockOpenCaravanBookDb).toHaveBeenCalledTimes(1);
    const backedUp = mockBackupCaravanBookDbFile.mock.calls[0]?.[0] as string;
    const opened = mockOpenCaravanBookDb.mock.calls[0]?.[0] as string;
    expect(opened).toBe(backedUp);
    // gitRoot 基準に解決され、cwd 側へは向かわない
    expect(opened).toBe(path.join(gitRoot, '.anytime', 'trail', 'db', 'caravan-book.db'));
    expect(opened.startsWith(cwdDir)).toBe(false);
  });

  it('dbPath 明示時はその値をバックアップ・open の双方へ使う', async () => {
    const explicit = path.join(gitRoot, 'custom', 'caravan-book.db');

    await openCaravanDbSession(
      { logger: makeLogger(), trailDbPath, gitRoot, dbPath: explicit },
      { writeStatus: false, ollamaFactory: () => ({}) as never },
    );

    expect(mockBackupCaravanBookDbFile.mock.calls[0]?.[0]).toBe(explicit);
    expect(mockOpenCaravanBookDb.mock.calls[0]?.[0]).toBe(explicit);
  });
});
