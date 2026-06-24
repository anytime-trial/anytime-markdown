import { mountHotspotControls } from '../../views/c4/overlays/hotspotControls';
import type { HotspotControlsValue } from '../components/overlays/HotspotControls';

const baseValue: HotspotControlsValue = {
  period: '30d',
  granularity: 'commit',
};

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    value: baseValue,
    onChange: jest.fn(),
    loading: false,
    isDark: false,
    enabled: true,
    labelPeriod: 'Period',
    labelGranularity: 'Granularity',
    labelGranularityCommit: 'Commit',
    labelGranularitySession: 'Session',
    ...overrides,
  };
}

describe('HotspotControls / overlay panel positioning', () => {
  it('floats with absolute positioning by default', () => {
    const container = document.createElement('div');
    const handle = mountHotspotControls(container, baseProps());
    const root = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(root.style.position).toBe('absolute');
    handle.destroy();
  });

  it('flows inline (no absolute overlap) when variant=inline so it does not cover the C4 controls panel', () => {
    const container = document.createElement('div');
    const handle = mountHotspotControls(container, baseProps({ variant: 'inline' }));
    const root = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(root.style.position).toBe('static');
    expect(root.style.top).toBe('');
    expect(root.style.left).toBe('');
    handle.destroy();
  });

  it('keeps display visible (not none) after re-style when enabled', () => {
    const container = document.createElement('div');
    const handle = mountHotspotControls(container, baseProps({ variant: 'inline' }));
    const root = container.querySelector('[role="dialog"]') as HTMLElement;
    // isDark change triggers applyRootStyle (cssText reset) → display must be restored.
    handle.update(baseProps({ variant: 'inline', isDark: true }) as Parameters<typeof handle.update>[0]);
    expect(root.style.position).toBe('static');
    expect(root.style.display).not.toBe('none');
    handle.destroy();
  });

  it('restores display:none when a style change and enabled=false arrive together', () => {
    const container = document.createElement('div');
    const handle = mountHotspotControls(container, baseProps({ variant: 'inline' }));
    const root = container.querySelector('[role="dialog"]') as HTMLElement;
    // isDark change rebuilds cssText (clears display); enabled=false must re-apply none.
    handle.update(
      baseProps({ variant: 'inline', isDark: true, enabled: false }) as Parameters<typeof handle.update>[0],
    );
    expect(root.style.display).toBe('none');
    handle.destroy();
  });
});
