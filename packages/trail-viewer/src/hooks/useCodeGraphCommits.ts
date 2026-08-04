import { useCallback, useEffect, useState } from 'react';

/** コミット粒度の目盛り 1 件（`GET /api/code-graph/commits` の応答要素）。 */
export interface CodeGraphCommitTick {
  readonly sha: string;
  readonly shortSha: string;
  /** UTC ISO 8601。並び順はサーバがこの値の昇順で確定させている。 */
  readonly committedAt: string;
  /** コミットメッセージの 1 行目。 */
  readonly subject: string;
  /** コミット時点のコードグラフが生成済みか。false は「未生成」であって「無いコミット」ではない。 */
  readonly hasGraph: boolean;
}

export interface UseCodeGraphCommitsOptions {
  /** false の間は fetch しない（リリース粒度で表示している間はコミットを取りに行かない）。 */
  readonly enabled?: boolean;
  readonly repo?: string;
  /** 区間の上端リリースタグ。未指定では区間が決まらないため fetch しない。 */
  readonly to?: string;
  /** 区間の下端リリースタグ。省略すると最古からになる。 */
  readonly from?: string | null;
}

export interface UseCodeGraphCommitsResult {
  readonly commits: readonly CodeGraphCommitTick[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refetch: () => void;
}

function isTick(value: unknown): value is CodeGraphCommitTick {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sha === 'string' &&
    typeof v.shortSha === 'string' &&
    typeof v.committedAt === 'string' &&
    typeof v.subject === 'string' &&
    typeof v.hasGraph === 'boolean'
  );
}

/**
 * スクラバをコミット粒度へズームしたときの目盛り一覧を取得する。
 *
 * 取得失敗時は空配列に留める（`useCodeGraphReleases` と同じ縮退。一覧はナビゲーション補助で
 * あり、グラフ本体の描画の前提条件ではない）。並び替えはサーバ側の責務なので、ここでは
 * 並べ替えない。**未生成のコミットも一覧から落とさない**（生成を要求する対象になるため）。
 */
export function useCodeGraphCommits(
  serverUrl: string,
  options: UseCodeGraphCommitsOptions = {},
): UseCodeGraphCommitsResult {
  const { enabled = true, repo, to, from } = options;
  const [commits, setCommits] = useState<readonly CodeGraphCommitTick[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !repo || !to) {
      setCommits([]);
      setError(null);
      // 直前の取得が abort された場合、その finally は aborted ガードで setLoading(false) を
      // 飛ばす。ここで落とさないと loading が true のまま固定される。
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ repo, to });
    if (from) params.set('from', from);
    fetch(`${serverUrl}/api/code-graph/commits?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { commits?: unknown };
        const list = Array.isArray(body.commits) ? body.commits.filter(isTick) : [];
        setCommits(list);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setCommits([]);
        setError(String(e));
        console.error('[useCodeGraphCommits] fetch failed', e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [serverUrl, enabled, repo, to, from, reloadToken]);

  return { commits, loading, error, refetch };
}
