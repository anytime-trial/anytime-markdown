/**
 * 系図（ダイアグラム）の描画・編集に要る純ロジック。DOM もフレームワークも参照しない。
 *
 * 画面（`@anytime-markdown/diagram-viewer`）・拡張（`anytime-diagram`）・MCP サーバー
 * （`@anytime-markdown/mcp-diagram`）が同じ実装を読むことで、「画面で見た図」と「保存された図」
 * と「MCP が書いた図」が食い違わないようにする。
 */

export {
  createEmptyDiagramDocument,
  diagramPeople,
  isEmptyLayout,
  MAX_PLACEMENTS_PER_DIAGRAM,
  parseDiagramDocument,
  parseDiagramFile,
  parseDiagramFileStrict,
  readDiagramLayout,
  serializeDiagramDocument,
  validateDiagramLayout,
} from './document';
export {
  columnBoundaryX,
  columnCentreX,
  fittingShift,
  freeCellsPath,
  type GridAxis,
  gridBounds,
  type GridCell,
  type GridExtent,
  gridExtent,
  type GridLineEdits,
  gridLineEdits,
  gridLineOccupant,
  type GridShift,
  GUTTER_ICON_PX,
  insertGridLine,
  isNoShift,
  MAX_GRID_CELLS,
  nearestCell,
  nearestFreeCell,
  NO_SHIFT,
  nudgeCell,
  nudgeShift,
  paintableExtent,
  removeGridLine,
  rowBoundaryY,
  rowCentreY,
  shiftCell,
  visibleGutterIndices,
} from './grid';
export {
  applyDiagramPlacements,
  applyDiagramSpacing,
  type AutomaticChart,
  type ChartEdge,
  type ChartNode,
  type ConnectorPoint,
  diagramChart,
  familyConnector,
  layoutDiagram,
  type PlacedChart,
} from './layout';
export {
  cellFromPoint,
  cellKey,
  cellLimit,
  cellPosition,
  columnPitch,
  COORDINATE_LIMIT,
  DEFAULT_DIAGRAM_SPACING,
  DIAGRAM_MARGIN,
  DIAGRAM_SPACING_RANGE,
  isDefaultDiagramSpacing,
  isPlaceableCoordinate,
  readDiagramSpacing,
  resizedSpacing,
  rowPitch,
} from './spacing';
export {
  DIAGRAM_RELATIONS,
  type DiagramDocument,
  type DiagramFamily,
  type DiagramGroupAxis,
  type DiagramLayout,
  type DiagramPlacement,
  type DiagramRelation,
  type DiagramSpacing,
  EMPTY_DIAGRAM_LAYOUT,
} from './types';
export {
  chartPoint,
  type ChartView,
  editableSpacingKeys,
  fitChart,
  MAX_SCALE,
  MIN_SCALE,
  placementFromDrag,
  resizeFromDrag,
  SPACING_EDITABLE,
  zoomAt,
} from './view';
