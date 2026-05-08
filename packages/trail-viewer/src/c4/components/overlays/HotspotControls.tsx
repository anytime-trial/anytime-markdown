import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';

import type {
  HotspotGranularity,
  TrendPeriod,
} from '@anytime-markdown/trail-core/c4';

import { useTrailI18n } from '../../../i18n/context';

export interface HotspotControlsValue {
  readonly period: TrendPeriod;
  readonly granularity: HotspotGranularity;
}

export interface HotspotControlsProps {
  readonly value: HotspotControlsValue;
  readonly onChange: (next: HotspotControlsValue) => void;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly isDark?: boolean;
  /** ポップアップを表示するか。false の場合は何も描画しない（Ghost Edges 設定ポップアップと同じパターン） */
  readonly enabled?: boolean;
  /** Box.sx の上書き（デフォルトの position: 'absolute' を 'static' に変えたい場合など） */
  readonly sx?: Record<string, unknown>;
}

const PERIOD_OPTIONS: ReadonlyArray<TrendPeriod> = ['7d', '30d', '90d', 'all'];
const GRANULARITY_OPTIONS: ReadonlyArray<HotspotGranularity> = ['commit', 'session'];

export function HotspotControls({
  value,
  onChange,
  loading,
  disabled = false,
  isDark = false,
  enabled = true,
  sx: sxOverride,
}: Readonly<HotspotControlsProps>) {
  const { t } = useTrailI18n();
  if (!enabled) return null;
  const handlePeriod = (period: TrendPeriod): void => onChange({ ...value, period });
  const handleGranularity = (granularity: HotspotGranularity): void =>
    onChange({ ...value, granularity });
  return (
    <Box
      role="dialog"
      aria-label="Hotspot overlay controls"
      sx={{
        position: 'absolute',
        top: 8,
        left: 8,
        width: 220,
        zIndex: 10,
        border: 1,
        borderColor: 'divider',
        borderRadius: '8px',
        bgcolor: isDark ? 'rgba(18,18,18,0.92)' : 'rgba(251,249,243,0.94)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
        backdropFilter: 'blur(10px)',
        px: 1.5,
        py: 1.25,
        ...sxOverride,
      }}
    >
      <Typography
        variant="caption"
        sx={{ display: 'block', color: 'text.secondary', fontSize: '0.65rem', mb: 1 }}
      >
        Hotspot
      </Typography>

      <FormControl size="small" fullWidth sx={{ mb: 1.25 }} disabled={disabled}>
        <InputLabel id="hs-period-label">{t('c4.hotspot.controls.period')}</InputLabel>
        <Select
          labelId="hs-period-label"
          label={t('c4.hotspot.controls.period')}
          value={value.period}
          onChange={(e) => handlePeriod(String(e.target.value) as TrendPeriod)}
          inputProps={{ 'aria-label': t('c4.hotspot.controls.period') }}
        >
          {PERIOD_OPTIONS.map((p) => (
            <MenuItem key={p} value={p}>
              {p}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl
        component="fieldset"
        size="small"
        fullWidth
        disabled={disabled}
        sx={{ mb: 0.5 }}
      >
        <FormLabel
          component="legend"
          sx={{ typography: 'caption', position: 'static', transform: 'none', m: 0, mb: 0.5, fontSize: '0.65rem' }}
        >
          {t('c4.hotspot.controls.granularity')}
        </FormLabel>
        <RadioGroup
          value={value.granularity}
          onChange={(e) => handleGranularity(String(e.target.value) as HotspotGranularity)}
          aria-label={t('c4.hotspot.controls.granularity')}
        >
          {GRANULARITY_OPTIONS.map((g) => (
            <FormControlLabel
              key={g}
              value={g}
              control={<Radio size="small" sx={{ py: 0.25 }} />}
              label={
                <Typography variant="caption">
                  {g === 'commit'
                    ? t('c4.hotspot.controls.granularityCommit')
                    : t('c4.hotspot.controls.granularitySession')}
                </Typography>
              }
              sx={{ m: 0 }}
            />
          ))}
        </RadioGroup>
      </FormControl>

      {loading && (
        <Typography variant="caption" color="text.secondary" aria-live="polite" sx={{ display: 'block', mt: 0.5 }}>
          ...
        </Typography>
      )}
    </Box>
  );
}
