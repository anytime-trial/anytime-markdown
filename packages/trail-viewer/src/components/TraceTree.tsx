import { useState } from 'react';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';

import type { TrailTreeNode } from '../parser/types';
import { MessageNode } from './MessageNode';

interface TraceTreeProps {
  readonly nodes: readonly TrailTreeNode[];
  readonly showSystem?: boolean;
}

function TreeNodeList({
  nodes,
  showSystem,
}: Readonly<{
  nodes: readonly TrailTreeNode[];
  showSystem: boolean;
}>) {
  return (
    <>
      {nodes.map((node) => {
        if (!showSystem && node.message.type === 'system') {
          return null;
        }

        return (
          <Box key={node.message.uuid}>
            <MessageNode
              message={node.message}
              depth={node.depth}
            />
            {node.children.length > 0 && (
              <TreeNodeList
                nodes={node.children}
                showSystem={showSystem}
              />
            )}
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
          <TreeNodeList nodes={nodes} showSystem={showSystem} />
        )}
      </Box>
    </Box>
  );
}
