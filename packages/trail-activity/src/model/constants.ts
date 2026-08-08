import type { TrailNodeType, TrailEdgeType } from './types';

export const TRAIL_NODE_TYPES: readonly TrailNodeType[] = [
  'file', 'class', 'interface', 'function',
  'variable', 'type', 'enum', 'namespace',
] as const;

export const TRAIL_EDGE_TYPES: readonly TrailEdgeType[] = [
  'import', 'call', 'type_use',
  'inheritance', 'implementation', 'override',
] as const;
