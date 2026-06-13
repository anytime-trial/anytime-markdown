/**
 * graph-viewer vanilla ToolBar ファクトリ。
 *
 * React 版 `components/ToolBar.tsx` の vanilla 移植。
 * ツール選択 / Undo / Redo / ズーム / Export / Import / レイアウト / フィルタ等の
 * 操作バーを DOM で構築する。
 *
 * - `createToolBar(opts)` → `{ el, update(patch), destroy() }`
 * - update(patch) で tool/scale/saveStatus/canUndo/canRedo 等の表示状態を反映する。
 */

import { getCanvasColors } from '@anytime-markdown/graph-core';
import type { LayoutAlgorithm } from '@anytime-markdown/graph-core/engine';
import type { AlignType, ToolType } from '../types';
import { SaveStatus } from '../hooks/useAutoSave';
import type { GraphT } from '../i18n/createGraphT';

import { createIconButton } from '../ui-vanilla/IconButton';
import { createToggleButton, createToggleButtonGroup } from '../ui-vanilla/ToggleButton';
import type { ToggleButtonGroupHandle } from '../ui-vanilla/ToggleButton';
import { createDivider } from '../ui-vanilla/Divider';
import { createMenu } from '../ui-vanilla/Menu';
import { createPopover } from '../ui-vanilla/Popover';
import { createTooltip } from '../ui-vanilla/Tooltip';
import type { TooltipHandle } from '../ui-vanilla/Tooltip';
import { createMenuItem } from '../ui-vanilla/MenuItem';
import { createListItemIcon } from '../ui-vanilla/ListItemIcon';
import { createListItemText } from '../ui-vanilla/ListItemText';
import { createCircularProgress } from '../ui-vanilla/CircularProgress';
import {
  createAccountTreeIcon,
  createAlignHorizontalCenterIcon,
  createAlignHorizontalLeftIcon,
  createAlignHorizontalRightIcon,
  createAlignVerticalBottomIcon,
  createAlignVerticalCenterIcon,
  createAlignVerticalTopIcon,
  createArrowDropDownIcon,
  createCircleOutlinedIcon as createEllipseIcon,
  createCloudDoneIcon,
  createCloudOffIcon,
  createCloudSyncIcon,
  createCropSquareIcon as createRectIcon,
  createDashboardIcon as createFrameIcon,
  createDescriptionIcon as createDocIcon,
  createFileDownloadIcon as createExportIcon,
  createFileUploadIcon as createImportIcon,
  createFilterListIcon,
  createFitScreenIcon as createFitIcon,
  createGridOnIcon as createGridIcon,
  createLayersClearIcon as createClearAllIcon,
  createLayersIcon,
  createNearMeIcon as createSelectIcon,
  createPanToolIcon as createPanIcon,
  createRedoIcon,
  createRemoveIcon as createLineIcon,
  createTableRowsIcon,
  createTextFieldsIcon as createTextIcon,
  createUndoIcon,
  createUnfoldMoreIcon as createSpreadIcon,
  createViewColumnIcon,
  createZoomInIcon,
  createZoomOutIcon,
} from '../ui-vanilla/icons';
import {
  createCylinderShapeIcon as createCylinderIcon,
  createDiamondShapeIcon as createDiamondIcon,
  createParallelogramShapeIcon as createParallelogramIcon,
  createStickyNoteShapeIcon as createStickyIcon,
} from './ShapeIcons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const SHAPE_TOOLS = ['rect', 'ellipse', 'diamond', 'parallelogram', 'cylinder'] as const;
type ShapeToolType = typeof SHAPE_TOOLS[number];

function isShapeTool(t: ToolType): t is ShapeToolType {
  return (SHAPE_TOOLS as readonly string[]).includes(t);
}

const LAYOUT_LABEL_MAP: Record<LayoutAlgorithm, string> = {
  'eades': 'EA',
  'fruchterman-reingold': 'FR',
  'eades-vpsc': 'EA+V',
  'fruchterman-reingold-vpsc': 'FR+V',
  'hierarchical': 'HI',
};

const LAYOUT_FULL_LABEL_MAP: Record<LayoutAlgorithm, string> = {
  'eades': 'Eades',
  'fruchterman-reingold': 'FR',
  'eades-vpsc': 'Eades+VPSC',
  'fruchterman-reingold-vpsc': 'FR+VPSC',
  'hierarchical': 'Hierarchical',
};

