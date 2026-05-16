import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Sigma from 'sigma';
import { EdgeArrowProgram } from 'sigma/rendering';
import { useTrailTheme } from '../TrailThemeContext';
import { useTrailI18n } from '../../i18n';
import { buildBugGraph } from './bugGraphBuilder';
import type { MemoryBugHistoryRow } from '../../data/types';

export interface BugCausedByGraphProps {
  readonly bugs: readonly MemoryBugHistoryRow[];
  readonly isDark?: boolean;
}

export function BugCausedByGraph({ bugs, isDark = true }: Readonly<BugCausedByGraphProps>) {
  const { t } = useTrailI18n();
  const { colors } = useTrailTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const [containerReady, setContainerReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const update = () => {
      const ready = el.clientWidth > 0 && el.clientHeight > 0;
      setContainerReady((prev) => (prev === ready ? prev : ready));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!containerReady || !containerRef.current) return undefined;
    if (bugs.length === 0) return undefined;

    const g = buildBugGraph(bugs, isDark);

    const sigma = new Sigma(g, containerRef.current, {
      defaultEdgeType: 'arrow',
      edgeProgramClasses: { arrow: EdgeArrowProgram },
      renderEdgeLabels: true,
      labelSize: 10,
      defaultNodeColor: isDark ? '#607d8b' : '#90a4ae',
      defaultEdgeColor: isDark ? '#546e7a' : '#b0bec5',
      stagePadding: 20,
    });

    sigmaRef.current = sigma;
    return () => {
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [containerReady, bugs, isDark]);

  if (bugs.length === 0) {
    return (
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography variant="caption" sx={{ color: colors.textSecondary }}>
          {t('memory.bug.causedBy.empty')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      aria-label={t('memory.bug.causedBy.title')}
      sx={{ width: '100%', height: '100%', bgcolor: isDark ? '#1a2027' : '#f5f5f5' }}
    />
  );
}
