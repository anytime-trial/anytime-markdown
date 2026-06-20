import * as React from 'react';
import { Box, Typography, Check as CheckIcon, Close as CloseIcon } from '../../../ui';
import type { FileAnalysisApiEntry } from '../../hooks/fetchFileAnalysisApi';
import { aggregateDeadCodeForElement, type DeadCodeJudgment } from '../deadCodeJudgment';

interface Colors {
  readonly border: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly textMuted: string;
}

export interface DeadCodeDetailSectionProps {
  readonly entries: readonly FileAnalysisApiEntry[];
  readonly t: (key: string) => string;
  readonly colors: Colors;
  readonly onFileOpen?: (filePath: string) => void;
}

const JUDGMENT_COLOR: Record<DeadCodeJudgment, string> = {
  strong: '#f44336',
  review: '#ffc107',
  healthy: '#4caf50',
  ignored: '#9e9e9e',
};

const SIGNAL_DEFS = [
  { key: 'orphan' as const, weight: 45, i18n: 'c4.popup.deadCode.signalOrphan' },
  { key: 'fanInZero' as const, weight: 25, i18n: 'c4.popup.deadCode.signalFanInZero' },
  { key: 'noRecentChurn' as const, weight: 15, i18n: 'c4.popup.deadCode.signalNoRecentChurn' },
  { key: 'zeroCoverage' as const, weight: 10, i18n: 'c4.popup.deadCode.signalZeroCoverage' },
  { key: 'isolatedCommunity' as const, weight: 5, i18n: 'c4.popup.deadCode.signalIsolatedCommunity' },
];

const JUDGMENT_I18N_KEY: Record<DeadCodeJudgment, string> = {
  strong: 'c4.popup.deadCode.judgmentStrong',
  review: 'c4.popup.deadCode.judgmentReview',
  healthy: 'c4.popup.deadCode.judgmentHealthy',
  ignored: 'c4.popup.deadCode.judgmentIgnored',
};

export const DeadCodeDetailSection: React.FC<DeadCodeDetailSectionProps> = ({
  entries,
  t,
  colors,
  onFileOpen,
}) => {
  if (entries.length === 0) return null;

  const agg = aggregateDeadCodeForElement(entries);
  const judgmentLabel = t(JUDGMENT_I18N_KEY[agg.judgment]);
  const judgmentColor = JUDGMENT_COLOR[agg.judgment];

  return (
    <Box sx={{ borderTop: `1px solid ${colors.border}`, mt: 1.25, pt: 1 }}>
      {/* タイトル */}
      <Typography
        variant="caption"
        sx={{
          color: colors.textSecondary,
          fontSize: '0.68rem',
          fontWeight: 700,
          display: 'block',
          mb: 0.5,
        }}
      >
        {t('c4.popup.deadCode.title')}
      </Typography>

      {/* スコア + 判定バッジ */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.75 }}>
        <Typography
          variant="body2"
          sx={{ color: colors.text, fontSize: '0.78rem', fontWeight: 700 }}
        >
          {agg.score} / 100
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: judgmentColor, fontSize: '0.65rem', fontWeight: 700 }}
        >
          [{judgmentLabel}]
        </Typography>
      </Box>

      {/* シグナルチェックリスト */}
      <Box sx={{ display: 'grid', gap: 0.25, mb: 0.75 }}>
        {SIGNAL_DEFS.map((sig) => {
          const active = agg.signals[sig.key];
          return (
            <Box key={sig.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {active ? (
                <CheckIcon fontSize={11} color="#f44336" />
              ) : (
                <CloseIcon fontSize={11} color={colors.textMuted} />
              )}
              <Typography
                variant="caption"
                sx={{
                  color: active ? colors.text : colors.textMuted,
                  fontSize: '0.6rem',
                  flex: 1,
                }}
              >
                {t(sig.i18n)}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: colors.textMuted, fontSize: '0.58rem' }}
              >
                +{sig.weight}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* 関連ファイル一覧 */}
      {agg.relatedFiles.length > 0 && (
        <Box>
          <Typography
            variant="caption"
            sx={{
              color: colors.textSecondary,
              fontSize: '0.62rem',
              fontWeight: 600,
              display: 'block',
              mb: 0.25,
            }}
          >
            {t('c4.popup.deadCode.relatedFiles')}
          </Typography>
          {agg.relatedFiles.map((f) => (
            <Box
              key={f.filePath}
              onClick={() => onFileOpen?.(f.filePath)}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: onFileOpen ? 'pointer' : 'default',
                '&:hover': onFileOpen ? { textDecoration: 'underline' } : undefined,
                py: 0.15,
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: colors.text, fontSize: '0.6rem', wordBreak: 'break-all' }}
              >
                {f.filePath}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: colors.textMuted, fontSize: '0.58rem', ml: 0.5 }}
              >
                [{f.score}]
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};
