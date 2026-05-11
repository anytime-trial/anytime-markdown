import * as React from 'react';
import {
  Box,
  CircularProgress,
  IconButton,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SyncProblemIcon from '@mui/icons-material/SyncProblem';
import {
  buildHierarchyTreeData,
  findItemById,
  replaceItemChildren,
  type ApiHierarchyNode,
  type HierarchyTreeItem,
} from './buildHierarchyTreeData';

type Direction = 'callers' | 'callees';

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
  signal: AbortSignal,
): Promise<ApiHierarchyNode> {
  const params = new URLSearchParams({
    file: root.filePath,
    fn: root.fnName,
    direction,
    depth: String(depth),
  });
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

export const CallHierarchyPanel: React.FC<CallHierarchyPanelProps> = ({
  rootFunction,
  apiBaseUrl,
  t,
  isDark,
}) => {
  const theme = useTheme();
  const dark = isDark ?? theme.palette.mode === 'dark';
  const [direction, setDirection] = React.useState<Direction>('callees');
  const [state, setState] = React.useState<FetchState>(INITIAL_FETCH_STATE);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [loadingChildren, setLoadingChildren] = React.useState<Set<string>>(new Set());

  const cycleLabel = t('c4.callHierarchy.cycle');

  React.useEffect(() => {
    if (!rootFunction) {
      setState(INITIAL_FETCH_STATE);
      setExpanded(new Set());
      return;
    }
    const controller = new AbortController();
    setState({ tree: null, loading: true, error: null });
    setExpanded(new Set());
    fetchHierarchy(apiBaseUrl, rootFunction, direction, 1, controller.signal)
      .then(api => {
        const tree = buildHierarchyTreeData(api, cycleLabel);
        setState({ tree, loading: false, error: null });
        setExpanded(new Set([tree.id]));
      })
      .catch(err => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ tree: null, loading: false, error: err instanceof Error ? err.message : String(err) });
      });
    return () => controller.abort();
  }, [rootFunction, apiBaseUrl, direction, cycleLabel]);

  const handleToggle = React.useCallback(
    async (item: HierarchyTreeItem) => {
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
        fnName: item.label.endsWith(cycleLabel)
          ? item.label.slice(0, -cycleLabel.length).trimEnd()
          : item.label,
        startLine: item.line,
      };

      setLoadingChildren(prev => new Set(prev).add(item.id));
      const controller = new AbortController();
      try {
        const api = await fetchHierarchy(apiBaseUrl, childRoot, direction, 1, controller.signal);
        const fresh = buildHierarchyTreeData(api, cycleLabel);
        setState(prev => {
          if (!prev.tree) return prev;
          const tree = replaceItemChildren(prev.tree, item.id, fresh.children);
          return { ...prev, tree };
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // 子取得の失敗はパネル全体のエラーにしない: 折りたたみ状態に戻す
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
    [apiBaseUrl, cycleLabel, direction, expanded, loadingChildren, rootFunction, state.tree],
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
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
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
          <TreeNode
            item={state.tree}
            level={0}
            expanded={expanded}
            loadingChildren={loadingChildren}
            onToggle={handleToggle}
            isDark={dark}
            emptyLabel={t('c4.callHierarchy.noChildren')}
          />
        )}
      </Box>
    </Box>
  );
};

interface TreeNodeProps {
  readonly item: HierarchyTreeItem;
  readonly level: number;
  readonly expanded: ReadonlySet<string>;
  readonly loadingChildren: ReadonlySet<string>;
  readonly onToggle: (item: HierarchyTreeItem) => void;
  readonly isDark: boolean;
  readonly emptyLabel: string;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  item,
  level,
  expanded,
  loadingChildren,
  onToggle,
  isDark,
  emptyLabel,
}) => {
  const theme = useTheme();
  const isOpen = expanded.has(item.id);
  const isLoading = loadingChildren.has(item.id);
  const hasRevealed = item.children.length > 0;
  const canHaveChildren = !item.cycle; // cycle ノードは展開不可
  const showCaret = canHaveChildren;
  const hoverBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(31,30,28,0.04)';

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          pl: 0.5 + level * 1.5,
          pr: 1,
          py: 0.25,
          cursor: canHaveChildren ? 'pointer' : 'default',
          '&:hover': canHaveChildren ? { bgcolor: hoverBg } : {},
        }}
        onClick={() => canHaveChildren && onToggle(item)}
      >
        {showCaret ? (
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
            color: item.cycle ? theme.palette.warning.main : theme.palette.text.primary,
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
      {isOpen && hasRevealed &&
        item.children.map(child => (
          <TreeNode
            key={child.id}
            item={child}
            level={level + 1}
            expanded={expanded}
            loadingChildren={loadingChildren}
            onToggle={onToggle}
            isDark={isDark}
            emptyLabel={emptyLabel}
          />
        ))}
      {isOpen && !hasRevealed && !isLoading && canHaveChildren && (
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            pl: 2 + level * 1.5,
            color: theme.palette.text.disabled,
            fontSize: '0.7rem',
            py: 0.25,
          }}
        >
          {emptyLabel}
        </Typography>
      )}
    </Box>
  );
};
