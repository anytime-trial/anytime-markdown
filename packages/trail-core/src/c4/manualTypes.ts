import type { C4ElementType } from './types';

export interface ManualElement {
  readonly id: string;
  readonly type: C4ElementType;
  readonly name: string;
  readonly description?: string;
  readonly external: boolean;
  readonly parentId: string | null;
  readonly updatedAt: string;
  readonly serviceType?: string;
}

export interface ManualRelationship {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly label?: string;
  readonly technology?: string;
  readonly updatedAt: string;
}

export interface IManualElementProvider {
  getElements(repoName: string): Promise<readonly ManualElement[]>;
  getRelationships(repoName: string): Promise<readonly ManualRelationship[]>;
}
