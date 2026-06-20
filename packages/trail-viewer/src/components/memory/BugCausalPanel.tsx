import { useEffect, useState } from 'react';
import { Box, Chip, Divider, Tooltip, Typography } from '../../ui';
import { useTrailI18n } from '../../i18n';
import { useTrailTheme } from '../TrailThemeContext';
import type { MemoryReader } from '../../data/readers/MemoryReader';
import type { MemoryBugCausalInfo } from '../../data/types';

const CATEGORY_COLORS: Record<string, 'default' | 'error' | 'warning' | 'info' | 'success'> = {
  regression: 'error',
  spec: 'info',
  logic: 'warning',
  typo: 'default',
  deps: 'default',
};

const SEVERITY_COLORS: Record<string, 'default' | 'warning' | 'error' | 'info'> = {
  info: 'info',
  warn: 'warning',
  error: 'error',
};

export interface BugCausalPanelProps {
  readonly reader: MemoryReader | null;
  readonly bugEntityId: string | null;
  readonly onOpenPrecedingReviews?: (findingIds: readonly string[]) => void;
  readonly onOpenSiblingBugs?: (bugEntityIds: readonly string[]) => void;
}

export function BugCausalPanel({
  reader,
  bugEntityId,
  onOpenPrecedingReviews,
  onOpenSiblingBugs,
}: Readonly<BugCausalPanelProps>) {
  const { t } = useTrailI18n();
  const { colors, scrollbarSx } = useTrailTheme();
  const [info, setInfo] = useState<MemoryBugCausalInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!reader || !bugEntityId) {
      setInfo(null);
      return;
    }
    setLoading(true);
    let cancelled = false;
    void reader.getBugCausalInfo(bugEntityId).then((data) => {
      if (!cancelled) {
        setInfo(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reader, bugEntityId]);

  if (!bugEntityId) {
    return (
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography variant="caption" sx={{ color: colors.textSecondary }}>
          {t('memory.bug.causedBy.empty')}
        </Typography>
      </Box>
    );
  }

  if (loading || !info) {
    return (
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography variant="caption" sx={{ color: colors.textSecondary }}>
          {t('memory.loading')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 1.5, overflow: 'auto', height: '100%', ...scrollbarSx }}>
      {/* このバグ */}
      <Section title={`📌 ${t('memory.bug.causal.thisBug')}`} colors={colors}>
        <Typography variant="body2" sx={{ color: colors.textPrimary, fontWeight: 500, mb: 0.5 }}>
          {info.subject}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip
            label={info.category}
            color={CATEGORY_COLORS[info.category] ?? 'default'}
            size="small"
            sx={{ fontSize: '0.65rem', height: 18 }}
          />
          <Typography variant="caption" sx={{ color: colors.textSecondary, fontFamily: 'monospace' }}>
            {info.commitSha.slice(0, 7)}
          </Typography>
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            ({info.committedAt.slice(0, 10)})
          </Typography>
        </Box>
      </Section>

      {/* 同じ原因の過去バグ */}
      {info.siblingBugEntityIds.length > 0 && (
        <Section title={`🔁 ${t('memory.bug.causal.sibling')}`} colors={colors}>
          <Tooltip title={t('memory.bug.causal.sibling.tooltip')}>
            <Chip
              label={`${info.siblingBugEntityIds.length} ${t('memory.bug.causal.bugsUnit')}`}
              size="small"
              color="warning"
              onClick={() => onOpenSiblingBugs?.(info.siblingBugEntityIds)}
              sx={{ fontSize: '0.7rem', height: 22, cursor: onOpenSiblingBugs ? 'pointer' : 'default' }}
            />
          </Tooltip>
        </Section>
      )}

      {/* 事前指摘 */}
      {info.precedingFindings.length > 0 && (
        <Section title={`⚠ ${t('memory.bug.causal.preceding')}`} colors={colors}>
          <Box sx={{ mb: 0.5 }}>
            <Chip
              label={`${info.precedingFindings.length} ${t('memory.bug.causal.findingsUnit')}`}
              size="small"
              color="info"
              onClick={() =>
                onOpenPrecedingReviews?.(info.precedingFindings.map((f) => f.findingEntityId))
              }
              sx={{ fontSize: '0.7rem', height: 22, cursor: onOpenPrecedingReviews ? 'pointer' : 'default' }}
            />
          </Box>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {info.precedingFindings.slice(0, 5).map((f) => (
              <Box component="li" key={f.findingEntityId} sx={{ fontSize: '0.7rem', color: colors.textSecondary, mb: 0.25 }}>
                <Chip
                  label={f.severity}
                  size="small"
                  color={SEVERITY_COLORS[f.severity] ?? 'default'}
                  sx={{ fontSize: '0.6rem', height: 16, mr: 0.5 }}
                />
                <Typography component="span" variant="caption" sx={{ color: colors.textPrimary }}>
                  {f.targetFilePath ?? '—'}
                </Typography>
              </Box>
            ))}
          </Box>
        </Section>
      )}

      {/* 混入コミット */}
      {info.introducedByCommitSha && (
        <Section title={`🔧 ${t('memory.bug.causal.introducedBy')}`} colors={colors}>
          <Typography variant="caption" sx={{ color: colors.textSecondary, fontFamily: 'monospace', display: 'block' }}>
            {info.introducedByCommitSha.slice(0, 7)}
          </Typography>
          {info.introducedByCommitSubject && (
            <Typography variant="caption" sx={{ color: colors.textPrimary, display: 'block', mt: 0.25 }}>
              {info.introducedByCommitSubject}
            </Typography>
          )}
        </Section>
      )}

      {/* 影響ファイル */}
      {info.affectedFilePaths.length > 0 && (
        <Section
          title={`📁 ${t('memory.bug.causal.affectedFiles')} (${info.affectedFilePaths.length})`}
          colors={colors}
        >
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {info.affectedFilePaths.slice(0, 6).map((p) => (
              <Box
                component="li"
                key={p}
                sx={{ fontSize: '0.7rem', color: colors.textSecondary, fontFamily: 'monospace' }}
              >
                {p}
              </Box>
            ))}
            {info.affectedFilePaths.length > 6 && (
              <Box component="li" sx={{ fontSize: '0.65rem', color: colors.textDisabled, listStyle: 'none' }}>
                …+ {info.affectedFilePaths.length - 6}
              </Box>
            )}
          </Box>
        </Section>
      )}

      {/* 根本原因 */}
      {info.rootCauses.length > 0 && (
        <Section title={`🧩 ${t('memory.bug.causal.rootCauses')}`} colors={colors}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {info.rootCauses.map((rc) => (
              <Typography
                key={rc.entityId}
                variant="caption"
                sx={{ color: colors.textPrimary, fontSize: '0.7rem' }}
              >
                • {rc.displayName}
              </Typography>
            ))}
          </Box>
        </Section>
      )}

      {/* どのセクションも空のとき */}
      {info.siblingBugEntityIds.length === 0 &&
        info.precedingFindings.length === 0 &&
        !info.introducedByCommitSha &&
        info.affectedFilePaths.length === 0 &&
        info.rootCauses.length === 0 && (
          <Typography variant="caption" sx={{ color: colors.textSecondary, fontStyle: 'italic' }}>
            {t('memory.bug.causal.noCauses')}
          </Typography>
        )}
    </Box>
  );
}

interface SectionProps {
  readonly title: string;
  readonly colors: { readonly textSecondary: string; readonly border: string };
  readonly children: React.ReactNode;
}

function Section({ title, colors, children }: Readonly<SectionProps>) {
  return (
    <Box sx={{ mb: 1.25 }}>
      <Typography
        variant="caption"
        sx={{ color: colors.textSecondary, fontWeight: 600, fontSize: '0.7rem', display: 'block', mb: 0.5 }}
      >
        {title}
      </Typography>
      {children}
      <Divider sx={{ mt: 1, borderColor: colors.border }} />
    </Box>
  );
}
