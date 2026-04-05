import type { C4TreeNode } from '@anytime-markdown/c4-kernel';
import type { Action } from '@anytime-markdown/graph-core/state';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CodeIcon from '@mui/icons-material/Code';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExtensionIcon from '@mui/icons-material/Extension';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import PersonIcon from '@mui/icons-material/Person';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { Dispatch, FC } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';

/** デザインシステム: チャコール */
const BG_SECONDARY = '#121212';
/** デザインシステム: ボーダー */
const BORDER_COLOR = 'rgba(255,255,255,0.12)';
/** デザインシステム: アイスブルー */
const ACCENT_BLUE = '#90CAF9';

const INDENT_PX = 20;

/** C4要素タイプに対応するアイコン */
function TypeIcon({ type }: Readonly<{ type: C4TreeNode['type'] }>) {
  const sx = { fontSize: 16 };
  switch (type) {
    case 'person': return <PersonIcon sx={sx} />;
    case 'system':
    case 'boundary': return <AccountTreeIcon sx={sx} />;
    case 'container':
    case 'containerDb': return <Inventory2Icon sx={sx} />;
    case 'component': return <ExtensionIcon sx={sx} />;
    case 'code': return <CodeIcon sx={sx} />;
  }
}

/** パッケージ（container）かどうか */
function isPackageType(type: C4TreeNode['type']): boolean {
  return type === 'container' || type === 'containerDb';
}

/** ツリーからパッケージ型ノードのIDを再帰的に収集 */
function collectPackageIds(nodes: readonly C4TreeNode[]): Set<string> {
  const ids = new Set<string>();
  function walk(list: readonly C4TreeNode[]): void {
    for (const n of list) {
      if (isPackageType(n.type)) ids.add(n.id);
      if (n.children.length > 0) walk(n.children);
    }
  }
  walk(nodes);
  return ids;
}

interface TreeNodeItemProps {
  readonly node: C4TreeNode;
  readonly depth: number;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly expanded: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  readonly checkedIds: ReadonlySet<string>;
  readonly onCheck: (id: string) => void;
}

const TreeNodeItem: FC<TreeNodeItemProps> = memo(({ node, depth, selectedId, onSelect, expanded, onToggle, checkedIds, onCheck }) => {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = node.id === selectedId;
  const isPackage = isPackageType(node.type);
  const isChecked = checkedIds.has(node.id);

  const handleRowClick = useCallback(() => {
    onSelect(node.id);
  }, [node.id, onSelect]);

  const handleChevronClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(node.id);
  }, [node.id, onToggle]);

  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onCheck(node.id);
  }, [node.id, onCheck]);

  return (
    <>
      <ListItemButton
        selected={isSelected}
        onClick={handleRowClick}
        sx={{
          py: 0.25,
          pl: 1 + depth * (INDENT_PX / 8),
          minHeight: 28,
        }}
      >
        {hasChildren ? (
          <ListItemIcon
            sx={{ minWidth: 20, cursor: 'pointer' }}
            onClick={handleChevronClick}
          >
            {isOpen
              ? <ExpandMoreIcon sx={{ fontSize: 16 }} />
              : <ChevronRightIcon sx={{ fontSize: 16 }} />}
          </ListItemIcon>
        ) : (
          <Box sx={{ width: 20 }} />
        )}
        {isPackage && (
          <Checkbox
            size="small"
            checked={isChecked}
            onClick={handleCheckboxClick}
            sx={{ p: 0, mr: 0.5, '& .MuiSvgIcon-root': { fontSize: 16 } }}
            inputProps={{ 'aria-label': `Select ${node.name}` }}
          />
        )}
        <ListItemIcon sx={{ minWidth: 24 }}>
          <TypeIcon type={node.type} />
        </ListItemIcon>
        <ListItemText
          primary={node.name}
          primaryTypographyProps={{
            variant: 'body2',
            noWrap: true,
            fontSize: '0.8rem',
            color: node.external ? 'text.secondary' : undefined,
          }}
        />
      </ListItemButton>
      {hasChildren && (
        <Collapse in={isOpen} timeout="auto" unmountOnExit>
          <List dense disablePadding>
            {node.children.map(child => (
              <TreeNodeItem
                key={child.id}
                node={child}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                expanded={expanded}
                onToggle={onToggle}
                checkedIds={checkedIds}
                onCheck={onCheck}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
});
TreeNodeItem.displayName = 'TreeNodeItem';

interface C4ElementTreeProps {
  readonly tree: readonly C4TreeNode[];
  readonly dispatch: Dispatch<Action>;
  readonly onSelect?: (id: string) => void;
  readonly onCheckedChange?: (checkedIds: ReadonlySet<string>) => void;
}

export const C4ElementTree: FC<C4ElementTreeProps> = memo(({ tree, dispatch, onSelect, onCheckedChange }) => {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => {
    // デフォルトでルートレベルと system ノードの直下を展開
    const ids = new Set<string>();
    for (const n of tree) {
      ids.add(n.id);
      if (n.type === 'system' || n.type === 'boundary') {
        for (const child of n.children) {
          ids.add(child.id);
        }
      }
    }
    return ids;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(() => collectPackageIds(tree));

  const handleToggle = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [id], edgeIds: [] } });
    onSelect?.(id);
  }, [dispatch, onSelect]);

  const handleCheck = useCallback((id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      onCheckedChange?.(next);
      return next;
    });
  }, [onCheckedChange]);

  const allPackageIds = useMemo(() => collectPackageIds(tree), [tree]);
  const allChecked = allPackageIds.size > 0 && allPackageIds.size === [...allPackageIds].filter(id => checkedIds.has(id)).length;

  const handleCheckAll = useCallback(() => {
    const next = allChecked ? new Set<string>() : new Set(allPackageIds);
    setCheckedIds(next);
    onCheckedChange?.(next);
  }, [allChecked, allPackageIds, onCheckedChange]);

  return (
    <Box
      sx={{
        width: 260,
        bgcolor: BG_SECONDARY,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        px: 1,
        py: 0.25,
        borderBottom: `1px solid ${BORDER_COLOR}`,
        minHeight: 32,
        flexShrink: 0,
      }}>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', flex: 1 }}>
          Elements
        </Typography>
        <Tooltip title={allChecked ? 'Uncheck all' : 'Check all'} placement="left">
          <IconButton
            size="small"
            onClick={handleCheckAll}
            aria-label={allChecked ? 'Uncheck all packages' : 'Check all packages'}
            sx={{ color: ACCENT_BLUE, p: 0.25 }}
          >
            {allChecked
              ? <CheckBoxIcon sx={{ fontSize: 18 }} />
              : <CheckBoxOutlineBlankIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        </Tooltip>
      </Box>
      <List dense disablePadding sx={{ flex: 1, overflowY: 'auto' }}>
        {tree.map(node => (
          <TreeNodeItem
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedId}
            onSelect={handleSelect}
            expanded={expanded}
            onToggle={handleToggle}
            checkedIds={checkedIds}
            onCheck={handleCheck}
          />
        ))}
      </List>
    </Box>
  );
});
C4ElementTree.displayName = 'C4ElementTree';
