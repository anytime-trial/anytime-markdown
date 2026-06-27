import {
  createWebImportBridgeProvider,
  FETCH_WEB_PAGE_MESSAGE_TYPE,
  FETCH_WEB_PAGE_RESULT_MESSAGE_TYPE,
} from '../webImportBridge';

class FakeMessageTarget {
  private listener: ((event: MessageEvent) => void) | null = null;

  addEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.listener = listener;
  }

  dispatch(data: unknown, origin = ''): void {
    this.listener?.({ data, origin } as MessageEvent);
  }
}

describe('createWebImportBridgeProvider', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('fetchWebPageResult を requestId で対応させて resolve する', async () => {
    const target = new FakeMessageTarget();
    const posted: Array<{ type: string; requestId: string; url: string }> = [];
    const provider = createWebImportBridgeProvider((message) => posted.push(message), target);

    const promise = provider.fetch('https://example.com/article');

    expect(posted).toHaveLength(1);
    expect(posted[0].type).toBe(FETCH_WEB_PAGE_MESSAGE_TYPE);
    expect(posted[0].url).toBe('https://example.com/article');

    target.dispatch({
      type: FETCH_WEB_PAGE_RESULT_MESSAGE_TYPE,
      requestId: posted[0].requestId,
      html: '<main>Hello</main>',
      finalUrl: 'https://example.com/article',
      contentType: 'text/html; charset=utf-8',
    });

    await expect(promise).resolves.toEqual({
      html: '<main>Hello</main>',
      finalUrl: 'https://example.com/article',
      contentType: 'text/html; charset=utf-8',
    });
  });

  it('error 付き結果は reject する', async () => {
    const target = new FakeMessageTarget();
    const posted: Array<{ type: string; requestId: string; url: string }> = [];
    const provider = createWebImportBridgeProvider((message) => posted.push(message), target);

    const promise = provider.fetch('https://example.com/article');
    target.dispatch({
      type: FETCH_WEB_PAGE_RESULT_MESSAGE_TYPE,
      requestId: posted[0].requestId,
      error: 'upstream-500',
    });

    await expect(promise).rejects.toThrow('upstream-500');
  });

  it('指定時間内に結果が来ない場合は timeout で reject する', async () => {
    jest.useFakeTimers();
    const target = new FakeMessageTarget();
    const provider = createWebImportBridgeProvider(jest.fn(), target, 25);

    const promise = provider.fetch('https://example.com/slow');
    jest.advanceTimersByTime(25);

    await expect(promise).rejects.toThrow('timeout');
  });
});
