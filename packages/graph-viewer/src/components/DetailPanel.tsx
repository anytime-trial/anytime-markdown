'use client';

import { Close as CloseIcon } from '@mui/icons-material';
import { Box, Divider, IconButton,Typography } from '@mui/material';

import type { GraphNode } from '../types';

interface DetailPanelProps {
  readonly node: GraphNode;
  readonly onClose: () => void;
}

/** ノードの metadata を読み取り専用で表示する情報パネル */
export function DetailPanel({ node, onClose }: Readonly<DetailPanelProps>) {
  const metadata = node.metadata;
  const entries = metadata ? Object.entries(metadata) : [];

  return (
    <Box
      sx={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 280,
        bgcolor: 'background.paper',
        borderLeft: 1,
        borderColor: 'divider',
        overflowY: 'auto',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ヘッダー */}
      <Box sx={{ display: 'flex', alignItems: 'center', p: 1.5, gap: 1 }}>
        <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600 }} noWrap>
          {node.text || '(Untitled)'}
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="Close detail panel">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Divider />

      {/* ノード基本情報 */}
      <Box sx={{ p: 1.5 }}>
        <Typography variant="caption" color="text.secondary">
          Type
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {node.type}
        </Typography>

        {node.url && (
          <>
            <Typography variant="caption" color="text.secondary">
              URL
            </Typography>
            <Typography
              variant="body2"
              sx={{
                mb: 1,
                wordBreak: 'break-all',
                color: 'primary.main',
                cursor: 'pointer',
                '&:hover': { textDecoration: 'underline' },
              }}
              onClick={() => globalThis.open(node.url, '_blank', 'noopener')}
            >
              {node.url}
            </Typography>
          </>
        )}

        {node.label && (
          <>
            <Typography variant="caption" color="text.secondary">
              Label
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {node.label}
            </Typography>
          </>
        )}
      </Box>

      {/* メタデータ */}
      {entries.length > 0 && (
        <>
          <Divider />
          <Box sx={{ p: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Metadata
            </Typography>
            {entries.map(([key, value]) => (
              <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  {key}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                  {typeof value === 'number' ? value.toLocaleString() : String(value)}
                </Typography>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
