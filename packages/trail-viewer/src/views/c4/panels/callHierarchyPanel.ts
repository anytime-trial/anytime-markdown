/**
 * CallHierarchyPanel の vanilla DOM 等価実装。
 * フェッチ・仮想スクロール・ResizeObserver など全ての state をここで管理する。
 */
import {
  buildHierarchyTreeData,
  replaceItemChildren,
  type ApiHierarchyNode,
  type HierarchyLabelDecorations,
  type HierarchyTreeItem,
} from '../../../c4/components/panels/buildHierarchyTreeData';
import { flattenTree, type FlatRow } from '../../../c4/components/panels/flattenTree';
import { computeVisibleRange } from '../../../c4/components/panels/computeVisibleRange';
import { createSelect, createCheckbox, createTabs, createSpinner } from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

const ROW_HEIGHT = 24;
const ROW_OVERSCAN = 10;

type Direction = 'callers' | 'callees';
type Scope = 'project' | 'package' | 'file';

export interface CallHierarchyRootFunction {
  readonly filePath: string;
  readonly fnName: string;
  readonly startLine?: number;
}

export interface CallHierarchyPanelColors {
  readonly border: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly error: string;
}

export interface CallHierarchyPanelVanillaProps {
  readonly rootFunction: CallHierarchyRootFunction | null;
  readonly apiBaseUrl: string;
  readonly t: (key: string) => string;
  readonly isDark: boolean;
  readonly colors: CallHierarchyPanelColors;
}

