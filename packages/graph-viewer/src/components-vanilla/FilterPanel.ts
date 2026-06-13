/**
 * FilterPanel の vanilla DOM factory。
 *
 * React 版 `components/FilterPanel.tsx` の DOM 置換。
 * メタデータ数値範囲 / テキストフィルタ設定パネル。
 * フィルタ入力値は closure 変数で管理し、onConfigChange で外部へ通知する。
 */

import type { NodeFilterConfig, RangeFilter, TextFilter } from '../types/nodeFilter';
import { createButton } from '../ui-vanilla/Button';
import { createChip } from '../ui-vanilla/Chip';
import { createIconButton } from '../ui-vanilla/IconButton';
import { createAddIcon, createCloseIcon, createDeleteIcon } from '../ui-vanilla/icons';
import { createRangeSlider } from '../ui-vanilla/Slider';
import { createTextField } from '../ui-vanilla/TextField';
import { injectGraphUiStyles } from '../ui/injectStyles';

export interface FilterPanelOptions {
  /** 初期フィルタ設定。 */
  readonly config: NodeFilterConfig;
  /** フィルタ変更コールバック。 */
  readonly onConfigChange: (config: NodeFilterConfig) => void;
  /** metadata から検出されたキーの一覧。 */
  readonly availableKeys: readonly string[];
  /** 各数値キーの [min, max] 範囲。 */
  readonly keyRanges: ReadonlyMap<string, readonly [number, number]>;
  /** 閉じるコールバック。 */
  readonly onClose: () => void;
}

export interface FilterPanelHandle {
  /** パネルのルート要素。 */
  readonly el: HTMLDivElement;
  /**
   * 外部から config・availableKeys・keyRanges を更新してパネルを再描画する。
   */
  update(opts: Pick<FilterPanelOptions, 'config' | 'availableKeys' | 'keyRanges'>): void;
  /** イベントリスナーを解放する。 */
  destroy(): void;
}

/**
 * メタデータ数値範囲 / テキストフィルタ設定パネルを生成する。
 *
 * @returns {@link FilterPanelHandle}
 */
