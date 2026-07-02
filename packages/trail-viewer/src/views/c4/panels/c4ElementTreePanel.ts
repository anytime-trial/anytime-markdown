/**
 * C4ElementTree の vanilla DOM 等価実装。
 * ツリー展開・選択・チェック・検索などの全 internal state をここで管理する。
 */
import type { C4TreeNode, C4ReleaseEntry } from '@anytime-markdown/trail-core/c4';
import { filterTreeBySearch } from '@anytime-markdown/trail-core/c4';
import type { Action } from '@anytime-markdown/graph-core/state';
import type { Dispatch } from 'react';
import { createSelect, createTabs, createCheckbox, createSpinner } from '@anytime-markdown/ui-core';
import { communityColor } from '../../../components/communityColors';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

const INDENT_PX = 20;
const UNKNOWN_REPO_KEY = '__unknown__';
const CURRENT_RELEASE_TAG = 'current';

function isCheckableType(type: C4TreeNode['type']): boolean {
  return type === 'system' || type === 'container' || type === 'containerDb' || type === 'component';
}

function collectCheckableIds(nodes: readonly C4TreeNode[]): Set<string> {
  const ids = new Set<string>();
  function walk(list: readonly C4TreeNode[]): void {
    for (const n of list) {
      if (isCheckableType(n.type)) ids.add(n.id);
      if (n.children.length > 0) walk(n.children);
    }
  }
  walk(nodes);
  return ids;
}

function collectDescendantCheckableIds(node: C4TreeNode): Set<string> {
  return collectCheckableIds(node.children);
}

// C4 要素タイプ別アイコン（MUI Material Filled パス）。テキストバッジ(S/C/Co)は
// 「Co」と「C0」が紛らわしいため、種別が一目で区別できる SVG アイコンに置き換える。
const TYPE_ICON_PATHS: Record<string, string> = {
  // person
  person: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  // system / boundary — 角丸の枠（システム境界）
  system: 'M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z',
  // container — widgets（複数ブロック）
  container: 'M13 13v8h8v-8h-8zM3 21h8v-8H3v8zM3 3v8h8V3H3zm13.66-1.31L11 7.34 16.66 13l5.66-5.66-5.66-5.65z',
  // containerDb — storage（DB コンテナ）
  containerDb: 'M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z',
  // component — extension（パズルピース）
  component: 'M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z',
  // code — </>
  code: 'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
  // community — bubble_chart
  community: 'M7.2 14.4c-1.32 0-2.4 1.08-2.4 2.4s1.08 2.4 2.4 2.4 2.4-1.08 2.4-2.4-1.08-2.4-2.4-2.4zm5.8-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm4.5 9c-1.93 0-3.5 1.57-3.5 3.5s1.57 3.5 3.5 3.5 3.5-1.57 3.5-3.5-1.57-3.5-3.5-3.5z',
};

export function typeIconPath(type: C4TreeNode['type']): string {
  switch (type) {
    case 'boundary': return TYPE_ICON_PATHS.system;
    case 'containerDb': return TYPE_ICON_PATHS.containerDb;
    default: return TYPE_ICON_PATHS[type] ?? TYPE_ICON_PATHS.system;
  }
}

// 種別の人間可読ラベル（tooltip / aria-label 用。色のみに依存しない三重表現）。
export function typeLabel(type: C4TreeNode['type']): string {
  switch (type) {
    case 'person': return 'Person';
    case 'system':
    case 'boundary': return 'System';
    case 'container': return 'Container';
    case 'containerDb': return 'Container (DB)';
    case 'component': return 'Component';
    case 'code': return 'Code';
    case 'community': return 'Community';
    default: return 'Element';
  }
}

function makeTypeIcon(type: C4TreeNode['type'], size = 14): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', typeLabel(type));
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', typeIconPath(type));
  svg.appendChild(path);
  return svg;
}

export interface C4ElementTreeColors {
  readonly bg: string;
  readonly bgSecondary: string;
  readonly border: string;
  readonly accent: string;
  readonly hover: string;
  readonly text: string;
  readonly textMuted: string;
  readonly textSecondary: string;
  readonly selected: string;
}

