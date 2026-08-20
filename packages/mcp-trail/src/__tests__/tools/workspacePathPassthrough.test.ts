import { handleListReviewTargetHints } from '../../tools/listReviewTargetHints';

/**
 * ツール引数の `workspacePath` が DB パス解決まで届くことを固定する。
 *
 * 届かないと「引数を無視して cwd の DB を開く」形になり、別ワークスペースのデータを
 * 返しても失敗として現れない（呼び出し側からは「該当なし」と区別が付かない）。
 * 解決関数をモックしているだけの既存テストでは、この配線は検査されない。
 */
const mockResolveCaravanDbPath = jest.fn((_opts: { workspacePath?: string }) => '/tmp/mcp-trail-test/caravan-book.db');

jest.mock('../../dbPath', () => ({
  ...jest.requireActual('../../dbPath'),
  resolveCaravanDbPath: (opts: { workspacePath?: string }) => mockResolveCaravanDbPath(opts),
}));

jest.mock('@anytime-markdown/trail-caravan-book/query', () => ({
  noopLogger: { info: () => {}, error: () => {}, warn: () => {} },
  openCaravanBookDb: jest.fn().mockResolvedValue({ db: {}, close: jest.fn() }),
  listReviewTargetHints: jest.fn().mockReturnValue([]),
}));

describe('workspacePath の受け渡し', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('読み取り系ツール（list_review_target_hints）が workspacePath を解決へ渡す', async () => {
    await handleListReviewTargetHints({ workspacePath: '/ws/alpha' });

    expect(mockResolveCaravanDbPath).toHaveBeenCalledWith({ workspacePath: '/ws/alpha' });
  });

  test('省略時は undefined を渡し、解決側（resolveWorkspacePath）へ委ねる', async () => {
    await handleListReviewTargetHints({});

    expect(mockResolveCaravanDbPath).toHaveBeenCalledWith({ workspacePath: undefined });
  });
});
