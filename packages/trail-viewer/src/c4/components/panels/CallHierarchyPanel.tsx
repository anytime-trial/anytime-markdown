import * as React from 'react';
import {
  Box,
  Checkbox,
  CircularProgress,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LinkIcon from '@mui/icons-material/Link';
import SyncProblemIcon from '@mui/icons-material/SyncProblem';
import {
  buildHierarchyTreeData,
  replaceItemChildren,
  type ApiHierarchyNode,
  type HierarchyLabelDecorations,
  type HierarchyTreeItem,
} from './buildHierarchyTreeData';
import { flattenTree, type FlatRow } from './flattenTree';
import { computeVisibleRange } from './computeVisibleRange';

type Direction = 'callers' | 'callees';
type Scope = 'project' | 'package' | 'file';

const ROW_HEIGHT = 24;
const ROW_OVERSCAN = 10;

export interface CallHierarchyRootFunction {
  readonly filePath: string;
  readonly fnName: string;
  readonly startLine?: number;
}

export interface CallHierarchyPanelProps {
  readonly rootFunction: CallHierarchyRootFunction | null;
  readonly apiBaseUrl: string;
  readonly t: (key: string) => string;
  readonly isDark?: boolean;
}

interface FetchState {
  readonly tree: HierarchyTreeItem | null;
  readonly loading: boolean;
  readonly error: string | null;
}

const INITIAL_FETCH_STATE: FetchState = { tree: null, loading: false, error: null };

async function fetchHierarchy(
  apiBaseUrl: string,
  root: CallHierarchyRootFunction,
  direction: Direction,
  depth: number,
  scope: Scope,
  excludeTests: boolean,
  signal: AbortSignal,
): Promise<ApiHierarchyNode> {
  const params = new URLSearchParams({
    file: root.filePath,
    fn: root.fnName,
    direction,
    depth: String(depth),
    scope,
  });
  if (excludeTests) params.set('excludeTests', 'true');
  if (typeof root.startLine === 'number') {
    params.set('line', String(root.startLine));
  }
  const url = `${apiBaseUrl.replace(/\/$/, '')}/api/c4/call-hierarchy?${params.toString()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as ApiHierarchyNode;
}

function stripDecoration(label: string, decorations: HierarchyLabelDecorations): string {
  if (label.endsWith(decorations.cycleLabel)) {
    return label.slice(0, -decorations.cycleLabel.length).trimEnd();
  }
  if (label.endsWith(decorations.revisitedLabel)) {
    return label.slice(0, -decorations.revisitedLabel.length).trimEnd();
  }
  return label;
}

export const CallHierarchyPanel: React.FC<CallHierarchyPanelProps> = ({
  rootFunction,
  apiBaseUrl,
  t,
  isDark,
}) => {
  const theme = useTheme();
  const dark = isDark ?? theme.palette.mode === 'dark';
  const [direction, setDirection] = React.useState<Direction>('callees');
  const [scope, setScope] = React.useState<Scope>('project');
  const [excludeTests, setExcludeTests] = React.useState(false);
  const [state, setState] = React.useState<FetchState>(INITIAL_FETCH_STATE);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [loadingChildren, setLoadingChildren] = React.useState<Set<string>>(new Set());

  // 仮想化用の scroll/viewport state
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [clientHeight, setClientHeight] = React.useState(0);

  const decorations = React.useMemo<HierarchyLabelDecorations>(
    () => ({
      cycleLabel: t('c4.callHierarchy.cycle'),
      revisitedLabel: t('c4.callHierarchy.revisited'),
    }),
    [t],
  );

  React.useEffect(() => {
    if (!rootFunction) {
      setState(INITIAL_FETCH_STATE);
      setExpanded(new Set());
      return;
    }
    const controller = new AbortController();
    setState({ tree: null, loading: true, error: null });
    setExpanded(new Set());
    fetchHierarchy(apiBaseUrl, rootFunction, direction, 1, scope, excludeTests, controller.signal)
      .then(api => {
        const tree = buildHierarchyTreeData(api, decorations);
        setState({ tree, loading: false, error: null });
        setExpanded(new Set([tree.id]));
      })
      .catch(err => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ tree: null, loading: false, error: err instanceof Error ? err.message : String(err) });
      });
    return () => controller.abort();
  }, [rootFunction, apiBaseUrl, direction, scope, excludeTests, decorations]);

  // scroll コンテナの clientHeight を監視
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setClientHeight(el.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setClientHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [state.tree]);

  const handleToggle = React.useCallback(
    async (item: HierarchyTreeItem) => {
      if (item.cycle || item.revisited) return;
      const next = new Set(expanded);
      const isOpen = next.has(item.id);
      if (isOpen) {
        next.delete(item.id);
        setExpanded(next);
        return;
      }
      next.add(item.id);
      setExpanded(next);

      if (item.children.length > 0 || !rootFunction || !state.tree) return;
      if (loadingChildren.has(item.id)) return;

      const childRoot: CallHierarchyRootFunction = {
        filePath: item.filePath,
        fnName: stripDecoration(item.label, decorations),
        startLine: item.line,
      };

      setLoadingChildren(prev => new Set(prev).add(item.id));
      const controller = new AbortController();
      try {
        const api = await fetchHierarchy(
          apiBaseUrl,
          childRoot,
          direction,
          1,
          scope,
          excludeTests,
          controller.signal,
        );
        const fresh = buildHierarchyTreeData(api, decorations);
        setState(prev => {
          if (!prev.tree) return prev;
          const tree = replaceItemChildren(prev.tree, item.id, fresh.children);
          return { ...prev, tree };
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setExpanded(prev => {
          const after = new Set(prev);
          after.delete(item.id);
          return after;
        });
      } finally {
        setLoadingChildren(prev => {
          const after = new Set(prev);
          after.delete(item.id);
          return after;
        });
      }
    },
    [apiBaseUrl, decorations, direction, excludeTests, expanded, loadingChildren, rootFunction, scope, state.tree],
  );

  // フラット化 + visible 範囲算出
  const flatRows: readonly FlatRow[] = React.useMemo(() => {
    if (!state.tree) return [];
    return flattenTree(state.tree, expanded);
  }, [state.tree, expanded]);

  const [startIndex, endIndex] = React.useMemo(
    () => computeVisibleRange(scrollTop, clientHeight, ROW_HEIGHT, flatRows.length, ROW_OVERSCAN),
    [scrollTop, clientHeight, flatRows.length],
  );

  if (!rootFunction) {
    return (
      <Box
        sx={{
          p: 3,
          color: theme.palette.text.secondary,
          textAlign: 'center',
          fontSize: '0.85rem',
        }}
      >
        {t('c4.callHierarchy.empty')}
      </Box>
    );
  }

  const revisitedTooltip = t('c4.callHierarchy.revisited');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ px: 2, py: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography variant="subtitle2" sx={{ color: theme.palette.text.primary, fontWeight: 700 }}>
          {rootFunction.fnName}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: theme.palette.text.secondary, fontSize: '0.72rem' }}
        >
          {rootFunction.filePath}
          {typeof rootFunction.startLine === 'number' ? `:${rootFunction.startLine}` : ''}
        </Typography>
      </Box>
      <Box
        sx={{
          px: 2,
          py: 0.75,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="call-hierarchy-scope-label" sx={{ fontSize: '0.72rem' }}>
            {t('c4.callHierarchy.scope')}
          </InputLabel>
          <Select
            labelId="call-hierarchy-scope-label"
            label={t('c4.callHierarchy.scope')}
            value={scope}
            onChange={e => setScope(e.target.value as Scope)}
            sx={{ fontSize: '0.78rem', '& .MuiSelect-select': { py: 0.5 } }}
          >
            <MenuItem value="project" sx={{ fontSize: '0.78rem' }}>
              {t('c4.callHierarchy.scope.project')}
            </MenuItem>
            <MenuItem value="package" sx={{ fontSize: '0.78rem' }}>
              {t('c4.callHierarchy.scope.package')}
            </MenuItem>
            <MenuItem value="file" sx={{ fontSize: '0.78rem' }}>
              {t('c4.callHierarchy.scope.file')}
            </MenuItem>
          </Select>
        </FormControl>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={excludeTests}
              onChange={e => setExcludeTests(e.target.checked)}
            />
          }
          label={
            <Typography sx={{ fontSize: '0.78rem' }}>
              {t('c4.callHierarchy.excludeTests')}
            </Typography>
          }
        />
      </Box>
      <Tabs
        value={direction}
        onChange={(_, v: Direction) => setDirection(v)}
        sx={{ borderBottom: `1px solid ${theme.palette.divider}`, minHeight: 36 }}
      >
        <Tab
          value="callees"
          label={t('c4.callHierarchy.tab.callees')}
          sx={{ minHeight: 36, fontSize: '0.78rem' }}
        />
        <Tab
          value="callers"
          label={t('c4.callHierarchy.tab.callers')}
          sx={{ minHeight: 36, fontSize: '0.78rem' }}
        />
      </Tabs>
      <Box
        ref={scrollRef}
        onScroll={e => setScrollTop((e.target as HTMLElement).scrollTop)}
        sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}
      >
        {state.loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2 }}>
            <CircularProgress size={14} />
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
              {t('c4.callHierarchy.loading')}
            </Typography>
          </Box>
        )}
        {state.error && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2 }}>
            <SyncProblemIcon fontSize="small" sx={{ color: theme.palette.error.main }} />
            <Typography variant="body2" sx={{ color: theme.palette.error.main }}>
              {t('c4.callHierarchy.error')}: {state.error}
            </Typography>
          </Box>
        )}
        {!state.loading && !state.error && state.tree && (
          <Box sx={{ position: 'relative' }}>
            {/* 上部スペーサ: visible 範囲より上のノード分の高さを確保 */}
            <Box sx={{ height: startIndex * ROW_HEIGHT }} />
            {flatRows.slice(startIndex, endIndex).map(row => (
              <VirtualRow
                key={row.item.id}
                row={row}
                expanded={expanded}
                loadingChildren={loadingChildren}
                onToggle={handleToggle}
                isDark={dark}
                revisitedTooltip={revisitedTooltip}
              />
            ))}
            {/* 下部スペーサ */}
            <Box sx={{ height: Math.max(0, (flatRows.length - endIndex) * ROW_HEIGHT) }} />
          </Box>
        )}
      </Box>
    </Box>
  );
};

interface VirtualRowProps {
  readonly row: FlatRow;
  readonly expanded: ReadonlySet<string>;
  readonly loadingChildren: ReadonlySet<string>;
  readonly onToggle: (item: HierarchyTreeItem) => void;
  readonly isDark: boolean;
  readonly revisitedTooltip: string;
}

const VirtualRow: React.FC<VirtualRowProps> = ({
  row,
  expanded,
  loadingChildren,
  onToggle,
  isDark,
  revisitedTooltip,
}) => {
  const theme = useTheme();
  const { item, level, hasChildren } = row;
  const isOpen = expanded.has(item.id);
  const isLoading = loadingChildren.has(item.id);
  const canHaveChildren = !item.cycle && !item.revisited;
  const hoverBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(31,30,28,0.04)';

  const labelColor = item.cycle
    ? theme.palette.warning.main
    : item.revisited
      ? theme.palette.text.disabled
      : theme.palette.text.primary;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        height: ROW_HEIGHT,
        pl: 0.5 + level * 1.5,
        pr: 1,
        cursor: canHaveChildren ? 'pointer' : 'default',
        '&:hover': canHaveChildren ? { bgcolor: hoverBg } : {},
      }}
      onClick={() => canHaveChildren && onToggle(item)}
    >
      {item.revisited ? (
        <Tooltip title={revisitedTooltip} arrow placement="top">
          <Box sx={{ display: 'inline-flex', width: 22, justifyContent: 'center' }}>
            <LinkIcon sx={{ fontSize: '0.95rem', color: theme.palette.text.disabled }} />
          </Box>
        </Tooltip>
      ) : canHaveChildren ? (
        <IconButton
          size="small"
          disableRipple
          tabIndex={-1}
          sx={{ p: 0.25, mr: 0.25 }}
          onClick={e => {
            e.stopPropagation();
            onToggle(item);
          }}
        >
          {isLoading ? (
            <CircularProgress size={12} />
          ) : !hasChildren ? (
            <Box sx={{ width: 16 }} />
          ) : isOpen ? (
            <ExpandMoreIcon sx={{ fontSize: '1rem' }} />
          ) : (
            <ChevronRightIcon sx={{ fontSize: '1rem' }} />
          )}
        </IconButton>
      ) : (
        <Box sx={{ width: 22 }} />
      )}
      <Typography
        variant="body2"
        sx={{
          fontSize: '0.8rem',
          color: labelColor,
          fontWeight: level === 0 ? 600 : 400,
          whiteSpace: 'nowrap',
        }}
      >
        {item.label}
      </Typography>
      <Typography
        component="span"
        sx={{
          ml: 1,
          fontSize: '0.72rem',
          color: theme.palette.text.secondary,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {item.secondary}
      </Typography>
    </Box>
  );
};