export interface C4ElementTreeVanillaProps {
  readonly tree: readonly C4TreeNode[];
  readonly dispatch: Dispatch<Action>;
  readonly onSelect?: (id: string) => void;
  readonly repoOptions?: readonly string[];
  readonly selectedRepo?: string;
  readonly onRepoChange?: (repo: string) => void;
  readonly releaseOptions?: readonly C4ReleaseEntry[];
  readonly selectedRelease?: string;
  readonly onReleaseChange?: (release: string) => void;
  readonly currentLevel?: number;
  readonly selectedSystemId?: string | null;
  readonly onAddElement?: (type: 'person' | 'system' | 'container' | 'component') => void;
  readonly onCheckedChange?: (checkedIds: ReadonlySet<string>) => void;
  readonly onRemoveElement?: (id: string) => void;
  readonly onPurgeDeleted?: () => void;
  readonly isDark?: boolean;
  readonly checkReset?: {
    readonly key: number;
    readonly ids: ReadonlySet<string> | null;
    readonly expanded: ReadonlySet<string> | null;
  };
  readonly communityTree?: readonly C4TreeNode[];
  readonly communityLoading?: boolean;
  readonly onCommunityTabOpen?: () => void;
  readonly colors: C4ElementTreeColors;
  readonly t: (key: string) => string;
}

