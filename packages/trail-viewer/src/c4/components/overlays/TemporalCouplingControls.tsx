import { Box, FormControl, FormControlLabel, FormLabel, InputLabel, MenuItem, Radio, RadioGroup, Select, Slider, Switch, Typography } from '../../../ui';

export type TemporalCouplingGranularity = 'commit' | 'session' | 'subagentType';
export type GhostEdgeMode = 'none' | 'commit' | 'session';

export interface TemporalCouplingControlsValue {
  enabled: boolean;
  windowDays: number;
  threshold: number;
  topK: number;
  directional: boolean;
  confidenceThreshold: number;
  directionalDiff: number;
  granularity: TemporalCouplingGranularity;
}

export interface TemporalCouplingControlsProps {
  readonly value: TemporalCouplingControlsValue;
  readonly onChange: (next: TemporalCouplingControlsValue) => void;
  readonly resultCount: number;
  readonly loading: boolean;
  readonly showDirectionalControls?: boolean;
  readonly showSubagentGranularity?: boolean;
  readonly showCombinedGhostEdgeSelector?: boolean;
}

export interface TemporalCouplingSettingsPopupProps {
  readonly value: TemporalCouplingControlsValue;
  readonly onChange: (next: TemporalCouplingControlsValue) => void;
  readonly resultCount: number;
  readonly loading: boolean;
  readonly isDark?: boolean;
  readonly sx?: Record<string, unknown>;
}

const WINDOW_OPTIONS: ReadonlyArray<{ label: string; days: number }> = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'All', days: 365 },
];

const TOP_K_OPTIONS: ReadonlyArray<number> = [10, 50, 100];
const POPUP_GHOST_EDGE_MODES: ReadonlyArray<Exclude<GhostEdgeMode, 'none'>> = ['commit', 'session'];
const DEFAULT_GRANULARITIES: ReadonlyArray<TemporalCouplingGranularity> = [
  'commit',
  'session',
  'subagentType',
];

export function getTemporalCouplingGranularities(
  showSubagentGranularity: boolean,
): ReadonlyArray<TemporalCouplingGranularity> {
  return showSubagentGranularity ? DEFAULT_GRANULARITIES : ['commit', 'session'];
}

export function getGhostEdgeMode(value: Readonly<TemporalCouplingControlsValue>): GhostEdgeMode {
  if (!value.enabled) return 'none';
  return value.granularity === 'session' ? 'session' : 'commit';
}

export function getPopupGhostEdgeModes(): ReadonlyArray<Exclude<GhostEdgeMode, 'none'>> {
  return POPUP_GHOST_EDGE_MODES;
}

export function applyGhostEdgeMode(
  current: Readonly<TemporalCouplingControlsValue>,
  mode: GhostEdgeMode,
): TemporalCouplingControlsValue {
  if (mode === 'none') {
    return {
      ...current,
      enabled: false,
      directional: false,
    };
  }

  return {
    ...current,
    enabled: true,
    directional: false,
    granularity: mode,
  };
}

export function shouldShowTemporalCouplingInlineSettings(
  showCombinedGhostEdgeSelector: boolean,
): boolean {
  return !showCombinedGhostEdgeSelector;
}

/** 粒度別のしきい値デフォルト（plan/20260429-ghost-edge-* 第「パラメータの粒度別デフォルト」表） */
export const GRANULARITY_DEFAULT_THRESHOLD: Readonly<Record<TemporalCouplingGranularity, number>> = {
  commit: 0.5,
  session: 0.4,
  subagentType: 0.5,
};

/** Phase 5: 粒度別 Confidence デフォルト（commit→session→subagentType で段階的に緩める） */
export const GRANULARITY_DEFAULT_CONFIDENCE: Readonly<Record<TemporalCouplingGranularity, number>> = {
  commit: 0.5,
  session: 0.4,
  subagentType: 0.3,
};

/** Phase 5: 粒度別 directionalDiff デフォルト */
export const GRANULARITY_DEFAULT_DIRECTIONAL_DIFF: Readonly<Record<TemporalCouplingGranularity, number>> = {
  commit: 0.3,
  session: 0.25,
  subagentType: 0.2,
};

