/**
 * TourMode — vanilla DOM view.
 * Thin port of c4/canvas/TourMode.tsx.
 */
import type { FunctionRole } from '@anytime-markdown/trail-core/c4';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import type { TourStep } from '../../c4/canvas/tourTargets';

export type { TourStep };

export interface TourModeVanillaProps {
  readonly steps: readonly TourStep[];
  readonly onStepChange: (
    target: { file: string; label: string; startLine: number } | null,
  ) => void;
  readonly onClose: () => void;
  readonly isDark: boolean;
  readonly autoAdvanceMs?: number;
}

const ROLE_COLORS: Record<FunctionRole, string> = {
  hub: '#c62828',
  orchestrator: '#f9a825',
  leaf: '#2e7d32',
  peripheral: '#9e9e9e',
};

const DEFAULT_AUTO_ADVANCE_MS = 6000;

function makeBtnSvgPath(path: string, size: number): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.style.cssText = `width:${size}px;height:${size}px;fill:currentColor;display:block;`;
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path);
  svg.appendChild(p);
  return svg;
}

const SKIP_PREV_PATH = 'M6 6h2v12H6zm3.5 6 8.5 6V6z';
const SKIP_NEXT_PATH = 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z';
const PLAY_PATH = 'M8 5v14l11-7z';
const PAUSE_PATH = 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';
const CLOSE_PATH =
  'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';

function makeIconBtn(
  pathD: string,
  size: number,
  ariaLabel: string,
  colorFn: () => string,
  onClick: () => void,
): { el: HTMLButtonElement; updateColor: () => void } {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', ariaLabel);
  btn.style.cssText =
    'background:none;border:none;cursor:pointer;padding:4px;' +
    `color:${colorFn()};display:flex;align-items:center;justify-content:center;`;
  btn.appendChild(makeBtnSvgPath(pathD, size));
  btn.addEventListener('click', onClick);
  return {
    el: btn,
    updateColor: () => { btn.style.color = colorFn(); },
  };
}

