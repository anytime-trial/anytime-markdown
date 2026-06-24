import {
  applyGhostEdgeMode,
  computeGranularityChangeValue,
  GRANULARITY_DEFAULT_CONFIDENCE,
  GRANULARITY_DEFAULT_DIRECTIONAL_DIFF,
  GRANULARITY_DEFAULT_THRESHOLD,
  getGhostEdgeMode,
  getPopupGhostEdgeModes,
  getTemporalCouplingGranularities,
  shouldShowTemporalCouplingInlineSettings,
  type TemporalCouplingControlsValue,
} from '../components/overlays/TemporalCouplingControls';
import { mountTemporalCouplingControls } from '../../views/c4/overlays/temporalCouplingControls';

const baseValue: TemporalCouplingControlsValue = {
  enabled: true,
  windowDays: 30,
  threshold: 0.7, // ユーザーが手で動かした非デフォルト値
  topK: 50,
  directional: true,
  confidenceThreshold: 0.7, // 同上
  directionalDiff: 0.4, // 同上
  granularity: 'commit',
};

describe('TemporalCouplingControls / computeGranularityChangeValue', () => {
  it('returns a copy unchanged when granularity is the same', () => {
    const next = computeGranularityChangeValue(baseValue, 'commit');
    expect(next).toEqual(baseValue);
    expect(next).not.toBe(baseValue); // 別オブジェクト
  });

  it('resets confidence/diff to session defaults when switching commit → session (directional=true)', () => {
    const next = computeGranularityChangeValue(baseValue, 'session');
    expect(next.granularity).toBe('session');
    expect(next.threshold).toBe(GRANULARITY_DEFAULT_THRESHOLD.session);
    expect(next.confidenceThreshold).toBe(GRANULARITY_DEFAULT_CONFIDENCE.session);
    expect(next.directionalDiff).toBe(GRANULARITY_DEFAULT_DIRECTIONAL_DIFF.session);
    // 直接関係しないフィールドは保持
    expect(next.windowDays).toBe(baseValue.windowDays);
    expect(next.topK).toBe(baseValue.topK);
    expect(next.enabled).toBe(baseValue.enabled);
    expect(next.directional).toBe(true);
  });

  it('resets confidence/diff to subagentType defaults when switching session → subagentType (directional=true)', () => {
    const sessionValue: TemporalCouplingControlsValue = {
      ...baseValue,
      granularity: 'session',
      threshold: GRANULARITY_DEFAULT_THRESHOLD.session,
      confidenceThreshold: 0.45,
      directionalDiff: 0.3,
    };
    const next = computeGranularityChangeValue(sessionValue, 'subagentType');
    expect(next.granularity).toBe('subagentType');
    expect(next.threshold).toBe(GRANULARITY_DEFAULT_THRESHOLD.subagentType);
    expect(next.confidenceThreshold).toBe(GRANULARITY_DEFAULT_CONFIDENCE.subagentType);
    expect(next.directionalDiff).toBe(GRANULARITY_DEFAULT_DIRECTIONAL_DIFF.subagentType);
  });

  it('does NOT reset confidence/diff when directional=false (Jaccard threshold only)', () => {
    const jaccardValue: TemporalCouplingControlsValue = {
      ...baseValue,
      directional: false,
      confidenceThreshold: 0.7, // ユーザー設定値
      directionalDiff: 0.4, // ユーザー設定値
    };
    const next = computeGranularityChangeValue(jaccardValue, 'session');
    expect(next.granularity).toBe('session');
    // Jaccard 閾値は粒度別デフォルトに更新（既存挙動）
    expect(next.threshold).toBe(GRANULARITY_DEFAULT_THRESHOLD.session);
    // confidence/diff はユーザー設定を保持
    expect(next.confidenceThreshold).toBe(jaccardValue.confidenceThreshold);
    expect(next.directionalDiff).toBe(jaccardValue.directionalDiff);
  });
});

describe('TemporalCouplingControls / GRANULARITY_DEFAULT_CONFIDENCE', () => {
  it('exposes commit/session/subagentType defaults in decreasing order', () => {
    expect(GRANULARITY_DEFAULT_CONFIDENCE.commit).toBeGreaterThan(
      GRANULARITY_DEFAULT_CONFIDENCE.session,
    );
    expect(GRANULARITY_DEFAULT_CONFIDENCE.session).toBeGreaterThan(
      GRANULARITY_DEFAULT_CONFIDENCE.subagentType,
    );
  });
});

