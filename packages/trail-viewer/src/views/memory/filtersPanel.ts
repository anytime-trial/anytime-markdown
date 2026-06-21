/**
 * FiltersPanel の vanilla 版（`components/memory/FiltersPanel.tsx` の素 DOM 等価）。
 *
 * RepoScope ラジオグループを縦に積む。
 * データ取得なし・presentational のみ。
 */
import {
  createRadio,
  createRadioGroup,
  createFormControlLabel,
} from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';

export type RepoScope = 'all' | 'current';

export interface FiltersPanelProps {
  readonly t: (key: string) => string;
  readonly repoScope: RepoScope;
  readonly onRepoScopeChange: (scope: RepoScope) => void;
}

export function mountFiltersPanel(
  container: HTMLElement,
  initial: FiltersPanelProps,
): VanillaViewHandle<FiltersPanelProps> {
  let props = initial;

  const root = document.createElement('div');
  root.style.cssText =
    'border-right:1px solid var(--am-color-divider);padding:8px;overflow-y:auto;';

  const title = document.createElement('span');
  title.style.cssText =
    'display:block;margin-bottom:8px;font-size:0.75rem;font-weight:600;' +
    'letter-spacing:0.08em;text-transform:uppercase;color:var(--am-color-text-secondary);';
  title.textContent = props.t('memory.chat.filters.title');

  const allLabel = createFormControlLabel({
    label: props.t('memory.chat.filters.allRepos'),
    control: createRadio({ size: 'small' }),
    value: 'all',
  });

  const currentLabel = createFormControlLabel({
    label: props.t('memory.chat.filters.currentRepo'),
    control: createRadio({ size: 'small' }),
    value: 'current',
  });

  const radioGroup = createRadioGroup({
    value: props.repoScope,
    onChange: (v) => props.onRepoScopeChange(v as RepoScope),
    children: [allLabel, currentLabel],
  });

  root.append(title, radioGroup.el);
  container.appendChild(root);

  return {
    update(next) {
      props = next;
      radioGroup.update({
        value: next.repoScope,
        onChange: (v) => props.onRepoScopeChange(v as RepoScope),
      });
      title.textContent = next.t('memory.chat.filters.title');
    },
    destroy() {
      radioGroup.destroy();
      root.remove();
    },
  };
}
