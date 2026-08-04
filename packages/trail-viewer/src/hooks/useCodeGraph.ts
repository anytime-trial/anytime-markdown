import { useCallback, useEffect, useRef, useState } from 'react';
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';

export interface UseCodeGraphResult {
  graph: CodeGraph | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export interface UseCodeGraphOptions {
  /** false の場合 fetch を行わず、graph は null のまま保持される */
  readonly enabled?: boolean;
  /** リリースタグ（'current' で最新スナップショット）。デフォルト 'current' */
  readonly release?: string;
  /** リポジトリ名。release !== 'current' のとき releases.repo_name による帰属確認に使用 */
  readonly repo?: string;
}

export function useCodeGraph(
  serverUrl: string,
  options: UseCodeGraphOptions = {},
): UseCodeGraphResult {
  const { enabled = true, release = 'current', repo } = options;
  const [graph, setGraph] = useState<CodeGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Time Scrubber で release が高頻度に切り替わるようになったため、後着した古い応答で
  // 新しい選択を上書きしないよう世代を持つ。応答は 1 本 2 MB あり、目盛りを続けて確定
  // させると後発の要求が先に返る（スライダーの指す時点と描画が食い違う）。
  const generationRef = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    const generation = ++generationRef.current;
    const isStale = (): boolean => generation !== generationRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (release && release !== 'current') params.set('release', release);
      if (repo) params.set('repo', repo);
      const qs = params.toString();
      const url = `${serverUrl}/api/code-graph${qs ? `?${qs}` : ''}`;
      const res = await fetch(url);
      if (isStale()) return;
      if (res.status === 404) {
        setGraph(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CodeGraph;
      if (isStale()) return;
      setGraph(data);
    } catch (e) {
      if (isStale()) return;
      setError(String(e));
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [serverUrl, enabled, release, repo]);

  useEffect(() => {
    if (!enabled) return;
    void load();

    // WS で code-graph-updated を購読し、サーバ側のキャッシュ更新時に再 fetch する。
    // Reload Window 不要で skill 後の community 名・要約反映を実現するための同期経路。
    const WSCtor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    if (!WSCtor) return;
    let ws: WebSocket | undefined;
    try {
      const wsUrl = serverUrl.replace(/^http/, 'ws');
      ws = new WSCtor(wsUrl);
      ws.addEventListener('message', (event: MessageEvent) => {
        try {
          const data = typeof event.data === 'string' ? event.data : String(event.data);
          const msg = JSON.parse(data) as { type?: string };
          if (msg.type === 'code-graph-updated') void load();
        } catch {
          // 不正な JSON は無視
        }
      });
    } catch {
      // WS 接続失敗は静かに無視（fetch だけは成立しているため、初回 mount のデータは表示できる）
      ws = undefined;
    }
    return () => {
      try {
        ws?.close();
      } catch {
        // close 失敗は無視
      }
    };
  }, [load, enabled, serverUrl]);

  return { graph, loading, error, refetch: load };
}