describe('TemporalCouplingControls / getTemporalCouplingGranularities', () => {
  it('hides subagentType when disabled', () => {
    expect(getTemporalCouplingGranularities(false)).toEqual(['commit', 'session']);
  });

  it('keeps subagentType when enabled', () => {
    expect(getTemporalCouplingGranularities(true)).toEqual([
      'commit',
      'session',
      'subagentType',
    ]);
  });
});

describe('TemporalCouplingControls / ghost edge mode helpers', () => {
  it('maps disabled state to none', () => {
    expect(getGhostEdgeMode({ ...baseValue, enabled: false })).toBe('none');
  });

  it('maps enabled state to commit or session', () => {
    expect(getGhostEdgeMode({ ...baseValue, enabled: true, granularity: 'commit' })).toBe(
      'commit',
    );
    expect(getGhostEdgeMode({ ...baseValue, enabled: true, granularity: 'session' })).toBe(
      'session',
    );
  });

  it('applies none/commit/session mode changes', () => {
    const disabled = applyGhostEdgeMode(baseValue, 'none');
    expect(disabled.enabled).toBe(false);
    expect(disabled.directional).toBe(false);

    const commit = applyGhostEdgeMode({ ...baseValue, enabled: false }, 'commit');
    expect(commit.enabled).toBe(true);
    expect(commit.granularity).toBe('commit');
    expect(commit.directional).toBe(false);

    const session = applyGhostEdgeMode({ ...baseValue, enabled: false }, 'session');
    expect(session.enabled).toBe(true);
    expect(session.granularity).toBe('session');
    expect(session.directional).toBe(false);
  });
});

describe('TemporalCouplingControls / placement & ghost edge helpers', () => {
  it('hides inline period/threshold/top-k settings when using the combined selector', () => {
    expect(shouldShowTemporalCouplingInlineSettings(true)).toBe(false);
    expect(shouldShowTemporalCouplingInlineSettings(false)).toBe(true);
  });

  it('exposes commit/session as the ghost edge modes', () => {
    expect(getPopupGhostEdgeModes()).toEqual(['commit', 'session']);
  });

  it('renders the controls as a horizontal toolbar bar by default (floating)', () => {
    const container = document.createElement('div');
    const handle = mountTemporalCouplingControls(container, {
      value: baseValue,
      onChange: jest.fn(),
      resultCount: 0,
      loading: false,
    });
    const root = container.querySelector('[role="group"]') as HTMLElement;
    expect(root.style.flexDirection).toBe('');
    expect(root.style.borderTop).not.toBe('');
    handle.destroy();
  });

  it('renders as a vertical card in the left panel column when variant=inline', () => {
    const container = document.createElement('div');
    const handle = mountTemporalCouplingControls(container, {
      value: baseValue,
      onChange: jest.fn(),
      resultCount: 0,
      loading: false,
      isDark: false,
      variant: 'inline',
    });
    const root = container.querySelector('[role="group"]') as HTMLElement;
    expect(root.style.flexDirection).toBe('column');
    expect(root.style.width).toBe('220px');
    // 横バーの border-top 区切りではなくカード枠になる
    expect(root.style.borderTop).toBe('');
    expect(root.style.borderRadius).toBe('8px');
    handle.destroy();
  });

  it('re-applies card background on isDark change without losing inline layout', () => {
    const container = document.createElement('div');
    const handle = mountTemporalCouplingControls(container, {
      value: baseValue,
      onChange: jest.fn(),
      resultCount: 0,
      loading: false,
      isDark: false,
      variant: 'inline',
    });
    const root = container.querySelector('[role="group"]') as HTMLElement;
    handle.update({
      value: baseValue,
      onChange: jest.fn(),
      resultCount: 0,
      loading: false,
      isDark: true,
      variant: 'inline',
    });
    expect(root.style.flexDirection).toBe('column');
    expect(root.style.background).toContain('18, 18, 18');
    handle.destroy();
  });
});
