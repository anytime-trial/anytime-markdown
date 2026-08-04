/**
 * CodeGraphPanel vanilla view.
 *
 * Renders: search toolbar + optional subagent hint alert + graph canvas +
 * optional node-detail sidebar.
 *
 * Data fetching (useCodeGraph, useTemporalCoupling) stays in the thin React
 * wrapper (.tsx); this view receives resolved data and callbacks as props.
 */
import { createButton, createTextField } from '@anytime-markdown/ui-core';
import type { CodeGraph, CodeGraphNode } from '@anytime-markdown/trail-core/codeGraph';
import type { VanillaViewHandle } from '../shared/vanillaIsland';
import {
  ARCHITECTURE_LAYER_ORDER,
  LAYER_LABEL_KEYS,
  layerColor,
} from '../components/communityColors';
import type { AuthorHeatmapEntry } from '@anytime-markdown/trail-core/authorHeatmap';
import {
  buildEditFrequencyColorMap,
  buildLastEditorColorMap,
  frequencyColor,
  noDataColor,
  otherSessionColor,
  selectEmphasizedNodes,
  SESSION_COLORS,
  visibleTopSessions,
} from './authorHeatmapColors';
import {
  isOverrideColorBy,
  mountCodeGraphCanvas,
  type CodeGraphColorBy,
  type CodeGraphGhostEdge,
  type CodeGraphGhostEdgeGranularity,
} from './codeGraphCanvas';
import type { CodeGraphDiff, CodeGraphNodeDiffStatus } from '@anytime-markdown/trail-core/codeGraphDiff';
import { diffNodeColor } from './stateReplayColors';

/** t 未注入時の日本語フォールバック（パネルは元来 JP ハードコード）。 */
const COLOR_BY_FALLBACK: Record<string, string> = {
  'codeGraph.colorBy.label': '配色',
  'codeGraph.colorBy.community': 'コミュニティ',
  'codeGraph.colorBy.layer': '層',
  'codeGraph.colorBy.lastEditor': '最終編集者',
  'codeGraph.colorBy.editFrequency': '編集頻度',
  'codeGraph.authorHeatmap.other': 'その他',
  'codeGraph.authorHeatmap.noData': '記録なし',
  'codeGraph.authorHeatmap.sessionNote': '編集者はセッション（作業単位）で、個人ではありません',
  'codeGraph.authorHeatmap.emphasis': '太枠 = 単一セッションへの偏りが大きい',
  'codeGraph.authorHeatmap.coverage': '集計対象',
  'codeGraph.authorHeatmap.frequency.low': '低（1〜2 コミット）',
  'codeGraph.authorHeatmap.frequency.mid': '中（3〜8 コミット）',
  'codeGraph.authorHeatmap.frequency.high': '高（9 コミット以上）',
  'c4.layer.foundation': '基盤',
  'c4.layer.analysis': '解析',
  'c4.layer.data': '永続化',
  'c4.layer.serviceDomain': 'ドメイン/AI',
  'c4.layer.serviceServer': 'サーバ',
  'c4.layer.integration': '連携',
  'c4.layer.presentationUi': 'UI',
  'c4.layer.presentationExtension': '拡張',
  'c4.layer.utility': 'ユーティリティ',
  'codeGraph.scrubber.label': '時点',
  'codeGraph.scrubber.current': '現在',
  'codeGraph.scrubber.viewing': '表示中',
  'codeGraph.scrubber.legendAvailable': '生成済み',
  'codeGraph.scrubber.legendMissing': '未生成',
  'codeGraph.scrubber.notGenerated': 'この時点のグラフはまだ生成されていません。',
  'codeGraph.scrubber.generate': 'このリリースのグラフを生成',
  'codeGraph.scrubber.generating': '生成中',
  'codeGraph.scrubber.generateFailed': '生成に失敗しました',
  'codeGraph.scrubber.generatingOther': '別の時点を生成中です。完了までお待ちください。',
  'codeGraph.scrubber.busy': '別の解析が実行中です。完了後に再試行してください。',
  'codeGraph.scrubber.heatmapDisabled': '過去の時点では最終編集者・編集頻度の配色は使えません',
  'codeGraph.colorBy.diff': '前版との差分',
  'codeGraph.diff.added': '追加',
  'codeGraph.diff.removed': '削除',
  'codeGraph.diff.changed': '依存変化',
  'codeGraph.diff.unchanged': '変化なし',
  'codeGraph.diff.baseline': 'ベースライン',
  'codeGraph.diff.showRemoved': '削除を表示',
  'codeGraph.diff.ghostNote': '削除ノードの位置はベースライン時点のもので、現在の配置とは一致しません',
  'codeGraph.diff.baselineMissing': '1 つ前の時点のグラフが未生成です。',
  'codeGraph.diff.generateBaseline': 'ベースラインのグラフを生成',
  'codeGraph.diff.noBaseline': '最古の時点には前版がありません',
  'codeGraph.scrubber.zoomToCommits': 'コミットへズーム',
  'codeGraph.scrubber.zoomToReleases': 'リリースへ戻す',
  'codeGraph.scrubber.zoomUnavailable': '「現在」からはズームできません。リリースを選んでください。',
  'codeGraph.scrubber.granularityRelease': 'リリース粒度',
  'codeGraph.scrubber.granularityCommit': 'コミット粒度',
  'codeGraph.scrubber.rangeOldest': '最古',
  'codeGraph.scrubber.generateCommit': 'このコミットのグラフを生成',
  'codeGraph.scrubber.commitsEmpty': 'この区間に Trail が把握しているコミットはありません。',
  'codeGraph.scrubber.commitsLoading': 'コミット一覧を取得中です。',
  'codeGraph.scrubber.commitsError': 'コミット一覧を取得できませんでした。',
  'codeGraph.scrubber.retry': '再試行',
};

