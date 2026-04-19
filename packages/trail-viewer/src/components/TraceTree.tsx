import Box from '@mui/material/Box';

import type { TrailTreeNode } from '../parser/types';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';
import { MessageNode } from './MessageNode';

interface TraceTreeProps {
  readonly nodes: readonly TrailTreeNode[];
}

/** Flatten a single tree node and all its descendants */
function flattenNode(node: TrailTreeNode): readonly TrailTreeNode[] {
  const result: TrailTreeNode[] = [node];
  for (const child of node.children) {
    result.push(...flattenNode(child));
  }
  return result;
}

/** Render a single conversation turn (root node + all descendants, flat) */
function ConversationTurn({
  node,
}: Readonly<{
  node: TrailTreeNode;
}>) {
  const flat = flattenNode(node);

  return (
    <>
      {flat.map((n) => (
        <MessageNode
          key={n.message.uuid}
          message={n.message}
          depth={n.depth}
        />
      ))}
    </>
  );
}

export function TraceTree({
  nodes,
}: Readonly<TraceTreeProps>) {
  const { colors, scrollbarSx } = useTrailTheme();
  const { t } = useTrailI18n();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          px: 1,
          py: 1,
          ...scrollbarSx,
        }}
      >
        {nodes.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Box component="span" sx={{ color: colors.textSecondary }}>
              {t('trace.noMessages')}
            </Box>
          </Box>
        ) : (
          nodes.map((rootNode) => (
            <ConversationTurn key={rootNode.message.uuid} node={rootNode} />
          ))
        )}
      </Box>
    </Box>
  );
}
