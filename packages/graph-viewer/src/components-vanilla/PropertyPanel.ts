/**
 * PropertyPanel の vanilla DOM 実装。
 *
 * React 版 `components/PropertyPanel.tsx` の factory 移植。
 * 選択ノード / エッジのスタイル・属性編集パネル + 内部 ColorPalette を同ファイルに閉じる。
 */

import { getCanvasColors } from '@anytime-markdown/graph-core';
import type { EndpointShape, GraphEdge, GraphNode } from '../types';
import type { GraphT } from '../i18n/createGraphT';
import { createIconButton } from '../ui-vanilla/IconButton';
import { createSlider } from '../ui-vanilla/Slider';
import { createTextField } from '../ui-vanilla/TextField';
import { createText } from '../ui-vanilla/Text';
import { createDivider } from '../ui-vanilla/Divider';
import { createSwitch } from '../ui-vanilla/Switch';
import { createFormControlLabel } from '../ui-vanilla/FormControlLabel';
import { createToggleButton, createToggleButtonGroup } from '../ui-vanilla/ToggleButton';
import {
  createCloseIcon,
  createLockIcon,
  createLockOpenIcon,
  createArrowDownwardIcon as createDownIcon,
  createArrowUpwardIcon as createUpIcon,
  createVerticalAlignBottomIcon as createBottomIcon,
  createVerticalAlignTopIcon as createTopIcon,
} from '../ui-vanilla/icons';
import { applyStyle } from '../ui-vanilla/dom';

// ---------------------------------------------------------------------------
// COLORS 定数（元 .tsx と同一）
// ---------------------------------------------------------------------------
const COLORS: readonly string[] = [
  '#ffffff', '#f44336', '#e91e63', '#9c27b0', '#673ab7',
  '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688',
  '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107',
  '#ff9800', '#ff5722', '#795548', '#607d8b', '#333333',
];

// ---------------------------------------------------------------------------
// opts 型
// ---------------------------------------------------------------------------
export interface PropertyPanelOpts {
  readonly selectedNode: GraphNode | null;
  readonly selectedEdge: GraphEdge | null;
  readonly onUpdateNode: (id: string, changes: Partial<GraphNode>) => void;
  readonly onUpdateEdge: (id: string, changes: Partial<GraphEdge>) => void;
  readonly onLayerAction?: (action: 'up' | 'down' | 'top' | 'bottom') => void;
  readonly onClose: () => void;
  readonly themeMode?: 'light' | 'dark';
  /** createGraphT('Graph', locale) で生成した translator。 */
  readonly t: GraphT;
}

// ---------------------------------------------------------------------------
// 返り値
// ---------------------------------------------------------------------------
export interface PropertyPanelHandle {
  /** パネル root 要素。DOM に挿入して使う。 */
  readonly el: HTMLDivElement;
  /**
   * 選択対象が変わったとき呼ぶ（React の再 render 相当）。
   * 内部コンテンツを再構築する。
   */
  update(sel: Pick<PropertyPanelOpts, 'selectedNode' | 'selectedEdge'>): void;
  /** イベントリスナーを解除する。 */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// ColorPalette（内部ヘルパー）
// ---------------------------------------------------------------------------
interface ColorPaletteOpts {
  readonly colors: readonly string[];
  readonly selectedColor: string;
  readonly onSelect: (color: string) => void;
  readonly label: string;
  readonly themeMode: 'light' | 'dark';
}

function createColorPalette(opts: ColorPaletteOpts): HTMLDivElement {
  const isDark = opts.themeMode === 'dark';
  const themeColors = getCanvasColors(isDark);

  const container = document.createElement('div');
  container.setAttribute('role', 'radiogroup');
  container.setAttribute('aria-label', opts.label);
  applyStyle(container, { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '16px' });

  opts.colors.forEach((c, i) => {
    const swatch = document.createElement('div');
    swatch.className = 'gv-color-swatch';
    swatch.setAttribute('role', 'radio');
    swatch.setAttribute('aria-checked', String(opts.selectedColor === c));
    swatch.setAttribute('aria-label', c);
    swatch.tabIndex = opts.selectedColor === c ? 0 : -1;
    applyStyle(swatch, {
      width: '24px',
      height: '24px',
      backgroundColor: c,
      borderRadius: '4px',
      cursor: 'pointer',
      border: opts.selectedColor === c
        ? `2px solid ${themeColors.accentColor}`
        : `1px solid ${themeColors.panelBorder}`,
    });

    swatch.addEventListener('click', () => opts.onSelect(c));
    swatch.addEventListener('keydown', (e: KeyboardEvent) => {
      let nextIndex: number;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIndex = (i + 1) % opts.colors.length;
        e.preventDefault();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIndex = (i - 1 + opts.colors.length) % opts.colors.length;
        e.preventDefault();
      } else if (e.key === 'Enter' || e.key === ' ') {
        opts.onSelect(c);
        e.preventDefault();
        return;
      } else {
        return;
      }
      const next = container.children[nextIndex] as HTMLElement | undefined;
      next?.focus();
    });

    container.appendChild(swatch);
  });

