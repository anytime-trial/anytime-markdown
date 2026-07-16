import type { EmergencyPanelProps } from '../emergencyPanel';
import { mountEmergencyPanel } from '../emergencyPanel';
import { getTokens } from '../../theme/designTokens';
import { createTrailI18n } from '../../i18n/createTrailI18n';

function baseProps(overrides: Partial<EmergencyPanelProps> = {}): EmergencyPanelProps {
  return {
    isDark: true,
    tokens: getTokens(true),
    t: createTrailI18n('ja'),
    state: { status: 'inactive' },
    onActivate: async () => ({ ok: true }),
    onRelease: async () => ({ ok: true }),
    onRollback: async () => ({ ok: true, recoverBranch: 'recover-abc12345' }),
    fetchSafePoints: async () => [],
    ...overrides,
  };
}

function q(root: HTMLElement, sel: string): HTMLElement | null {
  return root.querySelector(sel);
}

/** マイクロタスクを消化する。 */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('emergencyPanel', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('FAB の 3 状態', () => {
    it('inactive は data-status="inactive"（平常）', () => {
      const handle = mountEmergencyPanel(container, baseProps({ state: { status: 'inactive' } }));
      expect(q(container, '[data-am-emergency-fab]')?.dataset['status']).toBe('inactive');
      handle.destroy();
    });

    it('active は data-status="active" で理由・発動者・時刻を提示する', () => {
      const handle = mountEmergencyPanel(
        container,
        baseProps({
          state: {
            status: 'active',
            reason: 'runaway loop',
            triggeredBy: 'loop-detector',
            triggeredAt: '2026-07-16T10:00:00.000Z',
          },
        }),
      );
      const fab = q(container, '[data-am-emergency-fab]');
      expect(fab?.dataset['status']).toBe('active');
      expect(fab?.getAttribute('title')).toContain('runaway loop');
      expect(fab?.getAttribute('title')).toContain('loop-detector');
      handle.destroy();
    });

    it('unknown は data-status="unknown"（inactive と別表示）', () => {
      const handle = mountEmergencyPanel(container, baseProps({ state: { status: 'unknown' } }));
      const fab = q(container, '[data-am-emergency-fab]');
      expect(fab?.dataset['status']).toBe('unknown');
      // 平常（inactive）と同じ見た目にしない
      const inactiveContainer = document.createElement('div');
      const other = mountEmergencyPanel(inactiveContainer, baseProps({ state: { status: 'inactive' } }));
      expect(fab?.dataset['status']).not.toBe(
        (inactiveContainer.querySelector('[data-am-emergency-fab]') as HTMLElement).dataset['status'],
      );
      other.destroy();
      handle.destroy();
    });

    it('update で状態が差し替わる', () => {
      const handle = mountEmergencyPanel(container, baseProps({ state: { status: 'inactive' } }));
      handle.update(baseProps({ state: { status: 'active', reason: 'r', triggeredBy: 'human', triggeredAt: 't' } }));
      expect(q(container, '[data-am-emergency-fab]')?.dataset['status']).toBe('active');
      handle.destroy();
    });
  });

  describe('発動フロー', () => {
    it('理由が空なら発動できない（確認へ進まない）', async () => {
      const onActivate = jest.fn(async () => ({ ok: true }));
      const handle = mountEmergencyPanel(container, baseProps({ onActivate }));

      (q(container, '[data-am-emergency-fab]') as HTMLElement).click();
      await settle();
      (q(container, '[data-am-emergency-activate]') as HTMLElement).click();
      await settle();

      expect(onActivate).not.toHaveBeenCalled();
      expect(q(container, '[data-am-emergency-confirm]')).toBeNull();
      handle.destroy();
    });

    it('理由入力 → 確認 → 実行で onActivate が理由付きで呼ばれる', async () => {
      const onActivate = jest.fn(async () => ({ ok: true }));
      const handle = mountEmergencyPanel(container, baseProps({ onActivate }));

      (q(container, '[data-am-emergency-fab]') as HTMLElement).click();
      await settle();
      const input = q(container, '[data-am-emergency-reason]') as HTMLInputElement;
      input.value = 'runaway loop';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      (q(container, '[data-am-emergency-activate]') as HTMLElement).click();
      await settle();

      expect(q(container, '[data-am-emergency-confirm]')).not.toBeNull();
      (q(container, '[data-am-emergency-confirm-ok]') as HTMLElement).click();
      await settle();

      expect(onActivate).toHaveBeenCalledWith('runaway loop');
      handle.destroy();
    });

    it('確認をキャンセルすると発動せず「発動していない」旨を明示する（無言キャンセル禁止）', async () => {
      const onActivate = jest.fn(async () => ({ ok: true }));
      const handle = mountEmergencyPanel(container, baseProps({ onActivate }));

      (q(container, '[data-am-emergency-fab]') as HTMLElement).click();
      await settle();
      const input = q(container, '[data-am-emergency-reason]') as HTMLInputElement;
      input.value = 'x';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      (q(container, '[data-am-emergency-activate]') as HTMLElement).click();
      await settle();
      (q(container, '[data-am-emergency-confirm-cancel]') as HTMLElement).click();
      await settle();

      expect(onActivate).not.toHaveBeenCalled();
      const feedback = q(container, '[data-am-emergency-feedback]');
      expect(feedback?.textContent).toBeTruthy();
      expect(feedback?.dataset['kind']).toBe('cancelled');
      handle.destroy();
    });

    it('サーバー側の失敗理由をそのまま表示する', async () => {
      const handle = mountEmergencyPanel(
        container,
        baseProps({ onActivate: async () => ({ ok: false, error: 'Forbidden origin' }) }),
      );

      (q(container, '[data-am-emergency-fab]') as HTMLElement).click();
      await settle();
      const input = q(container, '[data-am-emergency-reason]') as HTMLInputElement;
      input.value = 'x';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      (q(container, '[data-am-emergency-activate]') as HTMLElement).click();
      await settle();
      (q(container, '[data-am-emergency-confirm-ok]') as HTMLElement).click();
      await settle();

      const feedback = q(container, '[data-am-emergency-feedback]');
      expect(feedback?.textContent).toContain('Forbidden origin');
      expect(feedback?.dataset['kind']).toBe('error');
      handle.destroy();
    });
  });

  describe('解除フロー', () => {
    it('発動中のみ解除ボタンを出す', async () => {
      const handle = mountEmergencyPanel(container, baseProps({ state: { status: 'inactive' } }));
      (q(container, '[data-am-emergency-fab]') as HTMLElement).click();
      await settle();
      expect(q(container, '[data-am-emergency-release]')).toBeNull();

      handle.update(baseProps({ state: { status: 'active', reason: 'r', triggeredBy: 'human', triggeredAt: 't' } }));
      await settle();
      expect(q(container, '[data-am-emergency-release]')).not.toBeNull();
      handle.destroy();
    });

    it('解除も確認モーダルを経由する', async () => {
      const onRelease = jest.fn(async () => ({ ok: true }));
      const handle = mountEmergencyPanel(
        container,
        baseProps({ state: { status: 'active', reason: 'r', triggeredBy: 'human', triggeredAt: 't' }, onRelease }),
      );

      (q(container, '[data-am-emergency-fab]') as HTMLElement).click();
      await settle();
      const input = q(container, '[data-am-emergency-reason]') as HTMLInputElement;
      input.value = 'resolved';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      (q(container, '[data-am-emergency-release]') as HTMLElement).click();
      await settle();

      expect(onRelease).not.toHaveBeenCalled();
      (q(container, '[data-am-emergency-confirm-ok]') as HTMLElement).click();
      await settle();

      expect(onRelease).toHaveBeenCalledWith('resolved');
      handle.destroy();
    });
  });

  describe('セーフポイントとロールバック', () => {
    const points = [
      {
        id: 1,
        createdAt: '2026-07-16T10:00:00.000Z',
        commitHash: 'abc12345deadbeef',
        branch: 'develop',
        worktree: '/w',
        label: 'before migration',
        source: 'manual',
        sessionId: null,
      },
    ];

    it('パネルを開くと一覧を取得して表示する', async () => {
      const handle = mountEmergencyPanel(container, baseProps({ fetchSafePoints: async () => points }));
      (q(container, '[data-am-emergency-fab]') as HTMLElement).click();
      await settle();

      const items = container.querySelectorAll('[data-am-safe-point]');
      expect(items).toHaveLength(1);
      expect(items[0]?.textContent).toContain('abc12345');
      expect(items[0]?.textContent).toContain('before migration');
      handle.destroy();
    });

    it('選択 → 確認で recover ブランチ名と非破壊である旨を提示する', async () => {
      const handle = mountEmergencyPanel(container, baseProps({ fetchSafePoints: async () => points }));
      (q(container, '[data-am-emergency-fab]') as HTMLElement).click();
      await settle();
      (q(container, '[data-am-safe-point]') as HTMLElement).click();
      await settle();

      const confirm = q(container, '[data-am-emergency-confirm]');
      expect(confirm?.textContent).toContain('recover-abc12345');
      handle.destroy();
    });

    it('実行すると commitHash 付きで onRollback が呼ばれ結果を表示する', async () => {
      const onRollback = jest.fn(async () => ({ ok: true, recoverBranch: 'recover-abc12345' }));
      const handle = mountEmergencyPanel(
        container,
        baseProps({ fetchSafePoints: async () => points, onRollback }),
      );
      (q(container, '[data-am-emergency-fab]') as HTMLElement).click();
      await settle();
      (q(container, '[data-am-safe-point]') as HTMLElement).click();
      await settle();
      (q(container, '[data-am-emergency-confirm-ok]') as HTMLElement).click();
      await settle();

      expect(onRollback).toHaveBeenCalledWith('abc12345deadbeef');
      const feedback = q(container, '[data-am-emergency-feedback]');
      expect(feedback?.textContent).toContain('recover-abc12345');
      expect(feedback?.dataset['kind']).toBe('success');
      handle.destroy();
    });

    it('一覧が空なら空状態を表示する（無言の空白にしない）', async () => {
      const handle = mountEmergencyPanel(container, baseProps({ fetchSafePoints: async () => [] }));
      (q(container, '[data-am-emergency-fab]') as HTMLElement).click();
      await settle();

      expect(q(container, '[data-am-safe-points-empty]')).not.toBeNull();
      handle.destroy();
    });
  });

  describe('キーボード操作（cross-review 合意指摘）', () => {
    function press(el: Element, key: string): void {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }

    it('パネルを開くと内部の要素へフォーカスが移る', async () => {
      const handle = mountEmergencyPanel(container, baseProps());
      (q(container, '[data-am-emergency-fab]') as HTMLElement).click();
      await settle();

      const panel = q(container, '[data-am-emergency-panel]') as HTMLElement;
      expect(panel.contains(document.activeElement)).toBe(true);
      handle.destroy();
    });

    it('Escape でパネルを閉じられる', async () => {
      const handle = mountEmergencyPanel(container, baseProps());
      (q(container, '[data-am-emergency-fab]') as HTMLElement).click();
      await settle();

      press(q(container, '[data-am-emergency-panel]') as HTMLElement, 'Escape');
      await settle();

      expect(q(container, '[data-am-emergency-panel]')).toBeNull();
      handle.destroy();
    });

    it('確認モーダルの Escape は発動せず、キャンセルを明示する（FR-S5-5）', async () => {
      const onActivate = jest.fn(async () => ({ ok: true }));
      const handle = mountEmergencyPanel(container, baseProps({ onActivate }));

      (q(container, '[data-am-emergency-fab]') as HTMLElement).click();
      await settle();
      const input = q(container, '[data-am-emergency-reason]') as HTMLInputElement;
      input.value = 'x';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      (q(container, '[data-am-emergency-activate]') as HTMLElement).click();
      await settle();

      press(q(container, '[data-am-emergency-confirm-box]') as HTMLElement, 'Escape');
      await settle();

      // Escape を無言キャンセルにしない。S1 §16 の事故はまさにこれで起きた
      expect(onActivate).not.toHaveBeenCalled();
      expect(q(container, '[data-am-emergency-confirm]')).toBeNull();
      const feedback = q(container, '[data-am-emergency-feedback]');
      expect(feedback?.dataset['kind']).toBe('cancelled');
      handle.destroy();
    });
  });

  describe('unknown 状態の案内', () => {
    it('サーバー不明時は VS Code コマンドという代替経路を案内する', async () => {
      const handle = mountEmergencyPanel(container, baseProps({ state: { status: 'unknown' } }));
      (q(container, '[data-am-emergency-fab]') as HTMLElement).click();
      await settle();

      const notice = q(container, '[data-am-emergency-unknown-notice]');
      expect(notice?.textContent).toBeTruthy();
      handle.destroy();
    });
  });

  describe('i18n', () => {
    it('ja / en とも生キーを表示しない', async () => {
      for (const locale of ['ja', 'en'] as const) {
        const c = document.createElement('div');
        document.body.appendChild(c);
        const handle = mountEmergencyPanel(
          c,
          baseProps({ t: createTrailI18n(locale), state: { status: 'active', reason: 'r', triggeredBy: 'human', triggeredAt: 't' } }),
        );
        (c.querySelector('[data-am-emergency-fab]') as HTMLElement).click();
        await settle();

        expect(c.textContent).not.toContain('emergency.');
        handle.destroy();
        c.remove();
      }
    });
  });

  describe('destroy', () => {
    it('DOM を残さない', () => {
      const handle = mountEmergencyPanel(container, baseProps());
      expect(q(container, '[data-am-emergency-fab]')).not.toBeNull();
      handle.destroy();
      expect(q(container, '[data-am-emergency-fab]')).toBeNull();
    });
  });
});
