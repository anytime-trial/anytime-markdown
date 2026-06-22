/**
 * logs 詳細パネルの vanilla 版（`components/logs/LogDetailPanel.tsx` の素 DOM 等価）。
 *
 * 選択中ログの timestamp/component、extension ソース時の OutputChannel ボタン、
 * message、metadata/stack の整形表示を行う。log が null なら何も描画しない。
 */
import { createButton } from '@anytime-markdown/ui-core';
import type { LogEntry } from '../../c4/hooks/c4WsMessages';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';

export interface LogDetailPanelProps {
  t: (key: string) => string;
  log: LogEntry | null;
  onOpenOutputChannel?: () => void;
}

function preBlock(text: string): HTMLElement {
  const pre = document.createElement('pre');
  pre.style.cssText =
    'font-size:11px;margin:0;padding:8px;background-color:var(--am-color-action-hover);' +
    'border-radius:4px;overflow:auto;';
  pre.textContent = text;
  return pre;
}

function captionLabel(text: string): HTMLElement {
  const el = document.createElement('span');
  el.style.cssText = 'font-size:0.75rem;font-weight:bold;';
  el.textContent = text;
  return el;
}

export function mountLogDetailPanel(
  container: HTMLElement,
  initial: LogDetailPanelProps,
): VanillaViewHandle<LogDetailPanelProps> {
  let props = initial;
  const root = document.createElement('div');
  container.appendChild(root);

  const render = (): void => {
    root.replaceChildren();
    const log = props.log;
    if (!log) {
      root.style.display = 'none';
      return;
    }
    root.style.display = '';
    root.style.cssText =
      'border-top:1px solid var(--am-color-divider);padding:8px;max-height:240px;overflow:auto;';
    root.setAttribute('aria-label', 'log-detail');

    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
    const caption = document.createElement('span');
    caption.style.fontSize = '0.75rem';
    caption.textContent = `${log.timestamp} — ${log.component}`;
    header.appendChild(caption);
    if (log.source === 'extension' && props.onOpenOutputChannel) {
      const { el: btn } = createButton({
        size: 'small',
        label: props.t('logs.action.openOutputChannel'),
        onClick: () => props.onOpenOutputChannel?.(),
      });
      header.appendChild(btn);
    }
    root.appendChild(header);

    const message = document.createElement('div');
    message.style.cssText =
      'margin-bottom:8px;font-family:monospace;white-space:pre-wrap;font-size:0.875rem;';
    message.textContent = log.message;
    root.appendChild(message);

    if (log.metadata != null) {
      const wrap = document.createElement('div');
      wrap.style.marginBottom = '8px';
      wrap.appendChild(captionLabel('metadata'));
      wrap.appendChild(preBlock(JSON.stringify(log.metadata, null, 2)));
      root.appendChild(wrap);
    }
    if (log.stack != null) {
      const wrap = document.createElement('div');
      wrap.appendChild(captionLabel('stack'));
      wrap.appendChild(preBlock(log.stack));
      root.appendChild(wrap);
    }
  };
  render();

  return {
    update(next) {
      props = next;
      render();
    },
    destroy() {
      root.remove();
    },
  };
}
