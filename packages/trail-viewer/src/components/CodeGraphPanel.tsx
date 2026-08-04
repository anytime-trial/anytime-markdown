import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CodeGraphNode } from '@anytime-markdown/trail-core/codeGraph';
import { type CodeGraphGhostEdge } from './CodeGraphCanvas';
import { toCodeGraphNodeId } from '@anytime-markdown/trail-core/codeGraphNodeId';
import { useCodeGraph } from '../hooks/useCodeGraph';
import { useAuthorHeatmap } from '../hooks/useAuthorHeatmap';
import { isOverrideColorBy, type CodeGraphColorBy } from '../views/codeGraphCanvas';
import { useTemporalCoupling } from '../c4/hooks/useTemporalCoupling';
import type { TemporalCouplingControlsValue } from '../c4/components/overlays/TemporalCouplingControls';
import { VanillaIsland } from '../shared/vanillaIsland';
import {
  CURRENT_RELEASE,
  mountCodeGraphPanel,
  type CodeGraphGenerateState,
  type CodeGraphPanelProps as VanillaProps,
} from '../views/codeGraphPanel';
import { useCodeGraphReleases } from '../hooks/useCodeGraphReleases';
import { useTrailI18n } from '../i18n';
import type { TrailI18n } from '../i18n';

const DEFAULT_TC_VALUE: TemporalCouplingControlsValue = {
  enabled: false,
  windowDays: 30,
  threshold: 0.5,
  topK: 50,
  directional: false,
  confidenceThreshold: 0.5,
  directionalDiff: 0.3,
  granularity: 'commit',
};

interface CodeGraphPanelProps {
  readonly serverUrl: string;
  readonly isDark?: boolean;
  readonly tcValue?: TemporalCouplingControlsValue;
  readonly repoName?: string;
}

