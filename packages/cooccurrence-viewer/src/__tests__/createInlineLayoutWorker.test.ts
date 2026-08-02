/**
 * createInlineLayoutWorker のユニットテスト。
 *
 * layoutWorkerCode は配布ビルドでのみ実コードへ差し替わるため、ここでは doMock で
 * 「内包済み」状態を作る。Worker / URL.createObjectURL は Node に無いので明示スタブする。
 */

type InlineWorkerModule = typeof import('../worker/createInlineLayoutWorker');

function loadWithCode(code: string): InlineWorkerModule {
  let mod: InlineWorkerModule | undefined;
  jest.isolateModules(() => {
    jest.doMock('../worker/layoutWorkerCode', () => ({ layoutWorkerCode: code }));
    mod = require('../worker/createInlineLayoutWorker') as InlineWorkerModule;
  });
  if (!mod) throw new Error('failed to load createInlineLayoutWorker');
  return mod;
}

describe('createInlineLayoutWorker', () => {
  const globals = globalThis as Record<string, unknown>;
  const originalWorker = globals.Worker;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  afterEach(() => {
    globals.Worker = originalWorker;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    jest.restoreAllMocks();
  });

  it('コード未内包（ソース直参照）では null を返し、エラーログを出さない', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { createInlineLayoutWorker } = loadWithCode('');
    expect(createInlineLayoutWorker()).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('Worker の無い環境（SSR）では null を返し、エラーログを出さない', () => {
    delete globals.Worker;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { createInlineLayoutWorker } = loadWithCode('self.onmessage = () => {};');
    expect(createInlineLayoutWorker()).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('内包コードから Blob URL 経由で classic worker を生成し、URL を revoke する', () => {
    const constructed: string[] = [];
    globals.Worker = class {
      constructor(url: string) {
        constructed.push(url);
      }
    };
    URL.createObjectURL = jest.fn(() => 'blob:cooc-layout-worker');
    URL.revokeObjectURL = jest.fn();
    const { createInlineLayoutWorker } = loadWithCode('self.onmessage = () => {};');

    const worker = createInlineLayoutWorker();

    expect(worker).not.toBeNull();
    expect(constructed).toEqual(['blob:cooc-layout-worker']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cooc-layout-worker');
  });

  it('Blob ワーカー生成が拒否されたら（CSP 等）null を返し、URL を revoke してエラーログを残す', () => {
    globals.Worker = class {
      constructor() {
        throw new Error('worker-src blocked');
      }
    };
    URL.createObjectURL = jest.fn(() => 'blob:cooc-layout-worker');
    URL.revokeObjectURL = jest.fn();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { createInlineLayoutWorker } = loadWithCode('self.onmessage = () => {};');

    expect(createInlineLayoutWorker()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cooc-layout-worker');
    expect(errorSpy).toHaveBeenCalled();
  });
});
