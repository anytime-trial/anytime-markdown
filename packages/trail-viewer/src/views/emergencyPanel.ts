/**
 * emergencyPanel — Phase 5 S5。フローティング Kill Switch（FAB）+ EmergencyPanel。
 *
 * 設計の要点（要件書 §17.1 / §17.2）:
 *   - FAB は 3 状態（平常 / 発動中 / 状態不明）を**常時**提示する。状態不明を平常と同じ顔に
 *     しない（サーバー障害を「止まっていない」と誤読させない）。
 *   - 発動・解除・ロールバックはすべて確認モーダルを経由し、**どの段でキャンセルしても
 *     「実行していない」ことを明示**する（S1 §16 で踏んだ Esc 無言キャンセルの再発防止）。
 *   - 状態スタイルは data-status 属性 + 注入スタイルシートで表現し、色はテーマトークンから
 *     取る（ダーク / ライト両対応）。
 */
import { createFocusTrap } from '@anytime-markdown/ui-core';

import type { VanillaViewHandle } from '../shared/vanillaIsland';
import type { EmergencyActionResult, EmergencyViewState, SafePointDto } from '../data/emergencyStore';
import type { TrailThemeTokens } from '../theme/designTokens';

export interface EmergencyPanelProps {
  readonly isDark: boolean;
  readonly tokens: TrailThemeTokens;
  readonly t: (key: string) => string;
  readonly state: EmergencyViewState;
  readonly onActivate: (reason: string) => Promise<EmergencyActionResult>;
  readonly onRelease: (reason: string) => Promise<EmergencyActionResult>;
  readonly onRollback: (commitHash: string) => Promise<EmergencyActionResult>;
  readonly fetchSafePoints: () => Promise<readonly SafePointDto[]>;
}

type FeedbackKind = 'cancelled' | 'error' | 'success';

interface Feedback {
  readonly kind: FeedbackKind;
  readonly message: string;
}

/** 確認モーダルで待っている操作。 */
type PendingAction =
  | { readonly kind: 'activate'; readonly reason: string }
  | { readonly kind: 'release'; readonly reason: string }
  | { readonly kind: 'rollback'; readonly point: SafePointDto };

const STYLE_ID = 'am-emergency-panel-style';

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? '');
}

function shortSha(commitHash: string): string {
  return commitHash.slice(0, 8);
}

/**
 * スタイルは 1 度だけ注入する。位置・状態色はここが正本で、要素側へインラインで置かない
 * （インラインは注入スタイルを上書きして状態表現を壊す）。
 */
function ensureStyle(doc: Document, tokens: TrailThemeTokens): void {
  const existing = doc.getElementById(STYLE_ID);
  if (existing) existing.remove();
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  const c = tokens.colors;
  style.textContent = `
[data-am-emergency-root] { position: relative; }
[data-am-emergency-fab] {
  position: fixed; right: 24px; bottom: 24px; z-index: 1300;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-radius: 24px; cursor: pointer;
  font-size: 13px; font-weight: 600; line-height: 1.2;
  border: 1px solid ${c.border};
  box-shadow: 0 2px 8px rgba(0,0,0,0.28);
}
[data-am-emergency-fab][data-status="inactive"] {
  background: ${c.charcoal}; color: ${c.textSecondary};
}
[data-am-emergency-fab][data-status="active"] {
  background: ${c.error}; color: #FFFFFF; border-color: ${c.error};
}
[data-am-emergency-fab][data-status="unknown"] {
  background: ${c.warningBg}; color: ${c.warning}; border-color: ${c.warning};
  border-style: dashed;
}
[data-am-emergency-dot] { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
[data-am-emergency-backdrop] {
  position: fixed; inset: 0; z-index: 1400; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
}
[data-am-emergency-panel] {
  width: min(560px, 92vw); max-height: 82vh; overflow-y: auto;
  background: ${c.charcoal}; color: ${c.textPrimary};
  border: 1px solid ${c.border}; border-radius: 8px; padding: 20px;
}
[data-am-emergency-panel] h2 { margin: 0 0 12px; font-size: 16px; }
[data-am-emergency-panel] h3 { margin: 20px 0 8px; font-size: 13px; color: ${c.textSecondary}; }
[data-am-emergency-active-box] {
  background: ${c.errorBg}; border: 1px solid ${c.error}; border-radius: 6px;
  padding: 12px; margin-bottom: 12px; font-size: 13px;
}
[data-am-emergency-unknown-notice] {
  background: ${c.warningBg}; border: 1px solid ${c.warning}; border-radius: 6px;
  padding: 12px; margin-bottom: 12px; font-size: 13px; color: ${c.textPrimary};
}
[data-am-emergency-reason] {
  width: 100%; box-sizing: border-box; padding: 8px 10px; font-size: 13px;
  background: ${c.sectionBg}; color: ${c.textPrimary};
  border: 1px solid ${c.border}; border-radius: 4px;
}
[data-am-emergency-actions] { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
[data-am-emergency-root] button {
  padding: 8px 14px; border-radius: 4px; font-size: 13px; cursor: pointer;
  border: 1px solid ${c.border}; background: ${c.sectionBg}; color: ${c.textPrimary};
}
[data-am-emergency-root] button[data-variant="danger"] {
  background: ${c.error}; border-color: ${c.error}; color: #FFFFFF;
}
[data-am-emergency-feedback] { margin-top: 12px; font-size: 13px; padding: 8px 10px; border-radius: 4px; }
[data-am-emergency-feedback][data-kind="cancelled"] { background: ${c.sectionBg}; color: ${c.textSecondary}; }
[data-am-emergency-feedback][data-kind="error"] { background: ${c.errorBg}; color: ${c.error}; }
[data-am-emergency-feedback][data-kind="success"] { background: ${c.successBg}; color: ${c.success}; }
[data-am-safe-points] { list-style: none; margin: 0; padding: 0; }
[data-am-safe-point] {
  display: block; width: 100%; text-align: left; margin-bottom: 6px;
  font-size: 12px; font-family: ui-monospace, monospace;
}
[data-am-safe-points-empty] { font-size: 13px; color: ${c.textSecondary}; }
[data-am-emergency-confirm] {
  position: fixed; inset: 0; z-index: 1500; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
}
[data-am-emergency-confirm-box] {
  width: min(440px, 90vw); background: ${c.charcoal}; color: ${c.textPrimary};
  border: 1px solid ${c.border}; border-radius: 8px; padding: 20px; font-size: 13px;
}
`;
  doc.head.appendChild(style);
}

