import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

import type { ArchLayer, ArchNode } from '../architectureModel';

const ACCENT_COLOR = '#E8A012';

interface LayerBandProps {
  readonly layer: ArchLayer;
  readonly title: string;
  readonly description: string;
  readonly groupTitle: (labelKey: string) => string;
}

function ArchitectureNode({ node }: Readonly<{ node: ArchNode }>) {
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <Box
        component="span"
        title={node.pkg ? `packages/${node.pkg}` : undefined}
        sx={{
          display: 'inline-block',
          maxWidth: '100%',
          px: 1.25,
          py: 0.5,
          border: '1px solid',
          borderColor: node.accent ? ACCENT_COLOR : 'divider',
          borderRadius: 999,
          color: node.accent ? ACCENT_COLOR : 'text.primary',
          fontFamily: 'monospace',
          fontSize: '0.75rem',
          lineHeight: 1.4,
          overflowWrap: 'anywhere',
        }}
      >
        {node.label}
      </Box>
    </Box>
  );
}

export function LayerBand({ layer, title, description, groupTitle }: LayerBandProps) {
  return (
    <Box
      component="section"
      aria-labelledby={`architecture-layer-${layer.id}`}
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: 2,
        bgcolor: 'action.hover',
        overflowX: 'auto',
      }}
    >
      <Typography id={`architecture-layer-${layer.id}`} variant="h5" component="h2">
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 2, lineHeight: 1.7 }}>
        {description}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          // Why not: 既定の stretch だと行内で最も高いカードに全カードが揃い、
          // ノード 1 個のグループが大きな空白を抱える。内容の高さに合わせる。
          alignItems: 'start',
          gap: 2,
        }}
      >
        {layer.groups.map((group) => (
          <Paper key={group.id} variant="outlined" sx={{ p: 2, bgcolor: 'background.paper' }}>
            <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, mb: 1.25 }}>
              {groupTitle(group.labelKey)}
            </Typography>
            <Box
              component="ul"
              sx={{ m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 1 }}
            >
              {group.nodes.map((node) => <ArchitectureNode key={node.id} node={node} />)}
            </Box>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}
