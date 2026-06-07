'use client';

import { Box, CloseIcon, Divider, IconButton, Text } from '../ui';

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
      className="gv-scroll"
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 280,
        backgroundColor: 'var(--gv-color-bg-paper)',
        borderLeft: '1px solid var(--gv-color-divider)',
        overflowY: 'auto',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ヘッダー */}
      <Box style={{ display: 'flex', alignItems: 'center', padding: 12, gap: 8 }}>
        <Text
          variant="subtitle2"
          style={{ flex: 1, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {node.text || '(Untitled)'}
        </Text>
        <IconButton size="small" onClick={onClose} aria-label="Close detail panel">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Divider />

      {/* ノード基本情報 */}
      <Box style={{ padding: 12 }}>
        <Text variant="caption" color="text.secondary">
          Type
        </Text>
        <Text style={{ display: 'block', marginBottom: 8 }}>
          {node.type}
        </Text>

        {node.url && (
          <>
            <Text variant="caption" color="text.secondary">
              URL
            </Text>
            <Text
              style={{
                display: 'block',
                marginBottom: 8,
                wordBreak: 'break-all',
                color: 'var(--gv-color-primary-main)',
                cursor: 'pointer',
              }}
              onClick={() => globalThis.open(node.url, '_blank', 'noopener')}
            >
              {node.url}
            </Text>
          </>
        )}

        {node.label && (
          <>
            <Text variant="caption" color="text.secondary">
              Label
            </Text>
            <Text style={{ display: 'block', marginBottom: 8 }}>
              {node.label}
            </Text>
          </>
        )}
      </Box>

      {/* メタデータ */}
      {entries.length > 0 && (
        <>
          <Divider />
          <Box style={{ padding: 12 }}>
            <Text variant="caption" color="text.secondary" style={{ marginBottom: 4, display: 'block' }}>
              Metadata
            </Text>
            {entries.map(([key, value]) => (
              <Box key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <Text color="text.secondary">
                  {key}
                </Text>
                <Text style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                  {typeof value === 'number' ? value.toLocaleString() : String(value)}
                </Text>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
