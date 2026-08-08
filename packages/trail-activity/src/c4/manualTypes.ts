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

export interface ManualGroup {
  readonly id: string;
  readonly memberIds: readonly string[];  // C4Element.id への参照
  readonly label?: string;
  readonly updatedAt: string;  // ISO 8601 UTC
}

export interface IManualElementProvider {
  getElements(repoName: string): Promise<readonly ManualElement[]>;
  getRelationships(repoName: string): Promise<readonly ManualRelationship[]>;
  getGroups?(repoName: string): Promise<readonly ManualGroup[]>;
}
