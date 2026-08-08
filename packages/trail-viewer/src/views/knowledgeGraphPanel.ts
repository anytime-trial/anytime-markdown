/**
 * knowledgeGraphPanel — 知識グラフタブ（trail-caravan-book の知識グラフを共起ネットワークで表示）。
 *
 * 画面設計書: spec/31.trail/02.trail-viewer/trail-viewer-screen/trail-viewer-screen-knowledge-graph.ja.md
 *
 * 設計の要点:
 *   - 取得はタブ初回訪問時と操作（種別 / 件数 / 再読込）時、および視野が落ち着いた時のみ。
 *     ポーリングしない（知識グラフの更新は分〜時間単位で、常時ポーリングに見合わない。設計書 §3.2）。
 *   - 視野駆動配信: サーバが座標を持つとき、パン / ズームが落ち着いたら「今見えている範囲」で
 *     取り直す。取得中も現在の図を出したままにし、届いた図で視野を動かさない。
 *   - サーバー不達・DB 未設定（応答 null）は 0 件と別の顔で表示する（障害を「0 件」に見せない）。
 *   - 描画は cooccurrence-viewer に委ね、本パネルはツールバーと取得状態だけを持つ。
 *   - 色はテーマトークンから取り、要素側へインラインで置かない（ダーク / ライト両対応）。
 */
import { createSelect } from '@anytime-markdown/ui-core';
import {
  createInlineLayoutWorker,
  mountCooccurrenceViewer,
  type CooccurrenceViewerHandle,
} from '@anytime-markdown/cooccurrence-viewer';
import type { VanillaViewHandle } from '../shared/vanillaIsland';
import type { TrailThemeTokens } from '../theme/designTokens';
import { buildKnowledgeGraphCoocFile, type KnowledgeGraphResponse } from './knowledgeGraphCoocFile';
import { formatBboxParam, shouldRefetchForViewport, type ViewportBox } from './knowledgeGraphViewport';

export interface KnowledgeGraphPanelProps {
  /** TrailDataServer の基点 URL。空文字は未接続（取得しない）。 */
  readonly serverUrl: string;
  readonly isDark: boolean;
  readonly tokens: TrailThemeTokens;
  readonly t: (key: string) => string;
}

const STYLE_ID = 'am-knowledge-graph-style';
// 上限 10000 はサーバ側 clamp（TrailDataServer / CaravanApiHandler）と揃える。実測の根拠は
// CaravanApiHandler の KNOWLEDGE_GRAPH_MAX_NODES。既定を 150 に据え置くのは、10000 では
// レイアウトの同期実行で初回描画が約 3.3 秒かかるため（操作自体は 1 フレーム 8.5ms で軽い）。
const LIMIT_CHOICES = ['50', '150', '300', '500', '1000', '2000', '5000', '10000'] as const;
/**
 * これ以上を選ぶと初回描画に体感できる時間がかかる件数（実測: 5,000 で約 1.5 秒・
 * 10,000 で約 3.3 秒。レイアウトが同期実行のため、その間 UI は固まる）。
 * 選択肢に注記を出して、等価に見える選択肢の中でコストが跳ねる点を隠さない。
 */
const SLOW_LIMIT_THRESHOLD = 5000;
const DEFAULT_LIMIT = '150';

type LoadState = 'loading' | 'failed' | 'empty' | 'ready';

