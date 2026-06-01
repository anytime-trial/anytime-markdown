import { TextSelection } from '@anytime-markdown/markdown-pm/state'

export function isTextSelection(value: unknown): value is TextSelection {
  return value instanceof TextSelection
}
