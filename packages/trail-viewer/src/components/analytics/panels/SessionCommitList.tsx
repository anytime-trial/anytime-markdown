import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { TrailSessionCommit, TrailTokenUsage } from '../../../domain/parser/types';
import { fmtNum, fmtTokens } from '../../../domain/analytics/formatters';

export function SessionCommitList({
  sessionId,
  usage,
  fetchSessionCommits,
}: Readonly<{
  sessionId: string;
  usage: TrailTokenUsage;
  fetchSessionCommits: (id: string) => Promise<readonly TrailSessionCommit[]>;
}>) {
  const { colors, cardSx, scrollbarSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const [commits, setCommits] = useState<readonly TrailSessionCommit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchSessionCommits(sessionId);
        if (!cancelled) setCommits(result);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, fetchSessionCommits]);

  const totalAdded = commits.reduce((sum, c) => sum + c.linesAdded, 0);
  const totalTokens = usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheCreationTokens;
  const tokensPerLine = totalAdded > 0 ? Math.round(totalTokens / totalAdded) : 0;

  if (loading) {
    return (
      <Paper elevation={0} sx={{ ...cardSx, mt: 1, p: 1.5 }}>
        <Typography variant="body2" color="text.secondary">{t('analytics.loadingCommits')}</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} sx={{ ...cardSx, mt: 1, p: 1.5 }}>
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle2">
          {t('analytics.relatedCommits')} ({commits.length})
        </Typography>
      </Box>
      {commits.length === 0 ? (
        <Box sx={{ height: 198, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px dashed ${colors.border}`, borderRadius: 1 }}>
          <Typography variant="body2" sx={{ color: colors.textSecondary }}>
            {t('analytics.noCommits')}
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ height: 198, overflowY: 'auto', ...scrollbarSx }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { color: colors.textSecondary, borderColor: colors.border, bgcolor: colors.midnightNavy } }}>
                  <TableCell>{t('analytics.commitHash')}</TableCell>
                  <TableCell>{t('analytics.commitRepo')}</TableCell>
                  <TableCell>{t('analytics.commitMessage')}</TableCell>
                  <TableCell align="right">{t('analytics.commitFiles')}</TableCell>
                  <TableCell align="right">{t('analytics.commitDiff')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {commits.map((c) => {
                  const repoLabel = c.repoName !== '' ? c.repoName : t('analytics.commitRepoLegacy');
                  const isLegacy = c.repoName === '';
                  return (
                  <TableRow key={c.commitHash} sx={{ '& .MuiTableCell-root': { borderColor: colors.border } }}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {c.commitHash.slice(0, 8)}
                      {c.isAiAssisted && (
                        <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'info.main' }}>
                          {t('analytics.commitAI')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'nowrap', color: isLegacy ? colors.textSecondary : 'inherit' }}>
                      {repoLabel}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.commitMessage}
                    </TableCell>
                    <TableCell align="right">{c.filesChanged}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      +{fmtNum(c.linesAdded)} / -{fmtNum(c.linesDeleted)}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
          {totalAdded > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {t('analytics.tokensPerLineLabel')} {fmtTokens(tokensPerLine)}
            </Typography>
          )}
        </>
      )}
    </Paper>
  );
}