function ensureStyle(doc: Document, tokens: TrailThemeTokens): void {
  const existing = doc.getElementById(STYLE_ID);
  if (existing) existing.remove();
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  const c = tokens.colors;
  style.textContent = `
/* タブパネルの器は overflow:hidden。viewer ホストが flex:1 + min-height:0 を持たないと
   canvas の高さが 0 になる（flex 既定 min-height:auto の罠。flightRecordPanel と同じ理由）。 */
[data-am-kg-root] {
  display: flex; flex-direction: column; gap: 8px; padding: 12px; color: ${c.textPrimary};
  flex: 1 1 auto; min-height: 0; box-sizing: border-box; overflow: hidden;
}
[data-am-kg-toolbar] {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  font-size: 12px; color: ${c.textSecondary};
}
[data-am-kg-toolbar] label { display: inline-flex; align-items: center; gap: 6px; }
[data-am-kg-toolbar] button[data-am-kg-reload] {
  padding: 4px 12px; font-size: 12px; cursor: pointer; color: ${c.textPrimary};
  background: transparent; border: 1px solid ${c.border}; border-radius: 4px;
}
[data-am-kg-status] { font-size: 13px; color: ${c.textSecondary}; padding: 24px 4px; }
[data-am-kg-status][data-kind="failed"] { color: ${c.error}; }
[data-am-kg-viewer] { flex: 1 1 auto; min-height: 0; position: relative; }
`;
  doc.head.appendChild(style);
}

/** `{{name}}` を values で置換する（i18n 文字列の補間。emergencyPanel と同形）。 */
function format(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => values[k] ?? '');
}

