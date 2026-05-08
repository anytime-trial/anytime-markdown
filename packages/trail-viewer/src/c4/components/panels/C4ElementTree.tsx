import type { C4ReleaseEntry, C4TreeNode } from '@anytime-markdown/trail-core/c4';
import { findService } from '@anytime-markdown/trail-core/c4/services';
import type { Action } from '@anytime-markdown/graph-core/state';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AddIcon from '@mui/icons-material/Add';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ClearIcon from '@mui/icons-material/Clear';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import CodeIcon from '@mui/icons-material/Code';
import HubIcon from '@mui/icons-material/Hub';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExtensionIcon from '@mui/icons-material/Extension';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import PersonIcon from '@mui/icons-material/Person';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import type { Dispatch, FC } from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import TextField from '@mui/material/TextField';
import { filterTreeBySearch } from '@anytime-markdown/trail-core/c4';
import { useTrailI18n } from '../../../i18n';
import { getC4Colors } from '../../../theme/c4Tokens';
import { getTokens } from '../../../theme/designTokens';
import { communityColor } from '../../../components/communityColors';

const INDENT_PX = 20;
const UNKNOWN_REPO_KEY = '__unknown__';
const CURRENT_RELEASE_TAG = 'current';

/** C4要素タイプに対応するアイコン */
function TypeIcon({ type, serviceType, color }: Readonly<{ type: C4TreeNode['type']; serviceType?: string; color?: string }>) {
  const sx = { fontSize: 16 };

  if (type === 'container' && serviceType) {
    const entry = findService(serviceType);
    if (entry?.iconBody) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${entry.iconViewBox ?? '0 0 24 24'}">${entry.iconBody}</svg>`;
      const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      return <Box component="img" src={dataUri} alt={entry.label} sx={{ width: 16, height: 16, flexShrink: 0 }} />;
    }
    if (entry?.iconPath) {
      return (
        <Box
          component="svg"
          viewBox="0 0 24 24"
          sx={{ width: 16, height: 16, flexShrink: 0, fill: entry.brandColor }}
        >
          <path d={entry.iconPath} />
        </Box>
      );
    }
  }

  switch (type) {
    case 'person': return <PersonIcon sx={sx} />;
    case 'system':
    case 'boundary': return <AccountTreeIcon sx={sx} />;
    case 'container':
    case 'containerDb': return <Inventory2Icon sx={sx} />;
    case 'component': return <ExtensionIcon sx={sx} />;
    case 'code': return <CodeIcon sx={sx} />;
    case 'community': return <HubIcon sx={{ ...sx, color: color ?? 'inherit' }} />;
  }
}

/** チェックボックス表示対象かどうか */
function isCheckableType(type: C4TreeNode['type']): boolean {
  return type === 'system' || type === 'container' || type === 'containerDb' || type === 'component';
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
  return collectCheckableIds(node.children);
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
  readonly hideCheckbox?: boolean;
}