export function mountTourMode(
  container: HTMLElement,
  initial: TourModeVanillaProps,
): VanillaViewHandle<TourModeVanillaProps> {
  let props = initial;
  let stepIdx = 0;
  let autoPlay = true;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  // ---- DOM structure ----
  const root = document.createElement('div');

  // Header row
  const headerRow = document.createElement('div');
  headerRow.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;';

  const stepCounter = document.createElement('span');
  stepCounter.style.cssText = 'font-size:0.75rem;font-weight:600;';

  const btnColor = (): string => (props.isDark ? '#ddd' : '#333');

  const closeBtn = makeIconBtn(CLOSE_PATH, 16, 'close tour', btnColor, () => props.onClose());
  headerRow.appendChild(stepCounter);
  headerRow.appendChild(closeBtn.el);
  root.appendChild(headerRow);

  // Role chip
  const roleChip = document.createElement('span');
  roleChip.style.cssText =
    'display:inline-block;font-weight:700;font-size:11px;padding:1px 6px;border-radius:3px;margin-bottom:4px;';
  root.appendChild(roleChip);

  // Function name
  const fnName = document.createElement('div');
  fnName.style.cssText = 'font-weight:700;font-size:14px;margin:2px 0;word-break:break-all;';
  root.appendChild(fnName);

  // File path
  const filePath = document.createElement('div');
  filePath.style.cssText = 'font-size:10px;word-break:break-all;margin-bottom:6px;';
  root.appendChild(filePath);

  // Description
  const desc = document.createElement('div');
  desc.style.cssText = 'font-size:12px;line-height:1.45;margin-bottom:8px;';
  root.appendChild(desc);

  // Metrics row
  const metricsRow = document.createElement('div');
  metricsRow.style.cssText = 'display:flex;gap:12px;font-size:10px;margin-bottom:8px;';
  root.appendChild(metricsRow);

  // Controls row
  const controlsRow = document.createElement('div');
  controlsRow.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;';

  const btnGroup = document.createElement('div');
  btnGroup.style.cssText = 'display:flex;gap:2px;';

  const prevBtn = makeIconBtn(SKIP_PREV_PATH, 18, 'previous', btnColor, () => {
    setStep(stepIdx === 0 ? props.steps.length - 1 : stepIdx - 1);
  });
  const playPauseBtn = makeIconBtn(PAUSE_PATH, 18, 'pause', btnColor, () => {
    autoPlay = !autoPlay;
    refreshPlayPauseIcon();
    scheduleAutoAdvance();
    renderAutoLabel();
  });
  const nextBtn = makeIconBtn(SKIP_NEXT_PATH, 18, 'next', btnColor, () => {
    setStep((stepIdx + 1) % props.steps.length);
  });

  btnGroup.appendChild(prevBtn.el);
  btnGroup.appendChild(playPauseBtn.el);
  btnGroup.appendChild(nextBtn.el);

  const autoLabel = document.createElement('span');
  autoLabel.style.cssText = 'font-size:10px;';

  controlsRow.appendChild(btnGroup);
  controlsRow.appendChild(autoLabel);
  root.appendChild(controlsRow);

  container.appendChild(root);

  // ---- State helpers ----

  function setStep(idx: number): void {
    stepIdx = idx;
    renderStep();
    notifyStepChange();
    scheduleAutoAdvance();
  }

  function notifyStepChange(): void {
    const step = props.steps[stepIdx];
    if (!step) {
      props.onStepChange(null);
      return;
    }
    props.onStepChange({
      file: step.entry.filePath,
      label: step.entry.functionName,
      startLine: step.entry.startLine,
    });
  }

  function scheduleAutoAdvance(): void {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (!autoPlay || props.steps.length <= 1) return;
    const ms = props.autoAdvanceMs ?? DEFAULT_AUTO_ADVANCE_MS;
    timerId = setTimeout(() => {
      setStep((stepIdx + 1) % props.steps.length);
    }, ms);
  }

  function refreshPlayPauseIcon(): void {
    playPauseBtn.el.replaceChildren(makeBtnSvgPath(autoPlay ? PAUSE_PATH : PLAY_PATH, 18));
    playPauseBtn.el.setAttribute('aria-label', autoPlay ? 'pause' : 'play');
  }

  function renderAutoLabel(): void {
    const ms = props.autoAdvanceMs ?? DEFAULT_AUTO_ADVANCE_MS;
    autoLabel.textContent = autoPlay ? `auto · ${Math.round(ms / 1000)}s` : 'manual';
  }

  function applyTheme(): void {
    const { isDark } = props;
    root.style.cssText =
      'position:absolute;bottom:16px;right:16px;width:340px;max-width:calc(100% - 32px);' +
      `background:${isDark ? 'rgba(20,24,32,0.96)' : 'rgba(252,253,255,0.98)'};` +
      `color:${isDark ? '#fff' : '#222'};` +
      `border:1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'};` +
      'border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.18);padding:12px;z-index:20;';

    stepCounter.style.color = isDark ? '#aaa' : '#666';
    filePath.style.color = isDark ? '#888' : '#666';
    desc.style.color = isDark ? '#ddd' : '#333';
    metricsRow.style.color = isDark ? '#aaa' : '#555';
    autoLabel.style.color = isDark ? '#888' : '#666';

    [closeBtn, prevBtn, playPauseBtn, nextBtn].forEach((b) => {
      b.el.style.color = btnColor();
    });
  }

  function renderStep(): void {
    if (props.steps.length === 0) {
      root.style.display = 'none';
      return;
    }
    root.style.display = '';

    const step = props.steps[stepIdx];
    if (!step) return;

    stepCounter.textContent = `Tour ${step.index} / ${step.total}`;

    const role = step.entry.functionRole;
    roleChip.textContent = role;
    roleChip.style.color = ROLE_COLORS[role];
    roleChip.style.background = props.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

    fnName.textContent = step.entry.functionName;
    filePath.textContent = `${step.entry.filePath}:${step.entry.startLine}`;
    desc.textContent = step.description;

    metricsRow.replaceChildren();
    const metrics: Array<{ label: string; value: number }> = [
      { label: 'fanIn', value: step.entry.fanIn },
      { label: 'fanOut', value: step.entry.fanOut },
      { label: 'CC', value: step.entry.cognitiveComplexity },
      { label: 'lines', value: step.entry.lineCount },
    ];
    for (const m of metrics) {
      const span = document.createElement('span');
      const bold = document.createElement('b');
      bold.textContent = String(m.value);
      span.append(`${m.label} `, bold);
      metricsRow.appendChild(span);
    }
  }

  // Initial render
  applyTheme();
  renderStep();
  renderAutoLabel();
  notifyStepChange();
  scheduleAutoAdvance();

  return {
    update(next) {
      const prevIsDark = props.isDark;
      const prevSteps = props.steps;
      props = next;

      if (prevIsDark !== next.isDark) applyTheme();

      // If steps changed entirely, reset to 0
      if (prevSteps !== next.steps) {
        stepIdx = 0;
        notifyStepChange();
        scheduleAutoAdvance();
      }

      renderStep();
      renderAutoLabel();
    },
    destroy() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      props.onStepChange(null);
      root.remove();
    },
  };
}