export function mountKnowledgeGraphPanel(
  container: HTMLElement,
  initialProps: KnowledgeGraphPanelProps,
): VanillaViewHandle<KnowledgeGraphPanelProps> {
  let props = initialProps;
  let destroyed = false;

  let loadState: LoadState = 'loading';
  let data: KnowledgeGraphResponse | null = null;
  /** 種別フィルタ。空文字は「全種別」。 */
  let typeFilter = '';
  let limit = DEFAULT_LIMIT;
  /**
   * 種別の選択肢。最後に成功した応答の availableTypes を保持する（絞り込み中の応答でも
   * 全種別が返るため上書きでよい。失敗時に消すと、失敗 → 選択肢が空 → 解除不能になる）。
   */
  let availableTypes: readonly string[] = [];
  let viewerHandle: CooccurrenceViewerHandle | null = null;
  /** in-flight fetch の中断（destroy・条件変更時）。 */
  let controller: AbortController | null = null;
  /** 古い応答が新しい応答を上書きしないための世代番号。 */
  let fetchSeq = 0;
  /** 直近の取得で使った視野。null は「視野指定なし（全体）」。 */
  let fetchedBbox: ViewportBox | null = null;
  /**
   * 視野駆動の取り直しを行うか。サーバが座標を持たない構成（migration 未適用・
   * レイアウト未計算）では bboxApplied=false が返るため、以後は視野で取り直さない
   * （同じ全体グラフを何度も取り直すだけになるため）。
   */
  let viewportFetchEnabled = true;

  ensureStyle(container.ownerDocument, props.tokens);

  const root = document.createElement('div');
  root.dataset['amKgRoot'] = '';
  container.appendChild(root);

  const toolbar = document.createElement('div');
  toolbar.dataset['amKgToolbar'] = '';
  toolbar.innerHTML = `
    <label><span data-am-kg-label="typeFilter"></span><span data-am-kg-type-select></span></label>
    <label><span data-am-kg-label="nodeLimit"></span><span data-am-kg-limit-select></span></label>
    <button type="button" data-am-kg-reload></button>
    <span data-am-kg-count role="status"></span>
  `;
  root.appendChild(toolbar);

  const statusEl = document.createElement('div');
  statusEl.dataset['amKgStatus'] = '';
  root.appendChild(statusEl);

  const viewerHost = document.createElement('div');
  viewerHost.dataset['amKgViewer'] = '';
  viewerHost.hidden = true;
  root.appendChild(viewerHost);

  function typeOptions(): ReadonlyArray<{ value: string; label: string }> {
    return [
      { value: '', label: props.t('knowledgeGraph.typeAll') },
      ...availableTypes.map((type) => ({ value: type, label: type })),
    ];
  }

  const typeSelect = createSelect<string>({
    value: typeFilter,
    options: typeOptions(),
    ariaLabel: props.t('knowledgeGraph.typeFilter'),
    fullWidth: false,
    minWidth: 144,
    onChange: (value) => {
      if (value === typeFilter) return;
      typeFilter = value;
      void refresh();
    },
  });
  toolbar.querySelector<HTMLElement>('[data-am-kg-type-select]')?.appendChild(typeSelect.el);

  const limitOptions = (t: KnowledgeGraphPanelProps['t']): Array<{ value: string; label: string }> =>
    LIMIT_CHOICES.map((v) => ({
      value: v,
      label: Number(v) >= SLOW_LIMIT_THRESHOLD ? `${v}${t('knowledgeGraph.nodeLimitSlowSuffix')}` : v,
    }));

  const limitSelect = createSelect<string>({
    value: limit,
    options: limitOptions(props.t),
    ariaLabel: props.t('knowledgeGraph.nodeLimit'),
    fullWidth: false,
    minWidth: 88,
    onChange: (value) => {
      if (value === limit) return;
      limit = value;
      void refresh();
    },
  });
  toolbar.querySelector<HTMLElement>('[data-am-kg-limit-select]')?.appendChild(limitSelect.el);

  toolbar.querySelector<HTMLButtonElement>('[data-am-kg-reload]')?.addEventListener('click', () => {
    void refresh();
  });

  function buildQuery(bbox: ViewportBox | null): string {
    const params = new URLSearchParams();
    params.set('limit', limit);
    if (typeFilter !== '') params.set('types', typeFilter);
    if (bbox) params.set('bbox', formatBboxParam(bbox));
    return `?${params.toString()}`;
  }

  /**
   * データを取得して図へ反映する。
   *
   * @param bbox 取得する視野。null は全体（従来経路）。
   * @param viewportDriven 視野の変化による取り直しか。true のときは取得中も現在の図を出したままにし、
   *   届いた図でカメラを動かさない。false（操作・初回）のときは従来どおり読み込み表示へ切り替える。
   */
  async function refresh(bbox: ViewportBox | null = null, viewportDriven = false): Promise<void> {
    if (destroyed || props.serverUrl === '') return;
    controller?.abort();
    const ctrl = new AbortController();
    controller = ctrl;
    fetchSeq += 1;
    const seq = fetchSeq;
    if (!viewportDriven) {
      // 視野駆動では読み込み表示に切り替えない。切り替えると図が消えて、パンのたびに
      // 画面が白くなる（見えている図の上で差し替わるのが視野駆動の要件）。
      loadState = 'loading';
      render();
    }
    try {
      const res = await fetch(
        `${props.serverUrl}/api/caravan/knowledge-graph${buildQuery(bbox)}`,
        { signal: ctrl.signal },
      );
      // 200 + null は「DB 未設定」（サーバ実装参照）。0 件の正常応答と区別して障害側へ倒す
      const json = res.ok ? ((await res.json()) as KnowledgeGraphResponse | null) : null;
      if (destroyed || seq !== fetchSeq) return;
      if (json === null) {
        loadState = 'failed';
        data = null;
      } else {
        applyResponse(json, bbox, viewportDriven);
      }
    } catch (err) {
      if (destroyed || seq !== fetchSeq) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.warn(`[knowledgeGraph] failed to load: ${err instanceof Error ? err.message : String(err)}`);
      loadState = 'failed';
      data = null;
    }
    render();
  }

  /** 取得できた応答を状態と図へ反映する。 */
  function applyResponse(
    json: KnowledgeGraphResponse,
    bbox: ViewportBox | null,
    viewportDriven: boolean,
  ): void {
    data = json;
    availableTypes = json.availableTypes;
    fetchedBbox = bbox;
    // サーバが視野を無視した（座標が無い）なら、以後の視野駆動は無意味なので止める
    if (bbox !== null && json.bboxApplied === false) viewportFetchEnabled = false;
    loadState = json.nodes.length === 0 ? 'empty' : 'ready';
    if (loadState !== 'ready') return;
    syncViewer(buildKnowledgeGraphCoocFile(json, new Date().toISOString()), viewportDriven);
  }

  /** 図を差し替える（初回だけ mount、以後は update）。 */
  function syncViewer(file: ReturnType<typeof buildKnowledgeGraphCoocFile>, viewportDriven: boolean): void {
    if (viewerHandle) {
      viewerHandle.update({ file, preserveViewport: viewportDriven });
      return;
    }
    viewerHandle = mountCooccurrenceViewer(viewerHost, {
      file,
      themeMode: props.isDark ? 'dark' : 'light',
      createLayoutWorker: createInlineLayoutWorker,
      showPanels: true,
      onViewportChange: handleViewportChange,
    });
  }

  /**
   * 視野が落ち着いたときの取り直し判定。
   *
   * 図が出ていない間（読み込み中・失敗）は取り直さない。取得直後に届く最初の通知は
   * 全体表示に合わせた視野なので、`shouldRefetchForViewport` が「前回と同じ」と判定できるよう
   * 記録だけして取得しない。
   */
  function handleViewportChange(bounds: ViewportBox): void {
    if (destroyed || !viewportFetchEnabled || loadState !== 'ready') return;
    if (fetchedBbox === null) {
      // 全体取得の直後。今の視野を基準として記録するだけ（同じ内容の取り直しを避ける）
      fetchedBbox = bounds;
      return;
    }
    if (!shouldRefetchForViewport(fetchedBbox, bounds)) return;
    void refresh(bounds, true);
  }

  function render(): void {
    const { t } = props;
    for (const span of toolbar.querySelectorAll<HTMLElement>('[data-am-kg-label]')) {
      span.textContent = t(`knowledgeGraph.${span.dataset['amKgLabel'] ?? ''}`);
    }
    const reload = toolbar.querySelector<HTMLButtonElement>('[data-am-kg-reload]');
    if (reload) reload.textContent = t('knowledgeGraph.reload');
    typeSelect.update({ options: typeOptions(), ariaLabel: t('knowledgeGraph.typeFilter'), value: typeFilter });
    limitSelect.update({ options: limitOptions(t), ariaLabel: t('knowledgeGraph.nodeLimit'), value: limit });

    const count = toolbar.querySelector<HTMLElement>('[data-am-kg-count]');
    if (count) {
      count.textContent = loadState === 'ready' && data
        ? format(t('knowledgeGraph.shownCount'), {
          shown: String(data.nodes.length),
          total: String(data.totalEntityCount),
        })
        : '';
    }

    const statusKey: Partial<Record<LoadState, string>> = {
      loading: 'knowledgeGraph.loading',
      failed: 'knowledgeGraph.loadFailed',
      empty: 'knowledgeGraph.empty',
    };
    const key = statusKey[loadState];
    statusEl.hidden = key === undefined;
    statusEl.dataset['kind'] = loadState;
    statusEl.textContent = key === undefined ? '' : t(key);
    viewerHost.hidden = loadState !== 'ready';
  }

  render();
  void refresh();

  return {
    update(next: KnowledgeGraphPanelProps) {
      const prev = props;
      props = next;
      if (prev.tokens !== next.tokens) ensureStyle(container.ownerDocument, next.tokens);
      if (prev.isDark !== next.isDark) {
        viewerHandle?.update({ themeMode: next.isDark ? 'dark' : 'light' });
      }
      if (prev.serverUrl !== next.serverUrl) {
        // 接続先が変わったら前の接続の図を残さない
        viewerHandle?.destroy();
        viewerHandle = null;
        viewerHost.textContent = '';
        // 座標を持つかは接続先ごとに違う。前の接続で無効化した判断を持ち越さない
        viewportFetchEnabled = true;
        fetchedBbox = null;
        void refresh();
        return;
      }
      render();
    },
    destroy() {
      destroyed = true;
      controller?.abort();
      typeSelect.destroy();
      limitSelect.destroy();
      viewerHandle?.destroy();
      viewerHandle = null;
      root.remove();
    },
  };
}