async function fetchHierarchy(
  apiBaseUrl: string,
  root: CallHierarchyRootFunction,
  direction: Direction,
  depth: number,
  scope: Scope,
  excludeTests: boolean,
  signal: AbortSignal,
): Promise<ApiHierarchyNode> {
  const params = new URLSearchParams({
    file: root.filePath,
    fn: root.fnName,
    direction,
    depth: String(depth),
    scope,
  });
  if (excludeTests) params.set('excludeTests', 'true');
  if (typeof root.startLine === 'number') params.set('line', String(root.startLine));
  const url = `${apiBaseUrl.replace(/\/$/, '')}/api/c4/call-hierarchy?${params.toString()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as ApiHierarchyNode;
}

function stripDecoration(label: string, decorations: HierarchyLabelDecorations): string {
  if (label.endsWith(decorations.cycleLabel)) return label.slice(0, -decorations.cycleLabel.length).trimEnd();
  if (label.endsWith(decorations.revisitedLabel)) return label.slice(0, -decorations.revisitedLabel.length).trimEnd();
  return label;
}

export function mountCallHierarchyPanel(
  container: HTMLElement,
  initial: CallHierarchyPanelVanillaProps,
): VanillaViewHandle<CallHierarchyPanelVanillaProps> {
  let props = initial;
  let destroyed = false;

  // Internal state
  let direction: Direction = 'callees';
  let scope: Scope = 'project';
  let excludeTests = false;
  let tree: HierarchyTreeItem | null = null;
  let loading = false;
  let errorMsg: string | null = null;
  let expanded = new Set<string>();
  let loadingChildren = new Set<string>();
  let scrollTop = 0;
  let clientHeight = 0;
  let abortController: AbortController | null = null;

  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;';
  container.appendChild(root);

  // Empty state (no rootFunction)
  const emptyEl = document.createElement('div');
  emptyEl.style.cssText = 'padding:24px;text-align:center;font-size:0.85rem;display:none;';
  root.appendChild(emptyEl);

  // Header: function name + path
  const headerEl = document.createElement('div');
  headerEl.style.cssText = 'flex-shrink:0;display:none;';
  root.appendChild(headerEl);

  const fnNameEl = document.createElement('div');
  fnNameEl.style.cssText = 'font-size:0.875rem;font-weight:700;';
  const fnPathEl = document.createElement('div');
  fnPathEl.style.cssText = 'font-size:0.72rem;';
  headerEl.append(fnNameEl, fnPathEl);

  // Controls: scope select + excludeTests checkbox
  const controlsEl = document.createElement('div');
  controlsEl.style.cssText = 'display:none;align-items:center;gap:12px;flex-shrink:0;padding:6px 16px;';
  root.appendChild(controlsEl);

  const scopeSelect = createSelect<Scope>({
    value: scope,
    options: [
      { value: 'project', label: props.t('c4.callHierarchy.scope.project') },
      { value: 'package', label: props.t('c4.callHierarchy.scope.package') },
      { value: 'file', label: props.t('c4.callHierarchy.scope.file') },
    ],
    onChange: (v) => { scope = v; triggerFetch(); },
    ariaLabel: props.t('c4.callHierarchy.scope'),
    fullWidth: false,
  });
  scopeSelect.el.style.minWidth = '140px';
  scopeSelect.el.style.fontSize = '0.72rem';
  controlsEl.appendChild(scopeSelect.el);

  const { el: checkboxEl } = createCheckbox({
    checked: excludeTests,
    onChange: (checked) => { excludeTests = checked; triggerFetch(); },
  });
  const checkboxLabel = document.createElement('label');
  checkboxLabel.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;font-size:0.78rem;';
  checkboxLabel.append(checkboxEl);
  const checkLabelText = document.createElement('span');
  checkLabelText.textContent = props.t('c4.callHierarchy.excludeTests');
  checkboxLabel.appendChild(checkLabelText);
  controlsEl.appendChild(checkboxLabel);

  // Tabs: callees | callers
  const tabsHandle = createTabs({
    value: direction,
    onChange: (v) => { direction = v as Direction; triggerFetch(); },
    tabs: [
      { value: 'callees', label: props.t('c4.callHierarchy.tab.callees') },
      { value: 'callers', label: props.t('c4.callHierarchy.tab.callers') },
    ],
  });
  tabsHandle.el.style.flexShrink = '0';
  tabsHandle.el.style.display = 'none';
  root.appendChild(tabsHandle.el);

  // Scroll container (virtual)
  const scrollEl = document.createElement('div');
  scrollEl.style.cssText = 'flex:1;overflow:auto;min-height:0;display:none;';
  root.appendChild(scrollEl);

  // Status area (loading/error) inside scroll
  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'padding:16px;display:none;align-items:center;gap:8px;';
  scrollEl.appendChild(statusEl);

  // Virtual list container
  const listEl = document.createElement('div');
  listEl.style.cssText = 'position:relative;';
  scrollEl.appendChild(listEl);

  // ResizeObserver
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver((entries) => {
      for (const entry of entries) clientHeight = entry.contentRect.height;
      renderRows();
    });
    ro.observe(scrollEl);
  }

  scrollEl.addEventListener('scroll', () => {
    scrollTop = scrollEl.scrollTop;
    renderRows();
  });

  function getDecorations(): HierarchyLabelDecorations {
    return {
      cycleLabel: props.t('c4.callHierarchy.cycle'),
      revisitedLabel: props.t('c4.callHierarchy.revisited'),
    };
  }

  function triggerFetch(): void {
    if (!props.rootFunction) return;
    abortController?.abort();
    abortController = new AbortController();
    tree = null;
    loading = true;
    errorMsg = null;
    expanded = new Set();
    renderAll();
    const controller = abortController;
    const decorations = getDecorations();
    fetchHierarchy(props.apiBaseUrl, props.rootFunction, direction, 1, scope, excludeTests, controller.signal)
      .then((api) => {
        if (destroyed || controller.signal.aborted) return;
        tree = buildHierarchyTreeData(api, decorations);
        loading = false;
        expanded = new Set([tree.id]);
        renderAll();
      })
      .catch((err: unknown) => {
        if (destroyed || controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        loading = false;
        errorMsg = err instanceof Error ? err.message : String(err);
        renderAll();
      });
  }

  function renderHeader(): void {
    if (!props.rootFunction) {
      headerEl.style.display = 'none';
      return;
    }
    headerEl.style.cssText = `padding:8px 16px;border-bottom:1px solid ${props.colors.border};flex-shrink:0;display:block;`;
    fnNameEl.textContent = props.rootFunction.fnName;
    fnNameEl.style.color = props.colors.textPrimary;
    fnPathEl.textContent = props.rootFunction.filePath + (typeof props.rootFunction.startLine === 'number' ? `:${props.rootFunction.startLine}` : '');
    fnPathEl.style.color = props.colors.textSecondary;
  }

  function renderStatus(): void {
    statusEl.replaceChildren();
    if (loading) {
      statusEl.style.display = 'flex';
      const { el: spinnerEl } = createSpinner({ size: 14 });
      const label = document.createElement('span');
      label.style.cssText = `font-size:0.875rem;color:${props.colors.textSecondary};`;
      label.textContent = props.t('c4.callHierarchy.loading');
      statusEl.append(spinnerEl, label);
    } else if (errorMsg) {
      statusEl.style.display = 'flex';
      const errSpan = document.createElement('span');
      errSpan.style.cssText = `font-size:0.875rem;color:${props.colors.error};`;
      errSpan.textContent = `${props.t('c4.callHierarchy.error')}: ${errorMsg}`;
      statusEl.appendChild(errSpan);
    } else {
      statusEl.style.display = 'none';
    }
  }

  function renderRows(): void {
    listEl.replaceChildren();
    if (!tree || loading || errorMsg) return;
    const flatRows: readonly FlatRow[] = flattenTree(tree, expanded);
    const totalHeight = flatRows.length * ROW_HEIGHT;
    listEl.style.height = `${totalHeight}px`;
    const [startIdx, endIdx] = computeVisibleRange(scrollTop, clientHeight, ROW_HEIGHT, flatRows.length, ROW_OVERSCAN);

    const topSpacer = document.createElement('div');
    topSpacer.style.height = `${startIdx * ROW_HEIGHT}px`;
    listEl.appendChild(topSpacer);

    const revisitedTooltip = props.t('c4.callHierarchy.revisited');
    for (const row of flatRows.slice(startIdx, endIdx)) {
      listEl.appendChild(createRowEl(row, revisitedTooltip));
    }

    const bottomSpacer = document.createElement('div');
    bottomSpacer.style.height = `${Math.max(0, (flatRows.length - endIdx) * ROW_HEIGHT)}px`;
    listEl.appendChild(bottomSpacer);
  }

  function createRowEl(row: FlatRow, revisitedTooltip: string): HTMLElement {
    const item = row.item;
    const hasChildren = item.children.length > 0;
    const isOpen = expanded.has(item.id);

    const rowDiv = document.createElement('div');
    rowDiv.style.cssText = `display:flex;align-items:center;height:${ROW_HEIGHT}px;padding-left:${8 + row.level * 16}px;padding-right:8px;cursor:pointer;font-size:0.78rem;box-sizing:border-box;overflow:hidden;`;
    if (item.revisited) rowDiv.title = revisitedTooltip;

    // Toggle icon
    const toggleEl = document.createElement('span');
    toggleEl.style.cssText = 'width:16px;height:16px;flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-right:4px;';
    if (hasChildren) {
      toggleEl.innerHTML = isOpen
        ? '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/></svg>'
        : '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';
    }
    rowDiv.appendChild(toggleEl);

    // Label
    const labelEl = document.createElement('span');
    const labelColor = item.cycle ? props.colors.error : item.revisited ? props.colors.textSecondary : props.colors.textPrimary;
    labelEl.style.cssText = `flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${labelColor};`;
    labelEl.textContent = item.label;
    rowDiv.appendChild(labelEl);

    // File path
    const pathEl = document.createElement('span');
    pathEl.style.cssText = `font-size:0.65rem;color:${props.colors.textSecondary};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;margin-left:4px;flex-shrink:0;`;
    pathEl.textContent = item.filePath;
    rowDiv.appendChild(pathEl);

    rowDiv.addEventListener('click', () => void handleToggle(item));
    return rowDiv;
  }

  async function handleToggle(item: HierarchyTreeItem): Promise<void> {
    if (item.cycle || item.revisited) return;
    const next = new Set(expanded);
    const isOpen = next.has(item.id);
    if (isOpen) {
      next.delete(item.id);
      expanded = next;
      renderRows();
      return;
    }
    next.add(item.id);
    expanded = next;

    if (item.children.length > 0 || !props.rootFunction || !tree) {
      renderRows();
      return;
    }
    if (loadingChildren.has(item.id)) return;

    const childRoot: CallHierarchyRootFunction = {
      filePath: item.filePath,
      fnName: stripDecoration(item.label, getDecorations()),
      startLine: item.line,
    };
    loadingChildren = new Set(loadingChildren).add(item.id);
    renderRows();

    const controller = new AbortController();
    try {
      const api = await fetchHierarchy(props.apiBaseUrl, childRoot, direction, 1, scope, excludeTests, controller.signal);
      if (destroyed) return;
      const fresh = buildHierarchyTreeData(api, getDecorations());
      if (tree) tree = replaceItemChildren(tree, item.id, fresh.children);
    } catch (err: unknown) {
      if (destroyed) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const lc = new Set(expanded);
      lc.delete(item.id);
      expanded = lc;
    } finally {
      const lc = new Set(loadingChildren);
      lc.delete(item.id);
      loadingChildren = lc;
    }
    renderRows();
  }

  function renderAll(): void {
    const hasRoot = !!props.rootFunction;

    emptyEl.style.display = hasRoot ? 'none' : 'block';
    emptyEl.textContent = props.t('c4.callHierarchy.empty');
    emptyEl.style.color = props.colors.textSecondary;

    headerEl.style.display = hasRoot ? 'block' : 'none';
    controlsEl.style.display = hasRoot ? 'flex' : 'none';
    tabsHandle.el.style.display = hasRoot ? 'flex' : 'none';
    scrollEl.style.display = hasRoot ? 'block' : 'none';

    if (hasRoot) {
      renderHeader();
      controlsEl.style.borderBottom = `1px solid ${props.colors.border}`;
      tabsHandle.el.style.borderBottom = `1px solid ${props.colors.border}`;
      renderStatus();
      renderRows();
    }
  }

  // Initial fetch
  if (props.rootFunction) triggerFetch();
  renderAll();

  return {
    update(next) {
      const prevRoot = props.rootFunction;
      props = next;
      // Update locale-dependent labels
      scopeSelect.update({
        options: [
          { value: 'project', label: props.t('c4.callHierarchy.scope.project') },
          { value: 'package', label: props.t('c4.callHierarchy.scope.package') },
          { value: 'file', label: props.t('c4.callHierarchy.scope.file') },
        ],
        ariaLabel: props.t('c4.callHierarchy.scope'),
      });
      tabsHandle.update({
        value: direction,
        tabs: [
          { value: 'callees', label: props.t('c4.callHierarchy.tab.callees') },
          { value: 'callers', label: props.t('c4.callHierarchy.tab.callers') },
        ],
      });
      checkLabelText.textContent = props.t('c4.callHierarchy.excludeTests');
      if (next.rootFunction !== prevRoot) {
        if (!next.rootFunction) {
          tree = null; loading = false; errorMsg = null; expanded = new Set();
        } else {
          triggerFetch();
        }
      }
      renderAll();
    },
    destroy() {
      destroyed = true;
      abortController?.abort();
      ro?.disconnect();
      scopeSelect.destroy();
      tabsHandle.destroy();
      root.remove();
    },
  };
}
