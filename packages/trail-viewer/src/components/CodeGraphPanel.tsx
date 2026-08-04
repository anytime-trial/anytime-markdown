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
  type CodeGraphScrubberGranularity,
} from '../views/codeGraphPanel';
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';
import {
  buildPlaybackList,
  canPlay,
  nextPlaybackIndex,
  playbackStartIndex,
  shouldStopOnFailures,
  DEFAULT_PLAYBACK_SPEED,
  PLAYBACK_MIN_DWELL_MS,
  type CodeGraphPlaybackSpeed,
} from '../views/codeGraphPlayback';
import type { CodeGraphPlaybackResult } from '../views/codeGraphPanel';
import { useCodeGraphReleases } from '../hooks/useCodeGraphReleases';
import { useCodeGraphCommits } from '../hooks/useCodeGraphCommits';
import { diffCodeGraphs } from '@anytime-markdown/trail-core/codeGraphDiff';
import { useTrailI18n } from '../i18n';
import type { TrailI18n } from '../i18n';

/**
 * ベースライン再利用のために保持する時点グラフの本数。
 * 1 本 2 MB あるため小さく保つ。連続再生に必要なのは直前の 1 本だけで、
 * 手動で行き来したときの往復に少しだけ余裕を持たせている。
 */
const GRAPH_CACHE_SIZE = 3;

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
  // スクラバの粒度。コミット粒度の間も selectedRelease は保持する（「リリースへ戻す」で
  // 元のリリースへ戻すため。仕様 §5.1）。
  const [granularity, setGranularity] = useState<CodeGraphScrubberGranularity>('release');
  const [commitRange, setCommitRange] = useState<{ fromTag: string | null; toTag: string } | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
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
  // コミット粒度のズームも同じ理由で解除する（区間は元のリポジトリのタグで定義されている）。
  useEffect(() => {
    setSelectedRelease(CURRENT_RELEASE);
    setGenerateState({ status: 'idle' });
    setGranularity('release');
    setCommitRange(null);
    setSelectedCommit(null);
  }, [repoName]);

  // 選択中のタグが一覧から消えたら現在へ戻す（仕様 §4.2）。ビュー側の目盛り丸めは表示だけの
  // フォールバックで、取得に使うタグは戻らない。状態の正はここにあるのでリセットもここで行う。
  // 一覧が空のときは戻さない（取得失敗の縮退で選択を壊さないため）。
  useEffect(() => {
    if (selectedRelease === CURRENT_RELEASE) return;
    if (releases.length === 0) return;
    if (releases.some((r) => r.tag === selectedRelease)) return;
    setSelectedRelease(CURRENT_RELEASE);
    // 区間の上端が消えたのでズームも維持できない。リリース粒度へ戻す。
    setGranularity('release');
    setCommitRange(null);
    setSelectedCommit(null);
  }, [releases, selectedRelease]);

  const isCommitGranularity = granularity === 'commit';

  const {
    commits,
    loading: commitsLoading,
    error: commitsError,
    refetch: refetchCommits,
  } = useCodeGraphCommits(serverUrl, {
    enabled: isCommitGranularity && !!repoName && !!commitRange,
    repo: repoName,
    to: commitRange?.toTag,
    from: commitRange?.fromTag,
  });

  // ズーム直後は選択が未定。一覧が届いたら区間の上端（＝選択リリースに最も近いコミット）を選ぶ。
  // 一覧が入れ替わって選択中の SHA が消えた場合も同じ扱いにする。
  useEffect(() => {
    if (!isCommitGranularity || commits.length === 0) return;
    if (selectedCommit && commits.some((c) => c.sha === selectedCommit)) return;
    setSelectedCommit(commits[commits.length - 1]?.sha ?? null);
  }, [isCommitGranularity, commits, selectedCommit]);

  const activeCommit = isCommitGranularity ? selectedCommit : null;

  const { graph, graphKey, loading, error, refetch } = useCodeGraph(serverUrl, {
    repo: repoName,
    enabled: !!repoName && (!isCommitGranularity || !!activeCommit),
    release: selectedRelease,
    commit: activeCommit ?? undefined,
  });
  const [highlightedNodes, setHighlightedNodes] = useState<ReadonlySet<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<CodeGraphNode | null>(null);
  // 配色方式は vanilla view がローカルに持つが、Author Heatmap は取得の要否を決めるため
  // ラッパ側にもミラーする（view から onColorByChange で通知される）。
  const [colorBy, setColorBy] = useState<CodeGraphColorBy>('community');
  const tcValue = tcValueProp ?? DEFAULT_TC_VALUE;

  const { data: authorHeatmapData } = useAuthorHeatmap({
    // 集計は現在のグラフのノード集合に対するものなので、過去の時点では取得しない（仕様 §4.5）。
    // コミット粒度は定義上すべて過去の時点なので、選択に関わらず取得しない。
    enabled: isOverrideColorBy(colorBy) && !isCommitGranularity && selectedRelease === CURRENT_RELEASE,
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

  /**
   * State Replay のベースライン＝ 1 つ前の目盛り（仕様 §4.2）。
   *
   * 「現在」を選んでいるときは在庫のある最新のリリースを採る。目盛り上の直前が未生成だと
   * 「現在」の差分が常に出せなくなるため、ここだけ在庫のあるものまで遡る。
   * 過去の時点では在庫の有無に関わらず直前の目盛りを採る（未生成なら生成を要求できる）。
   */
  const baseline = useMemo<VanillaProps['baseline']>(() => {
    // コミット粒度のベースラインは 1 つ前のコミット（仕様 §5.1）。区間の先頭には前版が無い。
    if (isCommitGranularity) {
      if (!selectedCommit) return null;
      const index = commits.findIndex((c) => c.sha === selectedCommit);
      if (index <= 0) return null;
      const prev = commits[index - 1];
      if (!prev) return null;
      // tag は生成要求に使うため完全な SHA、表示は短縮 SHA（40 文字を凡例へ貼らない）。
      return { tag: prev.sha, label: prev.shortSha, hasGraph: prev.hasGraph };
    }
    if (releases.length === 0) return null;
    if (selectedRelease === CURRENT_RELEASE) {
      for (let i = releases.length - 1; i >= 0; i--) {
        const tick = releases[i];
        if (tick?.hasGraph) return tick;
      }
      return null;
    }
    const index = releases.findIndex((r) => r.tag === selectedRelease);
    if (index <= 0) return null;
    return releases[index - 1] ?? null;
  }, [isCommitGranularity, commits, selectedCommit, releases, selectedRelease]);

  // ベースラインのグラフは差分表示を選んでいる間だけ取る（1 本 2 MB あるため）。
  const baselineId = baseline?.hasGraph ? baseline.tag : null;

  /**
   * 直近に取得した時点のグラフを少数だけ保持する（Auto Playback のベースライン再利用）。
   *
   * 順方向の連続再生では、フレーム N の選択版がフレーム N+1 のベースラインになる。
   * 再利用しないとフレームごとに 2 本（約 4 MB）を取ることになり、速度プリセットが
   * 意味を失う。**主グラフの取得経路には触れない**（あちらは「保持しているグラフが今の
   * 時点のものか」を graphKey で守っており、キャッシュを差し込むとその防御と衝突する）。
   *
   * 「現在」は時間とともに中身が変わるため保持しない。ベースラインが `current` になる
   * 経路も無い（`baseline` はタグか SHA を返す）。
   *
   * キャッシュは **state ではなく ref** に置く。state にすると、保持したこと自体が再レンダー
   * を呼び、そのレンダーが取得フックの `enabled` とベースラインの同一性を揺らして
   * 取得 → 保持 → 再レンダー → 取得のループになる（実測: `CodeGraphPanel.stateReplay` の
   * テストがヒープを 4 GB まで食って落ちた）。保持しても描画は変わらないので、
   * 再レンダーを呼ぶ必要は無い。読むのは次に `baselineId` が変わったレンダーで足りる。
   */
  const graphCacheRef = useRef(new Map<string, CodeGraph>());
  useEffect(() => {
    if (!graph || !graphKey || graphKey === CURRENT_RELEASE) return;
    const cache = graphCacheRef.current;
    if (cache.get(graphKey) === graph) return;
    cache.delete(graphKey);
    cache.set(graphKey, graph);
    while (cache.size > GRAPH_CACHE_SIZE) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }, [graph, graphKey]);

  const cachedBaselineGraph = baselineId ? (graphCacheRef.current.get(baselineId) ?? null) : null;
  const { graph: fetchedBaselineGraph, graphKey: fetchedBaselineKey } = useCodeGraph(serverUrl, {
    repo: repoName,
    enabled: !!repoName && colorBy === 'diff' && !!baselineId && !cachedBaselineGraph,
    release: isCommitGranularity ? CURRENT_RELEASE : (baselineId ?? CURRENT_RELEASE),
    commit: isCommitGranularity ? (baselineId ?? undefined) : undefined,
  });
  const baselineGraph = cachedBaselineGraph ?? fetchedBaselineGraph;
  // キャッシュから採ったときの鍵は引いた ID そのもの。取得フック側の鍵と混ぜない。
  const baselineGraphKey = cachedBaselineGraph ? baselineId : fetchedBaselineKey;

  const diff = useMemo<VanillaProps['diff']>(() => {
    if (colorBy !== 'diff' || !graph || !baselineGraph) return null;
    // 保持しているベースラインが**今のベースライン**のものか確かめる。粒度を切り替えると
    // 新しいベースラインは未生成（`hasGraph:false` → 取得しない）のことが多く、フックは
    // 直前のグラフを保持し続ける。突き合わせないと、凡例には新しいベースラインを出しながら
    // 実際は前の時点との差分を描く（「選んだ時点と違う絵」）。
    if (!baselineId || baselineGraphKey !== baselineId) return null;
    return diffCodeGraphs(baselineGraph, graph);
  }, [colorBy, graph, baselineGraph, baselineGraphKey, baselineId]);

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
   * 未生成の時点（リリース / コミット）のオンデマンド生成。明示操作からのみ呼ばれる。
   *
   * `POST /api/analyze/{release,commit}` は生成完了まで応答を返さない同期エンドポイントなので、
   * 待っている間の進捗は WebSocket の `code-graph-progress` から拾う。
   * 完了後は在庫一覧とグラフの双方を取り直す（在庫フラグが変わるため）。
   *
   * `tag` は進捗・失敗の表示に使う識別子で、リリース粒度ではタグ、コミット粒度では SHA。
   */
  const runGeneration = useCallback(async (
    tag: string,
    request: () => Promise<Response>,
    onSucceeded: () => void,
  ) => {
    // 実行中はどの時点でも受け付けない。サーバは解析中に 409 を返すため、二重要求は
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
      const res = await request();
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
      onSucceeded();
    } catch (e) {
      console.error('[CodeGraphPanel] generate snapshot failed', e);
      closeSocket();
      generateStateRef.current = { status: 'idle' };
      if (mountedRef.current) setGenerateState({ status: 'error', tag, message: String(e) });
    }
  }, [serverUrl, t]);

  const handleGenerateRelease = useCallback((tag: string) => {
    void runGeneration(
      tag,
      () => fetch(`${serverUrl}/api/analyze/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: [tag] }),
      }),
      () => {
        refetchReleases();
        refetch();
      },
    );
  }, [runGeneration, serverUrl, refetch, refetchReleases]);

  /**
   * コミット時点のグラフ生成。`repo` はサーバ側で必須（省略を「既定リポジトリ」へ縮退させない）
   * なので、リポジトリ未選択では要求しない。
   */
  const handleGenerateCommit = useCallback((sha: string) => {
    if (!repoName) return;
    void runGeneration(
      sha,
      () => fetch(`${serverUrl}/api/analyze/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repoName, sha }),
      }),
      () => {
        refetchCommits();
        refetch();
      },
    );
  }, [runGeneration, serverUrl, repoName, refetch, refetchCommits]);

  /**
   * コミット粒度へのズーム。区間は `前のリリース..選択リリース`（仕様 §5.1）。
   * 「現在」は特定のリリースではないため区間の上端にできず、ズームしない。
   */
  const handleZoomToCommits = useCallback(() => {
    const index = releases.findIndex((r) => r.tag === selectedRelease);
    if (index < 0) return;
    setCommitRange({ toTag: selectedRelease, fromTag: releases[index - 1]?.tag ?? null });
    setSelectedCommit(null);
    setGranularity('commit');
  }, [releases, selectedRelease]);

  /** リリース粒度へ戻す。選択は元のリリースのまま（ズーム中も持ち越していた）。 */
  const handleZoomToReleases = useCallback(() => {
    setGranularity('release');
    setCommitRange(null);
    setSelectedCommit(null);
  }, []);

  // Build graphState for vanilla view
  const graphState = useMemo<VanillaProps['graphState']>(() => {
    if (!repoName) return { status: 'no-repo' };
    // ズーム直後（一覧取得中・区間が空）は直前のリリースのグラフを出さない。
    // 選んだ時点と違う絵をそのまま残すと、差分の読みが狂う。
    if (isCommitGranularity && !activeCommit) {
      return commitsLoading ? { status: 'loading' } : { status: 'no-graph' };
    }
    if (loading) return { status: 'loading' };
    if (error) return { status: 'error', message: error };
    if (!graph) return { status: 'no-graph' };
    return { status: 'ready', graph };
  }, [loading, error, repoName, graph, isCommitGranularity, activeCommit, commitsLoading]);

  // --- Auto Playback（機能仕様書 spec/31.trail/02.trail-viewer/auto-playback） ---

  const [playbackPlaying, setPlaybackPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<CodeGraphPlaybackSpeed>(DEFAULT_PLAYBACK_SPEED);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackFailed, setPlaybackFailed] = useState(0);
  const [playbackResult, setPlaybackResult] = useState<CodeGraphPlaybackResult | null>(null);
  // 送りの判定はレンダー間に挟まるため、state のスナップショットではなく ref を見る
  // （生成状態が同じ理由で ref を持っているのと同じ）。
  const playingRef = useRef(false);
  const playbackIndexRef = useRef(0);
  const playbackFailedRef = useRef(0);
  const consecutiveFailuresRef = useRef(0);
  /** 失敗を目盛りごとに 1 回だけ数えるための印（同じ状態で effect が再実行されるため）。 */
  const handledFailureRef = useRef<string | null>(null);

  const playbackList = useMemo(
    () =>
      buildPlaybackList({
        granularity,
        releases,
        commits,
        currentId: CURRENT_RELEASE,
        currentLabel: t('codeGraph.scrubber.current'),
      }),
    [granularity, releases, commits, t],
  );
  const playbackListRef = useRef(playbackList);
  playbackListRef.current = playbackList;

  const activeTickId = isCommitGranularity ? selectedCommit : selectedRelease;

  const selectTick = useCallback(
    (id: string) => {
      if (isCommitGranularity) setSelectedCommit(id);
      else setSelectedRelease(id);
    },
    [isCommitGranularity],
  );

  const stopPlayback = useCallback((reason: CodeGraphPlaybackResult['reason']) => {
    if (!playingRef.current) return;
    playingRef.current = false;
    setPlaybackPlaying(false);
    const list = playbackListRef.current;
    setPlaybackResult({
      reason,
      position: Math.min(playbackIndexRef.current + 1, list.ticks.length),
      total: list.ticks.length,
      skipped: list.skipped,
      failed: playbackFailedRef.current,
    });
  }, []);

  const handlePlaybackToggle = useCallback(() => {
    if (playingRef.current) {
      stopPlayback('paused');
      return;
    }
    if (!canPlay(playbackList)) return;
    const start = playbackStartIndex(playbackList, activeTickId);
    const tick = playbackList.ticks[start];
    if (!tick) return;
    consecutiveFailuresRef.current = 0;
    handledFailureRef.current = null;
    playbackFailedRef.current = 0;
    playbackIndexRef.current = start;
    playingRef.current = true;
    setPlaybackFailed(0);
    setPlaybackResult(null);
    setPlaybackIndex(start);
    setPlaybackPlaying(true);
    selectTick(tick.id);
  }, [playbackList, activeTickId, selectTick, stopPlayback]);

  /**
   * 送りの本体。1 フレームは「取得完了 → 描画完了 → 最小滞在時間の経過」で閉じる
   * （機能仕様書 §4.3）。固定間隔で送ると、間隔が描画コストを下回った時点で要求が
   * 積み上がり、速度を上げるほど滞留する。
   *
   * 描画完了は専用の通知ではなく effect の順序で見る。`VanillaIsland` は `useEffect` で
   * 描画層の `update()` を呼び、`mountCodeGraphCanvas` はその中で sigma を同期に組み直す。
   * 子の effect は親より先に走るため、この effect が動く時点で描画は終わっている。
   */
  useEffect(() => {
    if (!playbackPlaying) return;
    const tick = playbackList.ticks[playbackIndex];
    if (!tick) {
      stopPlayback('completed');
      return;
    }
    // 目標の目盛りがまだ選択へ反映されていない間は待つ。
    if (activeTickId !== tick.id) return;

    const advance = (): void => {
      const next = nextPlaybackIndex(playbackListRef.current, playbackIndexRef.current);
      if (next.done) {
        stopPlayback('completed');
        return;
      }
      const nextTick = playbackListRef.current.ticks[next.index];
      if (!nextTick) {
        stopPlayback('completed');
        return;
      }
      playbackIndexRef.current = next.index;
      setPlaybackIndex(next.index);
      selectTick(nextTick.id);
    };

    // 1 本の失敗で再生全体を止めない。ただし連続 3 本で止める（サーバ障害を叩き続けない）。
    if (graphState.status === 'error' || graphState.status === 'no-graph') {
      if (handledFailureRef.current === tick.id) return;
      handledFailureRef.current = tick.id;
      playbackFailedRef.current += 1;
      consecutiveFailuresRef.current += 1;
      setPlaybackFailed(playbackFailedRef.current);
      if (shouldStopOnFailures(consecutiveFailuresRef.current)) {
        stopPlayback('failed');
        return;
      }
      const retryTimer = setTimeout(advance, 0);
      return () => clearTimeout(retryTimer);
    }

    // `graphKey` が目標と一致して初めて「その時点の絵」である。status だけで進むと、
    // 前の時点のグラフを新しい時点のものとして数えてしまう。
    if (graphState.status !== 'ready' || graphKey !== tick.id) return;
    consecutiveFailuresRef.current = 0;
    handledFailureRef.current = null;
    const dwellTimer = setTimeout(advance, PLAYBACK_MIN_DWELL_MS[playbackSpeed]);
    return () => clearTimeout(dwellTimer);
  }, [
    playbackPlaying,
    playbackIndex,
    playbackList,
    activeTickId,
    graphState.status,
    graphKey,
    playbackSpeed,
    selectTick,
    stopPlayback,
  ]);

  // 粒度・リポジトリが変わると再生列そのものが入れ替わる。位置を持ち越さず停止する
  // （機能仕様書 §4.6）。配色の変更では止めない。
  const playbackResetKey = `${repoName ?? ''}|${granularity}`;
  const playbackResetRef = useRef(playbackResetKey);
  useEffect(() => {
    if (playbackResetRef.current === playbackResetKey) return;
    playbackResetRef.current = playbackResetKey;
    stopPlayback('paused');
  }, [playbackResetKey, stopPlayback]);

  // アンマウント時に再生を畳む。滞在タイマーは effect の後片付けが外す。
  useEffect(
    () => () => {
      playingRef.current = false;
    },
    [],
  );

  const playbackView = useMemo<VanillaProps['playback']>(() => {
    if (!canPlay(playbackList)) return { status: 'unavailable' };
    if (playbackPlaying) {
      return {
        status: 'playing',
        speed: playbackSpeed,
        position: playbackIndex + 1,
        total: playbackList.ticks.length,
        skipped: playbackList.skipped,
        failed: playbackFailed,
      };
    }
    if (playbackResult) return { status: 'idle', speed: playbackSpeed, result: playbackResult };
    return { status: 'idle', speed: playbackSpeed };
  }, [playbackList, playbackPlaying, playbackSpeed, playbackIndex, playbackFailed, playbackResult]);

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
    onGenerateRelease: handleGenerateRelease,
    baseline,
    diff,
    granularity,
    commits,
    commitsLoading,
    commitsError,
    selectedCommit,
    commitRange,
    onZoomToCommits: handleZoomToCommits,
    onZoomToReleases: handleZoomToReleases,
    onCommitChange: setSelectedCommit,
    onGenerateCommit: handleGenerateCommit,
    onRefetchCommits: refetchCommits,
    playback: playbackView,
    onPlaybackToggle: handlePlaybackToggle,
    onPlaybackSpeedChange: setPlaybackSpeed,
  };

  return <VanillaIsland mount={mountCodeGraphPanel} props={viewProps} />;
}
