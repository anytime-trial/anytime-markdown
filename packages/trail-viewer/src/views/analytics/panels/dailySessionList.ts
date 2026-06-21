import type { VanillaViewHandle } from '../../../shared/vanillaIsland';
import type {
  ToolMetrics,
  TrailMessage,
  TrailSession,
  TrailSessionCommit,
} from '../../../domain/parser/types';
import { fmtNum, fmtTokens, fmtUsd } from '../../../domain/analytics/formatters';
import { sessionCost } from '../../../domain/analytics/calculators';
import { agentBrandColors } from '../../../theme/designTokens';
import { buildDaySession } from '../../../components/analytics/helpers';
import { formatLocalTime, toLocalDateKey } from '@anytime-markdown/trail-core/formatDate';
import { mountSessionMetricsPanel } from './sessionMetricsPanel';
import { mountSessionCacheTimeline } from '../charts/sessionCacheTimeline';
import { mountSessionToolUsageChart } from '../charts/sessionToolUsageChart';
import { mountSessionErrorChart } from '../charts/sessionErrorChart';
import { mountSessionSkillUsageChart } from '../charts/sessionSkillUsageChart';
import { mountSessionCommitPrefixChart } from '../charts/sessionCommitPrefixChart';
import { mountDayCommitPrefixChart } from '../charts/dayCommitPrefixChart';
import type { ThemeColors, ThemeChartColors } from '../../../theme/designTokens';

export interface DailySessionListProps {
  date: string;
  sessions: readonly TrailSession[];
  sessionsLoading?: boolean;
  onSelectSession?: (id: string) => void;
  onJumpToTrace?: (session: TrailSession) => void;
  fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
  fetchSessionCommits?: (id: string) => Promise<readonly TrailSessionCommit[]>;
  fetchSessionToolMetrics?: (id: string) => Promise<ToolMetrics | null>;
  fetchDayToolMetrics?: (date: string) => Promise<ToolMetrics | null>;
  colors: ThemeColors;
  chartColors: ThemeChartColors;
  cardSx: { bgcolor: string; border: string; borderRadius: string };
  isDark: boolean;
  t: (k: string) => string;
}

type AnyHandle = VanillaViewHandle<object>;

function destroyAll(handles: AnyHandle[]): void {
  for (const h of handles) {
    h.destroy();
  }
  handles.length = 0;
}

