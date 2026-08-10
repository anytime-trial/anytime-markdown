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

interface KnowledgeGraphSearchHit {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly degree: number;
}

interface KnowledgeGraphSearchResponse {
  readonly hits: readonly KnowledgeGraphSearchHit[];
  readonly truncated: boolean;
}

/** エージェント照会（§2.5）。MCP search_caravan_book が記録した検索とそのヒット。 */
interface AgentSearchQuery {
  readonly id: string;
  readonly query: string;
  readonly occurredAt: string;
  readonly hits: readonly { id: string; label: string; type: string }[];
}

interface AgentSearchesResponse {
  readonly queries: readonly AgentSearchQuery[];
}

/** ego を開いた起点動線（計測 origin。§3.6）。 */
type EgoOrigin = 'search' | 'citation' | 'agent_history';
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
/**
 * カード表示（card スキン）で 1 列に縦へ積むカードの枚数。超えた分はカラム内で右へ折り返す。
 * 既定 20 は cooccurrence-viewer の既定（CARD_MAX_ROWS）と同値で、追加前の見え方を変えない。
 */
const CARD_ROWS_CHOICES = ['10', '20', '30', '50', '100'] as const;
const DEFAULT_CARD_ROWS = '20';

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
[data-am-kg-search-wrap] { position: relative; display: inline-flex; align-items: center; gap: 6px; }
[data-am-kg-search-wrap] input[data-am-kg-search-input] {
  padding: 4px 8px; font-size: 12px; min-width: 220px; color: ${c.textPrimary};
  background: transparent; border: 1px solid ${c.border}; border-radius: 4px;
}
[data-am-kg-search-wrap] button {
  padding: 4px 12px; font-size: 12px; cursor: pointer; color: ${c.textPrimary};
  background: transparent; border: 1px solid ${c.border}; border-radius: 4px;
}
[data-am-kg-search-results],
[data-am-kg-agent-list] {
  position: absolute; top: 100%; left: 0; z-index: 20; margin-top: 4px;
  min-width: 280px; max-height: 320px; overflow-y: auto;
  background: ${c.charcoal}; border: 1px solid ${c.border}; border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}
