/**
 * MessageTimeline の vanilla DOM 版（`components/messages/MessageTimeline.tsx` の素 DOM 等価）。
 *
 * レーンベースのタイムライン可視化。折りたたみ状態を localStorage に永続化する。
 * --am-color-* / --trv-color-* CSS 変数でテーマに追従し、React / MUI に依存しない。
 */
import {
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
} from '@anytime-markdown/ui-core';

import type { TrailMessage, TrailSession, TrailTreeNode } from '../../domain/parser/types';
import { toolActionColors } from '../../theme/designTokens';

import {
  COLLAPSED_HEIGHT,
  LANE_HEIGHT,
  LANE_LABEL_WIDTH,
  MAX_SUBAGENT_TRACKS,
  PLOT_TOP,
  STORAGE_KEY,
  TIME_AXIS_HEIGHT,
} from '../../components/messages/timeline/timelineConstants';
import {
  getAgentColor,
  getDelegatedAgentLabel,
  getTurnColor,
} from '../../components/messages/timeline/timelineColors';
import {
  applyScrollHighlight,
  extractAgentCallMeta,
  findMessageEl,
  formatTimeLabel,
} from '../../components/messages/timeline/timelineLayout';
import type { LaneKind, TimelineEntry, Turn } from '../../components/messages/types';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';

export interface MessageTimelineViewProps {
  t: (key: string) => string;
  nodes: readonly TrailTreeNode[];
  session?: TrailSession;
  onSelectMessage: (uuid: string) => void;
}

// ---------------------------------------------------------------------------
// Pure data computation (mirroring MessageTimeline.tsx useMemo blocks)
// ---------------------------------------------------------------------------

function buildTimelineMessages(nodes: readonly TrailTreeNode[]): readonly TimelineEntry[] {
  const result: TimelineEntry[] = [];
  function traverse(n: TrailTreeNode): void {
    const msg = n.message as TrailMessage;
    const t = msg.type;
    if (t === 'user' || t === 'assistant' || t === 'system') {
      if (t === 'user') {
        const hasUserContent =
          typeof msg.userContent === 'string' && msg.userContent.length > 0;
        if (!hasUserContent) {
          for (const child of n.children) traverse(child);
          return;
        }
      }
      const hasAgentId = typeof msg.agentId === 'string' && msg.agentId.length > 0;
      const agentCall = extractAgentCallMeta(
        msg.toolCalls as readonly { name: string; input: Record<string, unknown> }[] | undefined,
      );
      const isDelegatedAgentCall = t === 'assistant' && agentCall.delegated;
      const laneKind: LaneKind =
        hasAgentId || isDelegatedAgentCall ? 'subagent' : t;
      const syntheticAgentId = isDelegatedAgentCall
        ? `delegated:${agentCall.subagentType ?? 'unknown'}`
        : undefined;
      const ms = Date.parse(msg.timestamp);
      result.push({
        uuid: msg.uuid,
        timestamp: msg.timestamp,
        ms,
        laneKind,
        agentId: hasAgentId ? msg.agentId : syntheticAgentId,
        agentDescription: msg.agentDescription ?? agentCall.description,
        toolNames: (msg.toolCalls ?? []).map((tc) => tc.name),
        hasCommit: (msg.triggerCommitHashes?.length ?? 0) > 0,
        role: t,
      });
    }
    for (const child of n.children) traverse(child);
  }
  for (const node of nodes) traverse(node);
  return result.sort((a, b) => a.ms - b.ms);
}

function buildTurns(timelineMessages: readonly TimelineEntry[]): readonly Turn[] {
  const out: Turn[] = [];
  let cur: Turn | null = null;
  const pushCurrent = (): void => {
    if (cur) out.push(cur);
  };
  for (const msg of timelineMessages) {
    if (msg.role === 'user' && msg.laneKind === 'user') {
      pushCurrent();
      cur = { userMsg: msg, aiMsgs: [], subagentMsgs: [], systemMsgs: [] };
      continue;
    }
    if (!cur) {
      cur = { userMsg: null, aiMsgs: [], subagentMsgs: [], systemMsgs: [] };
    }
    if (msg.laneKind === 'assistant') cur.aiMsgs.push(msg);
    else if (msg.laneKind === 'subagent') cur.subagentMsgs.push(msg);
    else if (msg.laneKind === 'system') cur.systemMsgs.push(msg);
  }
  pushCurrent();
  return out;
}

