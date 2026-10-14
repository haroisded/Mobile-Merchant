// What a CSV file of items says, and what is wrong with it (POS-System-Added-Features.md 23.1;
// docs.frappe.io/erpnext/data-import): the template, the parser, and the check that turns each row into the
// payload public.import_items() takes — or into the row and column of a mistake. Import-free, so
// tools/check-logic.mjs runs it; the screen hands it the records to look names up in.

/** The template's columns, in order: the Item's 13.1 fields, then the three read on creation only. */
export const ITEM_CSV_COLUMNS = [
  'Item Code',
  'Item Name',
  'Item Group',
  'Default Unit of Measure',
  'Description',
  'Brand',
  'Disabled',
  'Maintain Stock',
  'Standard Selling Rate',
  'Opening Stock',
  'Valuation Rate',
] as const;

type Column = (typeof ITEM_CSV_COLUMNS)[number];

// ponytail: public.import_items refuses more — one file is one statement under an 8 s timeout. A shop with
// more splits the file.
export const ITEM_CSV_MAX_ROWS = 500;

/** The header line alone: what Download Template saves. CRLF, as a spreadsheet writes it. */
export const itemsTemplate = () => `${ITEM_CSV_COLUMNS.join(',')}\r\n`;

// One cell and what ends it (RFC 4180): in double quotes, where a doubled quote is one quote and commas and
// line breaks are text — or bare; then a comma, a line break, or the end of the text.
const CELL = /(?:"((?:[^"]|"")*)"|([^,\r\n]*))(,|\r\n|\n|\r|$)/g;

/**
 * A CSV file's records, each a list of cells. Lines end in CRLF, LF or CR; a UTF-8 byte order mark is
 * dropped. A blank line is a record of one empty cell, so a record's place in the list is its row in the
 * spreadsheet.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];

  for (const [, quoted, bare, end] of (text.startsWith('﻿') ? text.slice(1) : text).matchAll(CELL)) {
    record.push(quoted === undefined ? bare : quoted.replaceAll('""', '"'));
    if (end === ',') continue;
    // The end of the text straight after a line break is not one more row.
    if (end !== '' || record.length > 1 || record[0] !== '') records.push(record);
    if (end === '') break;
    record = [];
  }

  return records;
}

type GroupRecord = { id: string; item_group_name: string; is_group: boolean };
type UomRecord = { id: string; uom_name: string; enabled: boolean; must_be_whole_number: boolean };

/** What the file's names are looked up in, and what the importer's settings and roles allow. */
export type ItemCsvLookups = {
  /** The code of every item already in the system. */
  itemCodes: string[];
  groups: GroupRecord[];
  uoms: UomRecord[];
  brands: { id: string; brand: string }[];
  /** Stock Settings names items by the Item series: a typed code is not read. */
  codeFromSeries: boolean;
  /** Stock Settings' Default Item Group and Default Stock UOM: what a blank cell takes. */
  defaultGroup: string | null;
  defaultUom: string | null;
  /** Stock Settings names the Default Warehouse opening stock goes in. */
  hasWarehouse: boolean;
  /** Selling Settings names the Default Price List a Standard Selling Rate goes in. */
  hasPriceList: boolean;
  /** The importer may add an Item Price, and may create and submit a Stock Reconciliation. */
  mayPrice: boolean;
  mayStock: boolean;
};

/** One item read from the file: its row in the spreadsheet (the header is row 1), and what save_item takes. */
export type ItemCsvRow = {
  row: number;
  item: {
    item_code: string;
    item_name: string;
    item_group_id: string;
    stock_uom: string;
    description: string;
    brand_id: string;
    disabled: boolean;
    is_stock_item: boolean;
    standard_rate: string;
    opening_stock: string;
    valuation_rate: string;
  };
};

/** A mistake, by the spreadsheet's row and the column's heading. Row 0 is the file itself; '' no one column. */
export type ItemCsvError = { row: number; column: Column | ''; message: string };

/** A file once read: the items it holds, and the mistakes in it. */
export type ItemCsvFile = { rows: ItemCsvRow[]; errors: ItemCsvError[] };

// A column and what is wrong in it for one row, or null.
type Check = [Column | '', string | null];
// A row's cell under a heading, without the spaces around it.
type Cells = (column: Column) => string;
// The codes no row may take: the system's, and each earlier row's with the row that has it.
type Codes = { taken: Set<string>; seen: Map<string, number> };

const YES = ['1', 'yes', 'true'];
const NO = ['0', 'no', 'false'];
// The Item form's numberText (src/features/item-tax-templates/schema.ts): digits, with a decimal point.
const NUMBER = /^-?\d+(\.\d+)?$/;

const isBlank = (record: string[]) => record.every((cell) => cell.trim() === '');

