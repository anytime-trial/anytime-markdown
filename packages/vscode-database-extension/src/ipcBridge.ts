import * as vscode from "vscode";
import type {
  BetterSqlite3Adapter,
  RpcMethod,
  RpcResultMessage,
} from "@anytime-markdown/database-core";
import { isMutationSql } from "@anytime-markdown/database-core";

export function setupIpcBridge(
  panel: vscode.WebviewPanel,
  adapter: BetterSqlite3Adapter,
  onMutation: () => void,
): vscode.Disposable {
  return panel.webview.onDidReceiveMessage(
    async (msg: { type: string; id?: string; method?: RpcMethod; params?: unknown }) => {
      if (msg.type !== "rpc" || !msg.id || !msg.method) return;
      const result: {
        type: "rpcResult";
        id: string;
        result?: unknown;
        error?: { message: string };
      } = { type: "rpcResult", id: msg.id };
      try {
        switch (msg.method) {
          case "listSchema":
            result.result = await adapter.listSchema();
            break;
          case "selectRows":
            result.result = await adapter.selectRows(
              msg.params as { table: string; limit: number; offset: number },
            );
            break;
          case "countRows":
            result.result = await adapter.countRows(
              (msg.params as { table: string }).table,
            );
            break;
          case "executeSql": {
            const sql = (msg.params as { sql: string }).sql;
            const r = await adapter.executeSql(sql);
            if (isMutationSql(sql) && r.isMutation) onMutation();
            result.result = r;
            break;
          }
          case "save":
            await adapter.save();
            result.result = null;
            break;
          case "revert":
            await adapter.revert();
            result.result = null;
            break;
        }
      } catch (e) {
        result.error = { message: (e as Error).message };
      }
      void panel.webview.postMessage(result satisfies RpcResultMessage);
    },
  );
}
