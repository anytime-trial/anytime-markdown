import { consumeDriveOpenIntent, markDriveOpenIntent } from '../lib/driveOpenIntent';

describe('driveOpenIntent', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('保存した state をそのまま返す', () => {
    const raw = JSON.stringify({ ids: ['f1'], action: 'open' });
    markDriveOpenIntent(raw);
    expect(consumeDriveOpenIntent()).toBe(raw);
  });

  it('一度読んだら消える（同じ意図で二度開かない）', () => {
    markDriveOpenIntent('{"action":"create"}');
    expect(consumeDriveOpenIntent()).not.toBeNull();
    expect(consumeDriveOpenIntent()).toBeNull();
  });

  it('未記録なら null を返す', () => {
    expect(consumeDriveOpenIntent()).toBeNull();
  });

  it('sessionStorage が使えなくても throw せず warn する', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => markDriveOpenIntent('{}')).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();

    setItem.mockRestore();
    warnSpy.mockRestore();
  });
});
