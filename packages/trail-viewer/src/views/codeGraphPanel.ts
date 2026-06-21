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
  mountCodeGraphCanvas,
  type CodeGraphGhostEdge,
  type CodeGraphGhostEdgeGranularity,
} from './codeGraphCanvas';

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

  // --- Hint alert ---
  const hintEl = document.createElement('div');
  hintEl.style.cssText =
    'margin:4px 8px;padding:4px 12px;background:var(--am-color-info-bg,rgba(66,165,245,0.12));' +
    'border-radius:4px;font-size:0.75rem;color:var(--am-color-info-main,#42A5F5);display:none;';
  hintEl.textContent =
    'subagent 粒度では複数の subagent_type が共通ファイルを触っていないと方向性（矢印）は出ません。' +
    '現在のデータは対称的なため全エッジが無向です。期間（windowDays）を伸ばすか、' +
    '別の subagent_type を含むセッションが取り込まれているか確認してください。';
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

  function renderState(): void {
    if (destroyed) return;

    // Hint
    hintEl.style.display = props.showSubagentDirectionalHint ? '' : 'none';

    const state = props.graphState;

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
      showPlaceholder(
        `<div style="color:var(--am-color-error-main);">${state.message}</div>`,
      );
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

  // Add spin keyframe once
  const spinStyle = document.createElement('style');
  spinStyle.textContent = '@keyframes am-spin{to{transform:rotate(360deg)}}';
  document.head?.appendChild(spinStyle);

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
      spinStyle.remove();
      root.remove();
    },
  };
}
