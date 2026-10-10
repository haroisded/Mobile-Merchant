// What a receipt prints of a sale: Print Settings' Compact Item Print and Print Taxes with Zero Amount, and a
// print format's Show Item Code (docs.frappe.io/erpnext/print-settings §2.2 and §2.7, /print-format §1.1). Used
// by the Print Format page's sample receipt now and by the POS Invoice's receipt later.
//
// Import-free, so tools/check-logic.mjs can run it under plain Node. Amounts arrive already formatted.

export type SoldItem = { code: string; name: string; uom: string; qty: string; rate: string; amount: string };

export type ReceiptColumn = { label: string; value: string };

/**
 * An item line's columns. Compact Item Print: "only four columns … Description, Qty, Rate, and Amount", the
 * others folded into Description. Otherwise each value in a column of its own. A hidden item code prints in
 * neither.
 */
export function itemColumns(item: SoldItem, options: { compact: boolean; showItemCode: boolean }): ReceiptColumn[] {
  const code = options.showItemCode ? item.code : '';
  if (options.compact) {
    return [
      { label: 'Description', value: [code, item.name].filter((part) => part !== '').join(' ') },
      { label: 'Qty', value: `${item.qty} ${item.uom}` },
      { label: 'Rate', value: item.rate },
      { label: 'Amount', value: item.amount },
    ];
  }
  return [
    { label: 'Item Code', value: code },
    { label: 'Item Name', value: item.name },
    { label: 'UOM', value: item.uom },
    { label: 'Qty', value: item.qty },
    { label: 'Rate', value: item.rate },
    { label: 'Amount', value: item.amount },
  ].filter((column) => column.value !== '');
}

/** The tax rows a receipt prints: those that came to an amount, and the zero ones too when the setting says so. */
export function printedTaxes<T extends { amount: number }>(taxes: T[], zeroTaxes: boolean): T[] {
  return zeroTaxes ? taxes : taxes.filter((tax) => tax.amount !== 0);
}