/** 「現在のスナップショット」を表す予約タグ。`/api/code-graph` の release パラメタと同値。 */
export const CURRENT_RELEASE = 'current';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CodeGraphPanelProps {
  /** null = loading / no graph yet; string = error message; CodeGraph = loaded */
  readonly graphState:
    | { readonly status: 'loading' }
    | { readonly status: 'error'; readonly message: string }
    | { readonly status: 'no-repo' }
    | { readonly status: 'no-graph' }
    | { readonly status: 'ready'; readonly graph: CodeGraph };
  readonly highlightedNodes: ReadonlySet<string>;
  readonly selectedNode: CodeGraphNode | null;
  readonly showSubagentDirectionalHint: boolean;
  readonly ghostEdges: ReadonlyArray<CodeGraphGhostEdge>;
  readonly ghostEdgesEnabled: boolean;
  readonly ghostEdgeGranularity: CodeGraphGhostEdgeGranularity;
  readonly isDark?: boolean;
  readonly onSearch: (query: string) => void;
  readonly onRefetch: () => void;
  readonly onNodeClick: (nodeId: string) => void;
  /** community summaries for the detail panel */
  readonly communitySummaries?: Record<string, { name: string; summary?: string }>;
  /** i18n translator（未指定時は JP フォールバック）。配色トグル・層凡例で使用。 */
  readonly t?: (key: string) => string;
  /**
   * Author Heatmap の集計（`lastEditor` / `editFrequency` 配色で使用）。
   * 取得中・未取得は null。取得は React ラッパ側が担う。
   */
  readonly authorHeatmap?: AuthorHeatmapViewData | null;
  /** 配色方式が変わったときの通知（ラッパが集計取得の要否を判断する）。 */
  readonly onColorByChange?: (colorBy: CodeGraphColorBy) => void;
  /**
   * Time Scrubber の目盛り。`released_at` 昇順で渡す（並べ替えはサーバの責務）。
   * 空配列のときスクラバは表示しない。
   */
  readonly releases?: readonly CodeGraphReleaseTick[];
  /** 選択中の時点。`CURRENT_RELEASE` または `releases` に含まれるタグ。 */
  readonly selectedRelease?: string;
  /** 履歴版グラフのオンデマンド生成の状態。 */
  readonly generateState?: CodeGraphGenerateState;
  /** 目盛りを動かして確定したときの通知（ドラッグ中は発火しない）。 */
  readonly onReleaseChange?: (release: string) => void;
  /** 未生成タグの生成要求。明示操作でのみ呼ばれる（スライダー操作では呼ばない）。 */
  readonly onGenerateRelease?: (tag: string) => void;
  /**
   * スクラバの粒度（Snapshot per Commit）。既定はリリース粒度。
   * コミット粒度では目盛りが `commits` に切り替わり、「現在」の目盛りは並ばない
   * （コミット粒度は `前のリリース..選択リリース` の閉じた区間である）。
   */
  readonly granularity?: CodeGraphScrubberGranularity;
  /** コミット粒度の目盛り。`committed_at` 昇順で渡す（並べ替えはサーバの責務）。 */
  readonly commits?: readonly CodeGraphCommitTick[];
  /** 選択中のコミット SHA。コミット粒度でのみ使う。 */
  readonly selectedCommit?: string | null;
  /** ズーム中の区間。`fromTag` が null なら最古から。粒度ラベルに出す。 */
  readonly commitRange?: { readonly fromTag: string | null; readonly toTag: string } | null;
  /** コミット粒度へのズーム要求。 */
  readonly onZoomToCommits?: () => void;
  /** リリース粒度への復帰要求。 */
  readonly onZoomToReleases?: () => void;
  /** コミット目盛りを確定したときの通知（ドラッグ中は発火しない）。 */
  readonly onCommitChange?: (sha: string) => void;
  /** 未生成コミットの生成要求。明示操作でのみ呼ばれる。 */
  readonly onGenerateCommit?: (sha: string) => void;
  /** コミット一覧を取得中か。目盛りが空の理由を「取得中」と「本当に空」で区別するために要る。 */
  readonly commitsLoading?: boolean;
  /** コミット一覧の取得失敗。null は失敗していない。空の理由を「取得できなかった」と区別する。 */
  readonly commitsError?: string | null;
  /** コミット一覧の再取得要求（取得失敗時の再試行）。 */
  readonly onRefetchCommits?: () => void;
  /**
   * State Replay の差分（`colorBy: 'diff'` で使用）。ベースライン取得前・取得失敗時は null。
   * 計算は React ラッパが `diffCodeGraphs` で行う（描画層は結果だけ受け取る）。
   */
  readonly diff?: CodeGraphDiff | null;
  /**
   * 差分のベースライン（1 つ前の目盛り）。null は「前版が無い」＝最古の時点、または一覧が空。
   * `hasGraph` が false ならグラフ未生成で、生成を要求できる。
   */
  readonly baseline?: CodeGraphBaselineTick | null;
}

/** スクラバの粒度。 */
export type CodeGraphScrubberGranularity = 'release' | 'commit';

/** Time Scrubber の目盛り 1 件。 */
export interface CodeGraphReleaseTick {
  readonly tag: string;
  readonly releasedAt: string;
  readonly hasGraph: boolean;
}

/** コミット粒度の目盛り 1 件（`GET /api/code-graph/commits` の応答要素）。 */
export interface CodeGraphCommitTick {
  readonly sha: string;
  readonly shortSha: string;
  readonly committedAt: string;
  readonly subject: string;
  readonly hasGraph: boolean;
}

/**
 * 差分のベースラインとなる時点。
 *
 * `tag` は生成要求に使う識別子（リリース粒度ではタグ、コミット粒度では完全な SHA）。
 * 表示は `label` を優先する（40 文字の SHA をそのまま凡例へ出さないため）。
 */
export interface CodeGraphBaselineTick {
  readonly tag: string;
  readonly hasGraph: boolean;
  readonly label?: string;
}

/** オンデマンド生成の状態。`tag` は要求中・失敗中のタグ。 */
export type CodeGraphGenerateState =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly tag: string; readonly percent?: number }
  | { readonly status: 'error'; readonly tag: string; readonly message: string };

/** Author Heatmap の描画に必要な集計（`/api/author-heatmap` の応答から作る）。 */
export interface AuthorHeatmapViewData {
  readonly entries: readonly AuthorHeatmapEntry[];
  readonly topSessions: readonly string[];
  readonly coveredNodes: number;
  readonly totalNodes: number;
}

/** セッション ID は UUID で長いため、凡例では先頭 8 文字だけ出す。 */
function shortSessionId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

// ---------------------------------------------------------------------------
// mount
// ---------------------------------------------------------------------------