export function mountEmergencyPanel(
  container: HTMLElement,
  initialProps: EmergencyPanelProps,
): VanillaViewHandle<EmergencyPanelProps> {
  let props = initialProps;
  let destroyed = false;

  let panelOpen = false;
  let reason = '';
  let feedback: Feedback | null = null;
  let pending: PendingAction | null = null;
  let safePoints: readonly SafePointDto[] = [];
  let safePointsLoaded = false;

  // 再 render のたびに DOM を作り直すため、trap も張り直す。release を保持して二重付与を防ぐ。
  let releasePanelTrap: (() => void) | null = null;
  let releaseConfirmTrap: (() => void) | null = null;

  const doc = container.ownerDocument;
  ensureStyle(doc, props.tokens);

  const root = doc.createElement('div');
  root.setAttribute('data-am-emergency-root', '');
  container.appendChild(root);

  function statusLabel(status: EmergencyViewState['status']): string {
    return props.t(`emergency.status.${status}`);
  }

  function setFeedback(next: Feedback | null): void {
    feedback = next;
    render();
  }

  async function runPending(): Promise<void> {
    const action = pending;
    pending = null;
    if (action === null) return;

    if (action.kind === 'activate') {
      const result = await props.onActivate(action.reason);
      if (destroyed) return;
      setFeedback(
        result.ok
          ? { kind: 'success', message: props.t('emergency.feedback.activated') }
          : { kind: 'error', message: interpolate(props.t('emergency.feedback.failed'), { error: result.error ?? '' }) },
      );
      if (result.ok) reason = '';
      return;
    }

    if (action.kind === 'release') {
      const result = await props.onRelease(action.reason);
      if (destroyed) return;
      setFeedback(
        result.ok
          ? { kind: 'success', message: props.t('emergency.feedback.released') }
          : { kind: 'error', message: interpolate(props.t('emergency.feedback.failed'), { error: result.error ?? '' }) },
      );
      if (result.ok) reason = '';
      return;
    }

    const result = await props.onRollback(action.point.commitHash);
    if (destroyed) return;
    setFeedback(
      result.ok
        ? {
            kind: 'success',
            message: interpolate(props.t('emergency.feedback.rolledBack'), {
              branch: result.recoverBranch ?? `recover-${shortSha(action.point.commitHash)}`,
            }),
          }
        : { kind: 'error', message: interpolate(props.t('emergency.feedback.failed'), { error: result.error ?? '' }) },
    );
  }

  /** キャンセルは必ず明示フィードバックを残す（無言キャンセル禁止・S1 §16 の再発防止）。 */
  function cancelPending(): void {
    pending = null;
    setFeedback({ kind: 'cancelled', message: props.t('emergency.feedback.cancelled') });
  }

  async function openPanel(): Promise<void> {
    panelOpen = true;
    feedback = null;
    render();
    if (!safePointsLoaded) {
      safePoints = await props.fetchSafePoints();
      safePointsLoaded = true;
      if (destroyed) return;
      render();
    }
  }

  function closePanel(): void {
    panelOpen = false;
    pending = null;
    render();
  }

  function button(
    label: string,
    marker: string,
    onClick: () => void,
    variant?: 'danger',
  ): HTMLButtonElement {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute(marker, '');
    if (variant) b.dataset['variant'] = variant;
    b.addEventListener('click', onClick);
    return b;
  }

  function renderFab(): HTMLElement {
    const fab = doc.createElement('button');
    fab.type = 'button';
    fab.setAttribute('data-am-emergency-fab', '');
    fab.dataset['status'] = props.state.status;
    fab.setAttribute('aria-label', props.t('emergency.fab.label'));

    const dot = doc.createElement('span');
    dot.setAttribute('data-am-emergency-dot', '');
    fab.appendChild(dot);
    fab.appendChild(doc.createTextNode(statusLabel(props.state.status)));

    // 発動中は理由・発動者・時刻を hover でも読めるようにする（一目で「なぜ止まっているか」）
    if (props.state.status === 'active') {
      fab.title = `${props.state.reason ?? ''} (${props.state.triggeredBy ?? ''} / ${props.state.triggeredAt ?? ''})`;
    } else {
      fab.title = statusLabel(props.state.status);
    }
    fab.addEventListener('click', () => void openPanel());
    return fab;
  }

  function renderSafePoints(): HTMLElement {
    const wrap = doc.createElement('div');
    const heading = doc.createElement('h3');
    heading.textContent = props.t('emergency.safePoints.title');
    wrap.appendChild(heading);

    if (safePoints.length === 0) {
      const empty = doc.createElement('div');
      empty.setAttribute('data-am-safe-points-empty', '');
      empty.textContent = props.t('emergency.safePoints.empty');
      wrap.appendChild(empty);
      return wrap;
    }

    const list = doc.createElement('ul');
    list.setAttribute('data-am-safe-points', '');
    for (const p of safePoints) {
      const li = doc.createElement('li');
      const detail = p.label || (p.source === 'stop_hook' ? props.t('emergency.safePoints.autoLabel') : '');
      const b = button(
        `${p.createdAt}  ${shortSha(p.commitHash)}  ${p.branch}  ${detail}`,
        'data-am-safe-point',
        () => {
          pending = { kind: 'rollback', point: p };
          render();
        },
      );
      li.appendChild(b);
      list.appendChild(li);
    }
    wrap.appendChild(list);
    return wrap;
  }

  function renderPanel(): HTMLElement {
    const backdrop = doc.createElement('div');
    backdrop.setAttribute('data-am-emergency-backdrop', '');

    const panel = doc.createElement('div');
    panel.setAttribute('data-am-emergency-panel', '');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');

    const title = doc.createElement('h2');
    title.textContent = props.t('emergency.panel.title');
    panel.appendChild(title);

    if (props.state.status === 'active') {
      const box = doc.createElement('div');
      box.setAttribute('data-am-emergency-active-box', '');
      box.textContent =
        `${statusLabel('active')} — ${props.state.reason ?? ''}\n` +
        `${props.t('emergency.triggeredBy')}: ${props.state.triggeredBy ?? ''} / ` +
        `${props.t('emergency.activeSince')}: ${props.state.triggeredAt ?? ''}`;
      panel.appendChild(box);
    }

    if (props.state.status === 'unknown') {
      // サーバー不明時こそ代替経路（VS Code コマンド）を案内する（UI 経路全滅の手当て）
      const notice = doc.createElement('div');
      notice.setAttribute('data-am-emergency-unknown-notice', '');
      notice.textContent = props.t('emergency.unknown.notice');
      panel.appendChild(notice);
    }

    const label = doc.createElement('h3');
    label.textContent = props.t('emergency.reason.label');
    panel.appendChild(label);

    const input = doc.createElement('input');
    input.setAttribute('data-am-emergency-reason', '');
    input.type = 'text';
    input.value = reason;
    input.placeholder = props.t('emergency.reason.placeholder');
    input.addEventListener('input', () => {
      reason = input.value;
    });
    panel.appendChild(input);

    const actions = doc.createElement('div');
    actions.setAttribute('data-am-emergency-actions', '');

    if (props.state.status === 'active') {
      actions.appendChild(
        button(props.t('emergency.action.release'), 'data-am-emergency-release', () => {
          pending = { kind: 'release', reason: reason.trim() };
          render();
        }),
      );
    } else {
      actions.appendChild(
        button(
          props.t('emergency.action.activate'),
          'data-am-emergency-activate',
          () => {
            const trimmed = reason.trim();
            if (trimmed === '') {
              // 確認モーダルへ進ませない。理由なし発動は要件で禁止（サーバーも 400 で拒否）
              setFeedback({ kind: 'error', message: props.t('emergency.reason.required') });
              return;
            }
            pending = { kind: 'activate', reason: trimmed };
            render();
          },
          'danger',
        ),
      );
    }
    actions.appendChild(button(props.t('emergency.panel.close'), 'data-am-emergency-close', closePanel));
    panel.appendChild(actions);

    if (feedback !== null) {
      const fb = doc.createElement('div');
      fb.setAttribute('data-am-emergency-feedback', '');
      fb.dataset['kind'] = feedback.kind;
      fb.setAttribute('role', 'status');
      fb.textContent = feedback.message;
      panel.appendChild(fb);
    }

    panel.appendChild(renderSafePoints());
    backdrop.appendChild(panel);
    return backdrop;
  }

  function confirmText(action: PendingAction): { title: string; body: string } {
    if (action.kind === 'activate') {
      return {
        title: props.t('emergency.confirm.activateTitle'),
        body: props.t('emergency.confirm.activateBody'),
      };
    }
    if (action.kind === 'release') {
      return {
        title: props.t('emergency.confirm.releaseTitle'),
        body: props.t('emergency.confirm.releaseBody'),
      };
    }
    return {
      title: props.t('emergency.confirm.rollbackTitle'),
      body: interpolate(props.t('emergency.confirm.rollbackBody'), {
        branch: `recover-${shortSha(action.point.commitHash)}`,
      }),
    };
  }

  function renderConfirm(action: PendingAction): HTMLElement {
    const overlay = doc.createElement('div');
    overlay.setAttribute('data-am-emergency-confirm', '');

    const box = doc.createElement('div');
    box.setAttribute('data-am-emergency-confirm-box', '');
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');

    const { title, body } = confirmText(action);
    const h = doc.createElement('h2');
    h.textContent = title;
    box.appendChild(h);
    const p = doc.createElement('p');
    p.textContent = body;
    box.appendChild(p);

    const actions = doc.createElement('div');
    actions.setAttribute('data-am-emergency-actions', '');
    actions.appendChild(
      button(props.t('emergency.confirm.ok'), 'data-am-emergency-confirm-ok', () => void runPending(), 'danger'),
    );
    actions.appendChild(
      button(props.t('emergency.confirm.cancel'), 'data-am-emergency-confirm-cancel', cancelPending),
    );
    box.appendChild(actions);
    overlay.appendChild(box);
    return overlay;
  }

  function render(): void {
    if (destroyed) return;
    // 旧 DOM の trap を先に解除する（背景 aria-hidden / スクロールロックを残さない）
    releasePanelTrap?.();
    releasePanelTrap = null;
    releaseConfirmTrap?.();
    releaseConfirmTrap = null;

    root.replaceChildren();
    root.appendChild(renderFab());

    if (panelOpen) {
      const panel = renderPanel();
      root.appendChild(panel);
      const paper = panel.querySelector<HTMLElement>('[data-am-emergency-panel]');
      if (paper) {
        releasePanelTrap = createFocusTrap({ container: paper, onClose: closePanel }).release;
      }
    }

    if (pending !== null) {
      const confirm = renderConfirm(pending);
      root.appendChild(confirm);
      const box = confirm.querySelector<HTMLElement>('[data-am-emergency-confirm-box]');
      if (box) {
        // Escape は cancelPending へ繋ぐ。単に閉じるだけだと「無言キャンセル」になり、
        // S1 §16 で実際に起きた「発動したつもり」の事故を再現してしまう（FR-S5-5）。
        releaseConfirmTrap = createFocusTrap({ container: box, onClose: cancelPending }).release;
      }
    }
  }

  render();

  return {
    update(newProps: EmergencyPanelProps) {
      props = newProps;
      ensureStyle(doc, props.tokens);
      render();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      releasePanelTrap?.();
      releaseConfirmTrap?.();
      root.remove();
      doc.getElementById(STYLE_ID)?.remove();
    },
  };
}
