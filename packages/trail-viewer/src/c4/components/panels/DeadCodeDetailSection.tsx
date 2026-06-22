import * as React from 'react';
import type { FileAnalysisApiEntry } from '../../hooks/fetchFileAnalysisApi';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountDeadCodeDetailPanel, type DeadCodeDetailPanelProps } from '../../../views/c4/panels/deadCodeDetailPanel';

export interface DeadCodeDetailSectionProps {
  readonly entries: readonly FileAnalysisApiEntry[];
  readonly t: (key: string) => string;
  readonly colors: {
    readonly border: string;
    readonly text: string;
    readonly textSecondary: string;
    readonly textMuted: string;
  };
  readonly onFileOpen?: (filePath: string) => void;
}

export const DeadCodeDetailSection: React.FC<DeadCodeDetailSectionProps> = (props) => {
  const viewProps: DeadCodeDetailPanelProps = {
    entries: props.entries,
    t: props.t,
    colors: props.colors,
    onFileOpen: props.onFileOpen,
  };
  return <VanillaIsland mount={mountDeadCodeDetailPanel} props={viewProps} />;
};