export function mountCodeGraphPanel(
  container: HTMLElement,
  initial: CodeGraphPanelProps,
): VanillaViewHandle<CodeGraphPanelProps> {
  let props = initial;
  let destroyed = false;

  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;';
  container.appendChild(root);

  // --- Time Scrubber ---
  // ツールバーとは別の行に置く。ツールバーは ready のときだけ表示するが、スクラバは
  // 未生成の時点を選んでいる間も残らないと「選んだ瞬間に戻る手段が消える」ため、
  // 可視性の制御を分ける（機能仕様書 §4.4）。
  const scrubberEl = document.createElement('div');
  scrubberEl.setAttribute('data-testid', 'code-graph-scrubber');
  scrubberEl.style.cssText =
    'padding:8px;display:none;flex-direction:column;gap:4px;' +
    'border-bottom:1px solid var(--am-color-divider);flex-shrink:0;';
  root.appendChild(scrubberEl);

  const scrubberRow = document.createElement('div');
  scrubberRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
  scrubberEl.appendChild(scrubberRow);

  const scrubberLabel = document.createElement('span');
  scrubberLabel.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);flex-shrink:0;';
  scrubberRow.appendChild(scrubberLabel);

  const sliderWrap = document.createElement('div');
  sliderWrap.style.cssText = 'position:relative;flex:1;min-width:160px;';
  scrubberRow.appendChild(sliderWrap);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.step = '1';
  slider.style.cssText = 'width:100%;display:block;';
  sliderWrap.appendChild(slider);

  // 在庫の有無を示す目盛り帯。スライダーと同じ 0〜N の等間隔で並べる。
  const tickStrip = document.createElement('div');
  tickStrip.setAttribute('aria-hidden', 'true');
  tickStrip.style.cssText = 'position:relative;height:6px;margin:0 8px;';
  sliderWrap.appendChild(tickStrip);

  const scrubberValue = document.createElement('span');
  scrubberValue.setAttribute('data-testid', 'code-graph-scrubber-value');
  scrubberValue.style.cssText = 'font-size:0.75rem;font-variant-numeric:tabular-nums;flex-shrink:0;';
  scrubberRow.appendChild(scrubberValue);

  // 粒度（リリース / コミット）の切替と区間表示。スライダーの行とは分ける
  // （ズーム操作は目盛りを選ぶ操作とは別の軸で、同じ行に混ぜると押し間違える）。
  const zoomRow = document.createElement('div');
  zoomRow.setAttribute('data-testid', 'code-graph-scrubber-zoom');
  zoomRow.style.cssText =
    'display:flex;align-items:center;gap:8px;font-size:0.7rem;color:var(--am-color-text-secondary);';
  scrubberEl.appendChild(zoomRow);

  const zoomButton = document.createElement('button');
  zoomButton.style.cssText =
    'padding:2px 8px;border:1px solid var(--am-color-divider);border-radius:4px;' +
    'background:transparent;color:inherit;cursor:pointer;font-size:0.7rem;flex-shrink:0;';
  zoomButton.addEventListener('click', () => {
    if (zoomButton.disabled) return;
    if (granularity() === 'commit') props.onZoomToReleases?.();
    else props.onZoomToCommits?.();
  });
  zoomRow.appendChild(zoomButton);

  const zoomLabel = document.createElement('span');
  zoomLabel.setAttribute('data-testid', 'code-graph-scrubber-granularity');
  zoomRow.appendChild(zoomLabel);

  const scrubberLegend = document.createElement('div');
  scrubberLegend.setAttribute('data-testid', 'code-graph-scrubber-legend');
  scrubberLegend.style.cssText =
    'display:flex;gap:12px;align-items:center;font-size:0.65rem;color:var(--am-color-text-secondary);';
  scrubberEl.appendChild(scrubberLegend);

  // --- Search toolbar ---
  const toolbar = document.createElement('div');
  toolbar.style.cssText =
    'padding:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;' +
    'border-bottom:1px solid var(--am-color-divider);flex-shrink:0;';
  root.appendChild(toolbar);

  let searchQuery = '';

  const searchFieldHandle = createTextField({
    value: '',
    placeholder: '検索...',
    size: 'small',
    onChange: (e) => {
      searchQuery = (e.target as HTMLInputElement).value;
    },
  });
  searchFieldHandle.input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') props.onSearch(searchQuery);
  });
  searchFieldHandle.el.style.minWidth = '200px';
  toolbar.appendChild(searchFieldHandle.el);

  const { el: searchBtn } = createButton({
    label: '検索',
    variant: 'outlined',
    size: 'small',
    onClick: () => props.onSearch(searchQuery),
  });
  toolbar.appendChild(searchBtn);

  // --- Color-by toggle (community / layer) ---
  let colorBy: CodeGraphColorBy = 'community';
  const tr = (key: string): string => props.t?.(key) ?? COLOR_BY_FALLBACK[key] ?? key;

  const colorByWrap = document.createElement('label');
  colorByWrap.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:0.75rem;color:var(--am-color-text-secondary);';
  const colorByLabel = document.createElement('span');
  colorByWrap.appendChild(colorByLabel);
  const colorBySelect = document.createElement('select');
  colorBySelect.style.cssText =
    'font-size:0.75rem;padding:2px 4px;background:transparent;color:inherit;' +
    'border:1px solid var(--am-color-divider);border-radius:4px;';
  const optCommunity = document.createElement('option');
  optCommunity.value = 'community';
  const optLayer = document.createElement('option');
  optLayer.value = 'layer';
  const optLastEditor = document.createElement('option');
  optLastEditor.value = 'lastEditor';
  const optEditFrequency = document.createElement('option');
  optEditFrequency.value = 'editFrequency';
  const optDiff = document.createElement('option');
  optDiff.value = 'diff';
  colorBySelect.append(optCommunity, optLayer, optLastEditor, optEditFrequency, optDiff);

  const COLOR_BY_VALUES: readonly CodeGraphColorBy[] = [
    'community',
    'layer',
    'lastEditor',
    'editFrequency',
    'diff',
  ];
  colorBySelect.addEventListener('change', () => {
    const selected = COLOR_BY_VALUES.find((v) => v === colorBySelect.value) ?? 'community';
    if (selected === colorBy) return;
    colorBy = selected;
    props.onColorByChange?.(colorBy);
    renderState();
  });
  colorByWrap.appendChild(colorBySelect);
  toolbar.appendChild(colorByWrap);

  // --- Layer legend (shown only when colorBy === 'layer') ---
  const legendEl = document.createElement('div');
  legendEl.setAttribute('data-testid', 'code-graph-legend');
  legendEl.style.cssText =
    'display:none;gap:8px;align-items:center;flex-wrap:wrap;font-size:0.65rem;' +
    'color:var(--am-color-text-secondary);';
  toolbar.appendChild(legendEl);

  function renderLegend(): void {
    legendEl.replaceChildren();
    for (const layer of ARCHITECTURE_LAYER_ORDER) {
      const item = document.createElement('span');
      item.style.cssText = 'display:inline-flex;align-items:center;gap:3px;';
      const sw = document.createElement('span');
      sw.style.cssText =
        `width:10px;height:10px;border-radius:2px;flex-shrink:0;background:${layerColor(layer, props.isDark ?? false)};`;
      const txt = document.createElement('span');
      txt.textContent = tr(LAYER_LABEL_KEYS[layer]);
      item.append(sw, txt);
      legendEl.appendChild(item);
    }
  }

  /** 凡例に色見本 + ラベルの 1 項目を足す。 */
  function appendLegendItem(color: string, text: string, emphasized = false): void {
    const item = document.createElement('span');
    item.style.cssText = 'display:inline-flex;align-items:center;gap:3px;';
    const sw = document.createElement('span');
    sw.style.cssText =
      `width:10px;height:10px;border-radius:2px;flex-shrink:0;background:${color};` +
      (emphasized ? 'outline:2px solid var(--am-color-text-primary);outline-offset:1px;' : '');
    const txt = document.createElement('span');
    txt.textContent = text;
    item.append(sw, txt);
    legendEl.appendChild(item);
  }

  /** 凡例の末尾に説明文（色見本なし）を足す。 */
  function appendLegendNote(text: string): void {
    const note = document.createElement('span');
    note.style.cssText = 'color:var(--am-color-text-secondary);';
    note.textContent = text;
    legendEl.appendChild(note);
  }

  function renderAuthorHeatmapLegend(): void {
    legendEl.replaceChildren();
    const data = props.authorHeatmap;
    const isDark = props.isDark ?? false;

    if (colorBy === 'lastEditor') {
      const topSessions = visibleTopSessions(data?.topSessions ?? []);
      topSessions.forEach((sessionId, i) => {
        appendLegendItem(SESSION_COLORS[i], shortSessionId(sessionId));
      });
      if (topSessions.length > 0) {
        appendLegendItem(otherSessionColor(isDark), tr('codeGraph.authorHeatmap.other'));
      }
    } else {
      appendLegendItem(frequencyColor('low', isDark), tr('codeGraph.authorHeatmap.frequency.low'));
      appendLegendItem(frequencyColor('mid', isDark), tr('codeGraph.authorHeatmap.frequency.mid'));
      appendLegendItem(frequencyColor('high', isDark), tr('codeGraph.authorHeatmap.frequency.high'));
    }

    appendLegendItem(noDataColor(isDark), tr('codeGraph.authorHeatmap.noData'));

    if (colorBy === 'lastEditor') {
      appendLegendNote(tr('codeGraph.authorHeatmap.emphasis'));
      appendLegendNote(tr('codeGraph.authorHeatmap.sessionNote'));
    }

    // 被覆率は応答から算出する（設計書の実測値を焼き込まない）。
    if (data && data.totalNodes > 0) {
      const percent = Math.round((data.coveredNodes / data.totalNodes) * 100);
      appendLegendNote(
        `${tr('codeGraph.authorHeatmap.coverage')}: ${data.coveredNodes} / ${data.totalNodes} (${percent}%)`,
      );
    }
  }

  // -------------------------------------------------------------------------
  //  Time Scrubber
  // -------------------------------------------------------------------------

  interface ScrubberTick {
    readonly tag: string;
    readonly label: string;
    readonly hasGraph: boolean;
  }

  function granularity(): CodeGraphScrubberGranularity {
    return props.granularity ?? 'release';
  }

  /** コミットの subject は 1 行でも長い。目盛りラベルとして読める長さで切る。 */
  const COMMIT_SUBJECT_MAX = 40;

  function commitTickLabel(c: CodeGraphCommitTick): string {
    const subject =
      c.subject.length > COMMIT_SUBJECT_MAX ? `${c.subject.slice(0, COMMIT_SUBJECT_MAX)}…` : c.subject;
    return subject ? `${c.shortSha} ${subject}` : c.shortSha;
  }

  /**
   * 目盛り列。並べ替えはしない（サーバの昇順をそのまま使う）。
   *
   * リリース粒度の右端は常に「現在」。コミット粒度では「現在」を並べない
   * （区間が `前のリリース..選択リリース` で閉じており、その外側だから）。
   */
  function scrubberTicks(): ScrubberTick[] {
    if (granularity() === 'commit') {
      return (props.commits ?? []).map((c) => ({
        tag: c.sha,
        label: commitTickLabel(c),
        hasGraph: c.hasGraph,
      }));
    }
    const ticks: ScrubberTick[] = (props.releases ?? []).map((r) => ({
      tag: r.tag,
      // 日付は UTC の日付部分だけを出す（時刻まで出すと目盛りラベルが読めない）。
      label: `${r.tag} (${r.releasedAt.slice(0, 10)})`,
      hasGraph: r.hasGraph,
    }));
    ticks.push({ tag: CURRENT_RELEASE, label: tr('codeGraph.scrubber.current'), hasGraph: true });
    return ticks;
  }

  function selectedTickIndex(ticks: readonly ScrubberTick[]): number {
    const selected =
      granularity() === 'commit'
        ? (props.selectedCommit ?? '')
        : (props.selectedRelease ?? CURRENT_RELEASE);
    const index = ticks.findIndex((t) => t.tag === selected);
    // 一覧から消えたタグを選んだままにしない（機能仕様書 §4.2）。右端へ寄せる
    // （リリース粒度では「現在」、コミット粒度では区間の上端＝選択リリースに最も近い側）。
    return index >= 0 ? index : ticks.length - 1;
  }

  function applyScrubberValueText(ticks: readonly ScrubberTick[], index: number): void {
    const tick = ticks[index];
    if (!tick) return;
    const isCurrent = tick.tag === CURRENT_RELEASE;
    // 過去の時点を現在と取り違えないよう、選択中は常にタグと日付を出す（§4.5）。
    scrubberValue.textContent = isCurrent
      ? tick.label
      : `${tr('codeGraph.scrubber.viewing')}: ${tick.label}`;
    // 在庫の有無は目盛り帯の形と色だけで表しており、帯は aria-hidden である。
    // 読み上げ利用者が選ぶ前に生成済みか判別できるよう、読み上げ値へ載せる。
    slider.setAttribute(
      'aria-valuetext',
      tick.hasGraph ? tick.label : `${tick.label} — ${tr('codeGraph.scrubber.legendMissing')}`,
    );
  }

  function renderTickStrip(ticks: readonly ScrubberTick[]): void {
    tickStrip.replaceChildren();
    const last = ticks.length - 1;
    if (last <= 0) return;
    ticks.forEach((tick, i) => {
      const mark = document.createElement('span');
      const color = tick.hasGraph
        ? 'var(--am-color-primary-main)'
        : 'var(--am-color-text-secondary)';
      mark.style.cssText =
        `position:absolute;top:0;left:${(i / last) * 100}%;transform:translateX(-50%);` +
        `width:4px;height:4px;border-radius:50%;` +
        (tick.hasGraph ? `background:${color};` : `background:transparent;border:1px solid ${color};`);
      tickStrip.appendChild(mark);
    });
  }

  function renderScrubberLegend(): void {
    scrubberLegend.replaceChildren();
    const items: ReadonlyArray<{ filled: boolean; key: string }> = [
      { filled: true, key: 'codeGraph.scrubber.legendAvailable' },
      { filled: false, key: 'codeGraph.scrubber.legendMissing' },
    ];
    for (const item of items) {
      const wrap = document.createElement('span');
      wrap.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';
      const sw = document.createElement('span');
      const color = item.filled ? 'var(--am-color-primary-main)' : 'var(--am-color-text-secondary)';
      sw.style.cssText =
        'width:6px;height:6px;border-radius:50%;flex-shrink:0;' +
        (item.filled ? `background:${color};` : `border:1px solid ${color};`);
      const txt = document.createElement('span');
      txt.textContent = tr(item.key);
      wrap.append(sw, txt);
      scrubberLegend.appendChild(wrap);
    }
  }

  /** ズーム行（粒度の切替ボタンと区間ラベル）。 */
  function renderZoomRow(): void {
    const isCommit = granularity() === 'commit';
    zoomButton.textContent = tr(
      isCommit ? 'codeGraph.scrubber.zoomToReleases' : 'codeGraph.scrubber.zoomToCommits',
    );
    // 「現在」は特定のリリースではないため区間の上端にできない。押せるように見せない。
    const zoomable = isCommit || (props.selectedRelease ?? CURRENT_RELEASE) !== CURRENT_RELEASE;
    zoomButton.disabled = !zoomable;
    zoomButton.style.opacity = zoomable ? '1' : '0.5';
    zoomButton.style.cursor = zoomable ? 'pointer' : 'not-allowed';
    zoomButton.title = zoomable ? '' : tr('codeGraph.scrubber.zoomUnavailable');

    if (!isCommit) {
      zoomLabel.textContent = tr('codeGraph.scrubber.granularityRelease');
      return;
    }
    const range = props.commitRange ?? null;
    const from = range?.fromTag ?? tr('codeGraph.scrubber.rangeOldest');
    const to = range?.toTag ?? '';
    zoomLabel.textContent = `${tr('codeGraph.scrubber.granularityCommit')}: ${from} → ${to}`;
  }

  /** コミット粒度で目盛りが空のときの表示。取得失敗 / 取得中 / 本当に空を区別する。 */
  function renderEmptyCommitsNotice(): void {
    scrubberLegend.replaceChildren();
    if (props.commitsError) {
      scrubberValue.textContent = tr('codeGraph.scrubber.commitsError');
      const retry = document.createElement('button');
      retry.setAttribute('data-testid', 'code-graph-commits-retry');
      retry.textContent = tr('codeGraph.scrubber.retry');
      retry.style.cssText =
        'padding:2px 8px;border:1px solid var(--am-color-divider);border-radius:4px;' +
        'background:transparent;color:inherit;cursor:pointer;font-size:0.65rem;';
      retry.addEventListener('click', () => props.onRefetchCommits?.());
      scrubberLegend.appendChild(retry);
      return;
    }
    scrubberValue.textContent = tr(
      props.commitsLoading ? 'codeGraph.scrubber.commitsLoading' : 'codeGraph.scrubber.commitsEmpty',
    );
  }

  function renderScrubber(): void {
    const isCommit = granularity() === 'commit';
    const ticks = scrubberTicks();
    if (!isCommit && (props.releases ?? []).length === 0) {
      // 一覧が取れないときはスクラバを出さない。グラフ描画自体は生かす（§受け入れ基準 12）。
      scrubberEl.style.display = 'none';
      return;
    }
    scrubberEl.style.display = 'flex';
    renderZoomRow();

    // コミット粒度で区間が空でも、スクラバごと消すと「リリースへ戻す」手段まで消える。
    // 目盛りだけを畳み、戻る導線は残す。
    const empty = ticks.length === 0;
    sliderWrap.style.display = empty ? 'none' : '';
    if (empty) {
      scrubberLabel.textContent = tr('codeGraph.scrubber.label');
      // 目盛りが無い理由は 3 つある（取得失敗 / 取得中 / 本当に空）。同じ断定的な文言に
      // 潰すと、取得できなかっただけの状態が「コミットが無い」という誤った事実になる。
      renderEmptyCommitsNotice();
      return;
    }

    const index = selectedTickIndex(ticks);
    slider.max = String(ticks.length - 1);
    slider.value = String(index);
    slider.setAttribute('aria-label', tr('codeGraph.scrubber.label'));
    scrubberLabel.textContent = tr('codeGraph.scrubber.label');
    applyScrubberValueText(ticks, index);
    renderTickStrip(ticks);
    renderScrubberLegend();
    if (isCommit || ticks[index]?.tag !== CURRENT_RELEASE) {
      const note = document.createElement('span');
      note.textContent = tr('codeGraph.scrubber.heatmapDisabled');
      scrubberLegend.appendChild(note);
    }
  }

  // ドラッグ中（input）はラベルだけ更新し、確定（change）で初めて取得を要求する。
  // input で通知すると端から端へ滑らせただけで目盛りの数だけ fetch が走る。
  slider.addEventListener('input', () => {
    applyScrubberValueText(scrubberTicks(), Number(slider.value));
  });
  slider.addEventListener('change', () => {
    const ticks = scrubberTicks();
    const tick = ticks[Number(slider.value)];
    if (!tick) return;
    if (granularity() === 'commit') props.onCommitChange?.(tick.tag);
    else props.onReleaseChange?.(tick.tag);
  });

  /**
   * 未生成の時点の生成要求。粒度で宛先が変わる（リリースはタグ、コミットは SHA）。
   * 描画層は「どの時点か」だけを返し、どのエンドポイントを叩くかはラッパが決める。
   */
  function requestGenerate(id: string): void {
    if (granularity() === 'commit') props.onGenerateCommit?.(id);
    else props.onGenerateRelease?.(id);
  }

  /**
   * 配色マップのメモ化。
   *
   * canvas は props を同一性で比較して sigma を再構築するため、renderState のたびに
   * 新しい Map を渡すと毎回フルレイアウトが走る。入力（集計・配色方式・テーマ）が
   * 変わったときだけ作り直す。
   */
  type HeatmapVisual = {
    readonly overrides: ReadonlyMap<string, string>;
    readonly emphasized: ReadonlySet<string> | null;
  };
  let visualCache:
    | { data: AuthorHeatmapViewData; colorBy: CodeGraphColorBy; isDark: boolean; visual: HeatmapVisual }
    | null = null;

  function resolveHeatmapVisual(
    data: AuthorHeatmapViewData | null,
    mode: CodeGraphColorBy,
    isDark: boolean,
  ): HeatmapVisual | null {
    if (!data) return null;
    if (
      visualCache &&
      visualCache.data === data &&
      visualCache.colorBy === mode &&
      visualCache.isDark === isDark
    ) {
      return visualCache.visual;
    }
    const visual: HeatmapVisual = {
      overrides:
        mode === 'lastEditor'
          ? buildLastEditorColorMap(data.entries, data.topSessions, isDark)
          : buildEditFrequencyColorMap(data.entries, isDark),
      emphasized: mode === 'lastEditor' ? selectEmphasizedNodes(data.entries) : null,
    };
    visualCache = { data, colorBy: mode, isDark, visual };
    return visual;
  }

  function refreshColorByLabels(): void {
    colorByLabel.textContent = tr('codeGraph.colorBy.label');
    optCommunity.textContent = tr('codeGraph.colorBy.community');
    optLayer.textContent = tr('codeGraph.colorBy.layer');
    optLastEditor.textContent = tr('codeGraph.colorBy.lastEditor');
    optEditFrequency.textContent = tr('codeGraph.colorBy.editFrequency');
    optDiff.textContent = tr('codeGraph.colorBy.diff');
  }

  // -------------------------------------------------------------------------
  //  State Replay（前版との差分）
  // -------------------------------------------------------------------------

  /** 削除ノードをゴーストとして描くか。既定 ON（削除が見えないと差分表示が成立しない）。 */
  let showRemovedNodes = true;

  const DIFF_LEGEND_ORDER: readonly CodeGraphNodeDiffStatus[] = [
    'added',
    'removed',
    'changed',
    'unchanged',
  ];
  const DIFF_LEGEND_KEYS: Record<CodeGraphNodeDiffStatus, string> = {
    added: 'codeGraph.diff.added',
    removed: 'codeGraph.diff.removed',
    changed: 'codeGraph.diff.changed',
    unchanged: 'codeGraph.diff.unchanged',
  };

  function appendShowRemovedToggle(): void {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:3px;cursor:pointer;';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = showRemovedNodes;
    box.setAttribute('data-testid', 'code-graph-diff-show-removed');
    box.addEventListener('change', () => {
      showRemovedNodes = box.checked;
      renderState();
    });
    const txt = document.createElement('span');
    txt.textContent = tr('codeGraph.diff.showRemoved');
    wrap.append(box, txt);
    legendEl.appendChild(wrap);
  }

  function appendBaselineGenerateButton(tag: string): void {
    const gen = props.generateState ?? { status: 'idle' as const };
    // 解析は 1 本ずつしか走らない。実行中は押しても 409 で弾かれるだけなので、
    // 押せるように見せない（Time Scrubber の生成ボタンと同じ扱い）。
    const running = gen.status === 'running';

    if (gen.status === 'error' && gen.tag === tag) {
      appendLegendNote(`${tr('codeGraph.scrubber.generateFailed')}: ${gen.message}`);
    }

    if (running) {
      const percent = gen.percent === undefined ? '' : ` ${gen.percent}%`;
      appendLegendNote(`${tr('codeGraph.scrubber.generating')}${percent}`);
      return;
    }

    // 既存の Time Scrubber の生成ボタンと同じ素 button で揃える（ui-core の createButton は
    // ハンドルを返すため、凡例のインライン要素として扱うにはこちらが素直）。
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'code-graph-diff-generate-baseline');
    btn.textContent = tr('codeGraph.diff.generateBaseline');
    btn.style.cssText =
      'padding:2px 8px;background:var(--am-color-primary-main);color:#fff;border:none;' +
      'border-radius:4px;cursor:pointer;font-size:0.7rem;';
    btn.addEventListener('click', () => requestGenerate(tag));
    legendEl.appendChild(btn);
  }

  function renderDiffLegend(): void {
    legendEl.replaceChildren();
    const isDark = props.isDark ?? false;
    const baseline = props.baseline ?? null;

    if (baseline) {
      appendLegendNote(`${tr('codeGraph.diff.baseline')}: ${baseline.label ?? baseline.tag}`);
    }

    // 色を読めなくても差分の規模が分かるよう、区分ごとに件数を数値で出す（仕様 §4.4）。
    const counts = props.diff?.counts ?? null;
    for (const status of DIFF_LEGEND_ORDER) {
      const label = tr(DIFF_LEGEND_KEYS[status]);
      const text = counts ? `${label}: ${counts[status]}` : label;
      appendLegendItem(diffNodeColor(status, isDark), text, status === 'changed');
    }

    appendShowRemovedToggle();
    appendLegendNote(tr('codeGraph.diff.ghostNote'));

    // ベースラインが未生成なら差分は出せない。何が足りないかと復旧手段を同時に出す。
    if (baseline && !baseline.hasGraph) {
      appendLegendNote(tr('codeGraph.diff.baselineMissing'));
      appendBaselineGenerateButton(baseline.tag);
    }
  }

  // --- Hint alert ---
  // role="alert" + info アイコンで a11y を担保しつつ、従来の subtle な見た目（薄い info 背景 +
  // info 文字色）を維持する（createAlert の filled banner とは意図的に異なる軽量表示）。
  const hintEl = document.createElement('div');
  hintEl.setAttribute('role', 'alert');
  hintEl.style.cssText =
    'margin:4px 8px;padding:4px 12px;background:var(--am-color-info-bg,rgba(66,165,245,0.12));' +
    'border-radius:4px;font-size:0.75rem;color:var(--am-color-info-main,#42A5F5);display:none;' +
    'align-items:center;gap:6px;';
  const hintIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  hintIcon.setAttribute('viewBox', '0 0 24 24');
  hintIcon.setAttribute('aria-hidden', 'true');
  hintIcon.style.cssText = 'width:16px;height:16px;flex-shrink:0;fill:currentColor;';
  const hintIconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  hintIconPath.setAttribute('d', 'M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z');
  hintIcon.appendChild(hintIconPath);
  const hintText = document.createElement('span');
  hintText.textContent =
    'subagent 粒度では複数の subagent_type が共通ファイルを触っていないと方向性（矢印）は出ません。' +
    '現在のデータは対称的なため全エッジが無向です。期間（windowDays）を伸ばすか、' +
    '別の subagent_type を含むセッションが取り込まれているか確認してください。';
  hintEl.append(hintIcon, hintText);
  root.appendChild(hintEl);

  // --- Body (canvas + detail) ---
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex:1;overflow:hidden;';
  root.appendChild(body);

  // Canvas pane placeholder (replaced by content)
  const canvasPane = document.createElement('div');
  canvasPane.style.cssText = 'flex:1;position:relative;overflow:hidden;';
  body.appendChild(canvasPane);

  // Detail sidebar
  const detailPane = document.createElement('div');
  detailPane.style.cssText =
    'width:260px;padding:16px;border-left:1px solid var(--am-color-divider);overflow:auto;display:none;';
  body.appendChild(detailPane);

  // Graph canvas handle (null when not in ready state)
  let canvasHandle: VanillaViewHandle<Parameters<typeof mountCodeGraphCanvas>[1]> | null = null;

  // Placeholder elements for loading/error/etc states
  let placeholderEl: HTMLElement | null = null;

  function clearCanvas(): void {
    canvasHandle?.destroy();
    canvasHandle = null;
    placeholderEl?.remove();
    placeholderEl = null;
  }

  function showPlaceholder(html: string): void {
    clearCanvas();
    const el = document.createElement('div');
    el.style.cssText = 'padding:24px;font-size:0.875rem;';
    el.innerHTML = html;
    canvasPane.appendChild(el);
    placeholderEl = el;
  }

  /** 外部由来テキスト（エラーメッセージ等）を安全に表示する（innerHTML を使わない）。 */
  function showPlaceholderText(text: string, color: string): void {
    clearCanvas();
    const el = document.createElement('div');
    el.style.cssText = `padding:24px;font-size:0.875rem;color:${color};`;
    el.textContent = text;
    canvasPane.appendChild(el);
    placeholderEl = el;
  }

  /**
   * 未生成のリリースを選んでいるときの表示。
   *
   * 生成は明示操作でのみ行う（スライダー操作で自動生成しない）。実行中は
   * 他の時点を選べるようスクラバは残したまま、この領域だけを差し替える。
   */
  function renderMissingRelease(tag: string, label = tag): void {
    clearCanvas();
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'code-graph-missing-release');
    el.style.cssText = 'padding:24px;font-size:0.875rem;display:flex;flex-direction:column;gap:8px;align-items:flex-start;';

    const gen = props.generateState ?? { status: 'idle' as const };
    // 実行中はタグを問わずボタンを出さない。解析は 1 本ずつしか走らず（サーバは 409 を返す）、
    // 別タグの要求は必ず失敗した上に先行要求の帰結を上書きして消す。
    const running = gen.status === 'running';
    const runningThisTag = running && gen.tag === tag;
    const failed = gen.status === 'error' && gen.tag === tag;

    const message = document.createElement('div');
    if (runningThisTag) {
      const percent = gen.status === 'running' && typeof gen.percent === 'number' ? ` ${gen.percent}%` : '';
      message.textContent = `${tr('codeGraph.scrubber.generating')}: ${label}${percent}`;
    } else if (running) {
      message.textContent = `${label} — ${tr('codeGraph.scrubber.generatingOther')}`;
    } else {
      message.textContent = `${label} — ${tr('codeGraph.scrubber.notGenerated')}`;
    }
    el.appendChild(message);

    if (failed) {
      const err = document.createElement('div');
      err.style.cssText = 'color:var(--am-color-error-main);';
      err.textContent = `${tr('codeGraph.scrubber.generateFailed')}: ${gen.message}`;
      el.appendChild(err);
    }

    if (!running) {
      const btn = document.createElement('button');
      btn.setAttribute('data-testid', 'code-graph-generate-release');
      btn.textContent = tr(
        granularity() === 'commit' ? 'codeGraph.scrubber.generateCommit' : 'codeGraph.scrubber.generate',
      );
      btn.style.cssText =
        'padding:4px 12px;background:var(--am-color-primary-main);color:#fff;border:none;' +
        'border-radius:4px;cursor:pointer;font-size:0.875rem;';
      btn.addEventListener('click', () => requestGenerate(tag));
      el.appendChild(btn);
    }

    canvasPane.appendChild(el);
    placeholderEl = el;
  }

  function renderState(): void {
    if (destroyed) return;

    // Hint
    hintEl.style.display = props.showSubagentDirectionalHint ? 'flex' : 'none';

    // Time Scrubber（ツールバーの可視性とは独立に描く）
    renderScrubber();

    // Author Heatmap は現在のグラフのノード集合に対する集計なので、過去の時点では成立しない。
    // 選択中だった場合は community へ戻す（§4.5）。コミット粒度は定義上すべて過去の時点。
    const isCurrentRelease =
      granularity() === 'release' && (props.selectedRelease ?? CURRENT_RELEASE) === CURRENT_RELEASE;
    optLastEditor.disabled = !isCurrentRelease;
    optEditFrequency.disabled = !isCurrentRelease;
    if (!isCurrentRelease && isOverrideColorBy(colorBy)) {
      colorBy = 'community';
      props.onColorByChange?.(colorBy);
    }

    // 最古の時点には前版が無いので差分を取りようがない（§4.1）。
    const hasBaseline = (props.baseline ?? null) !== null;
    optDiff.disabled = !hasBaseline;
    optDiff.title = hasBaseline ? '' : tr('codeGraph.diff.noBaseline');
    if (!hasBaseline && colorBy === 'diff') {
      colorBy = 'community';
      props.onColorByChange?.(colorBy);
    }

    // Color-by toggle / layer legend
    refreshColorByLabels();
    colorBySelect.value = colorBy;
    if (colorBy === 'layer') {
      renderLegend();
      legendEl.style.display = 'flex';
    } else if (isOverrideColorBy(colorBy)) {
      renderAuthorHeatmapLegend();
      legendEl.style.display = 'flex';
    } else if (colorBy === 'diff') {
      renderDiffLegend();
      legendEl.style.display = 'flex';
    } else {
      legendEl.style.display = 'none';
    }

    const state = props.graphState;

    // 検索ツールバー / colorBy トグルは ready 状態でのみ表示（旧 React は非 ready で early return し
    // 非表示だった）。非 ready では詳細サイドバーもクリアして stale 表示を防ぐ。
    const isReady = state.status === 'ready';
    toolbar.style.display = isReady ? '' : 'none';
    if (!isReady) {
      detailPane.style.display = 'none';
      detailPane.replaceChildren();
    }

    if (state.status === 'loading') {
      showPlaceholder(
        '<div style="display:flex;align-items:center;gap:12px;">' +
          '<span style="display:inline-block;width:20px;height:20px;border:2px solid var(--am-color-primary-main);' +
          'border-top-color:transparent;border-radius:50%;animation:am-spin 0.6s linear infinite;"></span>' +
          '<span>グラフを読み込み中...</span></div>',
      );
      return;
    }

    if (state.status === 'error') {
      // state.message は外部由来の可能性があるため textContent で挿入（XSS 回避）。
      showPlaceholderText(state.message, 'var(--am-color-error-main)');
      // Add retry button
      const retryBtn = document.createElement('button');
      retryBtn.textContent = '再試行';
      retryBtn.style.cssText =
        'margin-top:8px;padding:4px 12px;border:1px solid currentColor;border-radius:4px;' +
        'cursor:pointer;background:transparent;color:inherit;font-size:0.875rem;';
      retryBtn.addEventListener('click', () => props.onRefetch());
      placeholderEl?.appendChild(retryBtn);
      return;
    }

    if (state.status === 'no-repo') {
      showPlaceholder('<span style="color:var(--am-color-text-secondary);">リポジトリを選択してください。</span>');
      return;
    }

    if (state.status === 'no-graph') {
      if (granularity() === 'commit') {
        const sha = props.selectedCommit ?? '';
        // 区間が空・未選択のときは「未生成」ではなく素の未生成表示へ落とす（生成対象が無い）。
        if (sha) {
          const tick = (props.commits ?? []).find((c) => c.sha === sha);
          renderMissingRelease(sha, tick ? commitTickLabel(tick) : sha.slice(0, 8));
          return;
        }
      }
      const selected = props.selectedRelease ?? CURRENT_RELEASE;
      if (granularity() === 'release' && selected !== CURRENT_RELEASE) {
        renderMissingRelease(selected);
        return;
      }
      showPlaceholder(
        '<div>グラフがまだ生成されていません。</div>',
      );
      const reloadBtn = document.createElement('button');
      reloadBtn.textContent = 'Reload';
      reloadBtn.style.cssText =
        'margin-top:8px;padding:4px 12px;background:var(--am-color-primary-main);' +
        'color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.875rem;';
      reloadBtn.addEventListener('click', () => props.onRefetch());
      placeholderEl?.appendChild(reloadBtn);
      return;
    }

    // Ready state
    const isDark = props.isDark ?? false;
    const heatmap = isOverrideColorBy(colorBy) ? props.authorHeatmap : null;
    const visual = resolveHeatmapVisual(heatmap ?? null, colorBy, isDark);
    const canvasProps = {
      graph: state.graph,
      highlightedNodes: props.highlightedNodes,
      onNodeClick: props.onNodeClick,
      isDark: props.isDark,
      ghostEdges: props.ghostEdgesEnabled ? props.ghostEdges : undefined,
      ghostEdgeGranularity: props.ghostEdgeGranularity,
      colorBy,
      nodeColorOverrides: visual?.overrides ?? null,
      emphasizedNodes: visual?.emphasized ?? null,
      neutralColor: noDataColor(isDark),
      diff: colorBy === 'diff' ? (props.diff ?? null) : null,
      showRemovedNodes,
    };

    if (!canvasHandle) {
      clearCanvas(); // clear any placeholder
      canvasHandle = mountCodeGraphCanvas(canvasPane, canvasProps);
    } else {
      canvasHandle.update(canvasProps);
    }

    // Detail panel
    renderDetail();
  }

  function renderDetail(): void {
    const node = props.selectedNode;
    if (!node) {
      detailPane.style.display = 'none';
      detailPane.replaceChildren();
      return;
    }

    detailPane.style.display = '';
    detailPane.replaceChildren();

    const label = document.createElement('div');
    label.style.cssText = 'font-size:0.875rem;font-weight:600;margin-bottom:4px;';
    label.textContent = node.label;
    detailPane.appendChild(label);

    const lines: Array<{ text: string; secondary?: boolean }> = [
      { text: node.id, secondary: true },
      { text: `リポジトリ: ${node.repo}` },
    ];

    const summary = props.communitySummaries?.[node.community];
    lines.push({
      text: `コミュニティ: ${summary ? `${summary.name} (${node.communityLabel})` : node.communityLabel}`,
    });

    if (summary?.summary) {
      lines.push({ text: summary.summary, secondary: true });
    }

    lines.push({ text: `被参照数: ${node.size}` });

    for (const line of lines) {
      const el = document.createElement('div');
      el.style.cssText =
        `font-size:0.75rem;display:block;` +
        (line.secondary ? 'color:var(--am-color-text-secondary);padding-left:0;' : '');
      el.textContent = line.text;
      detailPane.appendChild(el);
    }
  }

  // Add spin keyframe once per document (shared across instances — guarded by data attr).
  if (!document.head?.querySelector('style[data-am-spin]')) {
    const spinStyle = document.createElement('style');
    spinStyle.setAttribute('data-am-spin', '');
    spinStyle.textContent = '@keyframes am-spin{to{transform:rotate(360deg)}}';
    document.head?.appendChild(spinStyle);
  }

  renderState();

  return {
    update(next) {
      if (destroyed) return;
      props = next;
      renderState();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      canvasHandle?.destroy();
      canvasHandle = null;
      searchFieldHandle.destroy();
      // spin keyframe は文書共有のため remove しない（data-am-spin で重複防止済み）。
      root.remove();
    },
  };
}
