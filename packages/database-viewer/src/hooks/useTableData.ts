import { useEffect, useRef, useState } from "react";
import type { DatabaseAdapter } from "@anytime-markdown/database-core";

export interface TableDataState {
  readonly columns: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<ReadonlyArray<string>>;
  readonly totalRows: number;
  readonly loading: boolean;
  readonly error: string | null;
}

const EMPTY: TableDataState = {
  columns: [],
  rows: [],
  totalRows: 0,
  loading: false,
  error: null,
};

export function useTableData(
  adapter: DatabaseAdapter | null,
  table: string | null,
  page: number,
  pageSize: number,
): TableDataState {
  const [state, setState] = useState<TableDataState>(EMPTY);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!adapter || !table) {
      setState(EMPTY);
      return;
    }
    const myReq = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    void Promise.all([
      adapter.selectRows({ table, limit: pageSize, offset: (page - 1) * pageSize }),
      adapter.countRows(table),
    ])
      .then(([data, total]) => {
        if (reqRef.current !== myReq) return;
        setState({
          columns: data.columns,
          rows: data.rows,
          totalRows: total,
          loading: false,
          error: null,
        });
      })
      .catch((e: Error) => {
        if (reqRef.current !== myReq) return;
        setState({
          columns: [],
          rows: [],
          totalRows: 0,
          loading: false,
          error: e.message,
        });
      });
  }, [adapter, table, page, pageSize]);

  return state;
}
