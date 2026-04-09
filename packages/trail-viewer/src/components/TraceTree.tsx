import { useState } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';

import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';

import type { TrailSession, TrailTreeNode } from '../parser/types';
import { useTrailTheme } from './TrailThemeContext';
import { MessageNode } from './MessageNode';

interface TraceTreeProps {
  readonly nodes: readonly TrailTreeNode[];
  readonly session?: TrailSession;
  readonly showSystem?: boolean;
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
  showSystem,
}: Readonly<{
  node: TrailTreeNode;
  showSystem: boolean;
}>) {
  const flat = flattenNode(node);

  return (
    <>
      {flat.map((n) => {
        if (!showSystem && n.message.type === 'system') {
          return null;
        }
        return (
          <MessageNode
            key={n.message.uuid}
            message={n.message}
            depth={n.depth}
          />
        );
      })}
    </>
  );
}

export function TraceTree({
  nodes,
  session,
  showSystem: showSystemProp = false,
}: Readonly<TraceTreeProps>) {
  const { colors } = useTrailTheme();
  const [showSystem, setShowSystem] = useState(showSystemProp);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: colors.border,
          flexShrink: 0,
        }}
      >
        {session && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 0.5, flexWrap: 'wrap' }}>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              Claude Code {session.version}
            </Typography>
            <Chip label={session.model || 'unknown'} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem', borderColor: colors.iceBlue, color: colors.iceBlue }} />
            <Chip label={session.gitBranch || '-'} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem', borderColor: colors.iceBlue, color: colors.iceBlue }} />
          </Box>
        )}
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={showSystem}
              onChange={(_, checked) => setShowSystem(checked)}
              sx={{
                '&.Mui-checked': { color: colors.iceBlue },
                '&.Mui-checked + .MuiSwitch-track': { bgcolor: colors.iceBlue },
              }}
            />
          }
          label="Show system messages"
          slotProps={{
            typography: { variant: 'body2', sx: { color: colors.textSecondary } },
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
            <Box component="span" sx={{ color: colors.textSecondary }}>
              No messages
            </Box>
          </Box>
        ) : (
          nodes.map((rootNode, index) => (
            <Box key={rootNode.message.uuid}>
              {index > 0 && <Divider sx={{ my: 2, borderColor: colors.border }} />}
              <ConversationTurn node={rootNode} showSystem={showSystem} />
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}
