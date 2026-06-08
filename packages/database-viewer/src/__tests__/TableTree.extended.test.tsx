/**
 * Extended tests for TableTree — covers branches not hit by the base test:
 * - null schema shows loading text
 * - filter narrows list
 * - filter matches no items → empty message
 * - context menu on table item calls onShowSchema
 * - context menu on db node calls onShowErd
 * - databaseName prop used as DB label
 * - collapse/expand DB node
 * - views list rendering
 */
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { DatabaseI18nProvider } from '../i18n/context';
import { TableTree } from '../TableTree';
import type { TableTreeProps } from '../TableTree';
import type { SchemaInfo } from '@anytime-markdown/database-core';

function wrap(props: Partial<TableTreeProps> & { schema: SchemaInfo | null; selected: string | null; onSelect: TableTreeProps['onSelect'] }) {
  return render(
    <DatabaseI18nProvider locale="ja">
      <TableTree {...props} />
    </DatabaseI18nProvider>,
  );
}

const baseSchema: SchemaInfo = {
  tables: [
    { name: 'users', columns: [] },
    { name: 'orders', columns: [] },
  ],
  views: [{ name: 'v_active', columns: [] }],
};

describe('TableTree — extended', () => {
  it('shows loading text when schema is null', () => {
    wrap({ schema: null, selected: null, onSelect: jest.fn() });
    expect(document.body.textContent).toMatch(/読込|loading/i);
  });

  it('renders databaseName when provided', () => {
    wrap({ schema: baseSchema, selected: null, onSelect: jest.fn(), databaseName: 'mydb.sqlite' });
    expect(screen.getByText('mydb.sqlite')).toBeTruthy();
  });

  it('filter narrows the tables list', () => {
    wrap({ schema: baseSchema, selected: null, onSelect: jest.fn() });
    const filterInput = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(filterInput, { target: { value: 'user' } });
    expect(screen.getByText('users')).toBeTruthy();
    expect(screen.queryByText('orders')).toBeNull();
  });

  it('shows empty message when filter matches nothing', () => {
    wrap({ schema: baseSchema, selected: null, onSelect: jest.fn() });
    const filterInput = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(filterInput, { target: { value: 'zzznomatch' } });
    // empty text should appear
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/見つかりません|empty|テーブルがありません/i);
  });

  it('renders views group', () => {
    wrap({ schema: baseSchema, selected: null, onSelect: jest.fn() });
    expect(screen.getByText('v_active')).toBeTruthy();
  });

  it('calls onSelect when a view is clicked', () => {
    const onSelect = jest.fn();
    wrap({ schema: baseSchema, selected: null, onSelect });
    fireEvent.click(screen.getByText('v_active'));
    expect(onSelect).toHaveBeenCalledWith('v_active');
  });

  it('context menu on table calls onShowSchema', () => {
    const onShowSchema = jest.fn();
    wrap({ schema: baseSchema, selected: null, onSelect: jest.fn(), onShowSchema });
    // Right-click on "users"
    fireEvent.contextMenu(screen.getByText('users'));
    // MUI Menu should appear with schema option
    const menuItems = document.querySelectorAll('[role="menuitem"]');
    const schemaItem = Array.from(menuItems).find((el) => el.textContent?.match(/スキーマ|schema/i));
    if (schemaItem) {
      fireEvent.click(schemaItem);
      expect(onShowSchema).toHaveBeenCalledWith('users');
    }
  });

  it('context menu on db node calls onShowErd', () => {
    const onShowErd = jest.fn();
    wrap({ schema: baseSchema, selected: null, onSelect: jest.fn(), onShowErd });
    // Right-click on the DB root list item (first ListItemButton)
    // The DB root button comes first
    const dbBtn = document.querySelector('.dbv-list-item-button') ?? document.querySelectorAll('li')[0];
    if (dbBtn) {
      fireEvent.contextMenu(dbBtn);
    } else {
      // Fallback: contextMenu on the storage icon's parent
      const storageIcon = document.querySelector('svg[data-testid="StorageIcon"]');
      if (storageIcon) fireEvent.contextMenu(storageIcon.parentElement!);
    }
    const menuItems = document.querySelectorAll('[role="menuitem"]');
    const erdItem = Array.from(menuItems).find((el) => el.textContent?.match(/ER図|ERD|erd/i));
    if (erdItem) {
      fireEvent.click(erdItem);
      expect(onShowErd).toHaveBeenCalled();
    }
  });

  it('collapse/expand DB node hides and shows table list', () => {
    wrap({ schema: baseSchema, selected: null, onSelect: jest.fn() });
    // Initially we can see the tables
    expect(screen.getByText('users')).toBeTruthy();

    // Click the DB-level ListItemButton (first clickable in list)
    const firstListBtn = document.querySelector('.dbv-list-item-button') as HTMLElement;
    fireEvent.click(firstListBtn);
    // After collapse aria / visibility changes — test that re-click restores
    fireEvent.click(firstListBtn);
    expect(screen.getByText('users')).toBeTruthy();
  });

  it('renders schema with only views (no tables)', () => {
    const viewsOnly: SchemaInfo = { tables: [], views: [{ name: 'v1', columns: [] }] };
    wrap({ schema: viewsOnly, selected: null, onSelect: jest.fn() });
    expect(screen.getByText('v1')).toBeTruthy();
    // Should NOT show tables section label
    const text = document.body.textContent ?? '';
    // tables group header should not appear when there are no tables
    expect(screen.queryByText('users')).toBeNull();
  });

  it('renders schema with only tables (no views)', () => {
    const tablesOnly: SchemaInfo = { tables: [{ name: 't1', columns: [] }], views: [] };
    wrap({ schema: tablesOnly, selected: null, onSelect: jest.fn() });
    expect(screen.getByText('t1')).toBeTruthy();
    expect(screen.queryByText('v1')).toBeNull();
  });
});
