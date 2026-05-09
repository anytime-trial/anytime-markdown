import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTrailI18n } from '../../i18n';
import { useTrailTheme } from '../TrailThemeContext';
import type { MemoryDriftEventDetail } from '../../data/types';

const SEVERITY_COLORS: Record<string, 'default' | 'warning' | 'error'> = {
  info: 'default',
  warn: 'warning',
  error: 'error',
};

export interface DriftDetailDialogProps {
  readonly eventId: string;
  readonly onClose: () => void;
  readonly onResolve: (id: string, note: string) => Promise<void>;
  readonly onLoadDetail: (id: string) => Promise<unknown>;
}

function DetailRow({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  const { colors } = useTrailTheme();
  return (
    <Box sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
      <Typography variant="caption" sx={{ color: colors.textSecondary, minWidth: 120, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="caption" sx={{ color: colors.textPrimary, wordBreak: 'break-all' }}>
        {value}
      </Typography>
    </Box>
  );
}

export function DriftDetailDialog({ eventId, onClose, onResolve, onLoadDetail }: Readonly<DriftDetailDialogProps>) {
  const { t } = useTrailI18n();
  const { colors } = useTrailTheme();
  const [detail, setDetail] = useState<MemoryDriftEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void onLoadDetail(eventId).then((d) => {
      if (!cancelled) {
        setDetail(d as MemoryDriftEventDetail | null);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [eventId, onLoadDetail]);

  const handleResolve = useCallback(async () => {
    setResolving(true);
    try {
      await onResolve(eventId, note);
      onClose();
    } finally {
      setResolving(false);
    }
  }, [eventId, note, onResolve, onClose]);

  const isResolved = detail?.resolvedAt != null;

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: '0.9rem', pb: 1 }}>
        {detail ? (detail.subjectDisplayName || detail.subjectEntityId) : t('memory.drift.detail')}
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : detail == null ? (
          <Typography variant="body2" sx={{ color: colors.textSecondary }}>—</Typography>
        ) : (
          <Box>
            <DetailRow label="Type" value={detail.driftType} />
            <DetailRow label="Predicate" value={detail.predicate} />
            <DetailRow
              label={t('memory.drift.filterSeverity')}
              value={
                <Chip
                  label={detail.severity}
                  color={SEVERITY_COLORS[detail.severity] ?? 'default'}
                  size="small"
                  sx={{ fontSize: '0.65rem', height: 18 }}
                />
              }
            />
            <DetailRow label="Detected" value={detail.detectedAt.slice(0, 10)} />
            {detail.conversationValue != null && (
              <DetailRow label="Conversation" value={detail.conversationValue} />
            )}
            {detail.specValue != null && (
              <DetailRow label="Spec" value={detail.specValue} />
            )}
            {detail.codeValue != null && (
              <DetailRow label="Code" value={detail.codeValue} />
            )}
            {detail.detailJson != null && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary }}>Detail JSON</Typography>
                <Box
                  component="pre"
                  sx={{
                    mt: 0.5,
                    p: 1,
                    borderRadius: 1,
                    bgcolor: colors.border,
                    fontSize: '0.65rem',
                    color: colors.textPrimary,
                    overflow: 'auto',
                    maxHeight: 180,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {JSON.stringify(detail.detailJson, null, 2)}
                </Box>
              </Box>
            )}
            {isResolved ? (
              <Box sx={{ mt: 1.5, p: 1, borderRadius: 1, border: 1, borderColor: colors.border }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                  {t('memory.drift.resolved')} — {detail.resolvedAt?.slice(0, 10)}
                </Typography>
                {detail.resolutionNote && (
                  <Typography variant="caption" display="block" sx={{ color: colors.textPrimary, mt: 0.5 }}>
                    {detail.resolutionNote}
                  </Typography>
                )}
              </Box>
            ) : (
              <TextField
                fullWidth
                size="small"
                label={t('memory.drift.resolutionNote')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                multiline
                rows={2}
                sx={{ mt: 1.5, '& .MuiInputBase-root': { fontSize: '0.75rem' } }}
              />
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose} sx={{ fontSize: '0.75rem' }}>
          {isResolved ? 'Close' : 'Cancel'}
        </Button>
        {!loading && !isResolved && detail != null && (
          <Button
            size="small"
            variant="contained"
            disabled={resolving}
            onClick={() => void handleResolve()}
            sx={{ fontSize: '0.75rem', bgcolor: colors.iceBlue, '&:hover': { bgcolor: colors.iceBlue } }}
          >
            {resolving ? <CircularProgress size={14} /> : t('memory.drift.resolve')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
