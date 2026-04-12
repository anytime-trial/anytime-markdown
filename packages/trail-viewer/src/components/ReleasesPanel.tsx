import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { formatLocalDate } from '@anytime-markdown/trail-core/formatDate';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';
import { useTrailI18n } from '../i18n';

const UNKNOWN_REPO_KEY = '__unknown__';

export interface ReleasesPanelProps {
  readonly releases: readonly TrailRelease[];
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function fmtOneDecimal(n: number): string {
  return n.toFixed(1);
}

function fmtPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

interface CommitBreakdownBarProps {
  readonly release: TrailRelease;
}

function CommitBreakdownBar({ release }: Readonly<CommitBreakdownBarProps>): React.ReactElement {
  const total = release.commitCount;
  if (total === 0) {
    return <Typography variant="caption" color="text.secondary">—</Typography>;
  }

  const segments: Array<{ label: string; count: number; color: string }> = [
    { label: 'feat', count: release.featCount, color: '#4caf50' },
    { label: 'fix', count: release.fixCount, color: '#f44336' },
    { label: 'refactor', count: release.refactorCount, color: '#2196f3' },
    { label: 'test', count: release.testCount, color: '#ff9800' },
    { label: 'other', count: release.otherCount, color: '#9e9e9e' },
  ];

  const tooltipText = segments
    .filter((s) => s.count > 0)
    .map((s) => `${s.label}: ${s.count}`)
    .join(', ');

  return (
    <Tooltip title={tooltipText}>
      <Box sx={{ display: 'flex', height: 12, width: 80, borderRadius: 1, overflow: 'hidden', cursor: 'default' }}>
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <Box
              key={s.label}
              sx={{
                width: `${(s.count / total) * 100}%`,
                backgroundColor: s.color,
                flexShrink: 0,
              }}
            />
          ))}
      </Box>
    </Tooltip>
  );
}

export function ReleasesPanel({ releases }: Readonly<ReleasesPanelProps>): React.ReactElement {
  const { t } = useTrailI18n();

  const repoOptions = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const r of releases) {
      const key = r.repoName ?? UNKNOWN_REPO_KEY;
      if (!seen.has(key)) {
        seen.add(key);
        order.push(key);
      }
    }
    return order;
  }, [releases]);

  const [selectedRepo, setSelectedRepo] = useState<string>(() => repoOptions[0] ?? '');

  useEffect(() => {
    if (repoOptions.length === 0) {
      if (selectedRepo !== '') setSelectedRepo('');
      return;
    }
    if (!repoOptions.includes(selectedRepo)) {
      setSelectedRepo(repoOptions[0]);
    }
  }, [repoOptions, selectedRepo]);

  const filteredReleases = useMemo(() => {
    if (selectedRepo === '') return releases;
    return releases.filter((r) => (r.repoName ?? UNKNOWN_REPO_KEY) === selectedRepo);
  }, [releases, selectedRepo]);

  const handleRepoChange = (event: SelectChangeEvent<string>): void => {
    setSelectedRepo(event.target.value);
  };

  if (releases.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">{t('releases.noReleases')}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <Box sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="releases-repo-select-label">{t('releases.repository')}</InputLabel>
          <Select
            labelId="releases-repo-select-label"
            value={selectedRepo}
            label={t('releases.repository')}
            onChange={handleRepoChange}
          >
            {repoOptions.map((key) => (
              <MenuItem key={key} value={key}>
                {key === UNKNOWN_REPO_KEY ? t('releases.unknownRepo') : key}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      <Box sx={{ overflow: 'auto', flex: 1 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>{t('releases.version')}</TableCell>
            <TableCell>{t('releases.date')}</TableCell>
            <TableCell align="right">{t('releases.interval')}</TableCell>
            <TableCell align="right">{t('releases.steps')}</TableCell>
            <TableCell align="right">{t('releases.files')}</TableCell>
            <TableCell align="right">{t('releases.commits')}</TableCell>
            <TableCell>{t('releases.breakdown')}</TableCell>
            <TableCell align="right">{t('releases.stepsPerDay')}</TableCell>
            <TableCell align="right">{t('releases.fixRate')}</TableCell>
            <TableCell>{t('releases.packages')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredReleases.map((release) => {
            const steps = release.linesAdded + release.linesDeleted;
            const stepsPerDay = release.durationDays > 0 ? steps / release.durationDays : 0;
            const fixRate = release.commitCount > 0 ? release.fixCount / release.commitCount : 0;

            return (
              <TableRow key={release.tag} hover>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                    <Typography variant="body2" fontWeight={600}>{release.tag}</Typography>
                    {release.packageTags.map((pt) => (
                      <Chip key={pt} label={pt} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                    ))}
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{formatLocalDate(release.releasedAt)}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">
                    {release.durationDays > 0 ? `${fmtOneDecimal(release.durationDays)}${t('releases.days')}` : '—'}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">{fmtNum(steps)}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">{fmtNum(release.filesChanged)}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">{fmtNum(release.commitCount)}</Typography>
                </TableCell>
                <TableCell>
                  <CommitBreakdownBar release={release} />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">
                    {stepsPerDay > 0 ? fmtNum(Math.round(stepsPerDay)) : '—'}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">
                    {release.commitCount > 0 ? fmtPercent(fixRate) : '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {release.affectedPackages.map((pkg) => (
                      <Chip key={pkg} label={pkg} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                    ))}
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </Box>
    </Box>
  );
}
