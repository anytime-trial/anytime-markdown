import type { GraphDocument } from './index';

export type SaveStatus = 'saved' | 'saving' | 'error';

export interface PersistenceAdapter {
  loadInitial: () => Promise<GraphDocument | null> | GraphDocument | null;
  save: (doc: GraphDocument) => void | Promise<void>;
  status: SaveStatus;
}
