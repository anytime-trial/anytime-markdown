'use client';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';

import LandingHeader from '../components/LandingHeader';
import { ARCHITECTURE_LAYERS } from './architectureModel';
import { FlowConnector } from './components/FlowConnector';
import { LayerBand } from './components/LayerBand';

export default function ArchitectureBody() {
  const t = useTranslations('Architecture');

  return (
    <Box sx={{ minHeight: '100vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <LandingHeader />
      <Container maxWidth={false} sx={{ maxWidth: 1100, py: { xs: 4, md: 6 }, flex: 1 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          {t('title')}
        </Typography>
        <Typography variant="body1" sx={{ maxWidth: 820, lineHeight: 1.8 }}>
          {t('lead')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 4 }}>
          {t('updatedNote')}
        </Typography>

        {/* Why not: 素の div へ aria-label を置いても支援技術は名前を読まない。
            section へ名前を付けて region ランドマークにし、図全体の要約を到達可能にする。 */}
        <Box component="section" aria-label={t('diagramAriaLabel')} sx={{ overflowX: 'auto', pb: 1 }}>
          <Box sx={{ minWidth: { xs: 280, sm: 0 } }}>
            {ARCHITECTURE_LAYERS.map((layer) => (
              <Box key={layer.id}>
                <LayerBand
                  layer={layer}
                  title={t(`layers.${layer.labelKey}`)}
                  description={t(`descriptions.${layer.descriptionKey}`)}
                  groupTitle={(labelKey) => t(`groups.${labelKey}`)}
                />
                {layer.flowKey ? <FlowConnector label={t(`flows.${layer.flowKey}`)} /> : null}
              </Box>
            ))}
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
