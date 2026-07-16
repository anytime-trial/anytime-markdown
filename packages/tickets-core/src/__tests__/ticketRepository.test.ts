import {
  assertTicketPath,
  listTickets,
  createTicket,
  updateTicketContent,
  archiveTicket,
  TicketApiError,
  TicketConflictError,
  type TicketRepositoryConfig,
} from '../ticketRepository';
import { serializeTicket, type TicketFrontmatter } from '../ticketModel';

function fm(overrides: Partial<TicketFrontmatter>): TicketFrontmatter {
  return {
    id: 'T-1',
    title: 'sample',
    status: 'backlog',
    priority: 'low',
    created_at: '2026-07-16T00:00:00.000Z',
    updated_at: '2026-07-16T00:00:00.000Z',
    ...overrides,
  };
}

function b64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

interface Route {
  method: string;
  status: number;
  json: unknown;
}

function makeFetch(routes: Record<string, Route[]>): {
  fetchFn: typeof fetch;
  calls: { method: string; url: string; body?: Record<string, unknown> }[];
} {
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ method, url, body });
    const key = new URL(url).pathname + (new URL(url).search ?? '');
    const route = routes[key]?.find((r) => r.method === method);
    if (!route) {
      return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    }
    return new Response(JSON.stringify(route.json), { status: route.status });
  }) as typeof fetch;
  return { fetchFn, calls };
}

const CFG_BASE: Omit<TicketRepositoryConfig, 'fetchFn'> = {
  token: 'tok',
  repo: 'owner/repo',
  branch: 'main',
};

const T1_TEXT = serializeTicket(fm({ id: 'T-1', title: 'first', status: 'up_next' }), '## 概要 (Description)\n\nx\n');
const T2_TEXT = serializeTicket(fm({ id: 'T-2', title: 'second' }), '');

describe('assertTicketPath', () => {
  it.each(['.tickets/T-1-a.md', '.tickets/archive/T-2-b.md'])('%s を許可する', (path) => {
    expect(() => assertTicketPath(path)).not.toThrow();
  });

  it.each([
    '.tickets/../secret.md',
    'docs/x.md',
    '.tickets/a/b.md',
    '/etc/passwd',
    '.tickets/T-1-a.txt',
    '.tickets/',
  ])('%s を拒否する', (path) => {
    expect(() => assertTicketPath(path)).toThrow(TicketApiError);
  });
});

describe('listTickets', () => {
  it('一覧を一括取得し、解析不能ファイルは invalid に分離する', async () => {
    const { fetchFn } = makeFetch({
      '/repos/owner/repo/contents/.tickets?ref=main': [
        {
          method: 'GET',
          status: 200,
          json: [
            { name: 'T-1-first.md', path: '.tickets/T-1-first.md', sha: 's1', type: 'file' },
            { name: 'T-2-second.md', path: '.tickets/T-2-second.md', sha: 's2', type: 'file' },
            { name: 'broken.md', path: '.tickets/broken.md', sha: 's3', type: 'file' },
            { name: 'note.txt', path: '.tickets/note.txt', sha: 's4', type: 'file' },
            { name: 'archive', path: '.tickets/archive', sha: 's5', type: 'dir' },
          ],
        },
      ],
      '/repos/owner/repo/contents/.tickets%2FT-1-first.md?ref=main': [
        { method: 'GET', status: 200, json: { content: b64(T1_TEXT), sha: 's1' } },
      ],
      '/repos/owner/repo/contents/.tickets%2FT-2-second.md?ref=main': [
        { method: 'GET', status: 200, json: { content: b64(T2_TEXT), sha: 's2' } },
      ],
      '/repos/owner/repo/contents/.tickets%2Fbroken.md?ref=main': [
        { method: 'GET', status: 200, json: { content: b64('# no frontmatter'), sha: 's3' } },
      ],
    });
    const result = await listTickets({ ...CFG_BASE, fetchFn });
    expect(result.tickets.map((t) => t.frontmatter.id).sort()).toEqual(['T-1', 'T-2']);
    expect(result.tickets.every((t) => !t.archived)).toBe(true);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].path).toBe('.tickets/broken.md');
    expect(result.invalid[0].reason).not.toBe('');
  });

  it('.tickets/ が無い（404）場合は空一覧を返す', async () => {
    const { fetchFn } = makeFetch({});
    const result = await listTickets({ ...CFG_BASE, fetchFn });
    expect(result.tickets).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it('includeArchive で archive/ も取得し archived フラグを付ける', async () => {
    const { fetchFn } = makeFetch({
      '/repos/owner/repo/contents/.tickets?ref=main': [{ method: 'GET', status: 200, json: [] }],
      '/repos/owner/repo/contents/.tickets%2Farchive?ref=main': [
        {
          method: 'GET',
          status: 200,
          json: [{ name: 'T-1-first.md', path: '.tickets/archive/T-1-first.md', sha: 'a1', type: 'file' }],
        },
      ],
      '/repos/owner/repo/contents/.tickets%2Farchive%2FT-1-first.md?ref=main': [
        { method: 'GET', status: 200, json: { content: b64(T1_TEXT), sha: 'a1' } },
      ],
    });
    const result = await listTickets({ ...CFG_BASE, fetchFn, includeArchive: true });
    expect(result.tickets).toHaveLength(1);
    expect(result.tickets[0].archived).toBe(true);
  });
});

