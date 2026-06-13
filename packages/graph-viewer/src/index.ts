// vanilla mount API（脱React: React GraphEditor の置換）
export {
  mountVanillaGraphEditor,
  type MountGraphEditorOptions,
  type GraphEditorHandle,
} from './host/mountVanillaGraphEditor';
export type { PersistenceAdapter, SaveStatus } from './types/persistence';
export { enMessages as messagesEn, jaMessages as messagesJa } from './i18n';
export type { GraphMessages } from './i18n';
// React 非依存 translator（consumer がラベル等に使う場合）
export { createGraphT, type GraphT } from './i18n/createGraphT';