export function CodeGraphPanel({ serverUrl, isDark, tcValue: tcValueProp, repoName }: Readonly<CodeGraphPanelProps>): React.ReactElement {
  const [selectedRelease, setSelectedRelease] = useState<string>(CURRENT_RELEASE);
  const [generateState, setGenerateState] = useState<CodeGraphGenerateState>({ status: 'idle' });
  // 生成は非同期で、判定（二重要求の抑止・進捗の採否）はレンダー間に挟まる。state は
  // 再レンダーまで古い値を返すため、判定には ref を使う。
  const generateStateRef = useRef<CodeGraphGenerateState>({ status: 'idle' });
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const { t: translate } = useTrailI18n();
  const t = useCallback((key: string): string => translate(key as keyof TrailI18n), [translate]);

  const { releases, refetch: refetchReleases } = useCodeGraphReleases(serverUrl, repoName);

  // リリース集合はリポジトリごとに異なるため、切替時に前の選択を持ち越さない（仕様 §4.2）。
  useEffect(() => {
    setSelectedRelease(CURRENT_RELEASE);
    setGenerateState({ status: 'idle' });
  }, [repoName]);

  // 選択中のタグが一覧から消えたら現在へ戻す（仕様 §4.2）。ビュー側の目盛り丸めは表示だけの
  // フォールバックで、取得に使うタグは戻らない。状態の正はここにあるのでリセットもここで行う。
  // 一覧が空のときは戻さない（取得失敗の縮退で選択を壊さないため）。
  useEffect(() => {
    if (selectedRelease === CURRENT_RELEASE) return;
    if (releases.length === 0) return;
    if (!releases.some((r) => r.tag === selectedRelease)) setSelectedRelease(CURRENT_RELEASE);
  }, [releases, selectedRelease]);

  const { graph, loading, error, refetch } = useCodeGraph(serverUrl, {
    repo: repoName,
    enabled: !!repoName,
    release: selectedRelease,
  });
  const [highlightedNodes, setHighlightedNodes] = useState<ReadonlySet<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<CodeGraphNode | null>(null);
  // 配色方式は vanilla view がローカルに持つが、Author Heatmap は取得の要否を決めるため
  // ラッパ側にもミラーする（view から onColorByChange で通知される）。
  const [colorBy, setColorBy] = useState<CodeGraphColorBy>('community');
  const tcValue = tcValueProp ?? DEFAULT_TC_VALUE;

  const { data: authorHeatmapData } = useAuthorHeatmap({
    // 集計は現在のグラフのノード集合に対するものなので、過去の時点では取得しない（仕様 §4.5）。
    enabled: isOverrideColorBy(colorBy) && selectedRelease === CURRENT_RELEASE,
    serverUrl,
    repo: repoName,
  });

  const authorHeatmap = useMemo<VanillaProps['authorHeatmap']>(() => {
    if (!authorHeatmapData) return null;
    return {
      entries: authorHeatmapData.entries,
      topSessions: authorHeatmapData.topSessions,
      coveredNodes: authorHeatmapData.coveredNodes,
      totalNodes: authorHeatmapData.totalNodes,
    };
  }, [authorHeatmapData]);

  const tcRepoId = useMemo<string | null>(() => {
    if (!graph || graph.repositories.length === 0) return null;
    return graph.repositories[0]?.id ?? null;
  }, [graph]);

  const {
    edges: rawGhostEdges,
    directional: tcDirectional,
    granularity: tcGranularity,
  } = useTemporalCoupling({
    enabled: tcValue.enabled && !!tcRepoId,
    serverUrl,
    repoName: tcRepoId ?? '',
    windowDays: tcValue.windowDays,
    threshold: tcValue.threshold,
    topK: tcValue.topK,
    directional: tcValue.directional,
    confidenceThreshold: tcValue.confidenceThreshold,
    directionalDiff: tcValue.directionalDiff,
    granularity: tcValue.granularity,
  });

  const showSubagentDirectionalHint = useMemo<boolean>(() => {
    if (!tcValue.enabled) return false;
    if (tcGranularity !== 'subagentType') return false;
    if (!tcDirectional) return false;
    if (rawGhostEdges.length === 0) return false;
    return rawGhostEdges.every(
      (e) => !('direction' in e) || e.direction !== 'A→B',
    );
  }, [tcValue.enabled, tcGranularity, tcDirectional, rawGhostEdges]);

  const ghostEdges = useMemo<CodeGraphGhostEdge[]>(() => {
    if (!tcRepoId) return [];
    return rawGhostEdges.map((e) => {
      const base: CodeGraphGhostEdge = {
        source: toCodeGraphNodeId(tcRepoId, e.source),
        target: toCodeGraphNodeId(tcRepoId, e.target),
        jaccard: e.jaccard,
        coChangeCount: e.coChangeCount,
      };
      if ('direction' in e) {
        return {
          ...base,
          direction: e.direction,
          confidenceForward: e.confidenceForward,
          confidenceBackward: e.confidenceBackward,
        };
      }
      return base;
    });
  }, [rawGhostEdges, tcRepoId]);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setHighlightedNodes(new Set());
      return;
    }
    try {
      const res = await fetch(`${serverUrl}/api/code-graph/query?q=${encodeURIComponent(query)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { nodes: string[] };
      setHighlightedNodes(new Set(data.nodes));
    } catch (err) {
      console.error('[CodeGraphPanel] search failed', err);
    }
  }, [serverUrl]);

  const handleNodeClick = useCallback(async (nodeId: string) => {
    try {
      const res = await fetch(`${serverUrl}/api/code-graph/explain?id=${encodeURIComponent(nodeId)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { node?: CodeGraphNode };
      setSelectedNode(data.node ?? null);
    } catch (err) {
      console.error('[CodeGraphPanel] explain failed', err);
    }
  }, [serverUrl]);

  /**
   * 未生成リリースのオンデマンド生成。明示操作（生成ボタン）からのみ呼ばれる。
   *
   * `POST /api/analyze/release` は生成完了まで応答を返さない同期エンドポイントなので、
   * 待っている間の進捗は WebSocket の `code-graph-progress` から拾う。
   * 完了後は在庫一覧とグラフの双方を取り直す（在庫フラグが変わるため）。
   */
  const handleGenerateRelease = useCallback(async (tag: string) => {
    // 実行中はどのタグでも受け付けない。サーバは解析中に 409 を返すため、二重要求は
    // 必ず失敗する上、単一の generateState を上書きして先行要求の帰結を UI から消す。
    // ボタン側でも抑止しているが、再レンダー前の連打はここでしか止まらない。
    if (generateStateRef.current.status === 'running') return;
    setGenerateState({ status: 'running', tag });
    generateStateRef.current = { status: 'running', tag };
    const WSCtor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    let ws: WebSocket | undefined;
    if (WSCtor) {
      try {
        ws = new WSCtor(serverUrl.replace(/^http/, 'ws'));
        ws.addEventListener('message', (event: MessageEvent) => {
          try {
            const raw = typeof event.data === 'string' ? event.data : String(event.data);
            const msg = JSON.parse(raw) as { type?: string; percent?: number };
            // SHORTCUT: 進捗をタグで絞らず、実行中の要求へそのまま当てる.
            // ceiling: サーバの code-graph-progress は phase と percent だけでタグ・repo を
            // 持たないため、current 解析など無関係な進捗も混じり得る（解析は 1 本ずつしか
            // 走らないので実害は「別の解析の割合が出る」に留まる）.
            // upgrade: ServerMessage に tag を載せたら一致するものだけ採用する.
            if (msg.type === 'code-graph-progress' && typeof msg.percent === 'number') {
              if (!mountedRef.current) return;
              if (generateStateRef.current.status !== 'running') return;
              setGenerateState({ status: 'running', tag, percent: Math.round(msg.percent) });
            }
          } catch (err) {
            console.error('[CodeGraphPanel] progress message parse failed', err);
          }
        });
      } catch (err) {
        // 進捗が取れなくても生成自体は続行する（表示が粗くなるだけ）。
        console.error('[CodeGraphPanel] progress socket failed', err);
        ws = undefined;
      }
    }
    /** 進捗の後着で running へ巻き戻らないよう、状態を確定させる前に購読を切る。 */
    const closeSocket = (): void => {
      try {
        ws?.close();
      } catch (err) {
        console.error('[CodeGraphPanel] progress socket close failed', err);
      }
    };
    try {
      const res = await fetch(`${serverUrl}/api/analyze/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: [tag] }),
      });
      closeSocket();
      if (res.status === 409) {
        // 他の解析が走っているだけで、後で再試行すれば成功する。恒久的な失敗と書かない。
        generateStateRef.current = { status: 'idle' };
        if (mountedRef.current) setGenerateState({ status: 'error', tag, message: t('codeGraph.scrubber.busy') });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      generateStateRef.current = { status: 'idle' };
      if (!mountedRef.current) return;
      setGenerateState({ status: 'idle' });
      refetchReleases();
      refetch();
    } catch (e) {
      console.error('[CodeGraphPanel] generate release failed', e);
      closeSocket();
      generateStateRef.current = { status: 'idle' };
      if (mountedRef.current) setGenerateState({ status: 'error', tag, message: String(e) });
    }
  }, [serverUrl, refetch, refetchReleases, t]);

  // Build graphState for vanilla view
  const graphState = useMemo<VanillaProps['graphState']>(() => {
    if (loading) return { status: 'loading' };
    if (error) return { status: 'error', message: error };
    if (!repoName) return { status: 'no-repo' };
    if (!graph) return { status: 'no-graph' };
    return { status: 'ready', graph };
  }, [loading, error, repoName, graph]);

  const viewProps: VanillaProps = {
    graphState,
    highlightedNodes,
    selectedNode,
    showSubagentDirectionalHint,
    ghostEdges,
    ghostEdgesEnabled: tcValue.enabled,
    ghostEdgeGranularity: tcGranularity,
    isDark,
    onSearch: (q) => void handleSearch(q),
    onRefetch: refetch,
    onNodeClick: (n) => void handleNodeClick(n),
    communitySummaries: graph?.communitySummaries,
    t,
    authorHeatmap,
    onColorByChange: setColorBy,
    releases,
    selectedRelease,
    generateState,
    onReleaseChange: setSelectedRelease,
    onGenerateRelease: (tag) => void handleGenerateRelease(tag),
  };

  return <VanillaIsland mount={mountCodeGraphPanel} props={viewProps} />;
}
