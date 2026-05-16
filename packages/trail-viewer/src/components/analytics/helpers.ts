import type { TrailSession, TrailTokenUsage } from '../../domain/parser/types';

export function getMainAgentLabel(source?: TrailSession['source']): string {
  return source === 'codex' ? 'Codex' : 'Claude Code';
}

export function buildDaySession(date: string, daySessions: readonly TrailSession[]): TrailSession {
  if (daySessions.length === 0) {
    return {
      id: `day-${date}`, slug: date, repoName: '', gitBranch: '',
      startTime: `${date}T00:00:00.000Z`, endTime: `${date}T23:59:59.999Z`,
      version: '', model: '', messageCount: 0,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    };
  }
  const sorted = [...daySessions].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const usage = daySessions.reduce<TrailTokenUsage>((acc, s) => ({
    inputTokens: acc.inputTokens + s.usage.inputTokens,
    outputTokens: acc.outputTokens + s.usage.outputTokens,
    cacheReadTokens: acc.cacheReadTokens + s.usage.cacheReadTokens,
    cacheCreationTokens: acc.cacheCreationTokens + s.usage.cacheCreationTokens,
  }), { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
  const commitStats = daySessions.reduce<{ commits: number; linesAdded: number; linesDeleted: number; filesChanged: number } | undefined>((acc, s) => {
    if (!s.commitStats) return acc;
    const base = acc ?? { commits: 0, linesAdded: 0, linesDeleted: 0, filesChanged: 0 };
    return {
      commits: base.commits + s.commitStats.commits,
      linesAdded: base.linesAdded + s.commitStats.linesAdded,
      linesDeleted: base.linesDeleted + s.commitStats.linesDeleted,
      filesChanged: base.filesChanged + s.commitStats.filesChanged,
    };
  }, undefined);
  const peakContextTokens = daySessions.reduce((max, s) => Math.max(max, s.peakContextTokens ?? 0), 0);
  return {
    id: `day-${date}`, slug: date, repoName: sorted[0].repoName, gitBranch: '',
    startTime: sorted[0].startTime, endTime: sorted.at(-1)!.endTime,
    version: '', model: '',
    messageCount: daySessions.reduce((acc, s) => acc + s.messageCount, 0),
    peakContextTokens: peakContextTokens > 0 ? peakContextTokens : undefined,
    usage,
    commitStats,
    errorCount: daySessions.reduce((acc, s) => acc + (s.errorCount ?? 0), 0) || undefined,
    estimatedCostUsd: daySessions.reduce((acc, s) => acc + (s.estimatedCostUsd ?? 0), 0),
  };
}
