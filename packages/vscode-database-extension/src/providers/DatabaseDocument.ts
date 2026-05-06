import * as vscode from "vscode";
import type { BetterSqlite3Adapter } from "@anytime-markdown/database-core";

export class DatabaseDocument implements vscode.CustomDocument {
  private dirty = false;
  private readonly _onDidChange = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<DatabaseDocument>
  >();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    public readonly uri: vscode.Uri,
    public readonly adapter: BetterSqlite3Adapter,
  ) {}

  isDirty(): boolean {
    return this.dirty;
  }

  markDirty(): void {
    if (this.dirty) return;
    this.dirty = true;
    this._onDidChange.fire({
      document: this,
      label: "edit",
      undo: async () => {
        /* ROLLBACK は revert で扱う */
      },
      redo: async () => {
        /* no-op */
      },
    });
  }

  markClean(): void {
    this.dirty = false;
  }

  async dispose(): Promise<void> {
    this._onDidChange.dispose();
    await this.adapter.dispose();
  }
}
