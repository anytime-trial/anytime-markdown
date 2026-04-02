export interface TrailStyleEntry {
  readonly selector: string;
  readonly style: Record<string, unknown>;
}

const NODE_COLORS: Record<string, { bg: string; border: string }> = {
  file:      { bg: '#6272a4', border: '#4a5a8a' },
  class:     { bg: '#8be9fd', border: '#5ac8db' },
  interface: { bg: '#8be9fd', border: '#5ac8db' },
  function:  { bg: '#f1fa8c', border: '#c8d96c' },
  variable:  { bg: '#bd93f9', border: '#9b71d7' },
  type:      { bg: '#ff79c6', border: '#d75fa6' },
  enum:      { bg: '#ffb86c', border: '#d9964a' },
  namespace: { bg: '#44475a', border: '#6272a4' },
};

const EDGE_COLORS: Record<string, { color: string; style: string; width: number }> = {
  import:         { color: '#6272a4', style: 'solid',  width: 2 },
  call:           { color: '#f1fa8c', style: 'solid',  width: 2 },
  type_use:       { color: '#8be9fd', style: 'dashed', width: 2 },
  inheritance:    { color: '#50fa7b', style: 'solid',  width: 3 },
  implementation: { color: '#50fa7b', style: 'dashed', width: 2 },
  override:       { color: '#ff79c6', style: 'dotted', width: 2 },
};

export function getTrailStylesheet(): TrailStyleEntry[] {
  const styles: TrailStyleEntry[] = [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        color: '#f8f8f2',
        'font-size': 12,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'text-max-width': '100px',
        width: 40,
        height: 40,
      },
    },
    {
      selector: 'edge',
      style: {
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
      },
    },
    {
      selector: ':selected',
      style: {
        'background-color': '#ff79c6',
        'line-color': '#ff79c6',
        'target-arrow-color': '#ff79c6',
      },
    },
  ];

  for (const [type, colors] of Object.entries(NODE_COLORS)) {
    styles.push({
      selector: `node[type="${type}"]`,
      style: {
        'background-color': colors.bg,
        'border-color': colors.border,
        'border-width': 2,
      },
    });
  }

  for (const [type, config] of Object.entries(EDGE_COLORS)) {
    styles.push({
      selector: `edge[type="${type}"]`,
      style: {
        'line-color': config.color,
        'target-arrow-color': config.color,
        'line-style': config.style,
        width: config.width,
      },
    });
  }

  return styles;
}