// The first mistake in the header, or null. Cells past the last column may trail, empty.
function headerMistake(header: string[]) {
  if (header.length === 1 && header[0].includes(';')) return 'This file separates its columns with semicolons. Save it as comma-separated (CSV) and choose it again.';
  const wrong = ITEM_CSV_COLUMNS.findIndex((column, index) => (header[index] ?? '').trim() !== column);
  if (wrong >= 0) {
    const found = (header[wrong] ?? '').trim();
    return `Column ${wrong + 1} should be "${ITEM_CSV_COLUMNS[wrong]}"${found ? `, and the file has "${found}"` : ''}. Download the template and fill that in.`;
  }
  return header.slice(ITEM_CSV_COLUMNS.length).some((cell) => cell.trim() !== '') ? 'The file has more columns than the template. Download the template and fill that in.' : null;
}

// What is wrong with a typed code, or null — and then the code is this row's, for the rows after it.
function claimCode(code: string, row: number, codes: Codes) {
  if (!code) return 'Enter a code.';
  if (code.length > 140) return 'Use 140 characters or fewer.';
  if (codes.taken.has(code)) return `There is already an item with the code ${code}.`;
  const earlier = codes.seen.get(code);
  if (earlier) return `Row ${earlier} has the same code.`;
  codes.seen.set(code, row);
  return null;
}

// The item group a cell names — Stock Settings' default for a blank one, as a new item's form starts with.
function findGroup(name: string, lookups: ItemCsvLookups) {
  const group = name ? lookups.groups.find((candidate) => candidate.item_group_name === name) : lookups.groups.find((candidate) => candidate.id === lookups.defaultGroup);
  if (!group) return { id: '', mistake: name ? `No item group is named "${name}".` : 'Enter an item group: Stock Settings names no default one.' };
  return { id: group.id, mistake: group.is_group ? `"${group.item_group_name}" is a group: items go in the groups under it.` : null };
}

// The unit a cell names, or Stock Settings' default for a blank one.
function findUom(name: string, lookups: ItemCsvLookups) {
  const uom = name ? lookups.uoms.find((candidate) => candidate.uom_name === name) : lookups.uoms.find((candidate) => candidate.id === lookups.defaultUom);
  if (!uom) return { uom, mistake: name ? `No unit of measure is named "${name}".` : 'Enter a unit of measure: Stock Settings names no default one.' };
  return { uom, mistake: uom.enabled ? null : `"${uom.uom_name}" is disabled.` };
}

// A yes/no cell: 1/0, yes/no or true/false in any case. Blank is the form's own start.
function yesNo(value: string, fallback: boolean) {
  const word = value.toLowerCase();
  const known = word === '' || YES.includes(word) || NO.includes(word);
  return { value: word === '' ? fallback : YES.includes(word), mistake: known ? null : 'Enter yes or no.' };
}

// The number in a cell, 0 when blank.
function amount(value: string) {
  if (value === '') return { value: 0, mistake: null };
  if (!NUMBER.test(value)) return { value: 0, mistake: 'Enter a number, with no commas or currency sign.' };
  return Number(value) < 0 ? { value: 0, mistake: 'Enter 0 or more.' } : { value: Number(value), mistake: null };
}

// A Standard Selling Rate becomes an Item Price: it needs the price list to go in, and the role to add it.
function rateMistake(rate: number, lookups: ItemCsvLookups) {
  if (rate <= 0) return null;
  if (!lookups.hasPriceList) return 'Selling Settings names no Default Price List for this rate. Set one there, or clear the rate.';
  return lookups.mayPrice ? null : "You can't add an item price. Clear the rate, or ask the owner for Manage Items.";
}

// Opening Stock is posted as a Stock Reconciliation: for an item that keeps stock, by someone who may post
// one, into Stock Settings' Default Warehouse, in whole units where the unit can't be divided.
function openingMistake(opening: number, keepsStock: boolean, uom: UomRecord | undefined, lookups: ItemCsvLookups) {
  if (opening <= 0) return null;
  if (!keepsStock) return 'Only an item that keeps stock has opening stock. Clear it, or set Maintain Stock to yes.';
  if (!lookups.mayStock) return "You can't post opening stock. Clear it, or ask the owner for Adjust Inventory.";
  if (!lookups.hasWarehouse) return 'Stock Settings names no Default Warehouse for opening stock to go in. Set one there, or clear it.';
  return uom?.must_be_whole_number && !Number.isInteger(opening) ? `${uom.uom_name} can't be divided: enter a whole number.` : null;
}

