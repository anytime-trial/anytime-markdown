import React from 'react';
import { useTrailI18n } from '../../i18n';
import { VanillaIsland } from '../../shared/vanillaIsland';
import {
  mountFiltersPanel,
  type FiltersPanelProps as FiltersPanelViewProps,
} from '../../views/memory/filtersPanel';

export type RepoScope = 'all' | 'current';

export interface FiltersPanelProps {
  readonly repoScope: RepoScope;
  readonly onRepoScopeChange: (scope: RepoScope) => void;
}

export function FiltersPanel({
  repoScope,
  onRepoScopeChange,
}: Readonly<FiltersPanelProps>): React.ReactElement {
  const { t } = useTrailI18n();
  const tStr = (k: string): string => t(k as Parameters<typeof t>[0]);

  const viewProps: FiltersPanelViewProps = {
    t: tStr,
    repoScope,
    onRepoScopeChange,
  };

  return <VanillaIsland mount={mountFiltersPanel} props={viewProps} />;
}