[data-am-kg-agent-list] [data-am-kg-agent-query] {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  padding: 6px 10px; font-size: 12px; cursor: pointer; color: ${c.textPrimary};
  background: transparent; border: none; border-radius: 0;
}
[data-am-kg-agent-list] [data-am-kg-agent-query]:hover:not(:disabled) { background: ${c.hoverBg}; }
[data-am-kg-agent-list] [data-am-kg-agent-query]:disabled { cursor: default; color: ${c.textSecondary}; }
[data-am-kg-agent-list] [data-am-kg-agent-query] .am-kg-agent-time { color: ${c.textSecondary}; flex: none; }
[data-am-kg-agent-list] [data-am-kg-agent-query] .am-kg-agent-query-text {
  flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
[data-am-kg-agent-list] [data-am-kg-agent-query] .am-kg-agent-count { color: ${c.textSecondary}; flex: none; }
[data-am-kg-agent-list] [data-am-kg-agent-empty] {
  padding: 6px 10px; font-size: 12px; color: ${c.textSecondary};
}
[data-am-kg-status][data-kind="notFound"] { padding: 4px; }
[data-am-kg-search-results] [data-am-kg-search-hit] {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  padding: 6px 10px; font-size: 12px; cursor: pointer; color: ${c.textPrimary};
  background: transparent; border: none; border-radius: 0;
}
[data-am-kg-search-results] [data-am-kg-search-hit]:hover { background: ${c.hoverBg}; }
[data-am-kg-search-results] [data-am-kg-search-hit] .am-kg-hit-type { color: ${c.textSecondary}; flex: none; }
[data-am-kg-search-results] [data-am-kg-search-hit] .am-kg-hit-label {
  flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
[data-am-kg-search-results] [data-am-kg-search-empty] {
  padding: 6px 10px; font-size: 12px; color: ${c.textSecondary};
}
`;
  doc.head.appendChild(style);
}

/** `{{name}}` を values で置換する（i18n 文字列の補間。emergencyPanel と同形）。 */
function format(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => values[k] ?? '');
}

/** パネルの handle。引用からの遷移（focusEntity）を通常の view handle に加えて持つ。 */
export type KnowledgeGraphPanelHandle = VanillaViewHandle<KnowledgeGraphPanelProps> & {
  focusEntity(id: string, label?: string): void;
};

export function mountKnowledgeGraphPanel(
  container: HTMLElement,
  initialProps: KnowledgeGraphPanelProps,
): KnowledgeGraphPanelHandle {
  let props = initialProps;
  let destroyed = false;

  let loadState: LoadState = 'loading';
  let data: KnowledgeGraphResponse | null = null;
  /** 種別フィルタ。空文字は「全種別」。 */
  let typeFilter = '';
  let limit = DEFAULT_LIMIT;
  /**
   * カード表示の縦の枚数。図の取得条件ではなく描き方の設定なので、変更しても取り直さず
   * viewer へ渡すだけにする（再取得すると視野と読み込み表示が無駄に動く）。
   */
  let cardRows = DEFAULT_CARD_ROWS;
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
  /**
   * ego 表示中の中心実体。null は通常の全体表示。検索結果の選択で入り、
   * クリア・種別/件数の変更（取得条件の変更 = モード解除。設計書 §3.5）で戻る。
   */
  let egoSeed: { id: string; label: string } | null = null;
  /** 検索結果ドロップダウンの表示状態。null は非表示。 */
  let searchResults: KnowledgeGraphSearchResponse | 'failed' | null = null;
  let searchController: AbortController | null = null;
  /** 結果リストから ego を開いたときに計測へ送る起点動線（§3.6）。 */
  let resultsOrigin: EgoOrigin = 'search';
  /**
   * 表示中のヒット一覧の元になったエージェント照会語。origin='agent_history' の ego_open
   * 計測はこれを query に送る（検索欄の値を送ると「どの照会のヒットを開いたか」を
   * caravan_search_events から復元できない。cross-review 2026-08-10 Codex 指摘 1）。
   */
  let agentHitsQuery = '';
  /** エージェント照会ドロップダウンの表示状態。null は非表示。 */
  let agentQueries: AgentSearchesResponse | 'failed' | null = null;
  let agentController: AbortController | null = null;
  /** 引用・照会の実体が現存しない場合の告知（図は維持する。§3.6）。 */
  let entityNotFound = false;
  /** ego → 全体へ戻ったとき選択を 1 度だけ解除するためのフラグ。 */
  let egoSelectionApplied = false;

  ensureStyle(container.ownerDocument, props.tokens);

  const root = document.createElement('div');
  root.dataset['amKgRoot'] = '';
  container.appendChild(root);

  const toolbar = document.createElement('div');
  toolbar.dataset['amKgToolbar'] = '';
  toolbar.innerHTML = `
    <label><span data-am-kg-label="typeFilter"></span><span data-am-kg-type-select></span></label>
    <label><span data-am-kg-label="nodeLimit"></span><span data-am-kg-limit-select></span></label>
    <label><span data-am-kg-label="cardRows"></span><span data-am-kg-card-rows-select></span></label>
    <button type="button" data-am-kg-reload></button>
    <span data-am-kg-search-wrap>
      <input type="search" data-am-kg-search-input />
      <button type="button" data-am-kg-search-run></button>
      <button type="button" data-am-kg-agent-btn></button>
      <button type="button" data-am-kg-ego-clear hidden></button>
      <span data-am-kg-search-results hidden></span>
      <span data-am-kg-agent-list hidden></span>
    </span>
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
      // 取得条件の変更は ego 表示の解除（設計書 §3.5）
      egoSeed = null;
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
      // 取得条件の変更は ego 表示の解除（設計書 §3.5）
      egoSeed = null;
      void refresh();
    },
  });
  toolbar.querySelector<HTMLElement>('[data-am-kg-limit-select]')?.appendChild(limitSelect.el);

  const cardRowsSelect = createSelect<string>({
    value: cardRows,
    options: CARD_ROWS_CHOICES.map((v) => ({ value: v, label: v })),
    ariaLabel: props.t('knowledgeGraph.cardRows'),
    fullWidth: false,
    minWidth: 72,
    onChange: (value) => {
      if (value === cardRows) return;
      cardRows = value;
      viewerHandle?.update({ cardMaxRows: Number(cardRows) });
    },
  });
  toolbar.querySelector<HTMLElement>('[data-am-kg-card-rows-select]')?.appendChild(cardRowsSelect.el);

  toolbar.querySelector<HTMLButtonElement>('[data-am-kg-reload]')?.addEventListener('click', () => {
    void refresh();
  });

  // ---- 検索（設計書 §3.5: 検索 → 結果リスト → ego 表示 → クリア）----

  const searchInput = toolbar.querySelector<HTMLInputElement>('[data-am-kg-search-input]');
  const searchRunBtn = toolbar.querySelector<HTMLButtonElement>('[data-am-kg-search-run]');
  const agentBtn = toolbar.querySelector<HTMLButtonElement>('[data-am-kg-agent-btn]');
  const egoClearBtn = toolbar.querySelector<HTMLButtonElement>('[data-am-kg-ego-clear]');
  const searchResultsEl = toolbar.querySelector<HTMLElement>('[data-am-kg-search-results]');
  const agentListEl = toolbar.querySelector<HTMLElement>('[data-am-kg-agent-list]');

  /** 計測イベントの送信。失敗しても検索・表示を止めない（設計書 §2.4 fail-open）。 */
  function postSearchEvent(
    body: {
      kind: 'search' | 'ego_open' | 'clear';
      query: string;
      resultCount?: number;
      entityId?: string;
      origin?: EgoOrigin;
    },
  ): void {
    if (props.serverUrl === '') return;
    void fetch(`${props.serverUrl}/api/caravan/knowledge-graph/search-events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch((err: unknown) => {
      console.warn(`[knowledgeGraph] search event post failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  async function runSearch(): Promise<void> {
    const q = searchInput?.value.trim() ?? '';
    if (destroyed || props.serverUrl === '' || q === '') return;
    searchController?.abort();
    const ctrl = new AbortController();
    searchController = ctrl;
    try {
      const res = await fetch(
        `${props.serverUrl}/api/caravan/knowledge-graph/search?q=${encodeURIComponent(q)}`,
        { signal: ctrl.signal },
      );
      // 200 + null は DB 未設定（取得系と同じ規約）。障害側の顔で表示する
      const json = res.ok ? ((await res.json()) as KnowledgeGraphSearchResponse | null) : null;
      if (destroyed || ctrl !== searchController) return;
      searchResults = json ?? 'failed';
      resultsOrigin = 'search';
      agentQueries = null;
      renderAgentList();
      if (json) postSearchEvent({ kind: 'search', query: q, resultCount: json.hits.length });
    } catch (err) {
      if (destroyed || (err instanceof DOMException && err.name === 'AbortError')) return;
      console.warn(`[knowledgeGraph] search failed: ${err instanceof Error ? err.message : String(err)}`);
      searchResults = 'failed';
    }
    renderSearchResults();
  }

  function openEgo(hit: Pick<KnowledgeGraphSearchHit, 'id' | 'label'>, origin: EgoOrigin): void {
    egoSeed = { id: hit.id, label: hit.label };
    entityNotFound = false;
    searchResults = null;
    renderSearchResults();
    const eventQuery = origin === 'agent_history' ? agentHitsQuery : searchInput?.value.trim() ?? '';
    postSearchEvent({ kind: 'ego_open', query: eventQuery, entityId: hit.id, origin });
    render();
    void refresh();
  }

  function clearEgo(): void {
    if (egoSeed === null) return;
    postSearchEvent({ kind: 'clear', query: searchInput?.value.trim() ?? '' });
    egoSeed = null;
    entityNotFound = false;
    render();
    void refresh();
  }

  // ---- エージェント照会リスト（設計書 §3.6 (b)）----

  /** 照会リストの取得と表示。押すたびに取り直す（照会は MCP 側で随時増えるため）。 */
  async function openAgentList(): Promise<void> {
    if (destroyed || props.serverUrl === '') return;
    searchResults = null;
    renderSearchResults();
    agentController?.abort();
    const ctrl = new AbortController();
    agentController = ctrl;
    try {
      const res = await fetch(`${props.serverUrl}/api/caravan/knowledge-graph/agent-searches`, {
        signal: ctrl.signal,
      });
      const json = res.ok ? ((await res.json()) as AgentSearchesResponse | null) : null;
      if (destroyed || ctrl !== agentController) return;
      agentQueries = json ?? 'failed';
    } catch (err) {
      if (destroyed || (err instanceof DOMException && err.name === 'AbortError')) return;
      console.warn(`[knowledgeGraph] agent searches failed: ${err instanceof Error ? err.message : String(err)}`);
      agentQueries = 'failed';
    }
    renderAgentList();
  }

  /** 照会を選ぶと、そのヒット一覧を検索結果と同じ UI（同じ終点 = ego + 選択）で出す。 */
  function openAgentHits(query: AgentSearchQuery): void {
    agentQueries = null;
    renderAgentList();
    searchResults = {
      hits: query.hits.map((hit) => ({ ...hit, degree: 0 })),
      truncated: false,
    };
    resultsOrigin = 'agent_history';
    agentHitsQuery = query.query;
    renderSearchResults();
  }

  function renderAgentList(): void {
    if (!agentListEl) return;
    agentListEl.textContent = '';
    agentListEl.hidden = agentQueries === null;
    if (agentQueries === null) return;
    if (agentQueries === 'failed' || agentQueries.queries.length === 0) {
      const div = document.createElement('div');
      div.dataset['amKgAgentEmpty'] = '';
      div.textContent = props.t(
        agentQueries === 'failed' ? 'knowledgeGraph.agentSearchesFailed' : 'knowledgeGraph.agentSearchesEmpty',
      );
      agentListEl.appendChild(div);
      return;
    }
    for (const query of agentQueries.queries) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset['amKgAgentQuery'] = query.id;
      // ヒット 0 件（実体が現存しない照会を含む）は選べない行として明示する（abstain の可視化）
      btn.disabled = query.hits.length === 0;
      const time = document.createElement('span');
      time.className = 'am-kg-agent-time';
      time.textContent = query.occurredAt.slice(0, 16).replace('T', ' ');
      const text = document.createElement('span');
      text.className = 'am-kg-agent-query-text';
      text.textContent = query.query;
      text.title = query.query;
      const count = document.createElement('span');
      count.className = 'am-kg-agent-count';
      count.textContent = format(props.t('knowledgeGraph.agentSearchHitCount'), {
        count: String(query.hits.length),
      });
      btn.append(time, text, count);
      if (!btn.disabled) btn.addEventListener('click', () => openAgentHits(query));
      agentListEl.appendChild(btn);
    }
  }

  function renderSearchResults(): void {
    if (!searchResultsEl) return;
    searchResultsEl.textContent = '';
    searchResultsEl.hidden = searchResults === null;
    if (searchResults === null) return;
    if (searchResults === 'failed' || searchResults.hits.length === 0) {
      const div = document.createElement('div');
      div.dataset['amKgSearchEmpty'] = '';
      div.textContent = props.t(
        searchResults === 'failed' ? 'knowledgeGraph.searchFailed' : 'knowledgeGraph.searchNoMatch',
      );
      searchResultsEl.appendChild(div);
      return;
    }
    for (const hit of searchResults.hits) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset['amKgSearchHit'] = hit.id;
      const typeSpan = document.createElement('span');
      typeSpan.className = 'am-kg-hit-type';
      typeSpan.textContent = hit.type;
      const labelSpan = document.createElement('span');
      labelSpan.className = 'am-kg-hit-label';
      labelSpan.textContent = hit.label;
      labelSpan.title = hit.label;
      btn.append(typeSpan, labelSpan);
      btn.addEventListener('click', () => openEgo(hit, resultsOrigin));
      searchResultsEl.appendChild(btn);
    }
  }

  searchRunBtn?.addEventListener('click', () => { void runSearch(); });
  agentBtn?.addEventListener('click', () => {
    // 開いていれば閉じる（トグル）。開くときは毎回取り直す
    if (agentQueries !== null) {
      agentQueries = null;
      renderAgentList();
      return;
    }
    void openAgentList();
  });
  searchInput?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') void runSearch();
    if (ev.key === 'Escape') {
      searchResults = null;
      renderSearchResults();
    }
  });
  egoClearBtn?.addEventListener('click', clearEgo);
  /** 外側クリックで結果リスト・照会リストを閉じる（設計書 §3.5 / §3.6）。 */
  const onDocPointerDown = (ev: PointerEvent): void => {
    if (searchResults === null && agentQueries === null) return;
    const wrap = toolbar.querySelector('[data-am-kg-search-wrap]');
    if (wrap && ev.target instanceof Node && wrap.contains(ev.target)) return;
    searchResults = null;
    agentQueries = null;
    renderSearchResults();
    renderAgentList();
  };
  container.ownerDocument.addEventListener('pointerdown', onDocPointerDown);

  function buildQuery(bbox: ViewportBox | null): string {
    const params = new URLSearchParams();
    params.set('limit', limit);
    if (egoSeed) {
      // ego 表示は seed + limit のみ（種別・視野はサーバ側でも適用されない。設計書 §2.4）
      params.set('seed', egoSeed.id);
      return `?${params.toString()}`;
    }
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
      applyFetchError(err, viewportDriven);
    }
    render();
  }

  /**
   * 取得の失敗を状態へ反映する。
   *
   * 視野駆動の失敗では図を落とさない。落とすと canvas ごと消えて、パンで戻ることも
   * 取り直すこともできなくなる（`handleViewportChange` は `loadState === 'ready'` でしか
   * 動かない）。パン中の一時的な失敗は、daemon がレイアウト計算でふさがっている間に
   * 現実に起きる。全体取得の失敗だけ従来どおり failed へ倒す。
   */
  function applyFetchError(err: unknown, viewportDriven: boolean): void {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    console.warn(`[knowledgeGraph] failed to load: ${err instanceof Error ? err.message : String(err)}`);
    if (viewportDriven) return;
    loadState = 'failed';
    data = null;
  }

  /** 取得できた応答を状態と図へ反映する。 */
  function applyResponse(
    json: KnowledgeGraphResponse,
    bbox: ViewportBox | null,
    viewportDriven: boolean,
  ): void {
    fetchedBbox = bbox;
    if (bbox === null) {
      // 明示的な取り直し（初回・種別・件数・再読込）。座標はパイプラインが後から書くので、
      // 前回「絞れなかった」判断をここで捨てる。捨てないと、レイアウト計算前の窓で 1 回
      // パンしただけで、そのパネルは以後ずっと視野駆動を使わない（再読込でも戻らない）。
      viewportFetchEnabled = true;
    } else if (json.bboxApplied !== true) {
      // サーバが視野を無視した（座標が無い）／`bboxApplied` を返さない旧サーバでは、
      // 視野を変えても同じ全体グラフが返るだけなので止める。
      viewportFetchEnabled = false;
    }
    availableTypes = json.availableTypes;
    if (viewportDriven && json.nodes.length === 0) {
      // 何も無い場所へパンしただけ。図を消すと canvas ごと隠れて、パンで戻ることも
      // 取り直すこともできなくなる（「0 件」表示のまま操作不能になる）。座標は世界座標
      // なので、今の図を残しておけばその領域は自然に空白として見える。
      return;
    }
    if (egoSeed !== null && json.nodes.length === 0) {
      // 引用・照会の実体が現存しない（soft delete・DB 入れ替え）。図を空にすると
      // 戻れなくなるので現在の図を維持し、告知だけ出す（設計書 §3.6）。
      entityNotFound = true;
      egoSeed = null;
      if (data !== null) {
        loadState = data.nodes.length === 0 ? 'empty' : 'ready';
        return;
      }
      // 初回表示より先に引用から入った場合は全体表示へ倒す（維持する図が無い）
      void refresh();
      return;
    }
    if (egoSeed !== null) {
      // focusEntity は id しか知らない。件数表示のラベルは応答から解決する
      const seedNode = json.nodes.find((n) => n.id === egoSeed?.id);
      if (seedNode) egoSeed = { id: egoSeed.id, label: seedNode.label };
    }
    entityNotFound = false;
    data = json;
    loadState = json.nodes.length === 0 ? 'empty' : 'ready';
    if (loadState !== 'ready') return;
    syncViewer(
      buildKnowledgeGraphCoocFile(
        json,
        new Date().toISOString(),
        egoSeed ? { subjectId: egoSeed.id, subjectLabel: egoSeed.label } : undefined,
      ),
      viewportDriven,
    );
    applySubjectSelection(json);
  }

  /**
   * ego の中心ノードを選択状態にする（設計書 §3.6。ego 差し替えだけでは「どれがその
   * 実体か」がパン後に読めない）。全体表示へ戻ったら 1 度だけ解除する — 視野駆動の
   * 差し替えでは触らない（利用者が自分でクリックした選択を横から消さない）。
   */
  function applySubjectSelection(json: KnowledgeGraphResponse): void {
    if (!viewerHandle) return;
    if (egoSeed === null) {
      if (egoSelectionApplied) {
        viewerHandle.selectNode(null);
        egoSelectionApplied = false;
      }
      return;
    }
    const seedId = egoSeed.id;
    const seedLabel = egoSeed.label;
    const byId = json.nodes.findIndex((n) => n.id === seedId);
    const index = byId >= 0 ? byId : json.nodes.findIndex((n) => n.label === seedLabel);
    viewerHandle.selectNode(index >= 0 ? index : null);
    egoSelectionApplied = index >= 0;
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
      cardMaxRows: Number(cardRows),
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
    // ego 表示中は視野駆動を止める（seed の周辺だけを見せる図で、視野の上位 N に意味がない）
    if (destroyed || egoSeed !== null || !viewportFetchEnabled || loadState !== 'ready') return;
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
    cardRowsSelect.update({ ariaLabel: t('knowledgeGraph.cardRows'), value: cardRows });

    if (searchInput) searchInput.placeholder = t('knowledgeGraph.searchPlaceholder');
    if (searchRunBtn) searchRunBtn.textContent = t('knowledgeGraph.searchRun');
    if (agentBtn) agentBtn.textContent = t('knowledgeGraph.agentSearches');
    if (egoClearBtn) {
      egoClearBtn.textContent = t('knowledgeGraph.egoClear');
      egoClearBtn.hidden = egoSeed === null;
    }

    const count = toolbar.querySelector<HTMLElement>('[data-am-kg-count]');
    if (count) {
      if (loadState !== 'ready' || data === null) {
        count.textContent = '';
      } else if (egoSeed !== null) {
        count.textContent = format(t('knowledgeGraph.egoShownCount'), {
          label: egoSeed.label,
          shown: String(data.nodes.length),
        });
      } else {
        count.textContent = format(t('knowledgeGraph.shownCount'), {
          shown: String(data.nodes.length),
          total: String(data.totalEntityCount),
        });
      }
    }

    const statusKey: Partial<Record<LoadState, string>> = {
      loading: 'knowledgeGraph.loading',
      failed: 'knowledgeGraph.loadFailed',
      empty: 'knowledgeGraph.empty',
    };
    const key = statusKey[loadState];
    if (entityNotFound && loadState === 'ready') {
      // 実体不在の告知は図を維持したまま出す（設計書 §3.6。0 件表示と区別する）
      statusEl.hidden = false;
      statusEl.dataset['kind'] = 'notFound';
      statusEl.textContent = t('knowledgeGraph.entityNotFound');
    } else {
      statusEl.hidden = key === undefined;
      statusEl.dataset['kind'] = loadState;
      statusEl.textContent = key === undefined ? '' : t(key);
    }
    viewerHost.hidden = loadState !== 'ready';
  }

  render();
  void refresh();

  return {
    /**
     * 引用（Chat タブの entity チップ）から該当実体を開く（設計書 §3.6 (a)）。
     * ラベルは応答から解決するため id だけでよい。
     */
    focusEntity(id: string, label?: string): void {
      if (destroyed || id === '') return;
      egoSeed = { id, label: label ?? id };
      entityNotFound = false;
      searchResults = null;
      agentQueries = null;
      renderSearchResults();
      renderAgentList();
      postSearchEvent({ kind: 'ego_open', query: '', entityId: id, origin: 'citation' });
      render();
      void refresh();
    },
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
      searchController?.abort();
      agentController?.abort();
      container.ownerDocument.removeEventListener('pointerdown', onDocPointerDown);
      typeSelect.destroy();
      limitSelect.destroy();
      cardRowsSelect.destroy();
      viewerHandle?.destroy();
      viewerHandle = null;
      root.remove();
    },
  };
}
