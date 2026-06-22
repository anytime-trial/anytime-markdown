/**
 * Tests for vanilla DOM views:
 * - mountDefectRiskControls
 * - mountGroupLabelDialog
 * - mountTourMode
 */
import { mountDefectRiskControls } from '../../views/c4/overlays/defectRiskControls';
import { mountGroupLabelDialog } from '../../views/c4/dialogs/groupLabelDialog';
import { mountTourMode } from '../../views/c4/tourMode';
import type { TourStep } from '../../c4/canvas/tourTargets';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContainer(): HTMLElement {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

function cleanup(container: HTMLElement): void {
  container.remove();
}

// ---------------------------------------------------------------------------
// DefectRiskControls
// ---------------------------------------------------------------------------

describe('mountDefectRiskControls', () => {
  it('mounts and renders a switch element', () => {
    const container = makeContainer();
    const onChange = jest.fn();

    const handle = mountDefectRiskControls(container, {
      value: { enabled: false, windowDays: 30, halfLifeDays: 10 },
      onChange,
      resultCount: 0,
      loading: false,
      labelWindow: '期間',
      labelHalfLife: '半減期',
      labelCalculating: '計算中...',
      labelOff: 'OFF',
    });

    // Root group rendered
    const group = container.querySelector('[role="group"]');
    expect(group).toBeTruthy();

    // Switch input rendered
    const switchInput = container.querySelector('input[type="checkbox"]');
    expect(switchInput).toBeTruthy();

    // Status text shows OFF when disabled
    const statusEl = container.querySelector('[aria-live="polite"]');
    expect(statusEl?.textContent).toBe('OFF');

    handle.destroy();
    cleanup(container);
  });

  it('update reflects new value', () => {
    const container = makeContainer();
    const onChange = jest.fn();

    const handle = mountDefectRiskControls(container, {
      value: { enabled: false, windowDays: 30, halfLifeDays: 10 },
      onChange,
      resultCount: 0,
      loading: false,
      labelWindow: '期間',
      labelHalfLife: '半減期',
      labelCalculating: '計算中...',
      labelOff: 'OFF',
    });

    handle.update({
      value: { enabled: true, windowDays: 90, halfLifeDays: 30 },
      onChange,
      resultCount: 5,
      loading: false,
      labelWindow: '期間',
      labelHalfLife: '半減期',
      labelCalculating: '計算中...',
      labelOff: 'OFF',
    });

    const statusEl = container.querySelector('[aria-live="polite"]');
    expect(statusEl?.textContent).toBe('5 files');

    handle.destroy();
    cleanup(container);
  });

  it('destroy removes root element', () => {
    const container = makeContainer();
    const handle = mountDefectRiskControls(container, {
      value: { enabled: false, windowDays: 30, halfLifeDays: 10 },
      onChange: jest.fn(),
      resultCount: 0,
      loading: false,
      labelWindow: '期間',
      labelHalfLife: '半減期',
      labelCalculating: '計算中...',
      labelOff: 'OFF',
    });

    handle.destroy();
    const group = container.querySelector('[role="group"]');
    expect(group).toBeNull();
    cleanup(container);
  });
});

// ---------------------------------------------------------------------------
// GroupLabelDialog
// ---------------------------------------------------------------------------

describe('mountGroupLabelDialog', () => {
  it('does not show dialog when open=false', () => {
    const container = makeContainer();
    const handle = mountGroupLabelDialog(container, {
      open: false,
      initialLabel: 'test',
      onClose: jest.fn(),
      onSave: jest.fn(),
    });

    // No dialog in body
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeNull();

    handle.destroy();
    cleanup(container);
  });

  it('shows dialog when open=true', () => {
    const container = makeContainer();
    const onClose = jest.fn();
    const onSave = jest.fn();

    const handle = mountGroupLabelDialog(container, {
      open: true,
      initialLabel: 'My Label',
      onClose,
      onSave,
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();

    // Text field with initial value
    const input = dialog?.querySelector('input');
    expect((input as HTMLInputElement)?.value).toBe('My Label');

    handle.destroy();
    cleanup(container);
  });

  it('fires onSave when save button clicked', () => {
    const container = makeContainer();
    const onClose = jest.fn();
    const onSave = jest.fn();

    const handle = mountGroupLabelDialog(container, {
      open: true,
      initialLabel: 'My Label',
      onClose,
      onSave,
    });

    // Click 保存 button
    const buttons = Array.from(document.querySelectorAll('button'));
    const saveBtn = buttons.find((b) => b.textContent?.includes('保存'));
    expect(saveBtn).toBeTruthy();
    saveBtn!.click();

    expect(onSave).toHaveBeenCalledWith('My Label');
    expect(onClose).toHaveBeenCalled();

    handle.destroy();
    cleanup(container);
  });

  it('update opens dialog', () => {
    const container = makeContainer();
    const onClose = jest.fn();
    const onSave = jest.fn();

    const handle = mountGroupLabelDialog(container, {
      open: false,
      onClose,
      onSave,
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();

    handle.update({ open: true, onClose, onSave, initialLabel: 'updated' });
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();

    handle.destroy();
    cleanup(container);
  });

  it('destroy cleans up properly', () => {
    const container = makeContainer();
    const handle = mountGroupLabelDialog(container, {
      open: true,
      onClose: jest.fn(),
      onSave: jest.fn(),
    });

    handle.destroy();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    cleanup(container);
  });
});

// ---------------------------------------------------------------------------
// TourMode
// ---------------------------------------------------------------------------

function makeTourStep(index: number): TourStep {
  return {
    entry: {
      filePath: `/src/file${index}.ts`,
      functionName: `fn${index}`,
      startLine: index * 10,
      fanIn: 3,
      fanOut: 2,
      cognitiveComplexity: 5,
      lineCount: 20,
      functionRole: 'leaf',
      importanceScore: 0.5,
    } as TourStep['entry'],
    index,
    total: 3,
    description: `Description for step ${index}`,
  };
}

describe('mountTourMode', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('mounts and renders first step', () => {
    const container = makeContainer();
    const onStepChange = jest.fn();
    const steps = [makeTourStep(1), makeTourStep(2), makeTourStep(3)];

    const handle = mountTourMode(container, {
      steps,
      onStepChange,
      onClose: jest.fn(),
      isDark: false,
      autoAdvanceMs: 1000,
    });

    // Should have called onStepChange for initial step
    expect(onStepChange).toHaveBeenCalledWith(
      expect.objectContaining({ file: '/src/file1.ts' }),
    );

    // Step counter rendered
    expect(container.textContent).toContain('Tour 1 / 3');
    expect(container.textContent).toContain('fn1');

    handle.destroy();
    cleanup(container);
  });

  it('advances step automatically', () => {
    const container = makeContainer();
    const onStepChange = jest.fn();
    const steps = [makeTourStep(1), makeTourStep(2), makeTourStep(3)];

    const handle = mountTourMode(container, {
      steps,
      onStepChange,
      onClose: jest.fn(),
      isDark: false,
      autoAdvanceMs: 1000,
    });

    jest.advanceTimersByTime(1000);

    expect(onStepChange).toHaveBeenCalledWith(
      expect.objectContaining({ file: '/src/file2.ts' }),
    );

    handle.destroy();
    cleanup(container);
  });

  it('fires onStepChange(null) on destroy', () => {
    const container = makeContainer();
    const onStepChange = jest.fn();

    const handle = mountTourMode(container, {
      steps: [makeTourStep(1)],
      onStepChange,
      onClose: jest.fn(),
      isDark: false,
    });

    onStepChange.mockClear();
    handle.destroy();
    expect(onStepChange).toHaveBeenCalledWith(null);
    cleanup(container);
  });

  it('renders nothing when steps is empty', () => {
    const container = makeContainer();
    const handle = mountTourMode(container, {
      steps: [],
      onStepChange: jest.fn(),
      onClose: jest.fn(),
      isDark: false,
    });

    // Root is hidden
    const root = container.firstChild as HTMLElement;
    expect(root.style.display).toBe('none');

    handle.destroy();
    cleanup(container);
  });

  it('navigate prev/next via buttons', () => {
    const container = makeContainer();
    const onStepChange = jest.fn();
    const steps = [makeTourStep(1), makeTourStep(2), makeTourStep(3)];

    const handle = mountTourMode(container, {
      steps,
      onStepChange,
      onClose: jest.fn(),
      isDark: false,
      autoAdvanceMs: 60000,
    });

    // Find next button
    const nextBtn = container.querySelector('[aria-label="next"]') as HTMLButtonElement;
    expect(nextBtn).toBeTruthy();
    onStepChange.mockClear();

    nextBtn.click();
    expect(onStepChange).toHaveBeenCalledWith(
      expect.objectContaining({ file: '/src/file2.ts' }),
    );

    handle.destroy();
    cleanup(container);
  });
});
