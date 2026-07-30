import { resolveTicketsConfig } from '../ticketsConfig';

const BASE = { TICKETS_GITHUB_TOKEN: 'tok', TICKETS_REPO: 'o/r' } as never;

describe('resolveTicketsConfig', () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

  afterEach(() => {
    errorSpy.mockClear();
  });

  it('未指定なら github-contents（既定）', () => {
    expect(resolveTicketsConfig(BASE)).toMatchObject({ provider: 'github-contents', branch: 'main' });
  });

  it('github-issues を指定できる', () => {
    expect(resolveTicketsConfig({ ...BASE, TICKETS_PROVIDER: 'github-issues' })).toMatchObject({
      provider: 'github-issues',
    });
  });

  it('local-git は無効化する（Workers 上にローカルクローンが無い）', () => {
    // enum に含まれるため isTicketProviderKind は通る。明示的に弾かないと
    // 「github-issues 以外は github-contents」の分岐に落ちて無言で別物として動く。
    expect(resolveTicketsConfig({ ...BASE, TICKETS_PROVIDER: 'local-git' })).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('未知の値は無効化する', () => {
    expect(resolveTicketsConfig({ ...BASE, TICKETS_PROVIDER: 'backlog' })).toBeUndefined();
  });
});
