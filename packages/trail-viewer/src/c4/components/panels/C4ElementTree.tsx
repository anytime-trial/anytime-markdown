import type { C4ReleaseEntry, C4TreeNode } from '@anytime-markdown/trail-core/c4';
import type { Action } from '@anytime-markdown/graph-core/state';
import type { Dispatch, FC } from 'react';
import { useMemo } from 'react';
import { useTrailI18n } from '../../../i18n';
import { getC4Colors } from '../../../theme/c4Tokens';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountC4ElementTree, type C4ElementTreeVanillaProps } from '../../../views/c4/panels/c4ElementTreePanel';

export interface C4ElementTreeProps {
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
  readonly checkReset?: { readonly key: number; readonly ids: ReadonlySet<string> | null; readonly expanded: ReadonlySet<string> | null };
  readonly communityTree?: readonly C4TreeNode[];
  readonly communityLoading?: boolean;
  readonly onCommunityTabOpen?: () => void;
}

export const C4ElementTree: FC<C4ElementTreeProps> = (props) => {
  const { t } = useTrailI18n();
  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);
  const colors = useMemo(() => getC4Colors(props.isDark ?? true), [props.isDark]);

  const viewProps: C4ElementTreeVanillaProps = {
    ...props,
    t: tStr,
    colors: {
      bg: colors.bg,
      bgSecondary: colors.bgSecondary,
      border: colors.border,
      accent: colors.accent,
      hover: colors.hover,
      text: colors.text,
      textMuted: colors.textMuted,
      textSecondary: colors.textSecondary,
      selected: colors.focus,
    },
  };

  return <VanillaIsland mount={mountC4ElementTree} props={viewProps} />;
};
