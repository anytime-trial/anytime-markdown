import { NodeSelection } from '@anytime-markdown/markdown-pm/state'

export function isNodeSelection(value: unknown): value is NodeSelection {
  return value instanceof NodeSelection
}