const TreeNodeItem: FC<TreeNodeItemProps> = memo(({ node, depth, selectedId, onSelect, expanded, onToggle, checkedIds, onCheck, onRemove, hideCheckbox }) => {
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
        {isCheckable && !hideCheckbox && (
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
          <TypeIcon
            type={node.type}
            serviceType={node.serviceType}
            color={node.type === 'community' && node.communityId !== undefined ? communityColor(node.communityId) : undefined}
          />
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
                hideCheckbox={hideCheckbox}
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

interface C4ElementTreeProps {
  readonly tree: readonly C4TreeNode[];
  readonly dispatch: Dispatch<Action>;
  readonly onSelect?: (id: string) => void;
  readonly repoOptions?: readonly string[];
  readonly selectedRepo?: string;
  readonly onRepoChange?: (repo: string) => void;
  readonly releaseOptions?: readonly C4ReleaseEntry[];
  readonly selectedRelease?: string;
  readonly onReleaseChange?: (release: string) => void;
  readonly currentLevel?: number;
  readonly selectedSystemId?: string | null;
  readonly onAddElement?: (type: 'person' | 'system' | 'container' | 'component') => void;
  readonly onCheckedChange?: (checkedIds: ReadonlySet<string>) => void;
  readonly onRemoveElement?: (id: string) => void;
  readonly onPurgeDeleted?: () => void;
  readonly isDark?: boolean;
  /** レベル/ドリル変更時に渡すリセット指示。key が変化したらチェック・展開状態をリセットする */
  readonly checkReset?: { readonly key: number; readonly ids: ReadonlySet<string> | null; readonly expanded: ReadonlySet<string> | null };
  readonly communityTree?: readonly C4TreeNode[];
  readonly communityLoading?: boolean;
  readonly onCommunityTabOpen?: () => void;
}

export const C4ElementTree: FC<C4ElementTreeProps> = memo(({ tree, dispatch, onSelect, repoOptions = [], selectedRepo = '', onRepoChange, releaseOptions = [], selectedRelease = CURRENT_RELEASE_TAG, onReleaseChange, currentLevel, selectedSystemId, onAddElement, onCheckedChange, onRemoveElement, onPurgeDeleted, isDark, checkReset, communityTree, communityLoading, onCommunityTabOpen }) => {
  const { t } = useTrailI18n();
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState<0 | 1>(0);
  const hasCommunityTree = (communityTree?.length ?? 0) > 0;

  const filteredTree = useMemo(
    () => filterTreeBySearch(tree, searchText),
    [tree, searchText],
  );

  const filteredCommunityTree = useMemo(
    () => communityTree ? filterTreeBySearch(communityTree, searchText) : [],
    [communityTree, searchText],
  );

  const colors = useMemo(() => getC4Colors(isDark ?? true), [isDark]);
  const { scrollbarSx } = useMemo(() => getTokens(isDark ?? true), [isDark]);
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
  const [communityExpanded, setCommunityExpanded] = useState<ReadonlySet<string>>(() => {
    const ids = new Set<string>();
    for (const n of communityTree ?? []) ids.add(n.id);
    return ids;
  });

  const handleCommunityToggle = useCallback((id: string) => {
    setCommunityExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

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


  useEffect(() => {
    if (!checkReset) return;
    setCheckedIds(checkReset.ids != null ? new Set(checkReset.ids) : collectCheckableIds(tree));
    if (checkReset.expanded != null) {
      setExpanded(new Set(checkReset.expanded));
    }
  }, [checkReset]);

  useEffect(() => {
    if (!searchText.trim()) return;
    const ids = new Set<string>();
    function collectIds(nodes: readonly C4TreeNode[]): void {
      for (const n of nodes) {
        ids.add(n.id);
        if (n.children.length > 0) collectIds(n.children);
      }
    }
    collectIds(filteredTree);
    setExpanded(ids);
  }, [searchText, filteredTree]);

  // checkedIds の変更を親に通知（useEffect で render 後に実行）
  useEffect(() => {
    onCheckedChange?.(checkedIds);
  }, [checkedIds, onCheckedChange]);

  useEffect(() => {
    const ids = new Set<string>();
    for (const n of communityTree ?? []) ids.add(n.id);
    setCommunityExpanded(ids);
  }, [communityTree]);

  const addButtonSx = {
    textTransform: 'none',
    justifyContent: 'flex-start',
    fontSize: '0.75rem',
    minHeight: 28,
    borderRadius: '8px',
    color: colors.accent,
    borderColor: colors.border,
    '&:hover': { bgcolor: colors.hover },
    '&:disabled': { color: colors.textMuted },
  } as const;

  const selectorSx = {
    fontSize: '0.75rem',
    height: 30,
    '& .MuiSelect-select': { py: '3px' },
  } as const;

  return (
    <Box
      sx={{
        width: 260,
        bgcolor: colors.bgSecondary,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        ...scrollbarSx,
      }}
    >
      {(repoOptions.length > 0 || releaseOptions.length > 0) && (
        <Box sx={{ px: 1, py: 0.75, flexShrink: 0, borderBottom: `1px solid ${colors.border}`, display: 'grid', gap: 0.75 }}>
          {repoOptions.length > 0 && (
            <Select
              size="small"
              fullWidth
              value={selectedRepo}
              onChange={(event) => onRepoChange?.(event.target.value)}
              sx={selectorSx}
              aria-label={t('c4.releaseRepository')}
            >
              {repoOptions.map((key) => (
                <MenuItem key={key} value={key} sx={{ fontSize: '0.75rem' }}>
                  {key === UNKNOWN_REPO_KEY ? t('c4.unknownRepo') : key}
                </MenuItem>
              ))}
            </Select>
          )}
          {releaseOptions.length > 0 && (
            <Select
              size="small"
              fullWidth
              value={selectedRelease}
              onChange={(event) => onReleaseChange?.(event.target.value)}
              sx={selectorSx}
              aria-label={t('c4.releases')}
            >
              {releaseOptions.map((entry) => (
                <MenuItem key={entry.tag} value={entry.tag} sx={{ fontSize: '0.75rem' }}>
                  {entry.tag === CURRENT_RELEASE_TAG ? t('c4.currentRelease') : entry.tag}
                </MenuItem>
              ))}
            </Select>
          )}
        </Box>
      )}
      <Tabs
        value={activeTab}
        onChange={(_, v: number) => {
          setActiveTab(v as 0 | 1);
          if (v === 1) onCommunityTabOpen?.();
        }}
        variant="fullWidth"
        sx={{
          minHeight: 32,
          borderBottom: `1px solid ${colors.border}`,
          '& .MuiTab-root': { minHeight: 32, fontSize: '0.72rem', py: 0.5 },
        }}
      >
        <Tab label={t('c4.elementPanel.tabLayer')} value={0} />
        <Tab label={t('c4.elementPanel.tabCommunity')} value={1} />
      </Tabs>
      <Box sx={{ px: 1, py: 0.5, flexShrink: 0, borderBottom: `1px solid ${colors.border}` }}>
        <TextField
          size="small"
          fullWidth
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder={t('c4.elementPanel.searchPlaceholder')}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                </InputAdornment>
              ),
              endAdornment: searchText ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label={t('c4.elementPanel.searchClear')}
                    onClick={() => setSearchText('')}
                    sx={{ p: 0.25, color: 'text.secondary' }}
                  >
                    <ClearIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
          sx={{
            '& .MuiOutlinedInput-root': { fontSize: '0.75rem' },
            '& .MuiOutlinedInput-input': { py: 0.5 },
          }}
        />
      </Box>
      {hasDeletedElements && onPurgeDeleted && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 0.5, py: 0.25, borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
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
        </Box>
      )}
      {activeTab === 0 && (
        <List dense disablePadding sx={{ flex: 1, overflowY: 'auto', ...scrollbarSx }}>
          {filteredTree.map(node => (
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
      )}
      {activeTab === 1 && (
        communityLoading ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : hasCommunityTree ? (
          <List dense disablePadding sx={{ flex: 1, overflowY: 'auto', ...scrollbarSx }}>
            {filteredCommunityTree.map(node => (
              <TreeNodeItem
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                onSelect={handleSelect}
                expanded={communityExpanded}
                onToggle={handleCommunityToggle}
                checkedIds={new Set()}
                onCheck={() => undefined}
                hideCheckbox
              />
            ))}
          </List>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
            <Typography variant="caption" sx={{ color: colors.textMuted, textAlign: 'center' }}>
              {t('c4.elementPanel.communityUnavailable')}
            </Typography>
          </Box>
        )
      )}
      {activeTab === 0 && onAddElement && currentLevel && currentLevel >= 1 && currentLevel <= 3 && (
        <Box sx={{ borderTop: `1px solid ${colors.border}`, px: 1, py: 0.75, flexShrink: 0 }}>
          <Typography variant="caption" sx={{ display: 'block', color: colors.textMuted, fontSize: '0.65rem', mb: 0.5 }}>
            Add
          </Typography>
          <Box sx={{ display: 'grid', gap: 0.5 }}>
            {currentLevel === 1 && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PersonIcon sx={{ fontSize: 16 }} />}
                  onClick={() => onAddElement('person')}
                  sx={addButtonSx}
                  aria-label="Add Person"
                >
                  Person
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                  onClick={() => onAddElement('system')}
                  sx={addButtonSx}
                  aria-label="Add System"
                >
                  System
                </Button>
              </>
            )}
            {currentLevel === 2 && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                onClick={() => onAddElement('container')}
                disabled={!selectedSystemId}
                sx={addButtonSx}
                aria-label="Add Container"
              >
                Container
              </Button>
            )}
            {currentLevel === 3 && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                onClick={() => onAddElement('component')}
                sx={addButtonSx}
                aria-label="Add Component"
              >
                Component
              </Button>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
});
C4ElementTree.displayName = 'C4ElementTree';
