/**
 * StatsBar の vanilla 版（`components/StatsBar.tsx` の素 DOM 等価）。
 *
 * セッション未選択時はプレースホルダーを表示し、選択時はトークン使用量・期間・メッセージ数を
 * outlined Chip 群で表示する。テーマ色は colors props 経由で受ける。
 */
import {
  createChip,
  ArrowDownward,
  ArrowUpward,
  Cached,
} from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../shared/vanillaIsland';
import type { TrailMessage, TrailSession } from '../domain/parser/types';

export interface StatsBarProps {
  readonly t: (key: string) => string;
  readonly session?: TrailSession;
  readonly messages: readonly TrailMessage[];
  /** colors from TrailThemeContext */
  readonly colors: {
    readonly border: string;
    readonly charcoal: string;
    readonly textSecondary: string;
    readonly iceBlue: string;
    readonly error: string;
    readonly success: string;
  };
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatDuration(startTime: string, endTime: string): string {
  if (!startTime || !endTime) return '-';
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return '-';
  const ms = end - start;
  if (ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function mountStatsBar(
  container: HTMLElement,
  initial: StatsBarProps,
): VanillaViewHandle<StatsBarProps> {
  let props = initial;

  const root = document.createElement('div');
  container.appendChild(root);

  function applyRootStyle(): void {
    root.style.cssText =
      `padding:8px 16px;border-top:1px solid ${props.colors.border};` +
      `background-color:${props.colors.charcoal};` +
      'display:flex;gap:8px;flex-wrap:wrap;align-items:center;';
  }

  function render(): void {
    root.replaceChildren();
    applyRootStyle();

    if (!props.session) {
      const text = document.createElement('span');
      text.style.cssText = `font-size:0.875rem;color:${props.colors.textSecondary};`;
      text.textContent = props.t('stats.noSessionSelected');
      root.appendChild(text);
      return;
    }

    const usage = props.session.usage ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };

    const iconChips: Array<{ iconFn: () => { el: SVGSVGElement }; label: string; color: string }> = [
      {
        iconFn: () => ArrowDownward({ fontSize: 'small' }),
        label: `${props.t('stats.input')} ${formatNumber(usage.inputTokens)}`,
        color: props.colors.iceBlue,
      },
      {
        iconFn: () => ArrowUpward({ fontSize: 'small' }),
        label: `${props.t('stats.output')} ${formatNumber(usage.outputTokens)}`,
        color: props.colors.error,
      },
      {
        iconFn: () => Cached({ fontSize: 'small' }),
        label: `${props.t('stats.cacheRead')} ${formatNumber(usage.cacheReadTokens)}`,
        color: props.colors.success,
      },
    ];

    for (const c of iconChips) {
      const { el } = createChip({ label: c.label, size: 'small', variant: 'outlined' });
      el.style.borderColor = c.color;
      el.style.color = c.color;
      const icon = c.iconFn();
      icon.el.style.marginRight = '4px';
      icon.el.style.flexShrink = '0';
      el.insertBefore(icon.el, el.firstChild);
      root.appendChild(el);
    }

    // Duration chip (no icon)
    const durationLabel = `${props.t('stats.duration')} ${formatDuration(
      props.session.startTime,
      props.session.endTime,
    )}`;
    const { el: durChip } = createChip({ label: durationLabel, size: 'small', variant: 'outlined' });
    durChip.style.borderColor = props.colors.textSecondary;
    durChip.style.color = props.colors.textSecondary;
    root.appendChild(durChip);

    // Message count chip
    const msgLabel = `${props.messages.length} ${props.t('stats.messages')}`;
    const { el: msgChip } = createChip({ label: msgLabel, size: 'small', variant: 'outlined' });
    msgChip.style.borderColor = props.colors.textSecondary;
    msgChip.style.color = props.colors.textSecondary;
    root.appendChild(msgChip);
  }

  render();

  return {
    update(next: StatsBarProps) {
      props = next;
      render();
    },
    destroy() {
      root.remove();
    },
  };
}
