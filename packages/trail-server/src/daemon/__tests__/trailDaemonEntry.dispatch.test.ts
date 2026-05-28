// daemon dispatch のユニットテスト (fork なし、直接 import)。

import { _resetForTest, dispatch } from '../trailDaemonEntry';

describe('trailDaemonEntry.dispatch (pre-configure)', () => {
  beforeEach(() => _resetForTest());

  it('configure 未呼び出しで runOnce が拒否される', async () => {
    await expect(dispatch('runOnce', { reason: 'manual' })).rejects.toThrow(
      /not configured/,
    );
  });

  it('configure 未呼び出しで start が拒否される', async () => {
    await expect(dispatch('start', { intervalMs: 1000 })).rejects.toThrow(
      /not configured/,
    );
  });

  it('configure 未呼び出しで getStatus が拒否される', async () => {
    await expect(dispatch('getStatus', undefined)).rejects.toThrow(/not configured/);
  });

  it('未知 method はエラー', async () => {
    await expect(dispatch('bogus', {})).rejects.toThrow(/unknown method/);
  });

  it('dispose は configure 未呼び出しでも成功する', async () => {
    await expect(dispatch('dispose', undefined)).resolves.toBeUndefined();
  });
});