export function mountDailySessionList(
  container: HTMLElement,
  props: DailySessionListProps,
): VanillaViewHandle<DailySessionListProps> {
  const root = document.createElement('div');
  root.style.cssText = [
    `background-color:${props.cardSx.bgcolor}`,
    `border:${props.cardSx.border}`,
    `border-radius:${props.cardSx.borderRadius}`,
    'margin-top:8px',
    'padding:12px',
  ].join(';');
  container.appendChild(root);

  let currentProps = props;
  let timelineSessionId: string | null = null;
  let timelineMessages: readonly TrailMessage[] = [];
  let timelineLoading = false;
  let sessionToolMetrics: ToolMetrics | null = null;
  let dayAggToolMetrics: ToolMetrics | null = null;
  let latestRequestId: string | null = null;
  let dayToolCancelled = false;

  const mountedHandles: AnyHandle[] = [];

  function renderHeader(p: DailySessionListProps, daySessions: readonly TrailSession[]): void {
    const sessionCountLabel =
      daySessions.length !== 1
        ? p.t('sessionList.sessions')
        : p.t('sessionList.session');
    const headerLabel = p.sessionsLoading
      ? '...'
      : `${daySessions.length} ${sessionCountLabel}`;

    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom:8px;';
    const headerText = document.createElement('span');
    headerText.style.cssText = 'font-size:0.875rem;font-weight:600;';
    headerText.textContent = `${p.date} — ${headerLabel}`;
    header.appendChild(headerText);
    root.appendChild(header);
  }

  function renderSessionRow(
    p: DailySessionListProps,
    s: TrailSession,
    tbody: HTMLElement,
    isSelected: boolean,
  ): void {
    const tr = document.createElement('tr');
    tr.style.cssText = `cursor:pointer;${isSelected ? 'background-color:rgba(77,208,225,0.1);' : ''}`;
    tr.setAttribute('data-session-id', s.id);

    // Hover effect
    tr.addEventListener('mouseenter', () => {
      if (!isSelected) tr.style.backgroundColor = 'rgba(255,255,255,0.04)';
    });
    tr.addEventListener('mouseleave', () => {
      if (!isSelected) tr.style.backgroundColor = '';
    });

    // Session name cell
    const nameTd = document.createElement('td');
    nameTd.style.cssText =
      `padding:4px 8px;border-bottom:1px solid ${p.colors.border};max-width:200px;min-width:120px;`;
    const nameSpan = document.createElement('div');
    nameSpan.style.cssText = [
      'font-weight:600',
      `color:${p.colors.iceBlue}`,
      'overflow:hidden',
      'text-overflow:ellipsis',
      'white-space:nowrap',
      'font-size:0.875rem',
    ].join(';');
    nameSpan.textContent = s.slug ?? s.id.slice(0, 8);
    const idSpan = document.createElement('div');
    idSpan.style.cssText = [
      `color:${p.colors.textSecondary}`,
      'font-family:monospace',
      'font-size:0.7rem',
    ].join(';');
    idSpan.textContent = s.id.slice(0, 8);
    nameTd.appendChild(nameSpan);
    nameTd.appendChild(idSpan);
    tr.appendChild(nameTd);

    // Time cell
    const timeTd = document.createElement('td');
    timeTd.style.cssText = [
      `padding:4px 8px;border-bottom:1px solid ${p.colors.border}`,
      'font-family:monospace',
      'font-size:0.8rem',
      'white-space:nowrap',
    ].join(';');
    timeTd.textContent = `${formatLocalTime(s.startTime)}–${formatLocalTime(s.endTime)}`;
    if (s.interruption?.interrupted) {
      const chip = document.createElement('span');
      const chipLabel =
        s.interruption.reason === 'max_tokens'
          ? p.t('sessionList.maxChip')
          : p.t('sessionList.nrChip');
      chip.textContent = chipLabel;
      chip.style.cssText =
        'margin-left:4px;border:1px solid #ff9800;color:#ff9800;font-size:0.65rem;padding:1px 4px;border-radius:4px;';
      timeTd.appendChild(chip);
    }
    tr.appendChild(timeTd);

    // Agent/source cell
    const agentTd = document.createElement('td');
    agentTd.style.cssText = [
      `padding:4px 8px;border-bottom:1px solid ${p.colors.border}`,
      'white-space:nowrap',
    ].join(';');
    const src = s.source ?? 'claude_code';
    const brandColor = (agentBrandColors as Record<string, string | undefined>)[src];
    const agentBox = document.createElement('span');
    agentBox.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';
    if (brandColor) {
      const dot = document.createElement('span');
      dot.style.cssText = `width:8px;height:8px;border-radius:2px;background-color:${brandColor};flex-shrink:0;display:inline-block;`;
      agentBox.appendChild(dot);
    }
    const agentLabel = document.createElement('span');
    agentLabel.style.cssText = `font-family:monospace;font-size:0.8rem;color:${brandColor ?? p.colors.textSecondary};`;
    agentLabel.textContent = src;
    agentBox.appendChild(agentLabel);
    agentTd.appendChild(agentBox);
    tr.appendChild(agentTd);

    // LOC cell
    const locTd = document.createElement('td');
    locTd.style.cssText = [
      `padding:4px 8px;border-bottom:1px solid ${p.colors.border}`,
      'text-align:right',
      'font-family:monospace',
      'font-size:0.8rem',
      'white-space:nowrap',
    ].join(';');
    if (s.commitStats) {
      const total = s.commitStats.linesAdded + s.commitStats.linesDeleted;
      locTd.textContent = `${fmtNum(total)} (+${fmtNum(s.commitStats.linesAdded)}/-${fmtNum(s.commitStats.linesDeleted)})`;
    } else {
      locTd.textContent = '—';
    }
    tr.appendChild(locTd);

    // Tokens cell
    const tokensTd = document.createElement('td');
    tokensTd.style.cssText = [
      `padding:4px 8px;border-bottom:1px solid ${p.colors.border}`,
      'text-align:right',
    ].join(';');
    const totalTokens =
      s.usage.inputTokens +
      s.usage.outputTokens +
      s.usage.cacheReadTokens +
      s.usage.cacheCreationTokens;
    tokensTd.textContent = fmtTokens(totalTokens);
    if (s.compactCount != null && s.compactCount >= 2) {
      const chip = document.createElement('span');
      chip.textContent = `⚠ ×${s.compactCount}`;
      chip.style.cssText =
        'margin-left:4px;border:1px solid #ff9800;color:#ff9800;font-size:0.65rem;padding:1px 4px;border-radius:4px;';
      tokensTd.appendChild(chip);
    }
    if (s.initialContextTokens != null || s.peakContextTokens != null) {
      const ctxDiv = document.createElement('div');
      ctxDiv.style.cssText = `font-family:monospace;font-size:0.7rem;color:${p.colors.textSecondary};line-height:1.2;`;
      ctxDiv.textContent = `${fmtTokens(s.initialContextTokens ?? 0)}→${fmtTokens(s.peakContextTokens ?? 0)}`;
      tokensTd.appendChild(ctxDiv);
    }
    tr.appendChild(tokensTd);

    // Cost cell
    const costTd = document.createElement('td');
    costTd.style.cssText = [
      `padding:4px 8px;border-bottom:1px solid ${p.colors.border}`,
      'text-align:right',
    ].join(';');
    costTd.textContent = fmtUsd(sessionCost(s));
    tr.appendChild(costTd);

    // Messages cell
    const msgTd = document.createElement('td');
    msgTd.style.cssText = [
      `padding:4px 8px;border-bottom:1px solid ${p.colors.border}`,
      'text-align:right',
    ].join(';');
    msgTd.textContent = fmtNum(s.messageCount);
    if (s.assistantMessageCount != null && s.assistantMessageCount > 0) {
      const turnSpan = document.createElement('span');
      turnSpan.style.cssText = `display:block;font-size:0.7em;color:${p.colors.textSecondary};`;
      turnSpan.textContent = `(${fmtNum(s.assistantMessageCount)} ${p.t('analytics.turns')})`;
      msgTd.appendChild(turnSpan);
    }
    tr.appendChild(msgTd);

    // Errors cell
    const errorTd = document.createElement('td');
    errorTd.style.cssText = [
      `padding:4px 8px;border-bottom:1px solid ${p.colors.border}`,
      'text-align:right',
    ].join(';');
    errorTd.textContent =
      s.errorCount != null && s.errorCount > 0 ? fmtNum(s.errorCount) : '—';
    tr.appendChild(errorTd);

    // Sub-agents cell
    const subTd = document.createElement('td');
    subTd.style.cssText = [
      `padding:4px 8px;border-bottom:1px solid ${p.colors.border}`,
      'text-align:right',
    ].join(';');
    subTd.textContent =
      s.subAgentCount != null && s.subAgentCount > 0 ? fmtNum(s.subAgentCount) : '—';
    tr.appendChild(subTd);

    // Jump button
    const jumpTd = document.createElement('td');
    jumpTd.style.cssText = [
      `padding:2px 4px;border-bottom:1px solid ${p.colors.border}`,
      'text-align:right',
      'width:36px',
    ].join(';');
    if (p.onJumpToTrace) {
      const btn = document.createElement('button');
      btn.title = p.t('analytics.openInTraces');
      btn.setAttribute('aria-label', p.t('analytics.openInTraces'));
      btn.style.cssText = [
        'background:none',
        'border:none',
        'cursor:pointer',
        `color:${p.colors.textSecondary}`,
        'padding:2px',
        'display:inline-flex',
        'align-items:center',
      ].join(';');
      btn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59L7.76 14.83l1.41 1.41L19 5.41V9h2V3h-7z"/></svg>';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        p.onJumpToTrace?.(s);
      });
      jumpTd.appendChild(btn);
    }
    tr.appendChild(jumpTd);

    tr.addEventListener('click', () => {
      handleSessionClick(s.id);
    });

    tbody.appendChild(tr);
  }

  function handleSessionClick(id: string): void {
    const p = currentProps;
    if (timelineSessionId === id) {
      latestRequestId = null;
      timelineSessionId = null;
      timelineMessages = [];
      sessionToolMetrics = null;
      render(p);
      return;
    }

    if (p.fetchSessionMessages) {
      latestRequestId = id;
      timelineSessionId = id;
      timelineLoading = true;
      sessionToolMetrics = null;
      render(p);

      void p.fetchSessionMessages(id).then((msgs) => {
        if (latestRequestId !== id) return;
        timelineMessages = msgs;
        timelineLoading = false;
        render(currentProps);
      });

      if (p.fetchSessionToolMetrics) {
        void p.fetchSessionToolMetrics(id).then((metrics) => {
          if (latestRequestId !== id) return;
          sessionToolMetrics = metrics;
          render(currentProps);
        });
      }
    } else {
      p.onSelectSession?.(id);
    }
  }

  function mountRightPanel(
    p: DailySessionListProps,
    daySessions: readonly TrailSession[],
    rightContainer: HTMLElement,
  ): void {
    rightContainer.innerHTML = '';
    destroyAll(mountedHandles);

    const selectedSession = timelineSessionId
      ? daySessions.find((s) => s.id === timelineSessionId)
      : undefined;
    const activeSession = selectedSession ?? buildDaySession(p.date, daySessions);
    const activeToolMetrics = selectedSession ? sessionToolMetrics : dayAggToolMetrics;

    // Session metrics panel
    const metricsEl = document.createElement('div');
    rightContainer.appendChild(metricsEl);
    const metricsHandle = mountSessionMetricsPanel(metricsEl, {
      session: activeSession,
      toolMetrics: activeToolMetrics,
      cardSx: p.cardSx,
      t: p.t,
    });
    mountedHandles.push(metricsHandle as AnyHandle);

    // Charts row 1: tool usage + error
    const chartsRow1 = document.createElement('div');
    chartsRow1.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
    rightContainer.appendChild(chartsRow1);

    const toolChartEl = document.createElement('div');
    chartsRow1.appendChild(toolChartEl);
    const toolHandle = mountSessionToolUsageChart(toolChartEl, {
      toolMetrics: activeToolMetrics,
      colors: p.colors,
      cardSx: p.cardSx,
      isDark: p.isDark,
      t: p.t,
    });
    mountedHandles.push(toolHandle as AnyHandle);

    const errorChartEl = document.createElement('div');
    chartsRow1.appendChild(errorChartEl);
    const errorHandle = mountSessionErrorChart(errorChartEl, {
      toolMetrics: activeToolMetrics,
      colors: p.colors,
      cardSx: p.cardSx,
      isDark: p.isDark,
      t: p.t,
    });
    mountedHandles.push(errorHandle as AnyHandle);

    // Charts row 2: skill usage + commit prefix
    const chartsRow2 = document.createElement('div');
    chartsRow2.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
    rightContainer.appendChild(chartsRow2);

    const skillChartEl = document.createElement('div');
    chartsRow2.appendChild(skillChartEl);
    const skillHandle = mountSessionSkillUsageChart(skillChartEl, {
      toolMetrics: activeToolMetrics,
      colors: p.colors,
      cardSx: p.cardSx,
      isDark: p.isDark,
      t: p.t,
    });
    mountedHandles.push(skillHandle as AnyHandle);

    if (p.fetchSessionCommits) {
      const commitEl = document.createElement('div');
      chartsRow2.appendChild(commitEl);

      if (selectedSession && timelineSessionId) {
        const commitHandle = mountSessionCommitPrefixChart(commitEl, {
          sessionId: timelineSessionId,
          fetchSessionCommits: p.fetchSessionCommits,
          colors: p.colors,
          cardSx: p.cardSx,
          isDark: p.isDark,
          t: p.t,
        });
        mountedHandles.push(commitHandle as AnyHandle);
      } else {
        const dayCommitHandle = mountDayCommitPrefixChart(commitEl, {
          sessionIds: daySessions.map((s) => s.id),
          fetchSessionCommits: p.fetchSessionCommits,
          colors: p.colors,
          cardSx: p.cardSx,
          isDark: p.isDark,
          t: p.t,
        });
        mountedHandles.push(dayCommitHandle as AnyHandle);
      }
    }
  }

  function render(p: DailySessionListProps): void {
    destroyAll(mountedHandles);
    root.innerHTML = '';

    const daySessions = p.sessions.filter(
      (s) => toLocalDateKey(s.startTime) === p.date,
    );

    renderHeader(p, daySessions);

    const contentRow = document.createElement('div');
    contentRow.style.cssText = 'display:flex;gap:16px;flex-direction:row;';
    root.appendChild(contentRow);

    // Left: session table
    const leftBox = document.createElement('div');
    leftBox.style.cssText = [
      'flex:1',
      'min-width:0',
      'overflow-y:auto',
      daySessions.length > 0 || p.sessionsLoading ? 'max-height:726px' : 'max-height:726px',
    ].join(';');
    contentRow.appendChild(leftBox);

    if (p.sessionsLoading) {
      const loadingEl = document.createElement('div');
      loadingEl.style.cssText = 'display:flex;justify-content:center;padding:24px 0;';
      loadingEl.textContent = '...';
      leftBox.appendChild(loadingEl);
    } else if (daySessions.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.style.cssText =
        'font-size:0.875rem;color:var(--am-color-text-secondary);';
      emptyEl.textContent = p.t('sessionList.noSessionsFound');
      leftBox.appendChild(emptyEl);
    } else {
      const table = document.createElement('table');
      table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.875rem;';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      const headers = [
        'Session',
        p.t('sessionList.timeHeader'),
        'Agent',
        p.t('sessionList.locHeader'),
        p.t('sessionList.tokensHeader'),
        p.t('sessionList.costHeader'),
        p.t('sessionList.messagesHeader'),
        p.t('sessionList.errorsHeader'),
        p.t('sessionList.subAgents'),
        '',
      ];
      for (const h of headers) {
        const th = document.createElement('th');
        th.textContent = h;
        th.style.cssText = [
          `color:${p.colors.textSecondary}`,
          `border-bottom:1px solid ${p.colors.border}`,
          `background-color:${p.colors.midnightNavy}`,
          'padding:4px 8px',
          'text-align:left',
          'position:sticky',
          'top:0',
        ].join(';');
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (const s of daySessions) {
        renderSessionRow(p, s, tbody, timelineSessionId === s.id);
      }
      table.appendChild(tbody);
      leftBox.appendChild(table);
    }

    // Right: metrics + charts panel
    if (daySessions.length > 0) {
      const rightBox = document.createElement('div');
      rightBox.style.cssText = 'flex-shrink:0;display:flex;flex-direction:column;gap:8px;width:600px;';
      contentRow.appendChild(rightBox);
      mountRightPanel(p, daySessions, rightBox);
    }

    // Timeline
    if (timelineSessionId) {
      const selectedSession = daySessions.find((s) => s.id === timelineSessionId);
      if (selectedSession) {
        if (timelineLoading) {
          const timelineLoaderEl = document.createElement('div');
          timelineLoaderEl.style.cssText = [
            `background-color:${p.cardSx.bgcolor}`,
            `border:${p.cardSx.border}`,
            `border-radius:${p.cardSx.borderRadius}`,
            'margin-top:8px',
            'padding:12px',
            'height:270px',
            'display:flex',
            'align-items:center',
            'justify-content:center',
          ].join(';');
          const loadingMsg = document.createElement('span');
          loadingMsg.style.cssText =
            'font-size:0.875rem;color:var(--am-color-text-secondary);';
          loadingMsg.textContent = p.t('sessionList.loadingTimeline');
          timelineLoaderEl.appendChild(loadingMsg);
          root.appendChild(timelineLoaderEl);
        } else {
          const timelineEl = document.createElement('div');
          root.appendChild(timelineEl);
          const timelineHandle = mountSessionCacheTimeline(timelineEl, {
            messages: timelineMessages,
            session: selectedSession,
            colors: p.colors,
            chartColors: p.chartColors,
            cardSx: p.cardSx,
            isDark: p.isDark,
            t: p.t,
          });
          mountedHandles.push(timelineHandle as AnyHandle);
        }
      }
    }
  }

  // Fetch day tool metrics
  function fetchDayToolMetrics(p: DailySessionListProps): void {
    if (!p.fetchDayToolMetrics) {
      dayAggToolMetrics = null;
      return;
    }
    dayToolCancelled = false;
    void p.fetchDayToolMetrics(p.date).then((result) => {
      if (dayToolCancelled) return;
      dayAggToolMetrics = result;
      render(currentProps);
    });
  }

  fetchDayToolMetrics(props);
  render(props);

  return {
    update(newProps: DailySessionListProps) {
      dayToolCancelled = true;
      if (
        newProps.date !== currentProps.date ||
        newProps.fetchDayToolMetrics !== currentProps.fetchDayToolMetrics
      ) {
        timelineSessionId = null;
        timelineMessages = [];
        sessionToolMetrics = null;
        dayAggToolMetrics = null;
        latestRequestId = null;
        timelineLoading = false;
      }
      currentProps = newProps;
      destroyAll(mountedHandles);
      render(newProps);
      fetchDayToolMetrics(newProps);
    },
    destroy() {
      dayToolCancelled = true;
      latestRequestId = null;
      destroyAll(mountedHandles);
      root.remove();
    },
  };
}
