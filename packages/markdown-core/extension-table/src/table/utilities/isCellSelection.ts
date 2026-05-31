import { CellSelection } from '@anytime-markdown/markdown-pm/tables'

export function isCellSelection(value: unknown): value is CellSelection {
  return value instanceof CellSelection
}
