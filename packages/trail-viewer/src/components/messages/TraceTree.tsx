import type { TrailTreeNode } from '../../domain/parser/types';
import { useTrailI18n } from '../../i18n';
import { VanillaIsland } from '../../shared/vanillaIsland';
import { mountTraceTree, type TraceTreeProps as TraceTreeViewProps } from '../../views/messages/traceTree';

interface TraceTreeProps {
  readonly nodes: readonly TrailTreeNode[];
}

export function TraceTree({
  nodes,
}: Readonly<TraceTreeProps>) {
  const { t } = useTrailI18n();
  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);

  const viewProps: TraceTreeViewProps = {
    t: tStr,
    nodes,
  };

  return <VanillaIsland mount={mountTraceTree} props={viewProps} />;
}