  return container;
}

// ---------------------------------------------------------------------------
// createPropertyPanel
// ---------------------------------------------------------------------------
export function createPropertyPanel(opts: Readonly<PropertyPanelOpts>): PropertyPanelHandle {
  const { t, onClose, onUpdateNode, onUpdateEdge, onLayerAction } = opts;
  const themeMode = opts.themeMode ?? 'dark';

  // --- root 要素 ---
  const el = document.createElement('div');
  el.className = 'gv-scroll';

  // destroy 時に解除するリスナー群
  const cleanups: (() => void)[] = [];

  // 現在の選択状態（update で上書き）
  let currentNode: GraphNode | null = opts.selectedNode;
  let currentEdge: GraphEdge | null = opts.selectedEdge;

  function rebuild(): void {
    // 子を全消去してリスナーを解放
    while (el.firstChild) el.removeChild(el.firstChild);
    cleanups.length = 0;

    const isDark = themeMode === 'dark';
    const colors = getCanvasColors(isDark);

    // 選択なし → 非表示
    if (!currentNode && !currentEdge) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';

    applyStyle(el, {
      position: 'absolute',
      right: '0',
      top: '0',
      bottom: '0',
      width: '240px',
      backgroundColor: colors.panelBg,
      borderLeft: `1px solid ${colors.panelBorder}`,
      padding: '16px',
      overflowY: 'auto',
      zIndex: '20',
    });

    // --- ヘッダー行 ---
    const header = document.createElement('div');
    applyStyle(header, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px',
    });

    const titleEl = createText({ variant: 'subtitle2', style: { color: colors.textPrimary } });
    titleEl.textContent = t('properties');
    header.appendChild(titleEl);

    const closeBtn = createIconButton({
      size: 'small',
      ariaLabel: 'close',
      onClick: () => onClose(),
    });
    closeBtn.style.color = colors.textSecondary;
    closeBtn.appendChild(createCloseIcon({ fontSize: 'small' }));
    header.appendChild(closeBtn);
    el.appendChild(header);

    el.appendChild(createDivider({ style: { marginBottom: '16px' } }));

    // =========================================================
    // ノード選択
    // =========================================================
    if (currentNode) {
      const node = currentNode; // closure 安定化

      // --- ロック & レイヤー ---
      const lockRow = document.createElement('div');
      applyStyle(lockRow, { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '16px' });

      const lockBtn = createIconButton({
        size: 'small',
        ariaLabel: node.locked ? t('unlock') : t('lock'),
        onClick: () => onUpdateNode(node.id, { locked: !node.locked }),
      });
      lockBtn.style.color = node.locked ? colors.accentColor : colors.textSecondary;
      lockBtn.appendChild(node.locked ? createLockIcon({ fontSize: 'small' }) : createLockOpenIcon({ fontSize: 'small' }));
      lockRow.appendChild(lockBtn);

      const lockText = createText({ variant: 'caption', style: { color: colors.textSecondary, flex: '1' } });
      lockText.textContent = node.locked ? t('locked') : t('unlocked');
      lockRow.appendChild(lockText);

      const topBtn = createIconButton({ size: 'small', ariaLabel: t('layerTop'), onClick: () => onLayerAction?.('top') });
      topBtn.style.color = colors.textSecondary;
      topBtn.appendChild(createTopIcon({ fontSize: 'small' }));
      lockRow.appendChild(topBtn);

      const upBtn = createIconButton({ size: 'small', ariaLabel: t('layerUp'), onClick: () => onLayerAction?.('up') });
      upBtn.style.color = colors.textSecondary;
      upBtn.appendChild(createUpIcon({ fontSize: 'small' }));
      lockRow.appendChild(upBtn);

      const downBtn = createIconButton({ size: 'small', ariaLabel: t('layerDown'), onClick: () => onLayerAction?.('down') });
      downBtn.style.color = colors.textSecondary;
      downBtn.appendChild(createDownIcon({ fontSize: 'small' }));
      lockRow.appendChild(downBtn);

      const bottomBtn = createIconButton({ size: 'small', ariaLabel: t('layerBottom'), onClick: () => onLayerAction?.('bottom') });
      bottomBtn.style.color = colors.textSecondary;
      bottomBtn.appendChild(createBottomIcon({ fontSize: 'small' }));
      lockRow.appendChild(bottomBtn);

      el.appendChild(lockRow);

      // --- 塗り色 ---
      const fillLabel = createText({ variant: 'caption', style: { color: colors.textSecondary } });
      fillLabel.textContent = t('fillColor');
      el.appendChild(fillLabel);

      el.appendChild(createColorPalette({
        colors: COLORS,
        selectedColor: node.style.fill,
        onSelect: (c) => onUpdateNode(node.id, { style: { ...node.style, fill: c } }),
        label: t('fillColor'),
        themeMode,
      }));

      // --- 線の色 ---
      const strokeLabel = createText({ variant: 'caption', style: { color: colors.textSecondary } });
      strokeLabel.textContent = t('strokeColor');
      el.appendChild(strokeLabel);

      el.appendChild(createColorPalette({
        colors: COLORS,
        selectedColor: node.style.stroke,
        onSelect: (c) => onUpdateNode(node.id, { style: { ...node.style, stroke: c } }),
        label: t('strokeColor'),
        themeMode,
      }));

      // --- 線の太さ ---
      const strokeWidthLabel = createText({ variant: 'caption', style: { color: colors.textSecondary } });
      strokeWidthLabel.textContent = t('strokeWidth');
      el.appendChild(strokeWidthLabel);

      const strokeWidthSlider = createSlider({
        value: node.style.strokeWidth,
        min: 0,
        max: 10,
        step: 0.5,
        size: 'small',
        ariaLabel: t('strokeWidth'),
        style: { marginBottom: '16px' },
        onChange: (v) => onUpdateNode(node.id, { style: { ...node.style, strokeWidth: v } }),
      });
      el.appendChild(strokeWidthSlider.el);
      cleanups.push(() => strokeWidthSlider.destroy());

      // --- フォントサイズ ---
      const fontSizeLabel = createText({ variant: 'caption', style: { color: colors.textSecondary } });
      fontSizeLabel.textContent = t('fontSize');
      el.appendChild(fontSizeLabel);

      const fontSizeSlider = createSlider({
        value: node.style.fontSize,
        min: 8,
        max: 48,
        step: 1,
        size: 'small',
        ariaLabel: t('fontSize'),
        style: { marginBottom: '16px' },
        onChange: (v) => onUpdateNode(node.id, { style: { ...node.style, fontSize: v } }),
      });
      el.appendChild(fontSizeSlider.el);
      cleanups.push(() => fontSizeSlider.destroy());

      // --- 角丸 ---
      const borderRadiusLabel = createText({ variant: 'caption', style: { color: colors.textSecondary } });
      borderRadiusLabel.textContent = t('borderRadius');
      el.appendChild(borderRadiusLabel);

      const borderRadiusSlider = createSlider({
        value: node.style.borderRadius ?? 0,
        min: 0,
        max: 30,
        step: 1,
        size: 'small',
        ariaLabel: t('borderRadius'),
        style: { marginBottom: '16px' },
        onChange: (v) => onUpdateNode(node.id, { style: { ...node.style, borderRadius: v } }),
      });
      el.appendChild(borderRadiusSlider.el);
      cleanups.push(() => borderRadiusSlider.destroy());

      // --- シャドウ ---
      const shadowSwitch = createSwitch({
        checked: node.style.shadow ?? false,
        onChange: (v) => onUpdateNode(node.id, { style: { ...node.style, shadow: v } }),
      });
      const shadowLabel = createText({ variant: 'caption', style: { color: colors.textSecondary } });
      shadowLabel.textContent = t('shadow');
      const shadowFcl = createFormControlLabel({
        control: shadowSwitch.el,
        label: shadowLabel,
        style: { marginBottom: '8px' },
      });
      el.appendChild(shadowFcl);

      // --- グラデーション終止色 ---
      const gradientToLabel = createText({ variant: 'caption', style: { color: colors.textSecondary, display: 'block' } });
      gradientToLabel.textContent = t('gradientTo');
      el.appendChild(gradientToLabel);

      const gradientBox = document.createElement('div');
      applyStyle(gradientBox, { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' });

      // "なし" スウォッチ
      const noGradSwatch = document.createElement('div');
      applyStyle(noGradSwatch, {
        width: '24px',
        height: '24px',
        borderRadius: '4px',
        cursor: 'pointer',
        background: 'linear-gradient(135deg, #666 25%, transparent 25%, transparent 75%, #666 75%)',
        backgroundSize: '8px 8px',
        border: node.style.gradientTo
          ? `1px solid ${colors.panelBorder}`
          : `2px solid ${colors.accentColor}`,
      });
      noGradSwatch.addEventListener('click', () =>
        onUpdateNode(node.id, { style: { ...node.style, gradientTo: undefined } }),
      );
      gradientBox.appendChild(noGradSwatch);

      COLORS.slice(0, 10).forEach((c) => {
        const swatch = document.createElement('div');
        applyStyle(swatch, {
          width: '24px',
          height: '24px',
          backgroundColor: c,
          borderRadius: '4px',
          cursor: 'pointer',
          border: node.style.gradientTo === c
            ? `2px solid ${colors.accentColor}`
            : `1px solid ${colors.panelBorder}`,
        });
        swatch.addEventListener('click', () =>
          onUpdateNode(node.id, { style: { ...node.style, gradientTo: c } }),
        );
        gradientBox.appendChild(swatch);
      });
      el.appendChild(gradientBox);

      // --- グラデーション方向（gradientTo が設定されている時のみ）---
      if (node.style.gradientTo) {
        const gradDirLabel = createText({ variant: 'caption', style: { color: colors.textSecondary, display: 'block' } });
        gradDirLabel.textContent = t('gradientDirection');
        el.appendChild(gradDirLabel);

        const gradGroup = createToggleButtonGroup({
          value: node.style.gradientDirection ?? 'vertical',
          exclusive: true,
          size: 'small',
          fullWidth: true,
          style: { marginBottom: '16px' },
          onChange: (_e, v) => {
            if (v != null) {
              onUpdateNode(node.id, {
                style: {
                  ...node.style,
                  gradientDirection: v as 'vertical' | 'horizontal' | 'diagonal',
                },
              });
            }
          },
        });

        const gradBtns = [
          { value: 'vertical', label: t('gradientVertical'), content: '↕' },
          { value: 'horizontal', label: t('gradientHorizontal'), content: '↔' },
          { value: 'diagonal', label: t('gradientDiagonal'), content: '↗' },
        ];
        gradBtns.forEach(({ value, label, content }) => {
          const btn = createToggleButton({ value, ariaLabel: label, children: content });
          gradGroup.register(btn);
        });
        el.appendChild(gradGroup.el);
        cleanups.push(() => gradGroup.destroy());
      }

      // --- URL ---
      const urlLabel = createText({ variant: 'caption', style: { color: colors.textSecondary, display: 'block' } });
      urlLabel.textContent = t('url');
      el.appendChild(urlLabel);

      const urlField = createTextField({
        value: node.url ?? '',
        size: 'small',
        fullWidth: true,
        placeholder: 'https://...',
        style: { marginBottom: '16px' },
        onChange: (e) => {
          const val = (e.target as HTMLInputElement).value;
          onUpdateNode(node.id, { url: val || undefined });
        },
      });
      el.appendChild(urlField.el);
      cleanups.push(() => urlField.destroy());

      // --- 接続点 ---
      el.appendChild(createDivider({ style: { margin: '8px 0' } }));

      const connLabel = createText({ variant: 'caption', style: { color: colors.textSecondary, display: 'block' } });
      connLabel.textContent = t('connectionPoints');
      el.appendChild(connLabel);

      const connRow = document.createElement('div');
      applyStyle(connRow, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' });

      const connCount = createText({ variant: 'caption', style: { color: colors.textSecondary, fontSize: '0.65rem' } });
      connCount.textContent = `${4 + (node.extraConnectionPoints?.length ?? 0)} ${t('points')}`;
      connRow.appendChild(connCount);

      const addConnBtn = createIconButton({
        size: 'small',
        ariaLabel: t('addConnectionPoints'),
        onClick: () => {
          const current = node.extraConnectionPoints ?? [];
          const newPoints = [
            { x: 0.25, y: 0 }, { x: 0.75, y: 0 },
            { x: 1, y: 0.25 }, { x: 1, y: 0.75 },
            { x: 0.25, y: 1 }, { x: 0.75, y: 1 },
            { x: 0, y: 0.25 }, { x: 0, y: 0.75 },
          ].filter((np) => !current.some((cp) => cp.x === np.x && cp.y === np.y));
          onUpdateNode(node.id, { extraConnectionPoints: [...current, ...newPoints] });
        },
      });
      addConnBtn.style.color = colors.textSecondary;
      addConnBtn.style.fontSize = '0.7rem';
      const addText = createText({ variant: 'caption' });
      addText.textContent = '+8';
      addConnBtn.appendChild(addText);
      connRow.appendChild(addConnBtn);

      if ((node.extraConnectionPoints?.length ?? 0) > 0) {
        const resetConnBtn = createIconButton({
          size: 'small',
          ariaLabel: t('resetConnectionPoints'),
          onClick: () => onUpdateNode(node.id, { extraConnectionPoints: undefined }),
        });
        resetConnBtn.style.color = colors.textSecondary;
        resetConnBtn.style.fontSize = '0.7rem';
        const resetText = createText({ variant: 'caption' });
        resetText.textContent = t('reset');
        resetConnBtn.appendChild(resetText);
        connRow.appendChild(resetConnBtn);
      }

      el.appendChild(connRow);
    }

    // =========================================================
    // エッジ選択
    // =========================================================
    if (currentEdge) {
      const edge = currentEdge; // closure 安定化

      // --- 線の色 ---
      const strokeColorLabel = createText({ variant: 'caption', style: { color: colors.textSecondary } });
      strokeColorLabel.textContent = t('strokeColor');
      el.appendChild(strokeColorLabel);

      const edgeColorBox = document.createElement('div');
      applyStyle(edgeColorBox, { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '16px' });
      COLORS.forEach((c) => {
        const swatch = document.createElement('div');
        applyStyle(swatch, {
          width: '24px',
          height: '24px',
          backgroundColor: c,
          borderRadius: '4px',
          cursor: 'pointer',
          border: edge.style.stroke === c
            ? `2px solid ${colors.accentColor}`
            : `1px solid ${colors.panelBorder}`,
        });
        swatch.addEventListener('click', () =>
          onUpdateEdge(edge.id, { style: { ...edge.style, stroke: c } }),
        );
        edgeColorBox.appendChild(swatch);
      });
      el.appendChild(edgeColorBox);

      // --- 線の太さ ---
      const edgeStrokeWidthLabel = createText({ variant: 'caption', style: { color: colors.textSecondary } });
      edgeStrokeWidthLabel.textContent = t('strokeWidth');
      el.appendChild(edgeStrokeWidthLabel);

      const edgeStrokeWidthSlider = createSlider({
        value: edge.style.strokeWidth,
        min: 1,
        max: 10,
        step: 0.5,
        size: 'small',
        ariaLabel: t('strokeWidth'),
        style: { marginBottom: '16px' },
        onChange: (v) => onUpdateEdge(edge.id, { style: { ...edge.style, strokeWidth: v } }),
      });
      el.appendChild(edgeStrokeWidthSlider.el);
      cleanups.push(() => edgeStrokeWidthSlider.destroy());

      // --- startShape ---
      const startShapeLabel = createText({ variant: 'caption', style: { color: colors.textSecondary, display: 'block' } });
      startShapeLabel.textContent = t('startShape');
      el.appendChild(startShapeLabel);

      const startShapeGroup = createToggleButtonGroup({
        value: edge.style.startShape ?? 'none',
        exclusive: true,
        size: 'small',
        fullWidth: true,
        style: { marginBottom: '16px' },
        onChange: (_e, v) => {
          if (v != null) {
            onUpdateEdge(edge.id, { style: { ...edge.style, startShape: v as EndpointShape } });
          }
        },
      });
      const endpointValues: ReadonlyArray<{ value: string; label: string }> = [
        { value: 'none', label: t('shapeNone') },
        { value: 'arrow', label: t('shapeArrow') },
        { value: 'circle', label: t('shapeCircle') },
        { value: 'diamond', label: t('shapeDiamond') },
        { value: 'bar', label: t('shapeBar') },
      ];
      endpointValues.forEach(({ value, label }) => {
        const btn = createToggleButton({ value, children: label });
        startShapeGroup.register(btn);
      });
      el.appendChild(startShapeGroup.el);
      cleanups.push(() => startShapeGroup.destroy());

      // --- endShape ---
      const endShapeLabel = createText({ variant: 'caption', style: { color: colors.textSecondary, display: 'block' } });
      endShapeLabel.textContent = t('endShape');
      el.appendChild(endShapeLabel);

      const endShapeGroup = createToggleButtonGroup({
        value: edge.style.endShape ?? (edge.type === 'connector' ? 'arrow' : 'none'),
        exclusive: true,
        size: 'small',
        fullWidth: true,
        style: { marginBottom: '16px' },
        onChange: (_e, v) => {
          if (v != null) {
            onUpdateEdge(edge.id, { style: { ...edge.style, endShape: v as EndpointShape } });
          }
        },
      });
      endpointValues.forEach(({ value, label }) => {
        const btn = createToggleButton({ value, children: label });
        endShapeGroup.register(btn);
      });
      el.appendChild(endShapeGroup.el);
      cleanups.push(() => endShapeGroup.destroy());

      // --- ラベル ---
      const edgeLabelLabel = createText({ variant: 'caption', style: { color: colors.textSecondary, display: 'block' } });
      edgeLabelLabel.textContent = t('edgeLabel');
      el.appendChild(edgeLabelLabel);

      const edgeLabelField = createTextField({
        value: edge.label ?? '',
        size: 'small',
        fullWidth: true,
        placeholder: 'Label',
        style: { marginBottom: '16px' },
        onChange: (e) => {
          const val = (e.target as HTMLInputElement).value;
          onUpdateEdge(edge.id, { label: val || undefined });
        },
      });
      el.appendChild(edgeLabelField.el);
      cleanups.push(() => edgeLabelField.destroy());

      // --- ルーティングモード（connector タイプのみ）---
      if (edge.type === 'connector') {
        const routingLabel = createText({ variant: 'caption', style: { color: colors.textSecondary, display: 'block' } });
        routingLabel.textContent = t('routing');
        el.appendChild(routingLabel);

        const routingGroup = createToggleButtonGroup({
          value: edge.style.routing ?? 'orthogonal',
          exclusive: true,
          size: 'small',
          fullWidth: true,
          style: { marginBottom: '16px' },
          onChange: (_e, v) => {
            if (v != null) {
              onUpdateEdge(edge.id, {
                style: {
                  ...edge.style,
                  routing: v as 'orthogonal' | 'bezier' | 'straight',
                },
              });
            }
          },
        });
        const routingValues: ReadonlyArray<{ value: string; label: string }> = [
          { value: 'orthogonal', label: t('routingOrthogonal') },
          { value: 'bezier', label: t('routingBezier') },
          { value: 'straight', label: t('routingStraight') },
        ];
        routingValues.forEach(({ value, label }) => {
          const btn = createToggleButton({ value, children: label });
          routingGroup.register(btn);
        });
        el.appendChild(routingGroup.el);
        cleanups.push(() => routingGroup.destroy());
      }
    }
  }

  // 初期構築
  rebuild();

  return {
    el,
    update(sel: Pick<PropertyPanelOpts, 'selectedNode' | 'selectedEdge'>): void {
      currentNode = sel.selectedNode;
      currentEdge = sel.selectedEdge;
      rebuild();
    },
    destroy(): void {
      for (const fn of cleanups) fn();
      cleanups.length = 0;
    },
  };
}
