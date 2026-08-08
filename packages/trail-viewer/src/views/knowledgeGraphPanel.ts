/**
 * knowledgeGraphPanel — 知識グラフタブ（trail-caravan-book の知識グラフを共起ネットワークで表示）。
 *
 * 画面設計書: spec/31.trail/02.trail-viewer/trail-viewer-screen/trail-viewer-screen-knowledge-graph.ja.md
 *
 * 設計の要点:
 *   - 取得はタブ初回訪問時と操作（種別 / 件数 / 再読込）時のみ。ポーリングしない
 *     （知識グラフの更新は分〜時間単位で、常時ポーリングに見合わない。設計書 §3.2）。
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

export interface KnowledgeGraphPanelProps {
  /** TrailDataServer の基点 URL。空文字は未接続（取得しない）。 */
  readonly serverUrl: string;
  readonly isDark: boolean;
  readonly tokens: TrailThemeTokens;
  readonly t: (key: string) => string;
}

const STYLE_ID = 'am-knowledge-graph-style';
const LIMIT_CHOICES = ['50', '150', '300', '500'] as const;
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

  const limitSelect = createSelect<string>({
    value: limit,
    options: LIMIT_CHOICES.map((v) => ({ value: v, label: v })),
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

  function buildQuery(): string {
    const params = new URLSearchParams();
    params.set('limit', limit);
    if (typeFilter !== '') params.set('types', typeFilter);
    return `?${params.toString()}`;
  }

  async function refresh(): Promise<void> {
    if (destroyed || props.serverUrl === '') return;
    controller?.abort();
    const ctrl = new AbortController();
    controller = ctrl;
    fetchSeq += 1;
    const seq = fetchSeq;
    loadState = 'loading';
    render();
    try {
      const res = await fetch(`${props.serverUrl}/api/memory/knowledge-graph${buildQuery()}`, { signal: ctrl.signal });
      if (destroyed || seq !== fetchSeq) return;
      // 200 + null は「DB 未設定」（サーバ実装参照）。0 件の正常応答と区別して障害側へ倒す
      const json = res.ok ? ((await res.json()) as KnowledgeGraphResponse | null) : null;
      if (destroyed || seq !== fetchSeq) return;
      if (json === null) {
        loadState = 'failed';
        data = null;
      } else {
        data = json;
        availableTypes = json.availableTypes;
        loadState = json.nodes.length === 0 ? 'empty' : 'ready';
        if (loadState === 'ready') {
          const file = buildKnowledgeGraphCoocFile(json, new Date().toISOString());
          if (viewerHandle) {
            viewerHandle.update({ file });
          } else {
            viewerHandle = mountCooccurrenceViewer(viewerHost, {
              file,
              themeMode: props.isDark ? 'dark' : 'light',
              createLayoutWorker: createInlineLayoutWorker,
              showPanels: true,
            });
          }
        }
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

  function render(): void {
    const { t } = props;
    for (const span of toolbar.querySelectorAll<HTMLElement>('[data-am-kg-label]')) {
      span.textContent = t(`knowledgeGraph.${span.dataset['amKgLabel'] ?? ''}`);
    }
    const reload = toolbar.querySelector<HTMLButtonElement>('[data-am-kg-reload]');
    if (reload) reload.textContent = t('knowledgeGraph.reload');
    typeSelect.update({ options: typeOptions(), ariaLabel: t('knowledgeGraph.typeFilter'), value: typeFilter });
    limitSelect.update({ ariaLabel: t('knowledgeGraph.nodeLimit'), value: limit });

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
