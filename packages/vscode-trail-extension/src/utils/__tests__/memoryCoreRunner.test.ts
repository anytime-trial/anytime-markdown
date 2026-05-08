import {
  openMemoryCoreDb,
  attachTrailDbReadOnly,
  createOllamaClient,
  runConversationIncremental,
  runConversationBackfill,
} from '@anytime-markdown/memory-core';
import * as fsMod from 'fs';
import { createMemoryCoreRunner } from '../memoryCoreRunner';

jest.mock('@anytime-markdown/memory-core', () => ({
  openMemoryCoreDb: jest.fn(),
  attachTrailDbReadOnly: jest.fn(),
  createOllamaClient: jest.fn(),
  runConversationIncremental: jest.fn(),
  runConversationBackfill: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
}));

const TRAIL_DB_PATH = '/fake/trail.db';

function makeStmt(stepResult: boolean, rowData: Record<string, unknown> = {}) {
  return {
    bind: jest.fn(),
    step: jest.fn().mockReturnValue(stepResult),
    getAsObject: jest.fn().mockReturnValue(rowData),
    free: jest.fn(),
  };
}

function makeMemDb(stmt: ReturnType<typeof makeStmt>) {
  const mockDb = {
    prepare: jest.fn().mockReturnValue(stmt),
    run: jest.fn(),
  };
  return {
    db: mockDb,
    save: jest.fn(),
    close: jest.fn(),
  };
}

function makeChannel() {
  return { appendLine: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
  (fsMod.existsSync as jest.Mock).mockReturnValue(true);
  (createOllamaClient as jest.Mock).mockReturnValue({});
  (attachTrailDbReadOnly as jest.Mock).mockResolvedValue({
    trailHandle: { close: jest.fn() },
  });
  (runConversationIncremental as jest.Mock).mockResolvedValue({
    status: 'success',
    items_processed: 0,
    entities_inserted: 0,
    entities_updated: 0,
    edges_inserted: 0,
    edges_invalidated: 0,
    items_failed: 0,
  });
  (runConversationBackfill as jest.Mock).mockResolvedValue({
    status: 'success',
    items_processed: 0,
    entities_inserted: 0,
    entities_updated: 0,
    edges_inserted: 0,
    edges_invalidated: 0,
    items_failed: 0,
  });
});

describe('createMemoryCoreRunner.runAfterImport', () => {
  test('T1: first run (no pipeline_state row) calls runConversationBackfill', async () => {
    const stmt = makeStmt(false); // step() returns false → no row
    const memDb = makeMemDb(stmt);
    (openMemoryCoreDb as jest.Mock).mockResolvedValue(memDb);

    const channel = makeChannel();
    const runner = createMemoryCoreRunner({
      outputChannel: channel as any,
      trailDbPath: TRAIL_DB_PATH,
    });

    await runner.runAfterImport();

    expect(openMemoryCoreDb).toHaveBeenCalledTimes(1);
    expect(attachTrailDbReadOnly).toHaveBeenCalledWith(
      memDb.db,
      TRAIL_DB_PATH,
    );
    expect(runConversationBackfill).toHaveBeenCalledTimes(1);
    expect(runConversationIncremental).not.toHaveBeenCalled();
    expect(memDb.save).toHaveBeenCalledTimes(1);
    expect(memDb.close).toHaveBeenCalledTimes(1);
  });

  test('T2: second run (pipeline_state has last_processed_at) calls runConversationIncremental', async () => {
    const stmt = makeStmt(true, {
      last_processed_at: '2026-05-01T00:00:00.000Z',
    });
    const memDb = makeMemDb(stmt);
    (openMemoryCoreDb as jest.Mock).mockResolvedValue(memDb);

    const channel = makeChannel();
    const runner = createMemoryCoreRunner({
      outputChannel: channel as any,
      trailDbPath: TRAIL_DB_PATH,
    });

    await runner.runAfterImport();

    expect(runConversationIncremental).toHaveBeenCalledTimes(1);
    expect(runConversationBackfill).not.toHaveBeenCalled();
    expect(memDb.save).toHaveBeenCalledTimes(1);
    expect(memDb.close).toHaveBeenCalledTimes(1);
  });

  test('T3: error thrown inside is caught, appendLine called with ERROR, does not throw', async () => {
    const error = new Error('DB explosion');
    (openMemoryCoreDb as jest.Mock).mockRejectedValue(error);

    const channel = makeChannel();
    const runner = createMemoryCoreRunner({
      outputChannel: channel as any,
      trailDbPath: TRAIL_DB_PATH,
    });

    // Must not throw
    await expect(runner.runAfterImport()).resolves.toBeUndefined();

    expect(channel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR] [memory-core]'),
    );
    expect(channel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('DB explosion'),
    );
  });

  test('T4: trail DB does not exist → logs error, does not call openMemoryCoreDb', async () => {
    (fsMod.existsSync as jest.Mock).mockReturnValue(false);

    const channel = makeChannel();
    const runner = createMemoryCoreRunner({
      outputChannel: channel as any,
      trailDbPath: TRAIL_DB_PATH,
    });

    await runner.runAfterImport();

    expect(openMemoryCoreDb).not.toHaveBeenCalled();
    expect(channel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR] [memory-core] Trail DB not found'),
    );
  });
});
