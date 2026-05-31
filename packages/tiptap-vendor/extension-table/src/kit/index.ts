import { Extension } from '@anytime-markdown/markdown-core'

import type { TableCellOptions } from '../cell/index'
import { TableCell } from '../cell/index'
import type { TableHeaderOptions } from '../header/index'
import { TableHeader } from '../header/index'
import type { TableRowOptions } from '../row/index'
import { TableRow } from '../row/index'
import type { TableOptions } from '../table/index'
import { Table } from '../table/index'

export interface TableKitOptions {
  /**
   * If set to false, the table extension will not be registered
   * @example table: false
   */
  table: Partial<TableOptions> | false
  /**
   * If set to false, the table extension will not be registered
   * @example tableCell: false
   */
  tableCell: Partial<TableCellOptions> | false
  /**
   * If set to false, the table extension will not be registered
   * @example tableHeader: false
   */
  tableHeader: Partial<TableHeaderOptions> | false
  /**
   * If set to false, the table extension will not be registered
   * @example tableRow: false
   */
  tableRow: Partial<TableRowOptions> | false
}

/**
 * The table kit is a collection of table editor extensions.
 *
 * It’s a good starting point for building your own table in Tiptap.
 */
export const TableKit = Extension.create<TableKitOptions>({
  name: 'tableKit',

  addExtensions() {
    const extensions = []

    if (this.options.table !== false) {
      extensions.push(Table.configure(this.options.table))
    }

    if (this.options.tableCell !== false) {
      extensions.push(TableCell.configure(this.options.tableCell))
    }

    if (this.options.tableHeader !== false) {
      extensions.push(TableHeader.configure(this.options.tableHeader))
    }

    if (this.options.tableRow !== false) {
      extensions.push(TableRow.configure(this.options.tableRow))
    }

    return extensions
  },
})
