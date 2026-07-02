/**
 * FilterBar の vanilla 版（`components/FilterBar.tsx` の素 DOM 等価）。
 *
 * セッション検索テキスト + ワークスペース選択の 2 フィールドを持つ横並びフィルタバー。
 * テーマ色は `--am-color-*` CSS 変数で追従（colors props 経由）。
 */
import {
  createTextField,
  createSelect,
  createIconButton,
  createToolbar,
  Clear,
  Search,
} from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../shared/vanillaIsland';
import type { TrailFilter, TrailSession } from '../domain/parser/types';

export interface FilterBarProps {
  readonly t: (key: string) => string;
  readonly filter: TrailFilter;
  readonly sessions: readonly TrailSession[];
  readonly onChange: (filter: TrailFilter) => void;
  /** colors from TrailThemeContext (midnightNavy, border, textSecondary) */
  readonly colors: {
    readonly midnightNavy: string;
    readonly border: string;
    readonly textSecondary: string;
  };
}

function getWorkspaces(sessions: readonly TrailSession[]): string[] {
  const set = new Set<string>();
  for (const s of sessions) {
    if (s.workspace) set.add(s.workspace);
  }
  return [...set].sort();
}

export function mountFilterBar(
  container: HTMLElement,
  initial: FilterBarProps,
): VanillaViewHandle<FilterBarProps> {
  let props = initial;
  let destroyed = false;

  // ── toolbar root ─────────────────────────────────────────────────────────
  const toolbar = createToolbar({
    variant: 'dense',
    style: {
      gap: '8px',
      borderBottom: `1px solid ${props.colors.border}`,
      backgroundColor: props.colors.midnightNavy,
      flexWrap: 'wrap',
      minHeight: '56px',
    },
  });
  container.appendChild(toolbar.el);

  // ── search text field ────────────────────────────────────────────────────
  const searchIcon = Search({ fontSize: 16, color: props.colors.textSecondary });
  const clearIcon = Clear({ fontSize: 14 });
  const clearBtnHandle = createIconButton({
    size: 'small',
    ariaLabel: props.t('filter.searchClear'),
    children: clearIcon.el,
    onClick: () => {
      if (destroyed) return;
      props.onChange({ ...props.filter, searchText: undefined });
    },
  });
  // Show/hide clear button based on searchText
  clearBtnHandle.el.style.display = props.filter.searchText ? '' : 'none';
  clearBtnHandle.el.style.color = props.colors.textSecondary;

  const searchField = createTextField({
    label: props.t('filter.searchLabel'),
    placeholder: props.t('filter.searchPlaceholder'),
    value: props.filter.searchText ?? '',
    size: 'small',
    style: { minWidth: '200px' },
    onChange: (e) => {
      if (destroyed) return;
      const val = (e.target as HTMLInputElement).value;
      props.onChange({ ...props.filter, searchText: val || undefined });
    },
  });

  // Insert search icon before the input, clear button after
  const inputEl = searchField.input as HTMLInputElement;
  const searchIconWrap = document.createElement('span');
  searchIconWrap.style.cssText = 'display:flex;align-items:center;padding-right:4px;';
  searchIconWrap.appendChild(searchIcon.el);
  inputEl.parentElement?.insertBefore(searchIconWrap, inputEl);
  inputEl.parentElement?.appendChild(clearBtnHandle.el);

  toolbar.el.appendChild(searchField.el);

  // ── workspace select ─────────────────────────────────────────────────────
  const wsBox = document.createElement('div');
  wsBox.style.cssText = 'display:flex;gap:8px;';

  let wsSelect = buildWorkspaceSelect(props);
  wsBox.appendChild(wsSelect.el);
  toolbar.el.appendChild(wsBox);

  function buildWorkspaceSelect(p: FilterBarProps) {
    const workspaces = getWorkspaces(p.sessions);
    const allLabel =
      p.t('filter.workspaceAll') !== 'filter.workspaceAll' ? p.t('filter.workspaceAll') : 'All';
    const options = [
      { value: '' as string, label: allLabel },
      ...workspaces.map((w) => ({ value: w, label: w })),
    ];
    return createSelect({
      value: p.filter.workspace ?? '',
      options,
      ariaLabel: p.t('filter.workspace'),
      fullWidth: false,
      minWidth: 200, // 旧 sx.minWidth:200。選択値の文字数で幅がガタつくのを防ぐ。
      onChange: (val) => {
        if (destroyed) return;
        p.onChange({ ...p.filter, workspace: val || undefined });
      },
    });
  }

  function applyProps(next: FilterBarProps): void {
    // Update toolbar colors
    toolbar.el.style.borderBottom = `1px solid ${next.colors.border}`;
    toolbar.el.style.backgroundColor = next.colors.midnightNavy;

    // Update search field value
    searchField.update({ value: next.filter.searchText ?? '' });
    clearBtnHandle.el.style.display = next.filter.searchText ? '' : 'none';
    clearBtnHandle.el.style.color = next.colors.textSecondary;
    searchIcon.el.style.color = next.colors.textSecondary;

    // Rebuild workspace select if sessions or workspace changed
    const prevWs = props.filter.workspace;
    const prevSessions = props.sessions;
    if (next.sessions !== prevSessions || next.filter.workspace !== prevWs) {
      const newSelect = buildWorkspaceSelect(next);
      wsBox.replaceChildren(newSelect.el);
      wsSelect.destroy();
      wsSelect = newSelect;
    }
  }

  return {
    update(next: FilterBarProps) {
      // applyProps が `props`(旧値) を prev として next と比較するため、再代入は applyProps の後。
      applyProps(next);
      props = next;
    },
    destroy() {
      destroyed = true;
      searchField.destroy();
      clearBtnHandle.destroy();
      wsSelect.destroy();
      toolbar.el.remove();
    },
  };
}