export function createFilterPanel(opts: Readonly<FilterPanelOptions>): FilterPanelHandle {
  injectGraphUiStyles();

  // ---- closure 状態 ----
  let currentConfig: NodeFilterConfig = opts.config;
  let currentAvailableKeys: readonly string[] = opts.availableKeys;
  let currentKeyRanges: ReadonlyMap<string, readonly [number, number]> = opts.keyRanges;

  // ---- 新規キー入力の closure 変数 ----
  let newRangeKey = '';
  let newTextKey = '';

  // ---- ルート ----
  const el = document.createElement('div');
  el.className = 'gv-scroll';
  el.style.cssText = [
    'position:absolute',
    'left:0',
    'top:0',
    'bottom:0',
    'width:280px',
    'background-color:var(--gv-color-bg-paper)',
    'border-right:1px solid var(--gv-color-divider)',
    'overflow-y:auto',
    'z-index:10',
    'display:flex',
    'flex-direction:column',
  ].join(';');

  // ---- セクション: ヘッダー ----
  function buildHeader(): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;padding:12px;gap:8px';

    const label = document.createElement('span');
    label.style.cssText = 'flex:1;font-weight:600;font-size:0.875rem';
    label.textContent = 'Filter';
    row.appendChild(label);

    const closeBtn = createIconButton({
      size: 'small',
      ariaLabel: 'Close filter panel',
      onClick: opts.onClose,
      children: createCloseIcon({ fontSize: 'small' }),
    });
    row.appendChild(closeBtn);

    return row;
  }

  // ---- セクション: 仕切り ----
  function buildDivider(): HTMLHRElement {
    const hr = document.createElement('hr');
    hr.style.cssText = 'margin:0;border:none;border-top:1px solid var(--gv-color-divider)';
    return hr;
  }

  // ---- セクション: 数値範囲フィルタ ----
  function buildRangeFilters(): HTMLDivElement {
    const section = document.createElement('div');
    section.style.padding = '12px';

    const caption = document.createElement('span');
    caption.style.cssText = 'display:block;font-size:0.75rem;color:var(--gv-color-text-secondary);margin-bottom:4px';
    caption.textContent = 'Range Filters';
    section.appendChild(caption);

    // 既存フィルタ行
    currentConfig.rangeFilters.forEach((rf, i) => {
      const range = currentKeyRanges.get(rf.key);
      const min = range?.[0] ?? 0;
      const max = range?.[1] ?? 100;

      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:12px';

      // ラベル行
      const labelRow = document.createElement('div');
      labelRow.style.cssText = 'display:flex;align-items:center;gap:4px';

      const chip = createChip({ label: rf.key, size: 'small' });
      labelRow.appendChild(chip);

      const deleteBtn = createIconButton({
        size: 'small',
        onClick: () => {
          currentConfig = {
            ...currentConfig,
            rangeFilters: currentConfig.rangeFilters.filter((_, idx) => idx !== i),
          };
          opts.onConfigChange(currentConfig);
          rebuild();
        },
        children: createDeleteIcon({ fontSize: 'small' }),
      });
      labelRow.appendChild(deleteBtn);
      row.appendChild(labelRow);

      // RangeSlider
      const slider = createRangeSlider({
        value: [rf.min ?? min, rf.max ?? max],
        min,
        max,
        onChange: (value) => {
          const [lo, hi] = value;
          const updated = currentConfig.rangeFilters.map((r, idx) =>
            idx === i ? { ...r, min: lo, max: hi } : r,
          );
          currentConfig = { ...currentConfig, rangeFilters: updated };
          opts.onConfigChange(currentConfig);
        },
        style: { marginTop: '4px' },
      });
      row.appendChild(slider.el);

      section.appendChild(row);
    });

    // 新規キー追加行
    const numericKeys = currentAvailableKeys.filter((k) => currentKeyRanges.has(k));
    if (numericKeys.length > 0) {
      const addRow = document.createElement('div');
      addRow.style.cssText = 'display:flex;gap:4px';

      const selectEl = createTextField({
        select: true,
        size: 'small',
        value: newRangeKey,
        fullWidth: true,
        children: (() => {
          const frag = document.createDocumentFragment();
          const defaultOpt = document.createElement('option');
          defaultOpt.value = '';
          defaultOpt.textContent = 'Select key';
          frag.appendChild(defaultOpt);
          numericKeys
            .filter((k) => !currentConfig.rangeFilters.some((rf) => rf.key === k))
            .forEach((k) => {
              const opt = document.createElement('option');
              opt.value = k;
              opt.textContent = k;
              frag.appendChild(opt);
            });
          return frag;
        })(),
        onChange: (e) => {
          newRangeKey = (e.target as HTMLSelectElement).value;
        },
      });
      addRow.appendChild(selectEl.el);

      const addBtn = createIconButton({
        size: 'small',
        disabled: !newRangeKey,
        onClick: () => {
          if (!newRangeKey) return;
          const range = currentKeyRanges.get(newRangeKey);
          const filter: RangeFilter = {
            key: newRangeKey,
            min: range?.[0],
            max: range?.[1],
          };
          currentConfig = {
            ...currentConfig,
            rangeFilters: [...currentConfig.rangeFilters, filter],
          };
          newRangeKey = '';
          opts.onConfigChange(currentConfig);
          rebuild();
        },
        children: createAddIcon({ fontSize: 'small' }),
      });
      addRow.appendChild(addBtn);
      section.appendChild(addRow);
    }

    return section;
  }

  // ---- セクション: テキストフィルタ ----
  function buildTextFilters(): HTMLDivElement {
    const section = document.createElement('div');
    section.style.padding = '12px';

    const caption = document.createElement('span');
    caption.style.cssText = 'display:block;font-size:0.75rem;color:var(--gv-color-text-secondary);margin-bottom:4px';
    caption.textContent = 'Text Filters';
    section.appendChild(caption);

    // 既存フィルタ行
    currentConfig.textFilters.forEach((tf, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:8px';

      const chip = createChip({ label: tf.key, size: 'small' });
      row.appendChild(chip);

      const input = createTextField({
        size: 'small',
        value: tf.value,
        placeholder: 'Search...',
        fullWidth: true,
        onChange: (e) => {
          const value = (e.target as HTMLInputElement).value;
          const updated = currentConfig.textFilters.map((t, idx) =>
            idx === i ? { ...t, value } : t,
          );
          currentConfig = { ...currentConfig, textFilters: updated };
          opts.onConfigChange(currentConfig);
        },
      });
      row.appendChild(input.el);

      const deleteBtn = createIconButton({
        size: 'small',
        onClick: () => {
          currentConfig = {
            ...currentConfig,
            textFilters: currentConfig.textFilters.filter((_, idx) => idx !== i),
          };
          opts.onConfigChange(currentConfig);
          rebuild();
        },
        children: createDeleteIcon({ fontSize: 'small' }),
      });
      row.appendChild(deleteBtn);

      section.appendChild(row);
    });

    // 新規キー追加行
    const textKeys = currentAvailableKeys.filter((k) => !currentKeyRanges.has(k));
    if (textKeys.length > 0) {
      const addRow = document.createElement('div');
      addRow.style.cssText = 'display:flex;gap:4px';

      const selectEl = createTextField({
        select: true,
        size: 'small',
        value: newTextKey,
        fullWidth: true,
        children: (() => {
          const frag = document.createDocumentFragment();
          const defaultOpt = document.createElement('option');
          defaultOpt.value = '';
          defaultOpt.textContent = 'Select key';
          frag.appendChild(defaultOpt);
          textKeys
            .filter((k) => !currentConfig.textFilters.some((tf) => tf.key === k))
            .forEach((k) => {
              const opt = document.createElement('option');
              opt.value = k;
              opt.textContent = k;
              frag.appendChild(opt);
            });
          return frag;
        })(),
        onChange: (e) => {
          newTextKey = (e.target as HTMLSelectElement).value;
        },
      });
      addRow.appendChild(selectEl.el);

      const addBtn = createIconButton({
        size: 'small',
        disabled: !newTextKey,
        onClick: () => {
          if (!newTextKey) return;
          const filter: TextFilter = { key: newTextKey, value: '' };
          currentConfig = {
            ...currentConfig,
            textFilters: [...currentConfig.textFilters, filter],
          };
          newTextKey = '';
          opts.onConfigChange(currentConfig);
          rebuild();
        },
        children: createAddIcon({ fontSize: 'small' }),
      });
      addRow.appendChild(addBtn);
      section.appendChild(addRow);
    }

    return section;
  }

  // ---- セクション: リセット ----
  function buildReset(): HTMLDivElement {
    const section = document.createElement('div');
    section.style.padding = '12px';

    const resetBtn = createButton({
      size: 'small',
      variant: 'outlined',
      disabled: currentConfig.rangeFilters.length === 0 && currentConfig.textFilters.length === 0,
      onClick: () => {
        currentConfig = { rangeFilters: [], textFilters: [] };
        opts.onConfigChange(currentConfig);
        rebuild();
      },
      children: 'Reset All Filters',
    });
    resetBtn.style.width = '100%';
    section.appendChild(resetBtn);

    return section;
  }

  // ---- 全体再構築 ----
  function rebuild(): void {
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(buildHeader());
    el.appendChild(buildDivider());
    el.appendChild(buildRangeFilters());
    el.appendChild(buildDivider());
    el.appendChild(buildTextFilters());
    el.appendChild(buildDivider());
    el.appendChild(buildReset());
  }

  // 初期描画
  rebuild();

  return {
    el,
    update({ config, availableKeys, keyRanges }) {
      currentConfig = config;
      currentAvailableKeys = availableKeys;
      currentKeyRanges = keyRanges;
      rebuild();
    },
    destroy() {
      // el は外部が管理するため remove しない。
      // injectGraphUiStyles() は冪等のためクリーンアップ不要。
    },
  };
}