export function mountC4ElementTree(
  container: HTMLElement,
  initial: C4ElementTreeVanillaProps,
): VanillaViewHandle<C4ElementTreeVanillaProps> {
  let props = initial;

  // Internal state
  let searchText = '';
  let activeTab: 0 | 1 = 0;
  let selectedId: string | null = null;
  let checkedIds: Set<string> = collectCheckableIds(props.tree);
  let expanded: Set<string> = (() => {
    const ids = new Set<string>();
    for (const n of props.tree) {
      ids.add(n.id);
      if (n.type === 'system' || n.type === 'boundary') {
        for (const child of n.children) ids.add(child.id);
      }
    }
    return ids;
  })();
  let communityExpanded: Set<string> = (() => {
    const ids = new Set<string>();
    for (const n of props.communityTree ?? []) ids.add(n.id);
    return ids;
  })();
  let prevCheckResetKey: number | undefined;
  // communityTree の非同期到着でルートを再展開するための前回参照（旧 useEffect([communityTree])）。
  let prevCommunityTree: readonly C4TreeNode[] | undefined = props.communityTree;

  const root = document.createElement('div');
  root.style.cssText = 'width:260px;display:flex;flex-direction:column;overflow-y:auto;';
  container.appendChild(root);

  // Selectors row (repo + release)
  const selectorsEl = document.createElement('div');
  root.appendChild(selectorsEl);

  let repoSelectHandle: ReturnType<typeof createSelect<string>> | null = null;
  let releaseSelectHandle: ReturnType<typeof createSelect<string>> | null = null;

  // Tabs
  const tabsHandle = createTabs({
    value: String(activeTab),
    onChange: (v) => {
      activeTab = Number(v) as 0 | 1;
      if (activeTab === 1) props.onCommunityTabOpen?.();
      renderTabContent();
    },
    tabs: [
      { value: '0', label: props.t('c4.elementPanel.tabLayer') },
      { value: '1', label: props.t('c4.elementPanel.tabCommunity') },
    ],
  });
  root.appendChild(tabsHandle.el);

  // Search bar
  const searchBar = document.createElement('div');
  root.appendChild(searchBar);
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.style.cssText = 'width:100%;box-sizing:border-box;font-size:0.75rem;padding:3px 6px;border:1px solid var(--am-color-input-border);border-radius:4px;background:transparent;color:inherit;';
  searchInput.addEventListener('input', () => {
    searchText = searchInput.value;
    if (searchText.trim()) {
      const ids = new Set<string>();
      function collectIds(nodes: readonly C4TreeNode[]): void {
        for (const n of nodes) {
          ids.add(n.id);
          if (n.children.length > 0) collectIds(n.children);
        }
      }
      collectIds(filterTreeBySearch(props.tree, searchText));
      expanded = ids;
    }
    renderTabContent();
  });
  searchBar.appendChild(searchInput);

  // Purge button bar
  const purgeBar = document.createElement('div');
  purgeBar.style.cssText = 'display:none;justify-content:flex-end;padding:2px 4px;flex-shrink:0;';
  const purgeBtn = document.createElement('button');
  purgeBtn.title = 'Remove all deleted elements';
  purgeBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:0.75rem;padding:2px 4px;';
  purgeBtn.textContent = '✕ purge deleted';
  purgeBtn.addEventListener('click', () => props.onPurgeDeleted?.());
  purgeBar.appendChild(purgeBtn);
  root.appendChild(purgeBar);

  // Tab content
  const tabContent = document.createElement('div');
  tabContent.style.cssText = 'flex:1;overflow-y:auto;';
  root.appendChild(tabContent);

  // Add-element footer
  const addFooter = document.createElement('div');
  addFooter.style.cssText = 'flex-shrink:0;display:none;';
  root.appendChild(addFooter);

  function notifyCheckedChange(): void {
    props.onCheckedChange?.(checkedIds);
  }

  function buildTreeNode(node: C4TreeNode, depth: number, useExpanded: Set<string>, hideCheckbox: boolean): HTMLElement {
    const wrapper = document.createElement('div');

    const rowEl = document.createElement('div');
    const isSelected = selectedId === node.id;
    rowEl.style.cssText = `display:flex;align-items:center;min-height:28px;padding-left:${8 + depth * INDENT_PX}px;padding-right:4px;cursor:pointer;font-size:0.8rem;box-sizing:border-box;${node.deleted ? 'opacity:0.5;' : ''}background-color:${isSelected ? props.colors.selected : 'transparent'};`;
    // 行 hover ハイライト（旧実装にあった colors.hover を復元。選択行には適用しない）。
    if (!isSelected) {
      rowEl.addEventListener('mouseenter', () => { rowEl.style.backgroundColor = props.colors.hover; });
      rowEl.addEventListener('mouseleave', () => { rowEl.style.backgroundColor = 'transparent'; });
    }

    const hasChildren = node.children.length > 0;
    const isOpen = useExpanded.has(node.id);
    const isCheckable = isCheckableType(node.type);
    const isChecked = checkedIds.has(node.id);

    // Toggle icon
    const toggleSpan = document.createElement('span');
    toggleSpan.style.cssText = 'width:16px;height:16px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;margin-right:2px;';
    if (hasChildren) {
      toggleSpan.innerHTML = isOpen
        ? '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/></svg>'
        : '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';
      toggleSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = new Set(useExpanded);
        if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
        if (useExpanded === expanded) {
          expanded = next;
        } else {
          communityExpanded = next;
        }
        renderTabContent();
      });
    }
    rowEl.appendChild(toggleSpan);

    // Checkbox
    if (isCheckable && !hideCheckbox) {
      const descIds = isChecked && hasChildren ? collectDescendantCheckableIds(node) : null;
      const isIndeterminate = isChecked && descIds && descIds.size > 0
        ? (() => { let cnt = 0; for (const cid of descIds) if (checkedIds.has(cid)) cnt++; return cnt > 0 && cnt < descIds.size; })()
        : false;

      const { el: cbEl } = createCheckbox({
        checked: isChecked,
        indeterminate: isIndeterminate,
        onChange: () => {
          const turning = !checkedIds.has(node.id);
          const next = new Set(checkedIds);
          if (turning) {
            next.add(node.id);
            for (const cid of collectDescendantCheckableIds(node)) next.add(cid);
          } else {
            next.delete(node.id);
            for (const cid of collectDescendantCheckableIds(node)) next.delete(cid);
          }
          checkedIds = next;
          notifyCheckedChange();
          renderTabContent();
        },
      });
      cbEl.addEventListener('click', (e) => e.stopPropagation());
      rowEl.appendChild(cbEl);
    }

    // Type icon（種別を一目で区別できる SVG アイコン。tooltip で種別名も補足）
    const iconSpan = document.createElement('span');
    iconSpan.style.cssText =
      'width:20px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;';
    iconSpan.title = typeLabel(node.type);
    const color = node.type === 'community' && node.communityId !== undefined ? communityColor(node.communityId) : undefined;
    if (color) iconSpan.style.color = color;
    iconSpan.appendChild(makeTypeIcon(node.type));
    rowEl.appendChild(iconSpan);

    // Name
    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = `flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${node.external ? `color:${props.colors.textSecondary};` : ''}${node.deleted ? 'text-decoration:line-through;' : ''}`;
    nameSpan.textContent = node.name;
    rowEl.appendChild(nameSpan);

    // Delete icon for deleted nodes
    if (node.deleted && props.onRemoveElement) {
      const delBtn = document.createElement('button');
      delBtn.title = 'Remove deleted element';
      delBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:2px;font-size:0.7rem;';
      delBtn.textContent = '✕';
      const nodeId = node.id;
      delBtn.addEventListener('click', (e) => { e.stopPropagation(); props.onRemoveElement?.(nodeId); });
      rowEl.appendChild(delBtn);
    }

    const nodeId = node.id;
    rowEl.addEventListener('click', () => {
      selectedId = nodeId;
      props.dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [nodeId], edgeIds: [] } });
      props.onSelect?.(nodeId);
      renderTabContent();
    });

    wrapper.appendChild(rowEl);

    if (hasChildren && isOpen) {
      for (const child of node.children) {
        wrapper.appendChild(buildTreeNode(child, depth + 1, useExpanded, hideCheckbox));
      }
    }

    return wrapper;
  }

  function renderSelectors(): void {
    selectorsEl.replaceChildren();
    const hasRepo = (props.repoOptions?.length ?? 0) > 0;
    const hasRelease = (props.releaseOptions?.length ?? 0) > 0;
    if (!hasRepo && !hasRelease) {
      selectorsEl.style.display = 'none';
      return;
    }
    selectorsEl.style.cssText = `padding:6px 8px;flex-shrink:0;border-bottom:1px solid ${props.colors.border};display:grid;gap:6px;`;
    if (hasRepo && props.repoOptions) {
      repoSelectHandle?.destroy();
      repoSelectHandle = createSelect<string>({
        value: props.selectedRepo ?? '',
        options: props.repoOptions.map((k) => ({ value: k, label: k === UNKNOWN_REPO_KEY ? props.t('c4.unknownRepo') : k })),
        onChange: (v) => props.onRepoChange?.(v),
        ariaLabel: props.t('c4.releaseRepository'),
      });
      selectorsEl.appendChild(repoSelectHandle.el);
    }
    if (hasRelease && props.releaseOptions) {
      releaseSelectHandle?.destroy();
      releaseSelectHandle = createSelect<string>({
        value: props.selectedRelease ?? CURRENT_RELEASE_TAG,
        options: props.releaseOptions.map((e) => ({ value: e.tag, label: e.tag === CURRENT_RELEASE_TAG ? props.t('c4.currentRelease') : e.tag })),
        onChange: (v) => props.onReleaseChange?.(v),
        ariaLabel: props.t('c4.releases'),
      });
      selectorsEl.appendChild(releaseSelectHandle.el);
    }
  }

  function hasDeletedNode(nodes: readonly C4TreeNode[]): boolean {
    for (const n of nodes) {
      if (n.deleted) return true;
      if (n.children.length > 0 && hasDeletedNode(n.children)) return true;
    }
    return false;
  }

  function renderTabContent(): void {
    tabContent.replaceChildren();
    root.style.backgroundColor = props.colors.bgSecondary;
    searchInput.placeholder = props.t('c4.elementPanel.searchPlaceholder');
    searchBar.style.cssText = `padding:4px 8px;flex-shrink:0;border-bottom:1px solid ${props.colors.border};`;
    tabsHandle.el.style.borderBottom = `1px solid ${props.colors.border}`;

    if (hasDeletedNode(props.tree) && props.onPurgeDeleted) {
      purgeBar.style.display = 'flex';
      purgeBar.style.borderBottom = `1px solid ${props.colors.border}`;
    } else {
      purgeBar.style.display = 'none';
    }

    if (activeTab === 0) {
      const filtered = filterTreeBySearch(props.tree, searchText);
      for (const node of filtered) {
        tabContent.appendChild(buildTreeNode(node, 0, expanded, false));
      }
      // Add footer
      addFooter.replaceChildren();
      if (props.onAddElement && props.currentLevel && props.currentLevel >= 1 && props.currentLevel <= 3) {
        addFooter.style.cssText = `display:block;border-top:1px solid ${props.colors.border};padding:6px 8px;flex-shrink:0;`;
        const addLabel = document.createElement('span');
        addLabel.style.cssText = `display:block;color:${props.colors.textMuted};font-size:0.65rem;margin-bottom:4px;`;
        addLabel.textContent = 'Add';
        addFooter.appendChild(addLabel);
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;gap:4px;';
        const btnStyle = `display:flex;align-items:center;gap:4px;font-size:0.75rem;min-height:28px;border-radius:8px;color:${props.colors.accent};border:1px solid ${props.colors.border};background:none;cursor:pointer;padding:0 8px;`;
        if (props.currentLevel === 1) {
          const p1 = document.createElement('button'); p1.style.cssText = btnStyle; p1.textContent = '+ Person'; p1.addEventListener('click', () => props.onAddElement?.('person')); grid.appendChild(p1);
          const p2 = document.createElement('button'); p2.style.cssText = btnStyle; p2.textContent = '+ System'; p2.addEventListener('click', () => props.onAddElement?.('system')); grid.appendChild(p2);
        } else if (props.currentLevel === 2) {
          const p = document.createElement('button'); p.style.cssText = btnStyle; p.textContent = '+ Container'; if (!props.selectedSystemId) p.disabled = true; p.addEventListener('click', () => props.onAddElement?.('container')); grid.appendChild(p);
        } else if (props.currentLevel === 3) {
          const p = document.createElement('button'); p.style.cssText = btnStyle; p.textContent = '+ Component'; p.addEventListener('click', () => props.onAddElement?.('component')); grid.appendChild(p);
        }
        addFooter.appendChild(grid);
      } else {
        addFooter.style.display = 'none';
      }
    } else {
      addFooter.style.display = 'none';
      if (props.communityLoading) {
        const { el: spinnerEl } = createSpinner({ size: 24 });
        const spinnerWrap = document.createElement('div');
        spinnerWrap.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:16px;';
        spinnerWrap.appendChild(spinnerEl);
        tabContent.appendChild(spinnerWrap);
      } else if ((props.communityTree?.length ?? 0) > 0) {
        const filtered = filterTreeBySearch(props.communityTree!, searchText);
        for (const node of filtered) {
          tabContent.appendChild(buildTreeNode(node, 0, communityExpanded, true));
        }
      } else {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.cssText = `display:flex;align-items:center;justify-content:center;padding:16px;font-size:0.75rem;color:${props.colors.textMuted};text-align:center;`;
        emptyMsg.textContent = props.t('c4.elementPanel.communityUnavailable');
        tabContent.appendChild(emptyMsg);
      }
    }
  }

  function applyCheckReset(): void {
    if (!props.checkReset) return;
    if (props.checkReset.key === prevCheckResetKey) return;
    prevCheckResetKey = props.checkReset.key;
    checkedIds = props.checkReset.ids != null ? new Set(props.checkReset.ids) : collectCheckableIds(props.tree);
    if (props.checkReset.expanded != null) expanded = new Set(props.checkReset.expanded);
  }

  /** communityTree が変わったら（非同期ロード後など）ルートノードを再展開する。 */
  function maybeReexpandCommunity(): void {
    if (props.communityTree === prevCommunityTree) return;
    prevCommunityTree = props.communityTree;
    const ids = new Set<string>();
    for (const n of props.communityTree ?? []) ids.add(n.id);
    communityExpanded = ids;
  }

  function render(): void {
    applyCheckReset();
    maybeReexpandCommunity();
    renderSelectors();
    tabsHandle.update({
      value: String(activeTab),
      tabs: [
        { value: '0', label: props.t('c4.elementPanel.tabLayer') },
        { value: '1', label: props.t('c4.elementPanel.tabCommunity') },
      ],
    });
    renderTabContent();
  }

  render();

  return {
    update(next) {
      props = next;
      render();
    },
    destroy() {
      repoSelectHandle?.destroy();
      releaseSelectHandle?.destroy();
      tabsHandle.destroy();
      root.remove();
    },
  };
}
