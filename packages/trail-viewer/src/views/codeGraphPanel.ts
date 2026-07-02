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
import {
  mountCodeGraphCanvas,
  type CodeGraphColorBy,
  type CodeGraphGhostEdge,
  type CodeGraphGhostEdgeGranularity,
} from './codeGraphCanvas';

/** t 未注入時の日本語フォールバック（パネルは元来 JP ハードコード）。 */
const COLOR_BY_FALLBACK: Record<string, string> = {
  'codeGraph.colorBy.label': '配色',
  'codeGraph.colorBy.community': 'コミュニティ',
  'codeGraph.colorBy.layer': '層',
  'c4.layer.foundation': '基盤',
  'c4.layer.analysis': '解析',
  'c4.layer.data': '永続化',
  'c4.layer.serviceDomain': 'ドメイン/AI',
  'c4.layer.serviceServer': 'サーバ',
  'c4.layer.integration': '連携',
  'c4.layer.presentationUi': 'UI',
  'c4.layer.presentationExtension': '拡張',
  'c4.layer.utility': 'ユーティリティ',
};

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
  colorBySelect.append(optCommunity, optLayer);
  colorBySelect.addEventListener('change', () => {
    colorBy = colorBySelect.value === 'layer' ? 'layer' : 'community';
    renderState();
  });
  colorByWrap.appendChild(colorBySelect);
  toolbar.appendChild(colorByWrap);

  // --- Layer legend (shown only when colorBy === 'layer') ---
  const legendEl = document.createElement('div');
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

  function refreshColorByLabels(): void {
    colorByLabel.textContent = tr('codeGraph.colorBy.label');
    optCommunity.textContent = tr('codeGraph.colorBy.community');
    optLayer.textContent = tr('codeGraph.colorBy.layer');
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

  function renderState(): void {
    if (destroyed) return;

    // Hint
    hintEl.style.display = props.showSubagentDirectionalHint ? 'flex' : 'none';

    // Color-by toggle / layer legend
    refreshColorByLabels();
    colorBySelect.value = colorBy;
    if (colorBy === 'layer') {
      renderLegend();
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
    const canvasProps = {
      graph: state.graph,
      highlightedNodes: props.highlightedNodes,
      onNodeClick: props.onNodeClick,
      isDark: props.isDark,
      ghostEdges: props.ghostEdgesEnabled ? props.ghostEdges : undefined,
      ghostEdgeGranularity: props.ghostEdgeGranularity,
      colorBy,
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
