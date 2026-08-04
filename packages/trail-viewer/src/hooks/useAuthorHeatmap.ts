import { useEffect, useState } from 'react';
import { fetchAuthorHeatmapApi, type AuthorHeatmapResponse } from './fetchAuthorHeatmapApi';

export interface UseAuthorHeatmapOptions {
  /** false の場合 fetch を行わない（Author Heatmap 配色を選んでいないとき） */
  readonly enabled: boolean;
  readonly serverUrl: string;
  readonly repo?: string;
  readonly topSessions?: number;
}

export interface UseAuthorHeatmapResult {
  readonly data: AuthorHeatmapResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
}

/**
 * Author Heatmap の集計を取得する。
 *
 * 取得失敗はグラフ描画を壊さないよう data を null に保ったままエラーを返す
 * （配色は中立色へ縮退し、構造の表示は生き残る）。
 */
export function useAuthorHeatmap(options: UseAuthorHeatmapOptions): UseAuthorHeatmapResult {
  const { enabled, serverUrl, repo, topSessions } = options;
  const [data, setData] = useState<AuthorHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !repo) {
      setData(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchAuthorHeatmapApi(serverUrl, { repo, topSessions }, controller.signal)
      .then((res) => {
        setData(res);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(String(e));
        console.error('[useAuthorHeatmap] fetch failed', e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, serverUrl, repo, topSessions]);

  return { data, loading, error };
}
