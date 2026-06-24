import { computeDefectRiskWindowLabel, DEFAULT_DEFECT_RISK_VALUE, type DefectRiskControlsValue } from '../components/overlays/DefectRiskControls';
import { mountDefectRiskControls } from '../../views/c4/overlays/defectRiskControls';

describe('computeDefectRiskWindowLabel', () => {
  it('returns "30d" for 30', () => {
    expect(computeDefectRiskWindowLabel(30)).toBe('30d');
  });
  it('returns "All" for 365', () => {
    expect(computeDefectRiskWindowLabel(365)).toBe('All');
  });
});

describe('DEFAULT_DEFECT_RISK_VALUE', () => {
  it('has enabled=false by default', () => {
    expect(DEFAULT_DEFECT_RISK_VALUE.enabled).toBe(false);
  });
});

const baseValue: DefectRiskControlsValue = { enabled: true, windowDays: 90, halfLifeDays: 30 };

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    value: baseValue,
    onChange: jest.fn(),
    resultCount: 0,
    loading: false,
    labelWindow: 'Window',
    labelHalfLife: 'Half-life',
    labelCalculating: 'Calculating',
    labelOff: 'OFF',
    ...overrides,
  };
}

describe('DefectRiskControls / placement', () => {
  it('renders as a horizontal toolbar bar by default (floating)', () => {
    const container = document.createElement('div');
    const handle = mountDefectRiskControls(container, baseProps());
    const root = container.querySelector('[role="group"]') as HTMLElement;
    expect(root.style.flexDirection).toBe('');
    expect(root.style.borderTop).not.toBe('');
    handle.destroy();
  });

  it('renders as a vertical card for the left panel column when variant=inline', () => {
    const container = document.createElement('div');
    const handle = mountDefectRiskControls(container, baseProps({ variant: 'inline', isDark: false }));
    const root = container.querySelector('[role="group"]') as HTMLElement;
    expect(root.style.flexDirection).toBe('column');
    expect(root.style.width).toBe('220px');
    expect(root.style.borderTop).toBe('');
    expect(root.style.borderRadius).toBe('8px');
    handle.destroy();
  });

  it('re-applies card background on isDark change without losing inline layout', () => {
    const container = document.createElement('div');
    const handle = mountDefectRiskControls(container, baseProps({ variant: 'inline', isDark: false }));
    const root = container.querySelector('[role="group"]') as HTMLElement;
    handle.update(baseProps({ variant: 'inline', isDark: true }) as Parameters<typeof handle.update>[0]);
    expect(root.style.flexDirection).toBe('column');
    expect(root.style.background).toContain('18, 18, 18');
    handle.destroy();
  });
});
