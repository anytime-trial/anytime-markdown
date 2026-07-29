import { createRetryingFetch, DisallowedHostError } from '../providerFactory';

function jsonResponse(status: number, headers: Record<string, string> = {}): Response {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: status < 400,
    status,
    json: async () => ({}),
    headers: { get: (name: string) => normalized.get(name.toLowerCase()) ?? null },
  } as unknown as Response;
}

describe('createRetryingFetch', () => {
  it('許可ホスト以外への要求を拒否する', async () => {
    const inner = jest.fn();
    const fetchFn = createRetryingFetch({ allowedHosts: ['api.github.com'], fetchFn: inner, sleep: async () => {} });

    // メッセージ文言依存の判定は文言変更で壊れるため、instanceof 判定を主とし、
    // メッセージ内容も併せて固定する（呼び出し元は DisallowedHostError を使うべき）。
    await expect(fetchFn('https://evil.example.com/x')).rejects.toThrow(DisallowedHostError);
    await expect(fetchFn('https://evil.example.com/x')).rejects.toThrow(/許可されていないホスト/);
    expect(inner).not.toHaveBeenCalled();
  });

  it('許可ホストへの要求はそのまま通す', async () => {
    const inner = jest.fn().mockResolvedValue(jsonResponse(200));
    const fetchFn = createRetryingFetch({ allowedHosts: ['api.github.com'], fetchFn: inner, sleep: async () => {} });

    await expect(fetchFn('https://api.github.com/repos/o/r')).resolves.toMatchObject({ status: 200 });
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('429 はリトライし、成功したらその応答を返す', async () => {
    const inner = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(429))
      .mockResolvedValueOnce(jsonResponse(200));
    const fetchFn = createRetryingFetch({ allowedHosts: ['api.github.com'], fetchFn: inner, sleep: async () => {} });

    await expect(fetchFn('https://api.github.com/x')).resolves.toMatchObject({ status: 200 });
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it('429 が続けば上限で打ち切り最後の応答を返す', async () => {
    const inner = jest.fn().mockResolvedValue(jsonResponse(429));
    const fetchFn = createRetryingFetch({
      allowedHosts: ['api.github.com'],
      fetchFn: inner,
      sleep: async () => {},
      maxAttempts: 3,
    });

    await expect(fetchFn('https://api.github.com/x')).resolves.toMatchObject({ status: 429 });
    expect(inner).toHaveBeenCalledTimes(3);
  });

  it('4xx（429 以外）はリトライしない', async () => {
    const inner = jest.fn().mockResolvedValue(jsonResponse(404));
    const fetchFn = createRetryingFetch({ allowedHosts: ['api.github.com'], fetchFn: inner, sleep: async () => {} });

    await expect(fetchFn('https://api.github.com/x')).resolves.toMatchObject({ status: 404 });
    expect(inner).toHaveBeenCalledTimes(1);
  });

  // --- リダイレクト追従（SSRF 回帰テスト） ---

  it('許可ホストから非許可ホストへの 302 を追従しない（最重要: SSRF 回帰テスト）', async () => {
    const inner = jest.fn().mockResolvedValue(jsonResponse(302, { location: 'https://evil.example.com/x' }));
    const fetchFn = createRetryingFetch({ allowedHosts: ['api.github.com'], fetchFn: inner, sleep: async () => {} });

    await expect(fetchFn('https://api.github.com/x')).rejects.toThrow(DisallowedHostError);
    // リダイレクト先（非許可ホスト）への実リクエストが発生していないことを確認する。
    // 初回の許可ホストへの要求 1 回のみが呼ばれているべき。
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('許可ホストから許可ホストへの 302 は追従して最終応答を返す', async () => {
    const inner = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(302, { location: 'https://api.github.com/y' }))
      .mockResolvedValueOnce(jsonResponse(200));
    const fetchFn = createRetryingFetch({ allowedHosts: ['api.github.com'], fetchFn: inner, sleep: async () => {} });

    await expect(fetchFn('https://api.github.com/x')).resolves.toMatchObject({ status: 200 });
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it('相対 Location を直前の URL 基準で解決する', async () => {
    const inner = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(302, { location: '/y' }))
      .mockResolvedValueOnce(jsonResponse(200));
    const fetchFn = createRetryingFetch({ allowedHosts: ['api.github.com'], fetchFn: inner, sleep: async () => {} });

    await expect(fetchFn('https://api.github.com/x')).resolves.toMatchObject({ status: 200 });
    expect(inner).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ href: 'https://api.github.com/y' }),
      expect.anything(),
    );
  });

  it('Location の無い 3xx は追従せずそのまま返す', async () => {
    const inner = jest.fn().mockResolvedValue(jsonResponse(302));
    const fetchFn = createRetryingFetch({ allowedHosts: ['api.github.com'], fetchFn: inner, sleep: async () => {} });

    await expect(fetchFn('https://api.github.com/x')).resolves.toMatchObject({ status: 302 });
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('リダイレクトが上限を超えたら打ち切ってエラーにする（無限ループ対策）', async () => {
    let hop = 0;
    const inner = jest.fn().mockImplementation(async () => {
      hop += 1;
      return jsonResponse(302, { location: `https://api.github.com/hop-${hop}` });
    });
    const fetchFn = createRetryingFetch({ allowedHosts: ['api.github.com'], fetchFn: inner, sleep: async () => {} });

    await expect(fetchFn('https://api.github.com/x')).rejects.toThrow(/リダイレクトの上限/);
    // MAX_REDIRECTS(5) 回まで追従し、6 回目の 3xx で打ち切るため呼び出しは 6 回。
    expect(inner).toHaveBeenCalledTimes(6);
  });

  it('リダイレクト先で 429 を受けたら、そのホップ内でリトライしてから応答を返す', async () => {
    const inner = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(302, { location: 'https://api.github.com/y' }))
      .mockResolvedValueOnce(jsonResponse(429))
      .mockResolvedValueOnce(jsonResponse(200));
    const fetchFn = createRetryingFetch({ allowedHosts: ['api.github.com'], fetchFn: inner, sleep: async () => {} });

    await expect(fetchFn('https://api.github.com/x')).resolves.toMatchObject({ status: 200 });
    expect(inner).toHaveBeenCalledTimes(3);
  });

  it('inner へ渡す init には常に redirect: manual を強制する（呼び出し元の指定は上書きする）', async () => {
    const inner = jest.fn().mockResolvedValue(jsonResponse(200));
    const fetchFn = createRetryingFetch({ allowedHosts: ['api.github.com'], fetchFn: inner, sleep: async () => {} });

    await fetchFn('https://api.github.com/x', { method: 'GET', redirect: 'follow' });

    expect(inner).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'GET', redirect: 'manual' }),
    );
  });

  // --- Request 入力（修正 2: new URL() が Request で throw する問題への対応） ---

  it('Request オブジェクトを入力として受け付ける', async () => {
    const inner = jest.fn().mockResolvedValue(jsonResponse(200));
    const fetchFn = createRetryingFetch({ allowedHosts: ['api.github.com'], fetchFn: inner, sleep: async () => {} });

    const request = new Request('https://api.github.com/repos/o/r');
    await expect(fetchFn(request)).resolves.toMatchObject({ status: 200 });
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('Request オブジェクトでも許可ホスト判定を行う', async () => {
    const inner = jest.fn();
    const fetchFn = createRetryingFetch({ allowedHosts: ['api.github.com'], fetchFn: inner, sleep: async () => {} });

    const request = new Request('https://evil.example.com/x');
    await expect(fetchFn(request)).rejects.toThrow(DisallowedHostError);
    expect(inner).not.toHaveBeenCalled();
  });
});
