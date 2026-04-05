import type { C4TreeNode } from '@anytime-markdown/c4-kernel';
import type { Action } from '../../state/index';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CodeIcon from '@mui/icons-material/Code';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExtensionIcon from '@mui/icons-material/Extension';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import PersonIcon from '@mui/icons-material/Person';
import StorageIcon from '@mui/icons-material/Storage';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import type { Dispatch, FC } from 'react';
import { memo, useCallback, useState } from 'react';

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
    case 'system': return <StorageIcon sx={sx} />;
    case 'container':
    case 'containerDb': return <Inventory2Icon sx={sx} />;
    case 'component': return <ExtensionIcon sx={sx} />;
    case 'code': return <CodeIcon sx={sx} />;
    case 'boundary': return <AccountTreeIcon sx={sx} />;
  }
}

interface TreeNodeItemProps {
  readonly node: C4TreeNode;
  readonly depth: number;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly expanded: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
}

const TreeNodeItem: FC<TreeNodeItemProps> = memo(({ node, depth, selectedId, onSelect, expanded, onToggle }) => {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = node.id === selectedId;

  const handleClick = useCallback(() => {
    if (hasChildren) {
      onToggle(node.id);
    }
    onSelect(node.id);
  }, [hasChildren, node.id, onSelect, onToggle]);

  return (
    <>
      <ListItemButton
        selected={isSelected}
        onClick={handleClick}
        sx={{
          py: 0.25,
          pl: 1 + depth * (INDENT_PX / 8),
          minHeight: 28,
        }}
      >
        {hasChildren ? (
          <ListItemIcon sx={{ minWidth: 20 }}>
            {isOpen
              ? <ExpandMoreIcon sx={{ fontSize: 16 }} />
              : <ChevronRightIcon sx={{ fontSize: 16 }} />}
          </ListItemIcon>
        ) : (
          <Box sx={{ width: 20 }} />
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
}

export const C4ElementTree: FC<C4ElementTreeProps> = memo(({ tree, dispatch, onSelect }) => {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => {
    // デフォルトでルートレベルを展開
    return new Set(tree.map(n => n.id));
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
  }, [dispatch]);

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
          />
        ))}
      </List>
    </Box>
  );
});
C4ElementTree.displayName = 'C4ElementTree';