describe('createTicket', () => {
  it('archive 含む既存ファイル名から自動採番して PUT する', async () => {
    const { fetchFn, calls } = makeFetch({
      '/repos/owner/repo/contents/.tickets?ref=main': [
        {
          method: 'GET',
          status: 200,
          json: [{ name: 'T-2-second.md', path: '.tickets/T-2-second.md', sha: 's2', type: 'file' }],
        },
      ],
      '/repos/owner/repo/contents/.tickets%2Farchive?ref=main': [
        {
          method: 'GET',
          status: 200,
          json: [{ name: 'T-9-old.md', path: '.tickets/archive/T-9-old.md', sha: 'a1', type: 'file' }],
        },
      ],
      '/repos/owner/repo/contents/.tickets%2FT-10-new-ticket.md': [
        {
          method: 'PUT',
          status: 201,
          json: { content: { path: '.tickets/T-10-new-ticket.md', sha: 'n1' }, commit: { sha: 'c1' } },
        },
      ],
    });
    const created = await createTicket({
      ...CFG_BASE,
      fetchFn,
      input: {
        title: 'New Ticket',
        status: 'backlog',
        priority: 'medium',
        creator: 'kiyotaka',
        now: '2026-07-16T04:00:00.000Z',
      },
    });
    expect(created.frontmatter.id).toBe('T-10');
    expect(created.path).toBe('.tickets/T-10-new-ticket.md');
    const put = calls.find((c) => c.method === 'PUT');
    expect(put).toBeDefined();
    expect(put?.body?.branch).toBe('main');
    const content = Buffer.from(String(put?.body?.content), 'base64').toString('utf8');
    expect(content).toContain('id: T-10');
    expect(content).toContain('## 作業タスクリスト (Subtasks)');
  });
});