function buildSubagentTracks(timelineMessages: readonly TimelineEntry[]): readonly string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const m of timelineMessages) {
    if (m.laneKind === 'subagent' && m.agentId && !seen.has(m.agentId)) {
      seen.add(m.agentId);
      order.push(m.agentId);
    }
  }
  return order;
}

interface RangeResult {
  rangeStart: number;
  rangeEnd: number;
}

function buildRange(
  timelineMessages: readonly TimelineEntry[],
  session: TrailSession | undefined,
): RangeResult {
  const sStart = session?.startTime ? Date.parse(session.startTime) : NaN;
  const sEnd = session?.endTime ? Date.parse(session.endTime) : NaN;
  const msgFirst = timelineMessages.length > 0 ? timelineMessages[0].ms : NaN;
  const msgLast =
    timelineMessages.length > 0 ? timelineMessages[timelineMessages.length - 1].ms : NaN;
  const candidates: number[] = [];
  if (Number.isFinite(sStart)) candidates.push(sStart);
  if (Number.isFinite(msgFirst)) candidates.push(msgFirst);
  if (Number.isFinite(sEnd)) candidates.push(sEnd);
  if (Number.isFinite(msgLast)) candidates.push(msgLast);
  if (candidates.length === 0) return { rangeStart: 0, rangeEnd: 0 };
  const start = Math.min(...candidates);
  const end = Math.max(...candidates);
  return { rangeStart: start, rangeEnd: end > start ? end : start + 1 };
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function laneLabel(text: string, borderColor: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText =
    `height:${LANE_HEIGHT}px;display:flex;align-items:center;justify-content:flex-end;` +
    `padding-right:8px;border-right:1px solid ${borderColor};`;
  const span = document.createElement('span');
  span.style.cssText = 'color:var(--am-color-text-secondary);font-size:0.7rem;';
  span.textContent = text;
  el.appendChild(span);
  return el;
}

function bar(
  leftPct: number,
  topPct: number,
  widthPct: number | undefined,
  heightPct: number,
  color: string,
  ariaLabel: string,
  tooltip: string,
  centered: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  const leftClamped = Math.max(0, Math.min(leftPct, 99.5));
  btn.style.cssText =
    'position:absolute;border:none;cursor:pointer;padding:0;z-index:2;' +
    `left:${leftClamped}%;top:${topPct}%;` +
    (widthPct !== undefined
      ? `width:${Math.max(widthPct, 0.3)}%;min-width:3px;`
      : 'width:4px;') +
    `height:${heightPct}%;` +
    `background-color:${color};border-radius:2px;` +
    (centered ? 'transform:translateX(-50%);' : '');
  btn.setAttribute('aria-label', ariaLabel);
  btn.title = tooltip;
  btn.addEventListener('click', onClick);
  btn.addEventListener('mouseenter', () => {
    btn.style.opacity = '0.7';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.opacity = '1';
  });
  return btn;
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function mountMessageTimeline(
  container: HTMLElement,
  initial: MessageTimelineViewProps,
): VanillaViewHandle<MessageTimelineViewProps> {
  // Read initial collapsed state from localStorage
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    // ignore – localStorage may not be available in test/SSR context
  }

  // Root element
  const root = document.createElement('div');
  root.setAttribute('data-testid', 'message-timeline');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Trace timeline');
  root.style.cssText =
    'position:relative;overflow:hidden;transition:height 0.2s ease;flex-shrink:0;' +
    'background-color:var(--trv-color-charcoal,#1a2035);' +
    'border-bottom:1px solid var(--am-color-divider);';

  // Collapse button (always visible)
  const collapseBtn = document.createElement('button');
  collapseBtn.style.cssText =
    'position:absolute;top:4px;right:4px;z-index:3;' +
    'border:none;background:none;cursor:pointer;padding:4px;border-radius:50%;' +
    'color:var(--am-color-text-secondary);display:flex;align-items:center;';
  root.appendChild(collapseBtn);

  // Content area (rebuilt on update)
  let contentEl: HTMLDivElement | null = null;

  const updateCollapseBtn = (): void => {
    collapseBtn.replaceChildren();
    collapseBtn.setAttribute(
      'aria-label',
      collapsed ? 'Expand timeline' : 'Collapse timeline',
    );
    const icon = collapsed
      ? KeyboardArrowDownIcon({ fontSize: 'small' }).el
      : KeyboardArrowUpIcon({ fontSize: 'small' }).el;
    collapseBtn.appendChild(icon);
  };

  collapseBtn.addEventListener('click', () => {
    collapsed = !collapsed;
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // ignore
    }
    updateCollapseBtn();
    applyLayout(latestProps);
  });

  let latestProps = initial;

  const applyLayout = (props: MessageTimelineViewProps): void => {
    latestProps = props;

    const timelineMessages = buildTimelineMessages(props.nodes);
    const turns = buildTurns(timelineMessages);
    const subagentTracks = buildSubagentTracks(timelineMessages);

    const subTrackCount = Math.max(subagentTracks.length, 1);
    const subagentIndex = new Map<string, number>();
    subagentTracks.forEach((id, i) => subagentIndex.set(id, i));
    const subagentTrackLabels = subagentTracks.map((id) => getDelegatedAgentLabel(id));

    const totalLaneCount = 3 + subTrackCount;
    const totalContentHeight = totalLaneCount * LANE_HEIGHT;
    const timelineHeight = totalContentHeight + TIME_AXIS_HEIGHT + PLOT_TOP;
    const maxTimelineHeight =
      (3 + MAX_SUBAGENT_TRACKS) * LANE_HEIGHT + TIME_AXIS_HEIGHT + PLOT_TOP;
    const displayHeight = Math.min(timelineHeight, maxTimelineHeight);
    const needsScroll = timelineHeight > maxTimelineHeight;
    const laneHeightPct = 100 / totalLaneCount;
    const systemLaneIndex = 2 + subTrackCount;

    // Set root height
    root.style.height = collapsed ? `${COLLAPSED_HEIGHT}px` : `${displayHeight}px`;

    // Remove old content
    if (contentEl) contentEl.remove();
    contentEl = null;

    if (collapsed) return;

    const mainAgentLabel = props.session?.source === 'codex' ? 'Codex' : 'Claude Code';

    const { rangeStart, rangeEnd } = buildRange(timelineMessages, props.session);
    const duration = Math.max(rangeEnd - rangeStart, 1);
    const includeDate = duration > 24 * 60 * 60 * 1000;

    const toPct = (ms: number): number => ((ms - rangeStart) / duration) * 100;
    const laneCenterPct = (laneIndex: number): number =>
      laneIndex * laneHeightPct + laneHeightPct * 0.5;

    const borderColor = 'var(--am-color-divider)';
    const iceBlue = 'var(--trv-color-ice-blue,#64b5f6)';
    const textSecondary = 'var(--am-color-text-secondary)';

    // Content wrapper
    contentEl = document.createElement('div');

    // ── Scrollable wrapper (plot area) ──────────────────────────────────────
    const scrollableWrapper = document.createElement('div');
    scrollableWrapper.style.cssText =
      `position:absolute;top:${PLOT_TOP}px;left:0;right:0;bottom:${TIME_AXIS_HEIGHT}px;` +
      `overflow-y:${needsScroll ? 'auto' : 'hidden'};`;

    // Inner container (full height)
    const innerContainer = document.createElement('div');
    innerContainer.style.cssText = `position:relative;height:${totalContentHeight}px;`;

    // ── Lane labels ──────────────────────────────────────────────────────────
    const laneLabels = document.createElement('div');
    laneLabels.style.cssText =
      `position:absolute;top:0;left:0;width:${LANE_LABEL_WIDTH}px;` +
      'display:flex;flex-direction:column;';

    laneLabels.appendChild(laneLabel('User', borderColor));

    // AI label (with optional version)
    const aiLabelEl = document.createElement('div');
    aiLabelEl.style.cssText =
      `height:${LANE_HEIGHT}px;display:flex;align-items:center;justify-content:flex-end;` +
      `padding-right:8px;border-right:1px solid ${borderColor};`;
    const aiInner = document.createElement('div');
    aiInner.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;line-height:1.1;';
    const aiNameSpan = document.createElement('span');
    aiNameSpan.style.cssText = `color:${textSecondary};font-size:0.7rem;`;
    aiNameSpan.textContent = mainAgentLabel;
    aiInner.appendChild(aiNameSpan);
    if (props.session?.version) {
      const versionSpan = document.createElement('span');
      versionSpan.style.cssText = `color:${textSecondary};font-size:0.6rem;opacity:0.7;`;
      versionSpan.textContent = `v${props.session.version}`;
      aiInner.appendChild(versionSpan);
    }
    aiLabelEl.appendChild(aiInner);
    laneLabels.appendChild(aiLabelEl);

    if (subagentTracks.length > 0) {
      subagentTracks.forEach((_, idx) => {
        laneLabels.appendChild(
          laneLabel(subagentTrackLabels[idx] ?? 'Claude Code', borderColor),
        );
      });
    } else {
      laneLabels.appendChild(laneLabel('-', borderColor));
    }

    laneLabels.appendChild(laneLabel('System', borderColor));
    innerContainer.appendChild(laneLabels);

    // ── Plot area ─────────────────────────────────────────────────────────────
    const plotArea = document.createElement('div');
    plotArea.style.cssText =
      `position:absolute;top:0;left:${LANE_LABEL_WIDTH}px;right:36px;bottom:0;`;

    // Lane background separators
    for (let i = 0; i < totalLaneCount; i++) {
      const lane = document.createElement('div');
      lane.style.cssText =
        `position:absolute;top:${i * laneHeightPct}%;left:0;right:0;height:${laneHeightPct}%;` +
        (i < totalLaneCount - 1 ? `border-bottom:1px dashed ${borderColor};` : '');
      plotArea.appendChild(lane);
    }

    // SVG for connectors
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;';
    svg.setAttribute('aria-hidden', 'true');

    for (const turn of turns) {
      if (!turn.userMsg || turn.aiMsgs.length === 0) continue;
      const x1Pct = toPct(turn.userMsg.ms);
      const x2Pct = toPct(turn.aiMsgs[0].ms);
      const userY = laneCenterPct(0);
      const aiY = laneCenterPct(1);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', `${x1Pct}%`);
      line.setAttribute('y1', `${userY}%`);
      line.setAttribute('x2', `${x2Pct}%`);
      line.setAttribute('y2', `${aiY}%`);
      line.setAttribute('stroke', iceBlue);
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '3,3');
      line.setAttribute('opacity', '0.5');
      svg.appendChild(line);
    }
    plotArea.appendChild(svg);

    // Empty state
    if (timelineMessages.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText =
        'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;';
      const emptySpan = document.createElement('span');
      emptySpan.style.cssText = `color:${textSecondary};font-size:0.75rem;`;
      emptySpan.textContent = 'データなし';
      empty.appendChild(emptySpan);
      plotArea.appendChild(empty);
    }

    // ── User bars ─────────────────────────────────────────────────────────────
    for (const msg of timelineMessages.filter((m) => m.laneKind === 'user')) {
      const leftPct = toPct(msg.ms);
      const topPct = laneHeightPct * 0.35;
      const heightPct = laneHeightPct * 0.3;
      const btn = bar(
        leftPct,
        topPct,
        undefined,
        heightPct,
        iceBlue,
        `user message at ${msg.timestamp}`,
        `[user] ${msg.timestamp}`,
        true,
        () => {
          props.onSelectMessage(msg.uuid);
          const el = findMessageEl([msg.uuid]);
          if (el) applyScrollHighlight(el, iceBlue);
        },
      );
      plotArea.appendChild(btn);
    }

    // ── AI turn bars ──────────────────────────────────────────────────────────
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      if (turn.aiMsgs.length === 0) continue;

      const startMs = turn.aiMsgs[0].ms;
      const lastAiMs = turn.aiMsgs[turn.aiMsgs.length - 1].ms;
      const nextUserMs =
        i + 1 < turns.length && turns[i + 1].userMsg
          ? (turns[i + 1].userMsg as TimelineEntry).ms
          : undefined;
      const endMs =
        nextUserMs !== undefined ? Math.max(lastAiMs, nextUserMs - 1) : lastAiMs;
      const allToolNames = turn.aiMsgs.flatMap((m) => m.toolNames);
      const hasCommit = turn.aiMsgs.some((m) => m.hasCommit);
      const scrollCandidates: string[] = turn.aiMsgs.map((m) => m.uuid);
      if (turn.userMsg) scrollCandidates.push(turn.userMsg.uuid);

      const leftPct = toPct(startMs);
      const widthPct = Math.max(toPct(endMs) - leftPct, 0.3);
      const topPct = laneHeightPct + laneHeightPct * 0.35;
      const heightPct = laneHeightPct * 0.3;
      const color = getTurnColor(allToolNames, toolActionColors);

      const toolSuffix =
        allToolNames.length > 0
          ? ` · ${Array.from(new Set(allToolNames)).join(', ')}`
          : '';
      const durMs = endMs - startMs;
      const tooltipLabel =
        `[AI turn] ${formatTimeLabel(startMs, includeDate)} - ${formatTimeLabel(endMs, includeDate)}` +
        ` (${Math.round(durMs / 1000)}s)${toolSuffix}`;

      const btn = bar(
        leftPct,
        topPct,
        widthPct,
        heightPct,
        color,
        `AI turn ${startMs}`,
        tooltipLabel,
        false,
        () => {
          const primary = scrollCandidates[0];
          if (primary) props.onSelectMessage(primary);
          const el = findMessageEl(scrollCandidates);
          if (el) applyScrollHighlight(el, iceBlue);
        },
      );

      if (hasCommit) {
        const dot = document.createElement('div');
        dot.style.cssText =
          'position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);' +
          `width:5px;height:5px;border-radius:50%;background-color:${iceBlue};`;
        dot.setAttribute('aria-hidden', 'true');
        btn.style.position = 'absolute';
        btn.appendChild(dot);
      }

      plotArea.appendChild(btn);
    }

    // ── Subagent bars ─────────────────────────────────────────────────────────
    for (const msg of timelineMessages.filter((m) => m.laneKind === 'subagent')) {
      const leftPct = toPct(msg.ms);
      const trackIndex = msg.agentId ? (subagentIndex.get(msg.agentId) ?? 0) : 0;
      const topPct = (2 + trackIndex) * laneHeightPct + laneHeightPct * 0.35;
      const heightPct = laneHeightPct * 0.3;
      const color = msg.agentId ? getAgentColor(msg.agentId) : toolActionColors.plain;

      const toolSuffix =
        msg.toolNames.length > 0
          ? ` · ${Array.from(new Set(msg.toolNames)).join(', ')}`
          : '';
      const tooltipLabel =
        `[subagent] ${msg.timestamp}` +
        (msg.agentId ? ` · ${msg.agentId.slice(0, 8)}` : '') +
        (msg.agentDescription ? ` (${msg.agentDescription})` : '') +
        toolSuffix;

      const btn = bar(
        leftPct,
        topPct,
        undefined,
        heightPct,
        color,
        `subagent message at ${msg.timestamp}`,
        tooltipLabel,
        true,
        () => {
          props.onSelectMessage(msg.uuid);
          const el = findMessageEl([msg.uuid]);
          if (el) applyScrollHighlight(el, iceBlue);
        },
      );
      btn.style.width = '3px';
      plotArea.appendChild(btn);
    }

    // ── System bars ───────────────────────────────────────────────────────────
    for (const msg of timelineMessages.filter((m) => m.laneKind === 'system')) {
      const leftPct = toPct(msg.ms);
      const topPct = systemLaneIndex * laneHeightPct + laneHeightPct * 0.35;
      const heightPct = laneHeightPct * 0.3;

      const btn = bar(
        leftPct,
        topPct,
        undefined,
        heightPct,
        toolActionColors.plain,
        `system message at ${msg.timestamp}`,
        `[system] ${msg.timestamp}`,
        true,
        () => {
          props.onSelectMessage(msg.uuid);
          const el = findMessageEl([msg.uuid]);
          if (el) applyScrollHighlight(el, iceBlue);
        },
      );
      btn.style.width = '3px';
      plotArea.appendChild(btn);
    }

    innerContainer.appendChild(plotArea);
    scrollableWrapper.appendChild(innerContainer);
    contentEl.appendChild(scrollableWrapper);

    // ── Time axis ─────────────────────────────────────────────────────────────
    const timeAxis = document.createElement('div');
    timeAxis.style.cssText =
      `position:absolute;left:${LANE_LABEL_WIDTH}px;right:36px;bottom:0;` +
      `height:${TIME_AXIS_HEIGHT}px;border-top:1px solid ${borderColor};` +
      'display:flex;align-items:center;justify-content:space-between;padding:0 8px;';

    const startLabel = document.createElement('span');
    startLabel.style.cssText = `color:${textSecondary};font-size:0.7rem;`;
    startLabel.textContent = formatTimeLabel(rangeStart, includeDate);
    timeAxis.appendChild(startLabel);

    const endLabel = document.createElement('span');
    endLabel.style.cssText = `color:${textSecondary};font-size:0.7rem;`;
    endLabel.textContent = formatTimeLabel(rangeEnd, includeDate);
    timeAxis.appendChild(endLabel);

    contentEl.appendChild(timeAxis);

    root.appendChild(contentEl);
  };

  updateCollapseBtn();
  applyLayout(initial);
  container.appendChild(root);

  return {
    update(next) {
      latestProps = next;
      applyLayout(next);
    },
    destroy() {
      root.remove();
    },
  };
}
