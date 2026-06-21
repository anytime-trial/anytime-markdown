/**
 * MatrixPanel の vanilla DOM 等価実装。
 * React hooks (useCodeGraph, useHotspot) および useMemo の集計は呼び出し側 (.tsx wrapper) で解決し、
 * 解決済み gridOptions を props 経由で受け取る。
 */
import {
  mountSpreadsheetGrid,
  type SpreadsheetGridHandle,
  type SpreadsheetGridOptions,
} from '@anytime-markdown/spreadsheet-viewer';
import { createButton } from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

export interface MatrixPanelColors {
  readonly bg: string;
  readonly border: string;
  readonly accent: string;
  readonly hover: string;
  readonly focus: string;
  readonly textMuted: string;
  readonly textSecondary: string;
}

export interface MatrixPanelVanillaProps {
  readonly gridOptions: Omit<SpreadsheetGridOptions, 'isDark'> | null;
  readonly isDark: boolean;
  readonly level: 'package' | 'component' | 'code';
  readonly onLevelChange: (level: 'package' | 'component' | 'code') => void;
  readonly colors: MatrixPanelColors;
  /** Reserved for future i18n; currently unused. */
  readonly t: (key: string) => string;
}

const LEVELS = ['package', 'component', 'code'] as const;
const LEVEL_LABELS: Record<string, string> = { package: 'C2', component: 'C3', code: 'C4' };

export function mountMatrixPanel(
  container: HTMLElement,
  initial: MatrixPanelVanillaProps,
): VanillaViewHandle<MatrixPanelVanillaProps> {
  let props = initial;

  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;';
  container.appendChild(root);

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;align-items:center;gap:4px;padding:4px 8px;flex-shrink:0;flex-wrap:wrap;';
  root.appendChild(toolbar);

  // Level button group
  const levelBtnGroup = document.createElement('div');
  levelBtnGroup.style.cssText = 'display:flex;border-radius:4px;overflow:hidden;';
  toolbar.appendChild(levelBtnGroup);

  const levelButtons = LEVELS.map((lv) => {
    const { el } = createButton({
      label: LEVEL_LABELS[lv],
      variant: 'outlined',
      size: 'small',
      onClick: () => props.onLevelChange(lv),
    });
    el.style.borderRadius = '0';
    el.style.border = 'none';
    levelBtnGroup.appendChild(el);
    return { lv, el };
  });

  // Sheet area
  const sheetArea = document.createElement('div');
  sheetArea.style.cssText = 'flex:1;display:flex;min-height:0;';
  root.appendChild(sheetArea);

  let gridHandle: SpreadsheetGridHandle | null = null;
  let emptyEl: HTMLElement | null = null;

  function applyButtonStyles(): void {
    for (const { lv, el } of levelButtons) {
      const active = props.level === lv;
      el.style.backgroundColor = active ? props.colors.focus : 'transparent';
      el.style.color = props.colors.accent;
      el.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    toolbar.style.borderBottom = `1px solid ${props.colors.border}`;
    root.style.backgroundColor = props.colors.bg;
  }

  function renderSheet(): void {
    if (props.gridOptions) {
      if (emptyEl) { emptyEl.remove(); emptyEl = null; }
      if (!gridHandle) {
        gridHandle = mountSpreadsheetGrid(sheetArea, { ...props.gridOptions, isDark: props.isDark });
      } else {
        gridHandle.update({ ...props.gridOptions, isDark: props.isDark });
      }
    } else {
      if (gridHandle) { gridHandle.destroy(); gridHandle = null; }
      if (!emptyEl) {
        emptyEl = document.createElement('div');
        emptyEl.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;width:100%;';
        const msg = document.createElement('span');
        msg.style.cssText = `font-size:0.875rem;color:${props.colors.textSecondary};`;
        msg.textContent = 'Import a C4 model to view metrics';
        emptyEl.appendChild(msg);
        sheetArea.appendChild(emptyEl);
      }
    }
  }

  function render(): void {
    applyButtonStyles();
    renderSheet();
  }

  render();

  return {
    update(next) {
      props = next;
      render();
    },
    destroy() {
      gridHandle?.destroy();
      gridHandle = null;
      root.remove();
    },
  };
}