// What the row is: its code and names, and the records they point at.
function readIdentity(cell: Cells, row: number, lookups: ItemCsvLookups, codes: Codes) {
  // Under the Item series the code is the series', whatever was typed.
  const code = lookups.codeFromSeries ? '' : cell('Item Code');
  const group = findGroup(cell('Item Group'), lookups);
  const unit = findUom(cell('Default Unit of Measure'), lookups);
  const brandName = cell('Brand');
  const brand = lookups.brands.find((candidate) => candidate.brand === brandName);
  const checks: Check[] = [
    ['Item Code', lookups.codeFromSeries ? null : claimCode(code, row, codes)],
    ['Item Name', cell('Item Name').length > 140 ? 'Use 140 characters or fewer.' : null],
    ['Item Group', group.mistake],
    ['Default Unit of Measure', unit.mistake],
    ['Description', cell('Description').length > 1000 ? 'Use 1,000 characters or fewer.' : null],
    ['Brand', brandName && !brand ? `No brand is named "${brandName}".` : null],
  ];

  return { code, groupId: group.id, uom: unit.uom, brandId: brand?.id ?? '', checks };
}

// What the row sells for and holds: the two switches, and the three figures with what each needs.
function readFigures(cell: Cells, uom: UomRecord | undefined, lookups: ItemCsvLookups) {
  const disabled = yesNo(cell('Disabled'), false);
  const keepsStock = yesNo(cell('Maintain Stock'), true);
  const rate = amount(cell('Standard Selling Rate'));
  const opening = amount(cell('Opening Stock'));
  const valuation = amount(cell('Valuation Rate'));
  const stockMistake = opening.mistake ?? openingMistake(opening.value, keepsStock.value, uom, lookups);
  // Valued at the Valuation Rate when the cell holds one, else at the Standard Selling Rate
  // (public.import_items). Said only once nothing else is wrong with the three.
  const valued = cell('Valuation Rate') ? valuation.value : rate.value;
  const unvalued = opening.value > 0 && valued <= 0 && !stockMistake && !rate.mistake;
  const checks: Check[] = [
    ['Disabled', disabled.mistake],
    ['Maintain Stock', keepsStock.mistake],
    ['Standard Selling Rate', rate.mistake ?? rateMistake(rate.value, lookups)],
    ['Opening Stock', stockMistake],
    ['Valuation Rate', valuation.mistake ?? (unvalued ? 'Opening Stock needs a Valuation Rate above 0, or a Standard Selling Rate to take it from.' : null)],
  ];

  return { disabled: disabled.value, keepsStock: keepsStock.value, checks };
}

// One row of the file: the item it describes, and each mistake in it, in the columns' order.
function readRow(record: string[], row: number, lookups: ItemCsvLookups, codes: Codes) {
  const cell: Cells = (column) => (record[ITEM_CSV_COLUMNS.indexOf(column)] ?? '').trim();
  const overflow = record.slice(ITEM_CSV_COLUMNS.length).some((extra) => extra.trim() !== '');
  const identity = readIdentity(cell, row, lookups, codes);
  const figures = readFigures(cell, identity.uom, lookups);
  const checks: Check[] = [['', overflow ? 'This row has more cells than the header. A value with a comma in it goes in double quotes.' : null], ...identity.checks, ...figures.checks];

  return {
    item: {
      row,
      item: {
        item_code: identity.code,
        item_name: cell('Item Name'),
        item_group_id: identity.groupId,
        stock_uom: identity.uom?.id ?? '',
        description: cell('Description'),
        brand_id: identity.brandId,
        disabled: figures.disabled,
        is_stock_item: figures.keepsStock,
        standard_rate: cell('Standard Selling Rate'),
        opening_stock: cell('Opening Stock'),
        valuation_rate: cell('Valuation Rate'),
      },
    },
    errors: checks.flatMap(([column, message]) => (message ? [{ row, column, message }] : [])),
  };
}

/**
 * Read a filled template: every item it holds, and every mistake in it. Nothing is imported while there is
 * one, so the rows are only of use when `errors` is empty. Names match as typed, ignoring the spaces around
 * them; an unknown Item Group, unit or Brand is a mistake, never created. What only the database knows — a
 * code taken a moment ago, a posting it refuses — it says itself, by row (public.import_items).
 */
export function readItemsCsv(text: string, lookups: ItemCsvLookups): ItemCsvFile {
  const records = parseCsv(text);
  const header = records.findIndex((record) => !isBlank(record));
  if (header < 0) return { rows: [], errors: [{ row: 0, column: '', message: 'The file is empty. Download the template and fill it in.' }] };
  const mistake = headerMistake(records[header]);
  if (mistake) return { rows: [], errors: [{ row: header + 1, column: '', message: mistake }] };

  const codes: Codes = { taken: new Set(lookups.itemCodes), seen: new Map() };
  // A record's place is its row in the spreadsheet; blank lines keep theirs and hold no item.
  const read = records.flatMap((record, index) => (index <= header || isBlank(record) ? [] : [readRow(record, index + 1, lookups, codes)]));
  const tooMany: ItemCsvError[] =
    read.length > ITEM_CSV_MAX_ROWS
      ? [{ row: 0, column: '', message: `A file holds at most ${ITEM_CSV_MAX_ROWS} items, and this one has ${read.length}. Split it into smaller files.` }]
      : [];

  return { rows: read.map((row) => row.item), errors: [...tooMany, ...read.flatMap((row) => row.errors)] };
}