const LAYOUT_CYCLE: readonly LayoutAlgorithm[] = [
  'eades',
  'fruchterman-reingold',
  'eades-vpsc',
  'fruchterman-reingold-vpsc',
  'hierarchical',
];

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ToolBarOpts {
  readonly tool: ToolType;
  readonly onToolChange: (tool: ToolType) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly showGrid: boolean;
  readonly onToggleGrid: () => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFitContent: () => void;
  readonly onClearAll: () => void;
  readonly onExportSvg: () => void;
  readonly onExportDrawio: () => void;
  readonly onImportDrawio: () => void;
  readonly onImportGraph: () => void;
  readonly onImportMermaid: () => void;
  readonly onAlign: (type: AlignType) => void;
  readonly onSetScale: (scale: number) => void;
  readonly selectionCount: number;
  readonly hasSelection?: boolean;
  readonly scale: number;
  readonly saveStatus: SaveStatus;
  readonly onToggleSettings?: () => void;
  readonly layoutRunning?: boolean;
  readonly collisionEnabled?: boolean;
  readonly onAutoLayout?: () => void;
  readonly onToggleCollision?: (enabled: boolean) => void;
  readonly layoutAlgorithm?: LayoutAlgorithm;
  readonly onChangeAlgorithm?: (algorithm: LayoutAlgorithm) => void;
  readonly onSpreadConnected?: () => void;
  readonly showFilter?: boolean;
  readonly onToggleFilter?: () => void;
  readonly filterActive?: boolean;
  readonly themeMode?: 'light' | 'dark';
  readonly t: GraphT;
}

// Fields that update() accepts — a partial snapshot of mutable state
export interface ToolBarPatch {
  readonly tool?: ToolType;
  readonly canUndo?: boolean;
  readonly canRedo?: boolean;
  readonly scale?: number;
  readonly saveStatus?: SaveStatus;
  readonly showGrid?: boolean;
  readonly filterActive?: boolean;
  readonly selectionCount?: number;
  readonly layoutRunning?: boolean;
  readonly collisionEnabled?: boolean;
  readonly layoutAlgorithm?: LayoutAlgorithm;
}

// ---------------------------------------------------------------------------
// Handle
// ---------------------------------------------------------------------------

