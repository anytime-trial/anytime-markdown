import { Box, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Switch, Typography } from '../../../ui';

export interface DefectRiskControlsValue {
  enabled: boolean;
  windowDays: number;
  halfLifeDays: number;
}

export interface DefectRiskControlsProps {
  readonly value: DefectRiskControlsValue;
  readonly onChange: (next: DefectRiskControlsValue) => void;
  readonly resultCount: number;
  readonly loading: boolean;
}

const WINDOW_OPTIONS: ReadonlyArray<{ label: string; days: number }> = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
  { label: 'All', days: 365 },
];

const HALF_LIFE_OPTIONS: ReadonlyArray<{ label: string; days: number }> = [
  { label: '10d', days: 10 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
];

export function computeDefectRiskWindowLabel(days: number): string {
  return WINDOW_OPTIONS.find((o) => o.days === days)?.label ?? `${days}d`;
}

export const DEFAULT_DEFECT_RISK_VALUE: DefectRiskControlsValue = {
  enabled: false,
  windowDays: 90,
  halfLifeDays: 90,
};

export function DefectRiskControls({
  value,
  onChange,
  resultCount,
  loading,
}: Readonly<DefectRiskControlsProps>) {
  return (
    <Box
      sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', px: 1, py: 0.5, borderTop: 1, borderColor: 'divider' }}
      role="group"
      aria-label="欠陥予測リスクの表示制御"
    >
      <FormControlLabel
        control={
          <Switch
            checked={value.enabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
            inputProps={{ 'aria-label': 'リスクスコアを表示' }}
            size="small"
          />
        }
        label={<Typography variant="caption">Defect Risk</Typography>}
      />

      <FormControl size="small" sx={{ minWidth: 88 }} disabled={!value.enabled}>
        <InputLabel id="dr-window-label">期間</InputLabel>
        <Select
          labelId="dr-window-label"
          label="期間"
          value={String(value.windowDays)}
          onChange={(e) => onChange({ ...value, windowDays: Number.parseInt(String(e.target.value), 10) })}
          inputProps={{ 'aria-label': '集計期間' }}
        >
          {WINDOW_OPTIONS.map((opt) => (
            <MenuItem key={opt.days} value={String(opt.days)}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 88 }} disabled={!value.enabled}>
        <InputLabel id="dr-halflife-label">半減期</InputLabel>
        <Select
          labelId="dr-halflife-label"
          label="半減期"
          value={String(value.halfLifeDays)}
          onChange={(e) => onChange({ ...value, halfLifeDays: Number.parseInt(String(e.target.value), 10) })}
          inputProps={{ 'aria-label': '減衰の半減期' }}
        >
          {HALF_LIFE_OPTIONS.map((opt) => (
            <MenuItem key={opt.days} value={String(opt.days)}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Typography variant="caption" color="text.secondary" aria-live="polite">
        {value.enabled
          ? loading
            ? '計算中...'
            : `${resultCount} files`
          : 'OFF'}
      </Typography>
    </Box>
  );
}
