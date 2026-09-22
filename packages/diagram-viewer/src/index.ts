/**
 * Custom Element のクラスと `detail` の型。**登録の副作用はここに載せない** — 登録は
 * `./element`（副作用あり）が持つ。mount API だけを使う宿主へ `customElements.define` を
 * 波及させないため。
 */
export type {
  DiagramDocumentDetail,
  DiagramDraftDetail,
  DiagramElementAnnexDetail,
  DiagramElementSelectDetail,
} from './AnytimeDiagramViewerElement';
export { AnytimeDiagramViewerElement } from './AnytimeDiagramViewerElement';
export { createDiagramT, detectLocale, type DiagramT, resolveLocale, type SupportedLocale } from './i18n';
export type { DiagramModel, FamilyConnector, GridLines } from './model';
export { createAutomaticCache, deriveModel, groupLabelsOf, layoutKey, parentsOf } from './model';
export { mountDiagramViewer } from './mountDiagramViewer';
export { DIAGRAM_ROOT_CLASS, DIAGRAM_STYLES, DIAGRAM_THEME_TOKENS } from './theme/diagramStyles';
export type {
  DiagramElementAnnex,
  DiagramElementAnnexItem,
  DiagramViewerHandle,
  DiagramViewerOptions,
  DiagramViewerUpdate,
} from './types';
