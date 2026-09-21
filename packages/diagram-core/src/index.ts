/**
 * 系図（ダイアグラム）の描画・編集に要る純ロジック。DOM もフレームワークも参照しない。
 *
 * 画面（`@anytime-markdown/diagram-viewer`）・拡張（`anytime-diagram`）・MCP サーバー
 * （`@anytime-markdown/mcp-diagram`）が同じ実装を読むことで、「画面で見た図」と「保存された図」
 * と「MCP が書いた図」が食い違わないようにする。
 */

export {
  DIAGRAM_RELATIONS,
  EMPTY_DIAGRAM_LAYOUT,
  type DiagramDocument,
  type DiagramFamily,
  type DiagramGroupAxis,
  type DiagramLayout,
  type DiagramPlacement,
  type DiagramRelation,
  type DiagramSpacing,
} from './types';

export {
  COORDINATE_LIMIT,
  DEFAULT_DIAGRAM_SPACING,
  DIAGRAM_MARGIN,
  DIAGRAM_SPACING_RANGE,
  cellFromPoint,
  cellKey,
  cellLimit,
  cellPosition,
  columnPitch,
  isDefaultDiagramSpacing,
  isPlaceableCoordinate,
  readDiagramSpacing,
  resizedSpacing,
  rowPitch,
} from './spacing';

export {
  MAX_PLACEMENTS_PER_DIAGRAM,
  createEmptyDiagramDocument,
  diagramPeople,
  isEmptyLayout,
  parseDiagramDocument,
  parseDiagramFile,
  parseDiagramFileStrict,
  readDiagramLayout,
  serializeDiagramDocument,
  validateDiagramLayout,
} from './document';

export {
  applyDiagramPlacements,
  applyDiagramSpacing,
  diagramChart,
  familyConnector,
  layoutDiagram,
  type AutomaticChart,
  type ChartEdge,
  type ChartNode,
  type ConnectorPoint,
  type PlacedChart,
} from './layout';

export {
  GUTTER_ICON_PX,
  MAX_GRID_CELLS,
  NO_SHIFT,
  columnBoundaryX,
  columnCentreX,
  fittingShift,
  freeCellsPath,
  gridBounds,
  gridExtent,
  gridLineEdits,
  gridLineOccupant,
  insertGridLine,
  isNoShift,
  nearestCell,
  nearestFreeCell,
  nudgeCell,
  nudgeShift,
  paintableExtent,
  removeGridLine,
  rowBoundaryY,
  rowCentreY,
  shiftCell,
  visibleGutterIndices,
  type GridAxis,
  type GridCell,
  type GridExtent,
  type GridLineEdits,
  type GridShift,
} from './grid';

export {
  MAX_SCALE,
  MIN_SCALE,
  SPACING_EDITABLE,
  chartPoint,
  editableSpacingKeys,
  fitChart,
  placementFromDrag,
  resizeFromDrag,
  zoomAt,
  type ChartView,
} from './view';