describe('updateTicketContent', () => {
  it('sha 付きで PUT し、新しい sha を返す', async () => {
    const { fetchFn, calls } = makeFetch({
      '/repos/owner/repo/contents/.tickets%2FT-1-first.md': [
        {
          method: 'PUT',
          status: 200,
          json: { content: { path: '.tickets/T-1-first.md', sha: 'new' }, commit: { sha: 'c2' } },
        },
      ],
    });
    const result = await updateTicketContent({
      ...CFG_BASE,
      fetchFn,
      input: { path: '.tickets/T-1-first.md', content: T1_TEXT, sha: 'old', message: 'update' },
    });
    expect(result.sha).toBe('new');
    expect(calls[0].body?.sha).toBe('old');
    expect(calls[0].body?.message).toBe('update');
  });

  it.each([409, 422])('%s は TicketConflictError にする', async (status) => {
    const { fetchFn } = makeFetch({
      '/repos/owner/repo/contents/.tickets%2FT-1-first.md': [
        { method: 'PUT', status, json: { message: 'conflict' } },
      ],
    });
    await expect(
      updateTicketContent({
        ...CFG_BASE,
        fetchFn,
        input: { path: '.tickets/T-1-first.md', content: T1_TEXT, sha: 'old', message: 'm' },
      }),
    ).rejects.toBeInstanceOf(TicketConflictError);
  });

  it('その他のエラーは TicketApiError(status 付き) にする', async () => {
    const { fetchFn } = makeFetch({
      '/repos/owner/repo/contents/.tickets%2FT-1-first.md': [
        { method: 'PUT', status: 403, json: { message: 'forbidden' } },
      ],
    });
    await expect(
      updateTicketContent({
        ...CFG_BASE,
        fetchFn,
        input: { path: '.tickets/T-1-first.md', content: T1_TEXT, sha: 'old', message: 'm' },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('archiveTicket', () => {
  it('archive/ へ作成後に旧パスを削除する', async () => {
    const { fetchFn, calls } = makeFetch({
      '/repos/owner/repo/contents/.tickets%2FT-1-first.md?ref=main': [
        { method: 'GET', status: 200, json: { content: b64(T1_TEXT), sha: 's1' } },
      ],
      '/repos/owner/repo/contents/.tickets%2Farchive%2FT-1-first.md': [
        {
          method: 'PUT',
          status: 201,
          json: { content: { path: '.tickets/archive/T-1-first.md', sha: 'a1' }, commit: { sha: 'c3' } },
        },
      ],
      '/repos/owner/repo/contents/.tickets%2FT-1-first.md': [
        { method: 'DELETE', status: 200, json: { commit: { sha: 'c4' } } },
      ],
    });
    const result = await archiveTicket({
      ...CFG_BASE,
      fetchFn,
      input: { path: '.tickets/T-1-first.md', sha: 's1' },
    });
    expect(result.newPath).toBe('.tickets/archive/T-1-first.md');
    const methods = calls.map((c) => c.method);
    expect(methods).toEqual(['GET', 'PUT', 'DELETE']);
    const del = calls.at(-1);
    expect(del?.body?.sha).toBe('s1');
  });

  it('archive 配下のチケットは再アーカイブできない', async () => {
    const { fetchFn } = makeFetch({});
    await expect(
      archiveTicket({ ...CFG_BASE, fetchFn, input: { path: '.tickets/archive/T-1-first.md', sha: 's1' } }),
    ).rejects.toBeInstanceOf(TicketApiError);
  });

  it('表示時点の sha と最新 sha が異なる場合は移動せず競合エラーにする', async () => {
    const { fetchFn, calls } = makeFetch({
      '/repos/owner/repo/contents/.tickets%2FT-1-first.md?ref=main': [
        { method: 'GET', status: 200, json: { content: b64(T1_TEXT), sha: 'newer-sha' } },
      ],
    });
    await expect(
      archiveTicket({ ...CFG_BASE, fetchFn, input: { path: '.tickets/T-1-first.md', sha: 'stale-sha' } }),
    ).rejects.toBeInstanceOf(TicketConflictError);
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('旧パス削除に失敗したら archive 側の複製を巻き戻す', async () => {
    const { fetchFn, calls } = makeFetch({
      '/repos/owner/repo/contents/.tickets%2FT-1-first.md?ref=main': [
        { method: 'GET', status: 200, json: { content: b64(T1_TEXT), sha: 's1' } },
      ],
      '/repos/owner/repo/contents/.tickets%2Farchive%2FT-1-first.md': [
        {
          method: 'PUT',
          status: 201,
          json: { content: { path: '.tickets/archive/T-1-first.md', sha: 'a1' }, commit: { sha: 'c3' } },
        },
        { method: 'DELETE', status: 200, json: { commit: { sha: 'c5' } } },
      ],
      '/repos/owner/repo/contents/.tickets%2FT-1-first.md': [
        { method: 'DELETE', status: 500, json: { message: 'boom' } },
      ],
    });
    await expect(
      archiveTicket({ ...CFG_BASE, fetchFn, input: { path: '.tickets/T-1-first.md', sha: 's1' } }),
    ).rejects.toMatchObject({ status: 500 });
    const rollback = calls.find(
      (c) => c.method === 'DELETE' && c.url.includes('archive%2FT-1-first.md'),
    );
    expect(rollback?.body?.sha).toBe('a1');
  });
});

describe('createTicket の競合・検証ガード', () => {
  it('採番と PUT の間に同一 id が作成されたら自分の作成分を巻き戻して競合にする', async () => {
    let putDone = false;
    const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ method, url, body });
      const key = new URL(url).pathname;
      if (method === 'GET' && key === '/repos/owner/repo/contents/.tickets') {
        const entries = putDone
          ? [
              { name: 'T-10-new-ticket.md', path: '.tickets/T-10-new-ticket.md', sha: 'n1', type: 'file' },
              { name: 'T-10-other.md', path: '.tickets/T-10-other.md', sha: 'o1', type: 'file' },
              { name: 'T-9-old.md', path: '.tickets/T-9-old.md', sha: 's9', type: 'file' },
            ]
          : [{ name: 'T-9-old.md', path: '.tickets/T-9-old.md', sha: 's9', type: 'file' }];
        return new Response(JSON.stringify(entries), { status: 200 });
      }
      if (method === 'GET' && key === '/repos/owner/repo/contents/.tickets%2Farchive') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (method === 'PUT') {
        putDone = true;
        return new Response(
          JSON.stringify({ content: { path: '.tickets/T-10-new-ticket.md', sha: 'n1' }, commit: { sha: 'c1' } }),
          { status: 201 },
        );
      }
      if (method === 'DELETE') {
        return new Response(JSON.stringify({ commit: { sha: 'c2' } }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    }) as typeof fetch;

    await expect(
      createTicket({
        ...CFG_BASE,
        fetchFn,
        input: { title: 'New Ticket', status: 'backlog', priority: 'medium', now: '2026-07-16T04:00:00.000Z' },
      }),
    ).rejects.toBeInstanceOf(TicketConflictError);
    const rollback = calls.find((c) => c.method === 'DELETE');
    expect(rollback?.url).toContain('T-10-new-ticket.md');
    expect(rollback?.body?.sha).toBe('n1');
  });

  it('不正な入力（estimate 負数）は PUT せず 400 で拒否する', async () => {
    const { fetchFn, calls } = makeFetch({
      '/repos/owner/repo/contents/.tickets?ref=main': [{ method: 'GET', status: 200, json: [] }],
      '/repos/owner/repo/contents/.tickets%2Farchive?ref=main': [{ method: 'GET', status: 200, json: [] }],
    });
    await expect(
      createTicket({
        ...CFG_BASE,
        fetchFn,
        input: {
          title: 'bad',
          status: 'backlog',
          priority: 'low',
          estimate: -1,
          now: '2026-07-16T04:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(calls.find((c) => c.method === 'PUT')).toBeUndefined();
  });
});
