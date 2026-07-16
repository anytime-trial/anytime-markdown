import type { C4Element, C4ElementType, C4Model } from '@anytime-markdown/trail-core/c4';

const BOUNDARY_TYPES: ReadonlySet<C4ElementType> = new Set(['system', 'container', 'containerDb']);

export interface DrillFrame {
  readonly element: C4Element;
}

export interface ContextMenuCapabilities {
  readonly canDrillDown: boolean;
  readonly canDrillUp: boolean;
  readonly canShowOnlyFrame: boolean;
  readonly canShowSequence: boolean;
  readonly canCopyPath: boolean;
  readonly canOpenFile: boolean;
  readonly canExportToNote: boolean;
  readonly canShowManualActions: boolean;
  readonly showContextMenu: boolean;
}

export interface ComputeContextMenuCapabilitiesArgs {
  readonly c4Model: C4Model | null;
  readonly c4Id: string | null;
  readonly drillStack: ReadonlyArray<DrillFrame>;
  readonly hasShowSequenceHandler: boolean;
  /** 「Agent Note に出力」ハンドラの有無（VS Code 連携時のみ true。Web 単体モードでは項目非表示） */
  readonly hasExportToNoteHandler?: boolean;
  readonly canShowManualContextActions: (model: C4Model | null, c4Id: string | null) => boolean;
  /**
   * 現在表示レベルの leaf タイプ (system / container / component / code)。
   * 指定された場合、target.type と一致するときは boundary 扱いせず drill down を許可する。
   * これにより C1 (system 表示) や C2 (container 表示) でも、可視ノードを起点に drill down できる。
   */
  readonly levelTargetType?: C4ElementType;
}

const EMPTY_CAPABILITIES: ContextMenuCapabilities = {
  canDrillDown: false,
  canDrillUp: false,
  canShowOnlyFrame: false,
  canShowSequence: false,
  canCopyPath: false,
  canOpenFile: false,
  canExportToNote: false,
  canShowManualActions: false,
  showContextMenu: false,
};

export function computeContextMenuCapabilities(
  args: ComputeContextMenuCapabilitiesArgs,
): ContextMenuCapabilities {
  const { c4Model, c4Id, drillStack, hasShowSequenceHandler, canShowManualContextActions, levelTargetType } = args;

  if (c4Id === null) return EMPTY_CAPABILITIES;

  const target = c4Model?.elements.find((e) => e.id === c4Id) ?? null;
  // 現在表示レベルの leaf タイプと一致する型は boundary 扱いせず可視ノードとして drill 可能にする
  const isBoundary = target !== null
    && BOUNDARY_TYPES.has(target.type)
    && target.type !== levelTargetType;

  const canDrillDown = target !== null
    && !isBoundary
    && drillStack.at(-1)?.element.id !== c4Id
    && (c4Model?.elements.some((e) => e.boundaryId === c4Id) ?? false);

  // drillStack の先頭要素（Drill Down 起点）を右クリックした場合も Drill Up を許可する。
  // component 型は BOUNDARY_TYPES に含まれないため isBoundary が false になるが、
  // C3→C4 Drill Down 後の component フレームはここで拾う必要がある。
  const isDrillRoot = drillStack.length > 0 && drillStack.at(-1)?.element.id === c4Id;
  const canDrillUp = (isBoundary || isDrillRoot) && drillStack.length > 0;
  const canShowOnlyFrame = isBoundary;
  const canShowSequence = target?.type === 'component' && hasShowSequenceHandler;
  const canCopyPath = c4Id.startsWith('pkg_') || c4Id.startsWith('file::');
  const canOpenFile = c4Id.startsWith('file::');
  const canExportToNote = target !== null && (args.hasExportToNoteHandler ?? false);
  const canShowManualActionsResult = canShowManualContextActions(c4Model, c4Id);

  const showContextMenu = (
    canDrillDown
    || canDrillUp
    || canShowOnlyFrame
    || canOpenFile
    || canCopyPath
    || canShowSequence
    || canExportToNote
    || canShowManualActionsResult
  );

  return {
    canDrillDown,
    canDrillUp,
    canShowOnlyFrame,
    canShowSequence,
    canCopyPath,
    canOpenFile,
    canExportToNote,
    canShowManualActions: canShowManualActionsResult,
    showContextMenu,
  };
}
