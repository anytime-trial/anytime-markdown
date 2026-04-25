import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import SettingsIcon from '@mui/icons-material/Settings';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { DEFAULT_THRESHOLDS } from '@anytime-markdown/trail-core/domain/metrics';
import type { QualityMetrics } from '@anytime-markdown/trail-core/domain/metrics';
import { useTrailI18n } from '../../i18n';

const THRESHOLDS_PATH = '.anytime-trail/metrics-thresholds.yaml';

export interface ThresholdsDialogProps {
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly thresholds: QualityMetrics | null;
  readonly isVsCode?: boolean;
}

export function ThresholdsDialog({ open, onOpen, onClose, isVsCode = false }: Readonly<ThresholdsDialogProps>) {
  const { t } = useTrailI18n();

  const handleOpenFile = () => {
    if (isVsCode && typeof window !== 'undefined') {
      // @ts-expect-error — VS Code webview acquireVsCodeApi
      const vscode = (window as Record<string, unknown>).__vscode as { postMessage: (msg: unknown) => void } | undefined;
      vscode?.postMessage({ type: 'openThresholdsFile', path: THRESHOLDS_PATH });
    }
    onClose();
  };

  const t2 = DEFAULT_THRESHOLDS;

  return (
    <>
      <IconButton size="small" onClick={onOpen} aria-label={t('metrics.thresholds.title')}>
        <SettingsIcon fontSize="small" />
      </IconButton>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{t('metrics.thresholds.title')}</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {THRESHOLDS_PATH}
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>指標</TableCell>
                <TableCell>Elite</TableCell>
                <TableCell>High</TableCell>
                <TableCell>Medium</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>{t('metrics.deploymentFrequency.name')}</TableCell>
                <TableCell>≥ {t2.deploymentFrequency.elite.toFixed(2)}/day</TableCell>
                <TableCell>≥ {t2.deploymentFrequency.high.toFixed(3)}/day</TableCell>
                <TableCell>≥ {t2.deploymentFrequency.medium.toFixed(4)}/day</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{t('metrics.leadTimePerLoc.name')}</TableCell>
                <TableCell>&lt; {t2.leadTimePerLoc.elite} min/LOC</TableCell>
                <TableCell>&lt; {t2.leadTimePerLoc.high} min/LOC</TableCell>
                <TableCell>&lt; {t2.leadTimePerLoc.medium} min/LOC</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{t('metrics.tokensPerLoc.name')}</TableCell>
                <TableCell>&lt; {(t2.tokensPerLoc.elite / 1000).toFixed(1)}k tok/LOC</TableCell>
                <TableCell>&lt; {(t2.tokensPerLoc.high / 1000).toFixed(1)}k tok/LOC</TableCell>
                <TableCell>&lt; {(t2.tokensPerLoc.medium / 1000).toFixed(1)}k tok/LOC</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{t('metrics.changeFailureRate.name')}</TableCell>
                <TableCell>≤ {t2.changeFailureRate.elite}%</TableCell>
                <TableCell>≤ {t2.changeFailureRate.high}%</TableCell>
                <TableCell>≤ {t2.changeFailureRate.medium}%</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{t('metrics.aiFirstTrySuccessRate.name')}</TableCell>
                <TableCell>≥ {t2.aiFirstTrySuccessRate.elite}%</TableCell>
                <TableCell>≥ {t2.aiFirstTrySuccessRate.high}%</TableCell>
                <TableCell>≥ {t2.aiFirstTrySuccessRate.medium}%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {isVsCode && (
            <Button size="small" sx={{ mt: 1 }} onClick={handleOpenFile}>
              {t('metrics.thresholds.openFile')}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
