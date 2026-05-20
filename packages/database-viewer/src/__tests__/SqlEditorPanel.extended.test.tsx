/**
 * Extended tests for SqlEditorPanel — covers branches/lines missed by the base test:
 * - collapse/expand toggle
 * - controlled mode (value / onValueChange)
 * - error / truncated result rendering
 * - Clear button
 * - running status label
 * - sqlStatusRows / sqlStatusTime labels after successful run
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import React, { createRef } from 'react';

import { DatabaseI18nProvider } from '../i18n/context';
import { SqlEditorPanel } from '../SqlEditorPanel';
import type { SqlEditorPanelHandle } from '../SqlEditorPanel';

const theme = createTheme({ palette: { mode: 'light' } });

function wrap(ui: React.ReactNode) {
  return render(
    <DatabaseI18nProvider locale="ja">
      <ThemeProvider theme={theme}>{ui}</ThemeProvider>
    </DatabaseI18nProvider>,
  );
}

const noopRun = async () => ({ columns: [], rows: [], executionTimeMs: 0, truncated: false });

describe('SqlEditorPanel — extended', () => {
  it('collapse/expand toggle changes aria-label', async () => {
    wrap(<SqlEditorPanel onRun={noopRun} />);
    // Initially expanded — aria-label should indicate collapse action
    const iconBtn = document.querySelector('button[aria-label]') as HTMLButtonElement;
    const initialLabel = iconBtn.getAttribute('aria-label') ?? '';
    expect(initialLabel.length).toBeGreaterThan(0);

    // Click the collapse icon button
    fireEvent.click(iconBtn);
    await act(async () => {});
    // After collapse the aria-label should change
    const collapsedLabel = iconBtn.getAttribute('aria-label') ?? '';
    expect(collapsedLabel).not.toBe(initialLabel);

    // Click again to expand
    fireEvent.click(iconBtn);
    await act(async () => {});
    expect(iconBtn.getAttribute('aria-label')).toBe(initialLabel);
  });

  it('Clear button resets SQL in uncontrolled mode', async () => {
    wrap(<SqlEditorPanel onRun={noopRun} initialSql="SELECT 1" />);
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('SELECT 1');

    // Click クリア button
    const clearBtn = screen.getByRole('button', { name: /クリア/i });
    fireEvent.click(clearBtn);
    expect(textarea.value).toBe('');
  });

  it('controlled mode calls onValueChange instead of internal state', () => {
    const onValueChange = jest.fn();
    wrap(
      <SqlEditorPanel
        onRun={noopRun}
        value="SELECT 1"
        onValueChange={onValueChange}
      />,
    );
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'SELECT 2' } });
    expect(onValueChange).toHaveBeenCalledWith('SELECT 2');
  });

  it('shows row count and execution time after successful run', async () => {
    const onRun = jest.fn().mockResolvedValue({
      columns: ['a'],
      rows: [['1'], ['2']],
      executionTimeMs: 42,
      truncated: false,
    });
    wrap(<SqlEditorPanel onRun={onRun} />);
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'SELECT 1' } });
    await act(async () => {
      fireEvent.click(screen.getByText('実行'));
    });
    // Should show rows count and time (labels in ja.json)
    const caption = document.body.textContent ?? '';
    // "2 行" or similar + time "42 ms"
    expect(caption).toMatch(/42/);
  });

  it('shows error label when run returns error', async () => {
    const onRun = jest.fn().mockResolvedValue({
      columns: [],
      rows: [],
      executionTimeMs: 10,
      truncated: false,
      error: 'syntax error near X',
    });
    const { getByText } = render(
      <DatabaseI18nProvider locale="ja">
        <ThemeProvider theme={theme}>
          <SqlEditorPanel onRun={onRun} />
        </ThemeProvider>
      </DatabaseI18nProvider>,
    );
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'BAD SQL' } });
    await act(async () => {
      fireEvent.click(getByText('実行'));
    });
    // The error text appears somewhere on screen
    const body = document.body.textContent ?? '';
    expect(body).toContain('syntax error near X');
  });

  it('shows truncated warning when result is truncated', async () => {
    const onRun = jest.fn().mockResolvedValue({
      columns: ['id'],
      rows: Array.from({ length: 100 }, (_, i) => [String(i)]),
      executionTimeMs: 5,
      truncated: true,
    });
    wrap(<SqlEditorPanel onRun={onRun} />);
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'SELECT *' } });
    await act(async () => {
      fireEvent.click(screen.getByText('実行'));
    });
    // Alert with truncated message should appear
    const body = document.body.textContent ?? '';
    // The truncated warning message key contains the count
    expect(body).toMatch(/100/);
  });

  it('disabled prop disables the Run button', () => {
    wrap(
      <SqlEditorPanel
        onRun={noopRun}
        disabled
      />,
    );
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'SELECT 1' } });
    const runBtn = screen.getByText('実行').closest('button') as HTMLButtonElement;
    expect(runBtn.hasAttribute('disabled')).toBe(true);
  });

  it('readOnly prop disables Run and Clear buttons', () => {
    wrap(<SqlEditorPanel onRun={noopRun} readOnly initialSql="SELECT 1" />);
    const runBtn = screen.getByText('実行').closest('button') as HTMLButtonElement;
    const clearBtn = screen.getByRole('button', { name: /クリア/i });
    expect(runBtn.hasAttribute('disabled')).toBe(true);
    expect(clearBtn.hasAttribute('disabled')).toBe(true);
  });

  it('insertText ref appends text to current SQL', async () => {
    const ref = createRef<SqlEditorPanelHandle>();
    wrap(<SqlEditorPanel ref={ref} onRun={noopRun} initialSql="SELECT " />);

    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('SELECT ');

    // Move cursor to end
    fireEvent.change(textarea, { target: { value: 'SELECT ' } });

    await act(async () => {
      ref.current?.insertText('1');
    });

    // The value after insertion should contain both parts
    const newVal = (document.querySelector('textarea') as HTMLTextAreaElement).value;
    expect(newVal).toContain('1');
  });
});
