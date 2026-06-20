import { Chip, Tooltip } from '../../ui';

export interface CitationChipProps {
  readonly tag: string; // e.g. "entity:abc123"
  readonly title?: string;
  readonly summary?: string;
  readonly onClick?: (tag: string) => void;
}

export function CitationChip({
  tag,
  title,
  summary,
  onClick,
}: Readonly<CitationChipProps>) {
  const label = title ?? tag;
  return (
    <Tooltip title={summary ?? tag}>
      <Chip
        size="small"
        label={label}
        onClick={() => onClick?.(tag)}
        sx={{ ml: 0.5, mr: 0.5, cursor: onClick ? 'pointer' : 'default' }}
      />
    </Tooltip>
  );
}