/**
 * 粒度切替時の値リセット計算（pure）。
 * - directional=false 時: Jaccard 閾値（threshold）のみ粒度別デフォルトへ
 * - directional=true 時: confidenceThreshold / directionalDiff も粒度別デフォルトへ
 */
export function computeGranularityChangeValue(
  current: Readonly<TemporalCouplingControlsValue>,
  nextGranularity: TemporalCouplingGranularity,
): TemporalCouplingControlsValue {
  if (nextGranularity === current.granularity) return { ...current };
  const next: TemporalCouplingControlsValue = {
    ...current,
    granularity: nextGranularity,
    threshold: GRANULARITY_DEFAULT_THRESHOLD[nextGranularity],
  };
  if (current.directional) {
    next.confidenceThreshold = GRANULARITY_DEFAULT_CONFIDENCE[nextGranularity];
    next.directionalDiff = GRANULARITY_DEFAULT_DIRECTIONAL_DIFF[nextGranularity];
  }
  return next;
}

const GRANULARITY_DESCRIPTION_ID: Readonly<Record<TemporalCouplingGranularity, string>> = {
  commit: 'tc-granularity-commit-desc',
  session: 'tc-granularity-session-desc',
  subagentType: 'tc-granularity-subagent-desc',
};

export function TemporalCouplingControls({
  value,
  onChange,
  resultCount,
  loading,
  showDirectionalControls = true,
  showSubagentGranularity = true,
  showCombinedGhostEdgeSelector = false,
}: Readonly<TemporalCouplingControlsProps>) {
  const handleEnabled = (next: boolean): void => onChange({ ...value, enabled: next });
  const handleWindow = (days: number): void => onChange({ ...value, windowDays: days });
  const handleThreshold = (threshold: number): void => onChange({ ...value, threshold });
  const handleTopK = (topK: number): void => onChange({ ...value, topK });
  const handleDirectional = (directional: boolean): void =>
    onChange({ ...value, directional });
  const handleConfidenceThreshold = (confidenceThreshold: number): void =>
    onChange({ ...value, confidenceThreshold });
  const handleDirectionalDiff = (directionalDiff: number): void =>
    onChange({ ...value, directionalDiff });
  const handleGranularity = (granularity: TemporalCouplingGranularity): void => {
    if (granularity === value.granularity) return;
    onChange(computeGranularityChangeValue(value, granularity));
  };
  const granularityOptions = getTemporalCouplingGranularities(showSubagentGranularity);
  const ghostEdgeMode = getGhostEdgeMode(value);
  const granularityDescription = {
    commit: 'コミット単位の共変更',
    session: 'セッション単位の共編集',
    subagentType: 'エージェント型ごとの編集領域',
  } as const;
  const shouldShowInlineSettings = shouldShowTemporalCouplingInlineSettings(
    showCombinedGhostEdgeSelector,
  );

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        alignItems: 'center',
        flexWrap: 'wrap',
        px: 1,
        py: 0.5,
        borderTop: 1,
        borderColor: 'divider',
      }}
      role="group"
      aria-label="時間的結合エッジの表示制御"
    >
      {showCombinedGhostEdgeSelector ? (
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="tc-ghost-edge-label">Ghost Edges</InputLabel>
          <Select
            labelId="tc-ghost-edge-label"
            label="Ghost Edges"
            value={ghostEdgeMode}
            onChange={(e) => onChange(applyGhostEdgeMode(value, e.target.value as GhostEdgeMode))}
            inputProps={{ 'aria-label': 'Ghost Edges の切り替え' }}
          >
            <MenuItem value="none">None</MenuItem>
            <MenuItem value="commit">commit</MenuItem>
            <MenuItem value="session">session</MenuItem>
          </Select>
        </FormControl>
      ) : (
        <>
          <FormControlLabel
            control={
              <Switch
                checked={value.enabled}
                onChange={(e) => handleEnabled(e.target.checked)}
                inputProps={{ 'aria-label': '時間的結合エッジを表示' }}
                size="small"
              />
            }
            label={<Typography variant="caption">Ghost Edges</Typography>}
          />

          <FormControl
            component="fieldset"
            size="small"
            disabled={!value.enabled}
            sx={{ display: 'flex', alignItems: 'center', flexDirection: 'row', gap: 1 }}
          >
            <FormLabel
              component="legend"
              sx={{ typography: 'caption', position: 'static', transform: 'none', m: 0 }}
            >
              粒度
            </FormLabel>
            <RadioGroup
              row
              value={value.granularity}
              onChange={(e) =>
                handleGranularity((e.target.value as TemporalCouplingGranularity) ?? 'commit')
              }
              aria-label="結合の粒度"
            >
              {granularityOptions.map((granularity) => (
                <FormControlLabel
                  key={granularity}
                  value={granularity}
                  control={
                    <Radio
                      size="small"
                      inputProps={{
                        'aria-describedby': GRANULARITY_DESCRIPTION_ID[granularity],
                      }}
                    />
                  }
                  label={
                    <Typography variant="caption">
                      {granularity === 'subagentType' ? 'subagent' : granularity}
                    </Typography>
                  }
                />
              ))}
            </RadioGroup>
            <Typography
              id={GRANULARITY_DESCRIPTION_ID.commit}
              variant="caption"
              sx={{ position: 'absolute', left: '-9999px' }}
            >
              {granularityDescription.commit}
            </Typography>
            <Typography
              id={GRANULARITY_DESCRIPTION_ID.session}
              variant="caption"
              sx={{ position: 'absolute', left: '-9999px' }}
            >
              {granularityDescription.session}
            </Typography>
            <Typography
              id={GRANULARITY_DESCRIPTION_ID.subagentType}
              variant="caption"
              sx={{ position: 'absolute', left: '-9999px' }}
            >
              {granularityDescription.subagentType}
            </Typography>
          </FormControl>

          {showDirectionalControls && (
            <FormControlLabel
              control={
                <Switch
                  checked={value.directional}
                  onChange={(e) => handleDirectional(e.target.checked)}
                  inputProps={{ 'aria-label': '方向性付きエッジを表示' }}
                  disabled={!value.enabled}
                  size="small"
                />
              }
              label={<Typography variant="caption">方向性</Typography>}
            />
          )}
        </>
      )}

      {shouldShowInlineSettings && (
        <>
          <FormControl size="small" sx={{ minWidth: 88 }} disabled={!value.enabled}>
            <InputLabel id="tc-window-label">期間</InputLabel>
            <Select
              labelId="tc-window-label"
              label="期間"
              value={String(value.windowDays)}
              onChange={(e) => handleWindow(Number.parseInt(String(e.target.value), 10))}
              inputProps={{ 'aria-label': '集計期間' }}
            >
              {WINDOW_OPTIONS.map((opt) => (
                <MenuItem key={opt.days} value={String(opt.days)}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {!value.directional && (
            <Box sx={{ minWidth: 140, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                閾値 {value.threshold.toFixed(2)}
              </Typography>
              <Slider
                value={value.threshold}
                min={0}
                max={1}
                step={0.05}
                size="small"
                disabled={!value.enabled}
                onChange={(_, v) => handleThreshold(Array.isArray(v) ? v[0] : v)}
                aria-label="Jaccard 閾値"
                aria-valuetext={`Jaccard ${value.threshold.toFixed(2)}`}
                sx={{ flex: 1 }}
              />
            </Box>
          )}

          {showDirectionalControls && value.directional && (
            <>
              <Box sx={{ minWidth: 140, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                  Conf {value.confidenceThreshold.toFixed(2)}
                </Typography>
                <Slider
                  value={value.confidenceThreshold}
                  min={0}
                  max={1}
                  step={0.05}
                  size="small"
                  disabled={!value.enabled}
                  onChange={(_, v) =>
                    handleConfidenceThreshold(Array.isArray(v) ? v[0] : v)
                  }
                  aria-label="Confidence 閾値"
                  aria-valuetext={`Confidence ${value.confidenceThreshold.toFixed(2)}`}
                  sx={{ flex: 1 }}
                />
              </Box>
              <Box sx={{ minWidth: 140, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                  Diff {value.directionalDiff.toFixed(2)}
                </Typography>
                <Slider
                  value={value.directionalDiff}
                  min={0}
                  max={1}
                  step={0.05}
                  size="small"
                  disabled={!value.enabled}
                  onChange={(_, v) =>
                    handleDirectionalDiff(Array.isArray(v) ? v[0] : v)
                  }
                  aria-label="方向差分閾値"
                  aria-valuetext={`方向差分 ${value.directionalDiff.toFixed(2)}`}
                  sx={{ flex: 1 }}
                />
              </Box>
            </>
          )}

          <FormControl size="small" sx={{ minWidth: 80 }} disabled={!value.enabled}>
            <InputLabel id="tc-topk-label">Top-K</InputLabel>
            <Select
              labelId="tc-topk-label"
              label="Top-K"
              value={String(value.topK)}
              onChange={(e) => handleTopK(Number.parseInt(String(e.target.value), 10))}
              inputProps={{ 'aria-label': 'Top-K 件数' }}
            >
              {TOP_K_OPTIONS.map((k) => (
                <MenuItem key={k} value={String(k)}>
                  {k}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </>
      )}

      <Typography variant="caption" color="text.secondary" aria-live="polite">
        {value.enabled
          ? loading
            ? '計算中...'
            : `${resultCount} edges (${value.granularity})`
          : 'OFF'}
      </Typography>
    </Box>
  );
}

export function TemporalCouplingSettingsPopup({
  value,
  onChange,
  resultCount,
  loading,
  isDark = false,
  sx: sxOverride,
}: Readonly<TemporalCouplingSettingsPopupProps>) {
  if (!value.enabled) return null;

  const handleWindow = (days: number): void => onChange({ ...value, windowDays: days });
  const handleThreshold = (threshold: number): void => onChange({ ...value, threshold });
  const handleTopK = (topK: number): void => onChange({ ...value, topK });
  const handleMode = (mode: GhostEdgeMode): void => onChange(applyGhostEdgeMode(value, mode));

  return (
    <Box
      role="dialog"
      aria-label="Ghost Edges 設定"
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
        Ghost Edges
      </Typography>

      <FormControl size="small" fullWidth sx={{ mb: 1.25 }}>
        <InputLabel id="tc-popup-mode-label">Mode</InputLabel>
        <Select
          labelId="tc-popup-mode-label"
          label="Mode"
          value={getGhostEdgeMode(value)}
          onChange={(e) => handleMode(e.target.value as GhostEdgeMode)}
          inputProps={{ 'aria-label': 'Ghost Edges の粒度' }}
        >
          {POPUP_GHOST_EDGE_MODES.map((mode) => (
            <MenuItem key={mode} value={mode}>
              {mode}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" fullWidth sx={{ mb: 1.25 }}>
        <InputLabel id="tc-popup-window-label">期間</InputLabel>
        <Select
          labelId="tc-popup-window-label"
          label="期間"
          value={String(value.windowDays)}
          onChange={(e) => handleWindow(Number.parseInt(String(e.target.value), 10))}
          inputProps={{ 'aria-label': '集計期間' }}
        >
          {WINDOW_OPTIONS.map((opt) => (
            <MenuItem key={opt.days} value={String(opt.days)}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box sx={{ mb: 1.25 }}>
        <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
          閾値 {value.threshold.toFixed(2)}
        </Typography>
        <Slider
          value={value.threshold}
          min={0}
          max={1}
          step={0.05}
          size="small"
          onChange={(_, v) => handleThreshold(Array.isArray(v) ? v[0] : v)}
          aria-label="Jaccard 閾値"
          aria-valuetext={`Jaccard ${value.threshold.toFixed(2)}`}
        />
      </Box>

      <FormControl size="small" fullWidth sx={{ mb: 1 }}>
        <InputLabel id="tc-popup-topk-label">Top-K</InputLabel>
        <Select
          labelId="tc-popup-topk-label"
          label="Top-K"
          value={String(value.topK)}
          onChange={(e) => handleTopK(Number.parseInt(String(e.target.value), 10))}
          inputProps={{ 'aria-label': 'Top-K 件数' }}
        >
          {TOP_K_OPTIONS.map((k) => (
            <MenuItem key={k} value={String(k)}>
              {k}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Typography variant="caption" color="text.secondary" aria-live="polite">
        {loading ? '計算中...' : `${resultCount} edges (${value.granularity})`}
      </Typography>
    </Box>
  );
}
