import type http from 'node:http';

import { ANY_METHOD, createRouteContext, RouteTable } from '../routing';

function stubHandler(name: string): { handler: () => void; calls: string[] } {
  const calls: string[] = [];
  return { handler: () => { calls.push(name); }, calls };
}

describe('RouteTable', () => {
  it('resolves an exact route only for the registered method', () => {
    const table = new RouteTable();
    const get = stubHandler('get');
    table.exact('GET', '/api/x', get.handler);

    expect(table.match('GET', '/api/x')?.handler).toBe(get.handler);
    expect(table.match('POST', '/api/x')).toBeUndefined();
    expect(table.match('GET', '/api/y')).toBeUndefined();
  });

  it('resolves a method-agnostic route for any method', () => {
    const table = new RouteTable();
    const any = stubHandler('any');
    table.exact(ANY_METHOD, '/trailstandalone.js', any.handler);

    expect(table.match('GET', '/trailstandalone.js')?.handler).toBe(any.handler);
    expect(table.match('POST', '/trailstandalone.js')?.handler).toBe(any.handler);
  });

  it('prefers a method-specific exact route over the method-agnostic one', () => {
    const table = new RouteTable();
    const specific = stubHandler('specific');
    const any = stubHandler('any');
    table.exact('GET', '/p', specific.handler);
    table.exact(ANY_METHOD, '/p', any.handler);

    expect(table.match('GET', '/p')?.handler).toBe(specific.handler);
    expect(table.match('HEAD', '/p')?.handler).toBe(any.handler);
  });

  it('rejects duplicate exact registrations instead of silently shadowing', () => {
    const table = new RouteTable();
    table.exact('GET', '/dup', () => undefined);
    expect(() => table.exact('GET', '/dup', () => undefined)).toThrow(/duplicate exact route/);
  });

  it('returns raw (still percent-encoded) captures for pattern routes', () => {
    const table = new RouteTable();
    const handler = stubHandler('pattern');
    table.pattern('GET', /^\/api\/s\/([^/]+)$/, handler.handler);

    const matched = table.match('GET', '/api/s/drift%3Aentity%3Afoo');
    expect(matched?.params).toEqual(['drift%3Aentity%3Afoo']);
  });

  it('evaluates pattern routes in registration order', () => {
    const table = new RouteTable();
    const commits = stubHandler('commits');
    const session = stubHandler('session');
    table.pattern('GET', /^\/api\/sessions\/([^/]+)\/commits$/, commits.handler);
    table.pattern('GET', /^\/api\/sessions\/([^/]+)$/, session.handler);

    expect(table.match('GET', '/api/sessions/abc/commits')?.handler).toBe(commits.handler);
    expect(table.match('GET', '/api/sessions/abc')?.handler).toBe(session.handler);
  });

  it('prefers an exact route over a prefix route that would also match', () => {
    const table = new RouteTable();
    const list = stubHandler('list');
    const detail = stubHandler('detail');
    table.exact('GET', '/api/events', list.handler);
    table.prefix('GET', '/api/events/', detail.handler);

    expect(table.match('GET', '/api/events')?.handler).toBe(list.handler);
    expect(table.match('GET', '/api/events/e1')?.handler).toBe(detail.handler);
    expect(table.match('POST', '/api/events/e1')).toBeUndefined();
  });

  it('lists registered routes in registration order with their kind', () => {
    const table = new RouteTable();
    table.exact('GET', '/a', () => undefined);
    table.pattern('PATCH', /^\/b\/([^/]+)$/, () => undefined);
    table.prefix('POST', '/c/', () => undefined);

    expect(table.list()).toEqual([
      { method: 'GET', kind: 'exact', path: '/a' },
      { method: 'PATCH', kind: 'pattern', path: '^\\/b\\/([^/]+)$' },
      { method: 'POST', kind: 'prefix', path: '/c/' },
    ]);
  });
});

describe('createRouteContext', () => {
  const req = {} as http.IncomingMessage;
  const res = {} as http.ServerResponse;

  it('exposes query defaults matching `searchParams.get(x) ?? fallback`', () => {
    const url = new URL('http://127.0.0.1/api/x?release=r1&empty=');
    const ctx = createRouteContext({ req, res, url, method: 'GET', params: [] });

    expect(ctx.query('release', 'current')).toBe('r1');
    expect(ctx.query('missing', 'current')).toBe('current');
    expect(ctx.query('empty', 'current')).toBe('');
    expect(ctx.queryOpt('release')).toBe('r1');
    expect(ctx.queryOpt('missing')).toBeUndefined();
  });

  it('exposes pathname and method from the parsed url', () => {
    const url = new URL('http://127.0.0.1/api/x/y?z=1');
    const ctx = createRouteContext({ req, res, url, method: 'DELETE', params: ['y'] });

    expect(ctx.pathname).toBe('/api/x/y');
    expect(ctx.method).toBe('DELETE');
    expect(ctx.params).toEqual(['y']);
  });
});
