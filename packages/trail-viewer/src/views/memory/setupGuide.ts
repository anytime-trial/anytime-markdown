/**
 * SetupGuide の vanilla DOM 版。
 * メモリ検索サーバ未起動時のセットアップ手順案内を表示する。
 */
import { createAlert, createButton } from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';

export interface SetupGuideProps {
  readonly t: (key: string) => string;
  readonly onRecheck: () => void;
  readonly detail?: string;
}

export function mountSetupGuide(
  container: HTMLElement,
  initial: SetupGuideProps,
): VanillaViewHandle<SetupGuideProps> {
  let props = initial;

  const root = document.createElement('div');
  root.style.cssText = 'padding:32px;overflow-y:auto;box-sizing:border-box;';
  container.appendChild(root);

  // Alert section
  const alertWrap = document.createElement('div');
  alertWrap.style.marginBottom = '16px';
  root.appendChild(alertWrap);

  let alertEl: HTMLElement | null = null;
  let recheckBtn: ReturnType<typeof createButton> | null = null;

  function render(): void {
    alertWrap.replaceChildren();

    const { el: alert } = createAlert({ severity: 'error' });

    const title = document.createElement('div');
    title.style.cssText = 'font-size:1.1rem;font-weight:600;margin-bottom:4px;';
    title.textContent = props.t('memory.chat.setup.title');
    alert.appendChild(title);

    if (props.detail) {
      const detailEl = document.createElement('code');
      detailEl.style.cssText =
        'display:block;margin-top:4px;font-family:monospace;font-size:0.75rem;';
      detailEl.textContent = props.detail;
      alert.appendChild(detailEl);
    }

    alertWrap.appendChild(alert);
    alertEl = alert;

    // Steps
    const stepsWrap = document.createElement('div');
    stepsWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    for (const key of [
      'memory.chat.setup.step1',
      'memory.chat.setup.step2',
      'memory.chat.setup.step3',
    ]) {
      const p = document.createElement('p');
      p.style.cssText = 'margin:0;font-size:0.875rem;';
      p.textContent = props.t(key);
      stepsWrap.appendChild(p);
    }

    // Recheck button
    recheckBtn?.el.remove();
    const { el: btn } = createButton({
      variant: 'contained',
      label: props.t('memory.chat.setup.recheck'),
      onClick: () => props.onRecheck(),
    });
    btn.style.marginTop = '16px';
    recheckBtn = { el: btn } as ReturnType<typeof createButton>;

    // Clear and rebuild after alert
    const existing = root.querySelector('[data-steps]');
    if (existing) existing.remove();
    stepsWrap.setAttribute('data-steps', '');
    root.append(stepsWrap, btn);
  }

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
