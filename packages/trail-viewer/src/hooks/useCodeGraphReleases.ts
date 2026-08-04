import { useCallback, useEffect, useState } from 'react';

/** Time Scrubber の目盛り 1 件（`GET /api/code-graph/releases` の応答要素）。 */
export interface CodeGraphReleaseTick {
  readonly tag: string;
  /** UTC ISO 8601。目盛りの並び順はサーバがこの値の昇順で確定させている。 */
  readonly releasedAt: string;
  /** 履歴版コードグラフが生成済みか。false は「未生成」であって「存在しないリリース」ではない。 */
  readonly hasGraph: boolean;
}

export interface UseCodeGraphReleasesResult {
  readonly releases: readonly CodeGraphReleaseTick[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refetch: () => void;
}

function isTick(value: unknown): value is CodeGraphReleaseTick {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.tag === 'string' && typeof v.releasedAt === 'string' && typeof v.hasGraph === 'boolean';
}

/**
 * Time Scrubber の目盛り一覧を取得する。
 *
 * 取得失敗時は空配列に留める。スクラバが消えるだけで、グラフ本体の描画は生き残らせる
 * （一覧はナビゲーション補助であり、表示の前提条件ではない）。
 *
 * 並び替えはサーバ側の責務なので、ここでは並べ替えない。
 */
export function useCodeGraphReleases(serverUrl: string, repo?: string): UseCodeGraphReleasesResult {
  const [releases, setReleases] = useState<readonly CodeGraphReleaseTick[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!repo) {
      setReleases([]);
      setError(null);
      // 直前の取得が abort された場合、その finally は aborted ガードで setLoading(false) を
      // 飛ばす。ここで落とさないと loading が true のまま固定される。
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`${serverUrl}/api/code-graph/releases?repo=${encodeURIComponent(repo)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { releases?: unknown };
        const list = Array.isArray(body.releases) ? body.releases.filter(isTick) : [];
        setReleases(list);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setReleases([]);
        setError(String(e));
        console.error('[useCodeGraphReleases] fetch failed', e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [serverUrl, repo, reloadToken]);

  return { releases, loading, error, refetch };
}
