import type { C4TreeNode, DocLink } from '@anytime-markdown/c4-kernel';
import type { Action } from '@anytime-markdown/graph-core/state';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import CodeIcon from '@mui/icons-material/Code';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExtensionIcon from '@mui/icons-material/Extension';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import PersonIcon from '@mui/icons-material/Person';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import DescriptionIcon from '@mui/icons-material/Description';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { Dispatch, FC } from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { getC4Colors } from '../c4Theme';

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

/** チェックボックス表示対象かどうか */
function isCheckableType(type: C4TreeNode['type']): boolean {
  return type === 'container' || type === 'containerDb' || type === 'component';
}

/** ツリーからチェック対象ノードのIDを再帰的に収集 */
function collectCheckableIds(nodes: readonly C4TreeNode[]): Set<string> {
  const ids = new Set<string>();
  function walk(list: readonly C4TreeNode[]): void {
    for (const n of list) {
      if (isCheckableType(n.type)) ids.add(n.id);
      if (n.children.length > 0) walk(n.children);
    }
  }
  walk(nodes);
  return ids;
}

/** 指定ノードの配下にあるチェック対象IDを収集 */
function collectDescendantCheckableIds(node: C4TreeNode): Set<string> {
  const ids = new Set<string>();
  function walk(list: readonly C4TreeNode[]): void {
    for (const n of list) {
      if (isCheckableType(n.type)) ids.add(n.id);
      if (n.children.length > 0) walk(n.children);
    }
  }
  walk(node.children);
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
  readonly onRemove?: (id: string) => void;
}

