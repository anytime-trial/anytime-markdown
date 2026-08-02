import { handleListReviewTargetHints } from '../../tools/listReviewTargetHints';
import { handleGetReviewRunStatus } from '../../tools/getReviewRunStatus';

/**
 * ツール引数の `workspacePath` が DB パス解決まで届くことを固定する。
 *
 * 届かないと「引数を無視して cwd の DB を開く」形になり、別ワークスペースのデータを
 * 返しても失敗として現れない（呼び出し側からは「該当なし」と区別が付かない）。
 * 解決関数をモックしているだけの既存テストでは、この配線は検査されない。
 */
const mockResolveMemoryDbPath = jest.fn((_opts: { workspacePath?: string }) => '/tmp/mcp-trail-test/memory-core.db');

jest.mock('../../dbPath', () => ({
  ...jest.requireActual('../../dbPath'),
  resolveMemoryDbPath: (opts: { workspacePath?: string }) => mockResolveMemoryDbPath(opts),
}));

jest.mock('@anytime-markdown/memory-core/query', () => ({
  noopLogger: { info: () => {}, error: () => {}, warn: () => {} },
  openMemoryCoreDb: jest.fn().mockResolvedValue({ db: {}, close: jest.fn() }),
  listReviewTargetHints: jest.fn().mockReturnValue([]),
  getReviewRunStatus: jest.fn().mockReturnValue(null),
}));

describe('workspacePath の受け渡し', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('読み取り系ツール（list_review_target_hints）が workspacePath を解決へ渡す', async () => {
    await handleListReviewTargetHints({ workspacePath: '/ws/alpha' });

    expect(mockResolveMemoryDbPath).toHaveBeenCalledWith({ workspacePath: '/ws/alpha' });
  });

  test('別ツール（get_review_run_status）でも同じ経路で渡る', async () => {
    await handleGetReviewRunStatus({ run_id: 'run-1', workspacePath: '/ws/beta' });

    expect(mockResolveMemoryDbPath).toHaveBeenCalledWith({ workspacePath: '/ws/beta' });
  });

  test('省略時は undefined を渡し、解決側（resolveWorkspacePath）へ委ねる', async () => {
    await handleListReviewTargetHints({});

    expect(mockResolveMemoryDbPath).toHaveBeenCalledWith({ workspacePath: undefined });
  });
});
