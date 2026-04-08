import { useState } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';

import type { TrailTreeNode } from '../parser/types';
import { MessageNode } from './MessageNode';

interface TraceTreeProps {
  readonly nodes: readonly TrailTreeNode[];
  readonly showSystem?: boolean;
}

/** Flatten tree nodes for rendering */
function flattenNodes(nodes: readonly TrailTreeNode[]): readonly TrailTreeNode[] {
  const result: TrailTreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children.length > 0) {
      result.push(...flattenNodes(node.children));
    }
  }
  return result;
}

function FlatMessageList({
  nodes,
  showSystem,
}: Readonly<{
  nodes: readonly TrailTreeNode[];
  showSystem: boolean;
}>) {
  const flat = flattenNodes(nodes);
  let userCount = 0;

  return (
    <>
      {flat.map((node) => {
        if (!showSystem && node.message.type === 'system') {
          return null;
        }

        const isUserTurn = node.message.type === 'user' && !node.message.isSidechain;
        if (isUserTurn) userCount++;
        const showDivider = isUserTurn && userCount > 1;

        return (
          <Box key={node.message.uuid}>
            {showDivider && <Divider sx={{ my: 1.5 }} />}
            <MessageNode
              message={node.message}
              depth={node.depth}
            />
          </Box>
        );
      })}
    </>
  );
}

export function TraceTree({
  nodes,
  showSystem: showSystemProp = false,
}: Readonly<TraceTreeProps>) {
  const [showSystem, setShowSystem] = useState(showSystemProp);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={showSystem}
              onChange={(_, checked) => setShowSystem(checked)}
            />
          }
          label="Show system messages"
          slotProps={{
            typography: { variant: 'body2' },
          }}
        />
      </Box>

      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          px: 1,
          py: 1,
        }}
      >
        {nodes.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Box component="span" sx={{ color: 'text.secondary' }}>
              No messages
            </Box>
          </Box>
        ) : (
          <FlatMessageList nodes={nodes} showSystem={showSystem} />
        )}
      </Box>
    </Box>
  );
}