const TreeNodeItem: FC<TreeNodeItemProps> = memo(({ node, depth, selectedId, onSelect, expanded, onToggle, checkedIds, onCheck, onRemove }) => {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = node.id === selectedId;
  const isCheckable = isCheckableType(node.type);
  const isChecked = checkedIds.has(node.id);
  const isDeleted = node.deleted === true;

  // 配下のチェック対象が一部だけONの場合 indeterminate
  const isIndeterminate = isChecked && hasChildren && (() => {
    const descIds = collectDescendantCheckableIds(node);
    if (descIds.size === 0) return false;
    let checkedCount = 0;
    for (const cid of descIds) {
      if (checkedIds.has(cid)) checkedCount++;
    }
    return checkedCount > 0 && checkedCount < descIds.size;
  })();

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

  const handleRemoveClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.(node.id);
  }, [node.id, onRemove]);

  return (
    <>
      <ListItemButton
        selected={isSelected}
        onClick={handleRowClick}
        sx={{
          py: 0.25,
          pl: 1 + depth * (INDENT_PX / 8),
          minHeight: 28,
          ...(isDeleted ? { opacity: 0.5 } : {}),
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
        {isCheckable && (
          <Checkbox
            size="small"
            checked={isChecked}
            indeterminate={isIndeterminate}
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
            sx: isDeleted ? { textDecoration: 'line-through' } : undefined,
          }}
        />
        {isDeleted && onRemove && (
          <Tooltip title="Remove deleted element" placement="right">
            <IconButton
              size="small"
              onClick={handleRemoveClick}
              sx={{ p: 0.25, color: 'text.secondary', '&:hover': { color: 'error.main' } }}
            >
              <DeleteIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
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
                onRemove={onRemove}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
});
TreeNodeItem.displayName = 'TreeNodeItem';

// ---------------------------------------------------------------------------
//  Documents section
// ---------------------------------------------------------------------------

/** c4Scope がターゲット要素IDに一致するか（完全一致 or 子パス前方一致） */
function matchesScope(docScope: readonly string[], elementId: string): boolean {
  return docScope.some(s => s === elementId || s.startsWith(elementId + '/'));
}

const TYPE_COLORS: Record<string, string> = {
  spec: '#4FC3F7',
  tech: '#81C784',
  plan: '#FFB74D',
  review: '#CE93D8',
  report: '#F48FB1',
  test: '#A5D6A7',
  manual: '#90A4AE',
};

interface DocLinksSectionProps {
  readonly isDark?: boolean;
  readonly docLinks: readonly DocLink[];
  readonly selectedId: string | null;
  readonly onDocLinkClick?: (doc: DocLink) => void;
}

const DocLinksSection: FC<DocLinksSectionProps> = memo(({ docLinks, selectedId, onDocLinkClick, isDark }) => {
  const colors = useMemo(() => getC4Colors(isDark ?? true), [isDark]);
  const matched = useMemo(() => {
    if (!selectedId || docLinks.length === 0) return [];
    return docLinks.filter(d => matchesScope(d.c4Scope, selectedId));
  }, [docLinks, selectedId]);

  return (
    <>
      <Divider sx={{ borderColor: colors.border }} />
      <Box sx={{
        px: 1,
        py: 0.25,
        borderBottom: `1px solid ${colors.border}`,
        minHeight: 32,
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <DescriptionIcon sx={{ fontSize: 14, mr: 0.5, color: colors.textSecondary }} />
        <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.7rem' }}>
          Documents
        </Typography>
      </Box>
      {!selectedId ? (
        <Typography variant="caption" sx={{ px: 1.5, py: 1, color: colors.textMuted, fontSize: '0.7rem' }}>
          Select an element
        </Typography>
      ) : matched.length === 0 ? (
        <Typography variant="caption" sx={{ px: 1.5, py: 1, color: colors.textMuted, fontSize: '0.7rem' }}>
          No linked documents
        </Typography>
      ) : (
        <List dense disablePadding sx={{ overflowY: 'auto' }}>
          {matched.map(doc => (
            <ListItemButton
              key={doc.path}
              onClick={() => onDocLinkClick?.(doc)}
              sx={{ py: 0.25, pl: 1.5, minHeight: 28 }}
            >
              <Chip
                label={doc.type}
                size="small"
                sx={{
                  height: 16,
                  fontSize: '0.6rem',
                  mr: 0.75,
                  bgcolor: TYPE_COLORS[doc.type] ?? '#757575',
                  color: '#000',
                  '& .MuiChip-label': { px: 0.5 },
                }}
              />
              <ListItemText
                primary={doc.title}
                primaryTypographyProps={{
                  variant: 'body2',
                  noWrap: true,
                  fontSize: '0.75rem',
                }}
              />
            </ListItemButton>
          ))}
        </List>
      )}
    </>
  );
});
DocLinksSection.displayName = 'DocLinksSection';

// ---------------------------------------------------------------------------

interface C4ElementTreeProps {
  readonly tree: readonly C4TreeNode[];
  readonly dispatch: Dispatch<Action>;
  readonly onSelect?: (id: string) => void;
  readonly onCheckedChange?: (checkedIds: ReadonlySet<string>) => void;
  readonly onRemoveElement?: (id: string) => void;
  readonly onPurgeDeleted?: () => void;
  readonly docLinks?: readonly DocLink[];
  readonly onDocLinkClick?: (doc: DocLink) => void;
  readonly isDark?: boolean;
}

export const C4ElementTree: FC<C4ElementTreeProps> = memo(({ tree, dispatch, onSelect, onCheckedChange, onRemoveElement, onPurgeDeleted, docLinks, onDocLinkClick, isDark }) => {
  const colors = useMemo(() => getC4Colors(isDark ?? true), [isDark]);
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
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(() => collectCheckableIds(tree));

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

  // ツリーノードをIDで引けるマップ + 親IDマップ
  const { nodeById, parentOf } = useMemo(() => {
    const nMap = new Map<string, C4TreeNode>();
    const pMap = new Map<string, string>();
    function walk(list: readonly C4TreeNode[], parentId?: string): void {
      for (const n of list) {
        nMap.set(n.id, n);
        if (parentId) pMap.set(n.id, parentId);
        if (n.children.length > 0) walk(n.children, n.id);
      }
    }
    walk(tree);
    return { nodeById: nMap, parentOf: pMap };
  }, [tree]);

  const handleCheck = useCallback((id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      const turning = !next.has(id);
      if (turning) {
        next.add(id);
      } else {
        next.delete(id);
      }
      // 子のチェック対象を連動
      const node = nodeById.get(id);
      if (node) {
        const childIds = collectDescendantCheckableIds(node);
        for (const cid of childIds) {
          if (turning) {
            next.add(cid);
          } else {
            next.delete(cid);
          }
        }
      }
      // 子ON → 祖先もON
      if (turning) {
        let cur = parentOf.get(id);
        while (cur) {
          const pNode = nodeById.get(cur);
          if (pNode && isCheckableType(pNode.type)) {
            next.add(cur);
          }
          cur = parentOf.get(cur);
        }
      }
      return next;
    });
  }, [nodeById, parentOf]);

  const hasDeletedElements = useMemo(() => {
    function hasDeleted(nodes: readonly C4TreeNode[]): boolean {
      for (const n of nodes) {
        if (n.deleted) return true;
        if (n.children.length > 0 && hasDeleted(n.children)) return true;
      }
      return false;
    }
    return hasDeleted(tree);
  }, [tree]);

  const allPackageIds = useMemo(() => collectCheckableIds(tree), [tree]);
  const allChecked = allPackageIds.size > 0 && allPackageIds.size === [...allPackageIds].filter(id => checkedIds.has(id)).length;

  const handleCheckAll = useCallback(() => {
    setCheckedIds(allChecked ? new Set<string>() : new Set(allPackageIds));
  }, [allChecked, allPackageIds]);

  // checkedIds の変更を親に通知（useEffect で render 後に実行）
  useEffect(() => {
    onCheckedChange?.(checkedIds);
  }, [checkedIds, onCheckedChange]);

  return (
    <Box
      sx={{
        width: 260,
        bgcolor: colors.bgSecondary,
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
        borderBottom: `1px solid ${colors.border}`,
        minHeight: 32,
        flexShrink: 0,
      }}>
        <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.7rem', flex: 1 }}>
          Elements
        </Typography>
        {hasDeletedElements && onPurgeDeleted && (
          <Tooltip title="Remove all deleted elements" placement="left">
            <IconButton
              size="small"
              onClick={onPurgeDeleted}
              aria-label="Remove all deleted elements"
              sx={{ color: 'text.secondary', p: 0.25, '&:hover': { color: 'error.main' } }}
            >
              <DeleteSweepIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={allChecked ? 'Uncheck all' : 'Check all'} placement="left">
          <IconButton
            size="small"
            onClick={handleCheckAll}
            aria-label={allChecked ? 'Uncheck all packages' : 'Check all packages'}
            sx={{ color: colors.accent, p: 0.25 }}
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
            onRemove={onRemoveElement}
          />
        ))}
      </List>
      {docLinks && docLinks.length > 0 && (
        <DocLinksSection
          docLinks={docLinks}
          selectedId={selectedId}
          onDocLinkClick={onDocLinkClick}
          isDark={isDark}
        />
      )}
    </Box>
  );
});
C4ElementTree.displayName = 'C4ElementTree';
