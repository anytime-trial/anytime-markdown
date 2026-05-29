// trail-server の index.ts 経由で typescript compiler API が eager load されると
// jest 環境で初期化エラーになるため、runtime/memoryCoreRunner を直接 import する。
import { createMemoryCoreRunner } from '../../../../trail-server/src/runtime/memoryCoreRunner';

// MemoryCoreService コンストラクタの呼び出しを観測するための spy。
const runOnceMock = jest.fn();
const constructorSpy = jest.fn();

jest.mock('@anytime-markdown/memory-core/pipeline', () => {
  return {
    MemoryCoreService: jest.fn().mockImplementation((opts: unknown) => {
      constructorSpy(opts);
      return {
        runOnce: runOnceMock,
      };
    }),
  };
});

const TRAIL_DB_PATH = '/fake/trail.db';

function makeChannel() {
  return { append: jest.fn(), appendLine: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
  runOnceMock.mockResolvedValue({ status: 'success' });
});

describe('createMemoryCoreRunner.runAfterImport', () => {
  test('runAfterImport delegates to MemoryCoreService.runOnce("import")', async () => {
    const channel = makeChannel();
    const runner = createMemoryCoreRunner({
      outputChannel: channel,
      trailDbPath: TRAIL_DB_PATH,
    });

    await runner.runAfterImport();

    // MemoryCoreService が 1 度だけ生成される (lazy 構築)
    expect(constructorSpy).toHaveBeenCalledTimes(1);
    expect(constructorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        logSink: channel,
        trailDbPath: TRAIL_DB_PATH,
      }),
    );

    // runOnce が 'import' 契機で 1 度呼ばれる
    expect(runOnceMock).toHaveBeenCalledTimes(1);
    expect(runOnceMock).toHaveBeenCalledWith('import');
  });

  test('subsequent runAfterImport reuses the same MemoryCoreService instance', async () => {
    const channel = makeChannel();
    const runner = createMemoryCoreRunner({
      outputChannel: channel,
      trailDbPath: TRAIL_DB_PATH,
    });

    await runner.runAfterImport();
    await runner.runAfterImport();

    // コンストラクタは 1 度しか呼ばれない (instance を使い回す)
    expect(constructorSpy).toHaveBeenCalledTimes(1);
    // runOnce は呼び出しの度に走る
    expect(runOnceMock).toHaveBeenCalledTimes(2);
  });

  test('passes nativeBinding and gitRoot through to MemoryCoreService', async () => {
    const channel = makeChannel();
    const runner = createMemoryCoreRunner({
      outputChannel: channel,
      trailDbPath: TRAIL_DB_PATH,
      nativeBinding: '/abs/path/better_sqlite3.node',
      gitRoot: '/repo/root',
    });

    await runner.runAfterImport();

    expect(constructorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        nativeBinding: '/abs/path/better_sqlite3.node',
        gitRoot: '/repo/root',
      }),
    );
  });

  test('errors thrown by runOnce propagate to the caller', async () => {
    runOnceMock.mockRejectedValueOnce(new Error('runOnce failed'));

    const channel = makeChannel();
    const runner = createMemoryCoreRunner({
      outputChannel: channel,
      trailDbPath: TRAIL_DB_PATH,
    });

    await expect(runner.runAfterImport()).rejects.toThrow('runOnce failed');
  });
});
