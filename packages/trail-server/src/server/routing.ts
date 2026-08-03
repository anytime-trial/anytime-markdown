import type http from 'node:http';

/**
 * HTTP ルーティングの最小テーブル。
 *
 * `TrailDataServer.handleHttp` が持っていた 111 分岐の if 連鎖を、判定種別ごとの
 * 3 レイヤー（完全一致 / パターン / 前方一致）へ移すためのもの。汎用ルータを名乗らず、
 * 既存の判定と同じ意味だけを提供する。
 */

/** メソッドを問わないルートの擬似メソッド（静的ファイル配信が現行でメソッドを見ていない）。 */
export const ANY_METHOD = '*';

export interface RouteContext {
  readonly req: http.IncomingMessage;
  readonly res: http.ServerResponse;
  readonly url: URL;
  readonly pathname: string;
  readonly method: string;
  /**
   * パターンルートのキャプチャ。**percent-decode しない生の文字列**を渡す。
   * 復号の有無は経路ごとに異なる（`sessions/:id` は復号するが `c4/manual-*` は生のまま扱う）ため、
   * 判断はハンドラ側に残す。
   */
  readonly params: readonly string[];
  /** `searchParams.get(name) ?? fallback` と同値。 */
  query(name: string, fallback: string): string;
  /** `searchParams.get(name) ?? undefined` と同値。 */
  queryOpt(name: string): string | undefined;
}

export type RouteHandler = (ctx: RouteContext) => void;

/** ルート台帳の 1 行。テストのゴールデンマスターに使う。 */
export interface RouteDescriptor {
  readonly method: string;
  readonly kind: 'exact' | 'pattern' | 'prefix';
  readonly path: string;
}

export interface RouteMatch {
  readonly handler: RouteHandler;
  readonly params: readonly string[];
}

interface PatternRoute {
  readonly method: string;
  readonly regexp: RegExp;
  readonly handler: RouteHandler;
}

interface PrefixRoute {
  readonly method: string;
  readonly prefix: string;
  readonly handler: RouteHandler;
}

function exactKey(method: string, path: string): string {
  return `${method} ${path}`;
}

export function createRouteContext(args: {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
  method: string;
  params: readonly string[];
}): RouteContext {
  const { req, res, url, method, params } = args;
  return {
    req,
    res,
    url,
    pathname: url.pathname,
    method,
    params,
    query: (name, fallback) => url.searchParams.get(name) ?? fallback,
    queryOpt: (name) => url.searchParams.get(name) ?? undefined,
  };
}

/**
 * 評価順序は「完全一致 → パターン（登録順）→ 前方一致（登録順）」で固定する。
 *
 * 完全一致を最優先にできるのは、パターン・前方一致のいずれのキーにも一致する完全一致経路が
 * 存在しないことを実測で確認しているため（例: 前方一致キー `/api/memory/drift/events/` は
 * 末尾スラッシュを持ち、完全一致の `/api/memory/drift/events` とは衝突しない）。
 * 新しいルートを足すときはこの前提を壊していないか確認する。
 */
export class RouteTable {
  private readonly exactRoutes = new Map<string, RouteHandler>();
  private readonly patternRoutes: PatternRoute[] = [];
  private readonly prefixRoutes: PrefixRoute[] = [];
  private readonly descriptors: RouteDescriptor[] = [];

  exact(method: string, path: string, handler: RouteHandler): this {
    const key = exactKey(method, path);
    if (this.exactRoutes.has(key)) {
      throw new Error(`[RouteTable] duplicate exact route: ${key}`);
    }
    this.exactRoutes.set(key, handler);
    this.descriptors.push({ method, kind: 'exact', path });
    return this;
  }

  pattern(method: string, regexp: RegExp, handler: RouteHandler): this {
    this.patternRoutes.push({ method, regexp, handler });
    this.descriptors.push({ method, kind: 'pattern', path: regexp.source });
    return this;
  }

  prefix(method: string, prefix: string, handler: RouteHandler): this {
    this.prefixRoutes.push({ method, prefix, handler });
    this.descriptors.push({ method, kind: 'prefix', path: prefix });
    return this;
  }

  match(method: string, pathname: string): RouteMatch | undefined {
    const exact = this.exactRoutes.get(exactKey(method, pathname))
      ?? this.exactRoutes.get(exactKey(ANY_METHOD, pathname));
    if (exact) return { handler: exact, params: [] };

    for (const route of this.patternRoutes) {
      if (route.method !== method) continue;
      const matched = route.regexp.exec(pathname);
      if (matched) return { handler: route.handler, params: matched.slice(1).map((v) => v ?? '') };
    }

    for (const route of this.prefixRoutes) {
      if (route.method !== method) continue;
      if (pathname.startsWith(route.prefix)) return { handler: route.handler, params: [] };
    }

    return undefined;
  }

  /** 登録済みルートの台帳（登録順）。ゴールデンマスターテスト用。 */
  list(): readonly RouteDescriptor[] {
    return this.descriptors;
  }
}
