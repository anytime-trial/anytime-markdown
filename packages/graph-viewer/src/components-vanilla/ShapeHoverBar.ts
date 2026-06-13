/**
 * graph-viewer vanilla ShapeHoverBar ファクトリ。
 *
 * React 版 `components/ShapeHoverBar.tsx` の vanilla 移植。
 * ノード上に表示される図形種別切り替えツールバーを DOM で構築する。
 *
 * - `worldToScreen` で canvas 座標 → 画面座標に変換し、絶対配置で追従する。
 * - `update(node, viewport)` で再配置できる handle を返す。
 * - 基本図形以外のノード（sticky / text / line 等）では `null` を返す。
 */

import { getCanvasColors } from '@anytime-markdown/graph-core';
import { worldToScreen } from '@anytime-markdown/graph-core/engine';
import type { GraphNode, NodeType, Viewport } from '../types';
import { createIconButton } from '../ui-vanilla/IconButton';
import { createTooltip, type TooltipHandle } from '../ui-vanilla/Tooltip';
import { createCircleOutlinedIcon as createEllipseIcon, createCropSquareIcon as createRectIcon } from '../ui-vanilla/icons';
import { createDiamondShapeIcon, createParallelogramShapeIcon, createCylinderShapeIcon } from './ShapeIcons';
import type { GraphT } from '../i18n/createGraphT';

/** ShapeHoverBar handle。destroy() で DOM 除去・イベント解除を行う。 */
export interface ShapeHoverBarHandle {
  readonly el: HTMLElement;
  /** ノードや viewport が変わったときに位置・アクティブ状態を再適用する。 */
  update(node: Readonly<GraphNode>, viewport: Readonly<Viewport>): void;
  destroy(): void;
}

interface ShapeEntry {
  readonly type: NodeType;
  readonly icon: () => SVGSVGElement;
  readonly i18nKey: string;
}

const SHAPE_FONT_SIZE = 18;

const SHAPES: readonly ShapeEntry[] = [
  { type: 'rect',         icon: () => createRectIcon({ fontSize: SHAPE_FONT_SIZE }),        i18nKey: 'rect' },
  { type: 'ellipse',      icon: () => createEllipseIcon({ fontSize: SHAPE_FONT_SIZE }),      i18nKey: 'ellipse' },
  { type: 'diamond',      icon: () => createDiamondShapeIcon({ fontSize: SHAPE_FONT_SIZE }), i18nKey: 'diamond' },
  { type: 'parallelogram',icon: () => createParallelogramShapeIcon({ fontSize: SHAPE_FONT_SIZE }), i18nKey: 'parallelogram' },
  { type: 'cylinder',     icon: () => createCylinderShapeIcon({ fontSize: SHAPE_FONT_SIZE }), i18nKey: 'cylinder' },
] as const;

const SHAPE_TYPES: ReadonlySet<NodeType> = new Set(SHAPES.map((s) => s.type));

const BAR_WIDTH = SHAPES.length * 30 + 16;

export interface CreateShapeHoverBarOpts {
  readonly node: Readonly<GraphNode>;
  readonly viewport: Readonly<Viewport>;
  readonly onChangeType: (id: string, type: NodeType) => void;
  readonly t: GraphT;
  readonly themeMode?: 'light' | 'dark';
}

/**
 * ShapeHoverBar を生成する。基本図形以外のノードでは `null` を返す。
 *
 * @param opts - ノード・viewport・コールバック・translator・テーマ
 * @returns `ShapeHoverBarHandle | null`
 */
export function createShapeHoverBar(
  opts: Readonly<CreateShapeHoverBarOpts>,
): ShapeHoverBarHandle | null {
  const { onChangeType, t, themeMode = 'dark' } = opts;
  let { node, viewport } = opts;

  // 基本図形以外はホバーバーを表示しない
  if (!SHAPE_TYPES.has(node.type)) return null;

  const isDark = themeMode === 'dark';
  const colors = getCanvasColors(isDark);

  // 外枠コンテナ
  const el = document.createElement('div');
  el.className = 'gv-shape-bar';
  Object.assign(el.style, {
    position: 'absolute',
    display: 'flex',
    gap: '2px',
    backgroundColor: colors.panelBg,
    border: `1px solid ${colors.panelBorder}`,
    borderRadius: '8px',
    padding: '4px 8px',
    zIndex: '25',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    pointerEvents: 'auto',
  });

  // mousedown バブルアップ防止（元の React 版と同様）
  el.addEventListener('mousedown', (e: MouseEvent) => e.stopPropagation());

  // ボタン配列とツールチップ handle を保持
  const tooltips: TooltipHandle[] = [];
  const buttons: HTMLButtonElement[] = [];

  function resolveActiveColors(nodeType: NodeType, shapeType: NodeType): {
    color: string;
    backgroundColor: string;
  } {
    const isActive = nodeType === shapeType;
    return {
      color: isActive ? colors.accentColor : colors.textSecondary,
      backgroundColor: isActive ? `${colors.accentColor}1F` : 'transparent',
    };
  }

  for (const shape of SHAPES) {
    const iconEl = shape.icon();
    const btn = createIconButton({
      size: 'small',
      children: iconEl,
      onClick: () => onChangeType(node.id, shape.type),
    });

    // サイズ・角丸は元 React 版に合わせる（gv-icon-btn は border-radius: 50% なので上書き）
    Object.assign(btn.style, {
      width: '28px',
      height: '28px',
      borderRadius: '6px',
      ...resolveActiveColors(node.type, shape.type),
    });

    const tooltip = createTooltip(btn, t(shape.i18nKey));
    tooltips.push(tooltip);
    buttons.push(btn);
    el.appendChild(btn);
  }

  function applyPosition(n: Readonly<GraphNode>, vp: Readonly<Viewport>): void {
    const screen = worldToScreen(vp, n.x + n.width / 2, n.y);
    el.style.left = `${screen.x - BAR_WIDTH / 2}px`;
    el.style.top = `${screen.y - 44}px`;
  }

  function applyActiveState(nodeType: NodeType): void {
    SHAPES.forEach((shape, i) => {
      const btn = buttons[i];
      if (btn == null) return;
      const { color, backgroundColor } = resolveActiveColors(nodeType, shape.type);
      btn.style.color = color;
      btn.style.backgroundColor = backgroundColor;
    });
  }

  // 初期位置を適用
  applyPosition(node, viewport);

  return {
    el,
    update(nextNode: Readonly<GraphNode>, nextViewport: Readonly<Viewport>): void {
      node = nextNode;
      viewport = nextViewport;
      applyPosition(node, viewport);
      applyActiveState(node.type);
    },
    destroy(): void {
      for (const tt of tooltips) tt.destroy();
      el.remove();
    },
  };
}