export interface ToolBarHandle {
  readonly el: HTMLElement;
  update(patch: Readonly<ToolBarPatch>): void;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * GraphToolBar の vanilla 実装。
 *
 * `createToolBar(opts)` で DOM を構築し、
 * `handle.update(patch)` で差分を反映する。
 */
export function createToolBar(opts: Readonly<ToolBarOpts>): ToolBarHandle {
  const { t } = opts;
  const themeMode = opts.themeMode ?? 'dark';
  const isDark = themeMode === 'dark';
  const colors = getCanvasColors(isDark);

  // -------------------------------------------------------------------
  // Mutable closure state (equiv. React useState / useRef)
  // -------------------------------------------------------------------
  let currentTool: ToolType = opts.tool;
  let currentCanUndo = opts.canUndo;
  let currentCanRedo = opts.canRedo;
  let currentScale = opts.scale;
  let currentSaveStatus = opts.saveStatus;
  let currentShowGrid = opts.showGrid;
  let currentFilterActive = opts.filterActive ?? false;
  let currentSelectionCount = opts.selectionCount;
  let currentLayoutRunning = opts.layoutRunning ?? false;
  let currentCollisionEnabled = opts.collisionEnabled ?? false;
  let currentLayoutAlgorithm: LayoutAlgorithm = opts.layoutAlgorithm ?? 'eades';

  // Shape-group closure state
  let lastShape: ShapeToolType = isShapeTool(currentTool)
    ? (currentTool as ShapeToolType)
    : 'rect';
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let isLongPress = false;
  const LONG_PRESS_DURATION = 400;

  // Tooltip handles for cleanup
  const tooltips: TooltipHandle[] = [];
  const addTooltip = (target: HTMLElement, title: string): void => {
    tooltips.push(createTooltip(target, title));
  };

  // -------------------------------------------------------------------
  // Root header
  // -------------------------------------------------------------------
  const header = document.createElement('header');
  header.style.backgroundColor = colors.panelBg;
  header.style.borderBottom = `1px solid ${colors.panelBorder}`;
  header.style.backdropFilter = 'blur(12px)';
  header.style.zIndex = '10';

  const box = document.createElement('div');
  box.style.display = 'flex';
  box.style.alignItems = 'center';
  box.style.gap = '8px';
  box.style.minHeight = '48px';
  box.style.padding = '0 12px';
  box.style.color = colors.textSecondary;
  header.appendChild(box);

  // -------------------------------------------------------------------
  // ToggleButtonGroup for tool selection
  // -------------------------------------------------------------------
  const isShapeSelected = (): boolean => isShapeTool(currentTool);
  const groupValue = (): string => isShapeSelected() ? lastShape : currentTool;

  const toolGroup: ToggleButtonGroupHandle = createToggleButtonGroup({
    value: groupValue(),
    exclusive: true,
    size: 'small',
    onChange: (_e, val) => {
      if (!val) return;
      if (isShapeTool(val as ToolType)) return; // shape button handles itself
      opts.onToolChange(val as ToolType);
    },
  });

  // select
  const selectBtn = createToggleButton({ value: 'select', ariaLabel: t('select'), children: createSelectIcon({ fontSize: 'small' }) });
  addTooltip(selectBtn.el, `${t('select')} (V)`);
  toolGroup.register(selectBtn);

  // pan
  const panBtn = createToggleButton({ value: 'pan', ariaLabel: t('pan'), children: createPanIcon({ fontSize: 'small' }) });
  addTooltip(panBtn.el, `${t('pan')} (Space)`);
  toolGroup.register(panBtn);

  // shape (long-press to open dropdown)
  const shapeIconWrapper = document.createElement('div');
  shapeIconWrapper.style.display = 'flex';
  shapeIconWrapper.style.alignItems = 'center';
  shapeIconWrapper.style.position = 'relative';

  const buildShapeIcon = (): SVGSVGElement => {
    switch (lastShape) {
      case 'rect': return createRectIcon({ fontSize: 'small' });
      case 'ellipse': return createEllipseIcon({ fontSize: 'small' });
      case 'diamond': return createDiamondIcon({ fontSize: 'small' });
      case 'parallelogram': return createParallelogramIcon({ fontSize: 'small' });
      case 'cylinder': return createCylinderIcon({ fontSize: 'small' });
    }
  };

  const refreshShapeIcon = (): void => {
    shapeIconWrapper.innerHTML = '';
    shapeIconWrapper.appendChild(buildShapeIcon());
    const arrow = createArrowDropDownIcon({ fontSize: 14 });
    arrow.style.position = 'absolute';
    arrow.style.right = '2px';
    arrow.style.bottom = '2px';
    arrow.style.opacity = '0.6';
    shapeIconWrapper.appendChild(arrow);
  };
  refreshShapeIcon();

  const shapeBtn = createToggleButton({
    value: lastShape,
    selected: isShapeSelected(),
    ariaLabel: t(lastShape),
    children: shapeIconWrapper,
    style: { position: 'relative', paddingRight: '20px' },
    onMouseDown: (e) => {
      isLongPress = false;
      const target = e.currentTarget as HTMLElement;
      longPressTimer = setTimeout(() => {
        isLongPress = true;
        openShapePopover(target);
      }, LONG_PRESS_DURATION);
    },
    onMouseUp: () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (!isLongPress) {
        opts.onToolChange(lastShape);
      }
    },
    onMouseLeave: () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    },
  });
  addTooltip(shapeBtn.el, `${t(lastShape)} (${t('longPressForMore')})`);
  toolGroup.register(shapeBtn);

  // line
  const lineBtn = createToggleButton({ value: 'line', ariaLabel: t('line'), children: createLineIcon({ fontSize: 'small' }) });
  addTooltip(lineBtn.el, `${t('line')} (L)`);
  toolGroup.register(lineBtn);

  // sticky
  const stickyBtn = createToggleButton({ value: 'sticky', ariaLabel: t('sticky'), children: createStickyIcon({ fontSize: 'small' }) });
  addTooltip(stickyBtn.el, `${t('sticky')} (S)`);
  toolGroup.register(stickyBtn);

  // text
  const textBtn = createToggleButton({ value: 'text', ariaLabel: t('text'), children: createTextIcon({ fontSize: 'small' }) });
  addTooltip(textBtn.el, `${t('text')} (T)`);
  toolGroup.register(textBtn);

  // doc
  const docBtn = createToggleButton({ value: 'doc', ariaLabel: t('doc'), children: createDocIcon({ fontSize: 'small' }) });
  addTooltip(docBtn.el, `${t('doc')} (M)`);
  toolGroup.register(docBtn);

  // frame
  const frameBtn = createToggleButton({ value: 'frame', ariaLabel: t('frame'), children: createFrameIcon({ fontSize: 'small' }) });
  addTooltip(frameBtn.el, `${t('frame')} (F)`);
  toolGroup.register(frameBtn);

  box.appendChild(toolGroup.el);

  // -------------------------------------------------------------------
  // Shape popover (long-press)
  // -------------------------------------------------------------------
  const openShapePopover = (anchorEl: HTMLElement): void => {
    const shapeItems = [
      { shape: 'rect' as ShapeToolType, icon: createRectIcon({ fontSize: 'small' }) },
      { shape: 'ellipse' as ShapeToolType, icon: createEllipseIcon({ fontSize: 'small' }) },
      { shape: 'diamond' as ShapeToolType, icon: createDiamondIcon({ fontSize: 'small' }) },
      { shape: 'parallelogram' as ShapeToolType, icon: createParallelogramIcon({ fontSize: 'small' }) },
      { shape: 'cylinder' as ShapeToolType, icon: createCylinderIcon({ fontSize: 'small' }) },
    ];

    const itemEls: HTMLButtonElement[] = shapeItems.map(({ shape, icon }) => {
      const btn = createIconButton({
        size: 'small',
        children: icon,
      });
      btn.title = t(shape);
      btn.style.color = currentTool === shape ? colors.accentColor : colors.textSecondary;
      btn.style.backgroundColor = currentTool === shape ? `${colors.accentColor}1F` : 'transparent';
      btn.style.borderRadius = '4px';
      btn.addEventListener('click', () => {
        lastShape = shape;
        opts.onToolChange(shape);
        popover.close();
        refreshShapeIcon();
        shapeBtn.el.setAttribute('aria-label', t(shape));
        toolGroup.setValue(shape);
      });
      return btn;
    });

    const popoverContent = document.createElement('div');
    popoverContent.style.display = 'flex';
    popoverContent.style.flexDirection = 'column';
    popoverContent.style.padding = '4px';
    popoverContent.style.gap = '2px';
    for (const btn of itemEls) {
      popoverContent.appendChild(btn);
    }

    const popover = createPopover({
      anchorEl,
      onClose: () => { popover.close(); },
      anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
      transformOrigin: { vertical: 'top', horizontal: 'left' },
      paperStyle: {
        backgroundColor: colors.panelBg,
        border: `1px solid ${colors.panelBorder}`,
        backdropFilter: 'blur(12px)',
      },
      children: popoverContent,
    });
  };

  // -------------------------------------------------------------------
  // Divider
  // -------------------------------------------------------------------
  box.appendChild(createDivider({ orientation: 'vertical', flexItem: true }));

  // -------------------------------------------------------------------
  // Undo / Redo
  // -------------------------------------------------------------------
  const undoWrapper = document.createElement('span');
  const undoBtn = createIconButton({ size: 'small', children: createUndoIcon({ fontSize: 'small' }) });
  undoBtn.disabled = !currentCanUndo;
  undoBtn.addEventListener('click', opts.onUndo);
  undoWrapper.appendChild(undoBtn);
  addTooltip(undoWrapper, `${t('undo')} (Ctrl+Z)`);
  box.appendChild(undoWrapper);

  const redoWrapper = document.createElement('span');
  const redoBtn = createIconButton({ size: 'small', children: createRedoIcon({ fontSize: 'small' }) });
  redoBtn.disabled = !currentCanRedo;
  redoBtn.addEventListener('click', opts.onRedo);
  redoWrapper.appendChild(redoBtn);
  addTooltip(redoWrapper, `${t('redo')} (Ctrl+Y)`);
  box.appendChild(redoWrapper);

  // -------------------------------------------------------------------
  // Divider
  // -------------------------------------------------------------------
  box.appendChild(createDivider({ orientation: 'vertical', flexItem: true }));

  // -------------------------------------------------------------------
  // Clear All
  // -------------------------------------------------------------------
  const clearBtn = createIconButton({ size: 'small', children: createClearAllIcon({ fontSize: 'small' }) });
  clearBtn.addEventListener('click', opts.onClearAll);
  addTooltip(clearBtn, t('clearAll'));
  box.appendChild(clearBtn);

  // -------------------------------------------------------------------
  // Alignment menu
  // -------------------------------------------------------------------
  const alignWrapper = document.createElement('span');
  const alignBtn = createIconButton({ size: 'small', children: createAlignHorizontalLeftIcon({ fontSize: 'small' }) });
  alignBtn.disabled = currentSelectionCount < 2;
  alignBtn.addEventListener('click', () => {
    if (currentSelectionCount < 2) return;
    openAlignMenu(alignBtn);
  });
  alignWrapper.appendChild(alignBtn);
  addTooltip(alignWrapper, t('alignment'));
  box.appendChild(alignWrapper);

  const openAlignMenu = (anchorEl: HTMLElement): void => {
    const alignItems: Array<{ type: AlignType; icon: SVGSVGElement; label: string }> = [
      { type: 'left',       icon: createAlignHorizontalLeftIcon({ fontSize: 'small' }),   label: t('alignLeft') },
      { type: 'right',      icon: createAlignHorizontalRightIcon({ fontSize: 'small' }),  label: t('alignRight') },
      { type: 'top',        icon: createAlignVerticalTopIcon({ fontSize: 'small' }),      label: t('alignTop') },
      { type: 'bottom',     icon: createAlignVerticalBottomIcon({ fontSize: 'small' }),   label: t('alignBottom') },
      { type: 'centerH',    icon: createAlignHorizontalCenterIcon({ fontSize: 'small' }), label: t('alignCenterH') },
      { type: 'centerV',    icon: createAlignVerticalCenterIcon({ fontSize: 'small' }),   label: t('alignCenterV') },
    ];
    const distItems: Array<{ type: AlignType; icon: SVGSVGElement; label: string }> = [
      { type: 'distributeH', icon: createViewColumnIcon({ fontSize: 'small' }), label: t('distributeH') },
      { type: 'distributeV', icon: createTableRowsIcon({ fontSize: 'small' }), label: t('distributeV') },
    ];

    const menuItems: (HTMLLIElement | HTMLHRElement)[] = [];
    for (const { type, icon, label } of alignItems) {
      const li = createMenuItem({
        onClick: () => { opts.onAlign(type); menu.close(); },
        children: [
          createListItemIcon({ children: icon }),
          createListItemText({ children: label }),
        ],
      });
      menuItems.push(li);
    }
    menuItems.push(createDivider());
    for (const { type, icon, label } of distItems) {
      const li = createMenuItem({
        onClick: () => { opts.onAlign(type); menu.close(); },
        disabled: currentSelectionCount < 3,
        children: [
          createListItemIcon({ children: icon }),
          createListItemText({ children: label }),
        ],
      });
      menuItems.push(li);
    }

    const menu = createMenu({
      anchorEl,
      onClose: () => { menu.close(); },
      children: menuItems,
    });
  };

  // -------------------------------------------------------------------
  // Auto Layout button
  // -------------------------------------------------------------------
  const autoLayoutWrapper = document.createElement('span');
  let layoutBtnIcon: SVGSVGElement | HTMLSpanElement = createAccountTreeIcon({ fontSize: 'small' });
  const autoLayoutBtn = createIconButton({ size: 'small', children: layoutBtnIcon });
  autoLayoutBtn.disabled = currentLayoutRunning;
  autoLayoutBtn.addEventListener('click', () => { opts.onAutoLayout?.(); });
  autoLayoutWrapper.appendChild(autoLayoutBtn);
  const updateAutoLayoutTooltip = (): void => {
    const fullLabel = LAYOUT_FULL_LABEL_MAP[currentLayoutAlgorithm];
    autoLayoutWrapper.title = '';
    // remove old tooltip and add fresh one
    tooltips.push(createTooltip(autoLayoutWrapper, `${t('autoLayout')} (${fullLabel})`));
  };
  updateAutoLayoutTooltip();
  box.appendChild(autoLayoutWrapper);

  // Algorithm switch button
  const algoBtnText = document.createElement('span');
  algoBtnText.style.fontSize = '10px';
  algoBtnText.style.fontWeight = 'bold';
  algoBtnText.style.lineHeight = '1';
  algoBtnText.textContent = LAYOUT_LABEL_MAP[currentLayoutAlgorithm];
  const algoBtn = createIconButton({ size: 'small', children: algoBtnText });
  algoBtn.disabled = currentLayoutRunning;
  algoBtn.addEventListener('click', () => {
    const idx = LAYOUT_CYCLE.indexOf(currentLayoutAlgorithm);
    opts.onChangeAlgorithm?.(LAYOUT_CYCLE[(idx + 1) % LAYOUT_CYCLE.length]);
  });
  addTooltip(algoBtn, t('switchAlgorithm'));
  box.appendChild(algoBtn);

  // Collision toggle
  const collisionBtn = createIconButton({ size: 'small', children: createLayersIcon({ fontSize: 'small' }) });
  collisionBtn.style.color = currentCollisionEnabled ? colors.accentColor : 'inherit';
  collisionBtn.style.backgroundColor = currentCollisionEnabled ? `${colors.accentColor}1F` : 'transparent';
  collisionBtn.style.borderRadius = '4px';
  collisionBtn.addEventListener('click', () => { opts.onToggleCollision?.(!currentCollisionEnabled); });
  addTooltip(collisionBtn, t('collisionDetection'));
  box.appendChild(collisionBtn);

  // Spread connected
  const spreadBtn = createIconButton({ size: 'small', children: createSpreadIcon({ fontSize: 'small' }) });
  spreadBtn.addEventListener('click', () => { opts.onSpreadConnected?.(); });
  addTooltip(spreadBtn, t('spreadConnected'));
  box.appendChild(spreadBtn);

  // -------------------------------------------------------------------
  // Spacer
  // -------------------------------------------------------------------
  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  box.appendChild(spacer);

  // -------------------------------------------------------------------
  // Zoom controls
  // -------------------------------------------------------------------
  const zoomOutBtn = createIconButton({ size: 'small', children: createZoomOutIcon({ fontSize: 'small' }) });
  zoomOutBtn.addEventListener('click', opts.onZoomOut);
  addTooltip(zoomOutBtn, t('zoomOut'));
  box.appendChild(zoomOutBtn);

  const zoomLabel = document.createElement('div');
  zoomLabel.style.minWidth = '48px';
  zoomLabel.style.textAlign = 'center';
  zoomLabel.style.fontSize = '0.75rem';
  zoomLabel.style.color = colors.textSecondary;
  zoomLabel.style.cursor = 'pointer';
  zoomLabel.style.borderRadius = '4px';
  zoomLabel.style.padding = '0 4px';
  zoomLabel.textContent = `${Math.round(currentScale * 100)}%`;
  zoomLabel.addEventListener('click', () => { openZoomMenu(zoomLabel); });
  box.appendChild(zoomLabel);

  const openZoomMenu = (anchorEl: HTMLElement): void => {
    const presets = [50, 75, 100, 150, 200];
    const menuItems = presets.map((pct) =>
      createMenuItem({
        onClick: () => {
          opts.onSetScale(pct / 100);
          menu.close();
        },
        children: `${pct}%`,
      }),
    );
    const menu = createMenu({
      anchorEl,
      onClose: () => { menu.close(); },
      children: menuItems,
    });
  };

  const zoomInBtn = createIconButton({ size: 'small', children: createZoomInIcon({ fontSize: 'small' }) });
  zoomInBtn.addEventListener('click', opts.onZoomIn);
  addTooltip(zoomInBtn, t('zoomIn'));
  box.appendChild(zoomInBtn);

  const fitBtn = createIconButton({ size: 'small', children: createFitIcon({ fontSize: 'small' }) });
  fitBtn.addEventListener('click', opts.onFitContent);
  addTooltip(fitBtn, t('fitContent'));
  box.appendChild(fitBtn);

  // -------------------------------------------------------------------
  // Save status icon
  // -------------------------------------------------------------------
  const saveBox = document.createElement('div');
  saveBox.style.display = 'flex';
  saveBox.style.alignItems = 'center';
  saveBox.style.marginLeft = '4px';

  let savedIcon: SVGSVGElement | null = null;
  let savingIcon: SVGSVGElement | null = null;
  let errorIcon: SVGSVGElement | null = null;

  const buildSaveIcons = (): void => {
    savedIcon = createCloudDoneIcon({ fontSize: 'small', color: colors.textSecondary });
    savingIcon = createCloudSyncIcon({ fontSize: 'small', color: colors.textSecondary });
    errorIcon = createCloudOffIcon({ fontSize: 'small', color: 'error' });
    saveBox.appendChild(savedIcon);
    saveBox.appendChild(savingIcon);
    saveBox.appendChild(errorIcon);
  };
  buildSaveIcons();

  const applySaveStatus = (status: SaveStatus): void => {
    if (savedIcon) savedIcon.style.display = status === 'saved' ? '' : 'none';
    if (savingIcon) savingIcon.style.display = status === 'saving' ? '' : 'none';
    if (errorIcon) errorIcon.style.display = status === 'error' ? '' : 'none';
    const saveStatusLabel = status === 'saving' ? t('saving') : t('saveError');
    const saveTooltip = status === 'saved' ? t('saved') : saveStatusLabel;
    saveBox.title = saveTooltip;
  };
  applySaveStatus(currentSaveStatus);

  box.appendChild(saveBox);

  // -------------------------------------------------------------------
  // Divider
  // -------------------------------------------------------------------
  box.appendChild(createDivider({ orientation: 'vertical', flexItem: true }));

  // -------------------------------------------------------------------
  // Grid toggle
  // -------------------------------------------------------------------
  const gridBtn = createIconButton({ size: 'small', children: createGridIcon({ fontSize: 'small' }) });
  gridBtn.style.color = currentShowGrid ? colors.accentColor : '';
  gridBtn.addEventListener('click', opts.onToggleGrid);
  addTooltip(gridBtn, t('grid'));
  box.appendChild(gridBtn);

  // -------------------------------------------------------------------
  // Filter toggle
  // -------------------------------------------------------------------
  const filterBtn = createIconButton({ size: 'small', children: createFilterListIcon({ fontSize: 'small' }) });
  filterBtn.style.color = currentFilterActive ? colors.accentColor : '';
  filterBtn.addEventListener('click', () => { opts.onToggleFilter?.(); });
  addTooltip(filterBtn, 'Filter');
  box.appendChild(filterBtn);

  // -------------------------------------------------------------------
  // Divider
  // -------------------------------------------------------------------
  box.appendChild(createDivider({ orientation: 'vertical', flexItem: true }));

  // -------------------------------------------------------------------
  // Export menu
  // -------------------------------------------------------------------
  const exportBtn = createIconButton({ size: 'small', children: createExportIcon({ fontSize: 'small' }) });
  exportBtn.addEventListener('click', () => { openExportMenu(exportBtn); });
  addTooltip(exportBtn, t('export'));
  box.appendChild(exportBtn);

  const openExportMenu = (anchorEl: HTMLElement): void => {
    const menu = createMenu({
      anchorEl,
      onClose: () => { menu.close(); },
      children: [
        createMenuItem({
          onClick: () => { opts.onExportSvg(); menu.close(); },
          children: createListItemText({ children: t('exportSvg') }),
        }),
        createMenuItem({
          onClick: () => { opts.onExportDrawio(); menu.close(); },
          children: createListItemText({ children: t('exportDrawio') }),
        }),
      ],
    });
  };

  // -------------------------------------------------------------------
  // Import menu
  // -------------------------------------------------------------------
  const importBtn = createIconButton({ size: 'small', children: createImportIcon({ fontSize: 'small' }) });
  importBtn.addEventListener('click', () => { openImportMenu(importBtn); });
  addTooltip(importBtn, t('import'));
  box.appendChild(importBtn);

  const openImportMenu = (anchorEl: HTMLElement): void => {
    const menu = createMenu({
      anchorEl,
      onClose: () => { menu.close(); },
      children: [
        createMenuItem({
          onClick: () => { opts.onImportDrawio(); menu.close(); },
          children: createListItemText({ children: t('importDrawio') }),
        }),
        createMenuItem({
          onClick: () => { opts.onImportGraph(); menu.close(); },
          children: createListItemText({ children: t('importGraph') }),
        }),
        createMenuItem({
          onClick: () => { opts.onImportMermaid(); menu.close(); },
          children: createListItemText({ children: t('importMermaid') }),
        }),
      ],
    });
  };

  // -------------------------------------------------------------------
  // update() — React re-render 相当
  // -------------------------------------------------------------------
  const update = (patch: Readonly<ToolBarPatch>): void => {
    // tool
    if (patch.tool !== undefined && patch.tool !== currentTool) {
      currentTool = patch.tool;
      if (isShapeTool(currentTool)) {
        lastShape = currentTool as ShapeToolType;
        refreshShapeIcon();
        shapeBtn.el.setAttribute('aria-label', t(lastShape));
      }
      toolGroup.setValue(isShapeSelected() ? lastShape : currentTool);
    }

    // canUndo / canRedo
    if (patch.canUndo !== undefined && patch.canUndo !== currentCanUndo) {
      currentCanUndo = patch.canUndo;
      undoBtn.disabled = !currentCanUndo;
    }
    if (patch.canRedo !== undefined && patch.canRedo !== currentCanRedo) {
      currentCanRedo = patch.canRedo;
      redoBtn.disabled = !currentCanRedo;
    }

    // scale
    if (patch.scale !== undefined && patch.scale !== currentScale) {
      currentScale = patch.scale;
      zoomLabel.textContent = `${Math.round(currentScale * 100)}%`;
    }

    // saveStatus
    if (patch.saveStatus !== undefined && patch.saveStatus !== currentSaveStatus) {
      currentSaveStatus = patch.saveStatus;
      applySaveStatus(currentSaveStatus);
    }

    // showGrid
    if (patch.showGrid !== undefined && patch.showGrid !== currentShowGrid) {
      currentShowGrid = patch.showGrid;
      gridBtn.style.color = currentShowGrid ? colors.accentColor : '';
    }

    // filterActive
    if (patch.filterActive !== undefined && patch.filterActive !== currentFilterActive) {
      currentFilterActive = patch.filterActive;
      filterBtn.style.color = currentFilterActive ? colors.accentColor : '';
    }

    // selectionCount
    if (patch.selectionCount !== undefined && patch.selectionCount !== currentSelectionCount) {
      currentSelectionCount = patch.selectionCount;
      alignBtn.disabled = currentSelectionCount < 2;
    }

    // layoutRunning
    if (patch.layoutRunning !== undefined && patch.layoutRunning !== currentLayoutRunning) {
      currentLayoutRunning = patch.layoutRunning;
      autoLayoutBtn.disabled = currentLayoutRunning;
      algoBtn.disabled = currentLayoutRunning;
      // swap spinner ↔ icon
      autoLayoutBtn.innerHTML = '';
      if (currentLayoutRunning) {
        autoLayoutBtn.appendChild(createCircularProgress({ size: 18 }));
      } else {
        autoLayoutBtn.appendChild(createAccountTreeIcon({ fontSize: 'small' }));
      }
    }

    // collisionEnabled
    if (patch.collisionEnabled !== undefined && patch.collisionEnabled !== currentCollisionEnabled) {
      currentCollisionEnabled = patch.collisionEnabled;
      collisionBtn.style.color = currentCollisionEnabled ? colors.accentColor : 'inherit';
      collisionBtn.style.backgroundColor = currentCollisionEnabled ? `${colors.accentColor}1F` : 'transparent';
    }

    // layoutAlgorithm
    if (patch.layoutAlgorithm !== undefined && patch.layoutAlgorithm !== currentLayoutAlgorithm) {
      currentLayoutAlgorithm = patch.layoutAlgorithm;
      algoBtnText.textContent = LAYOUT_LABEL_MAP[currentLayoutAlgorithm];
    }
  };

  // -------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------
  const destroy = (): void => {
    for (const tt of tooltips) tt.destroy();
    tooltips.length = 0;
    toolGroup.destroy();
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    header.remove();
  };

  return { el: header, update, destroy };
}
