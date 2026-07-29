import { createRetryingFetch } from '../providerFactory';

function jsonResponse(status: number): Response {
  return { ok: status < 400, status, json: async () => ({}) } as unknown as Response;
}

describe('createRetryingFetch', () => {
  it('許可ホスト以外への要求を拒否する', async () => {
    const inner = jest.fn();
    const fetchFn = createRetryingFetch({ allowedHosts: ['api.github.com'], fetchFn: inner, sleep: async () => {} });

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
});
