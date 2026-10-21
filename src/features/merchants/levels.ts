// What a store's level means (merchants.level, supabase/migrations/20261021153337_store_levels.sql): picked on Create
// Store's second step, changed by the owner on Features. Import-free: asserted in tools/check-logic.mjs.
//
// A level is presets, never a refusal. What the database sets up for one is private.apply_level (a register, item
// codes from the Item series, selling past zero stock). Here: the menu a person starts from until they save their own
// on Features, and which New Item fields show. A field is hidden only where the system fills it.

export type Level = 1 | 2 | 3 | 4 | 5;

export type LevelInfo = { level: Level; name: string; summary: string; gets: string[] };

export const LEVELS: LevelInfo[] = [
  {
    level: 1,
    name: 'Just Sell',
    summary: 'Add items, sell at the register, and check the dashboard.',
    gets: ['A register ready to sell from', 'Item codes numbered for you', 'A short New Item form: name, barcode, price, cost and stock'],
  },
  {
    level: 2,
    name: 'Sell & Restock',
    summary: 'Level 1, plus past orders and returns, deliveries, prices and stock on hand.',
    gets: ['Orders, receipts and returns', 'Deliveries in, and what is on hand', 'Item groups, units and low-stock alerts on items'],
  },
  {
    level: 3,
    name: 'Staff & Stock Control',
    summary: 'Level 2, plus employees, stock counts, imports, shift records and the basic settings.',
    gets: ['Employees and their roles', 'Stock counts, imports and the stock ledger', 'Registers, payment methods, price lists and receipts in Setup'],
  },
  {
    level: 4,
    name: 'Full Store',
    summary: 'Level 3, plus the books, taxes, pricing rules and the stock and selling settings.',
    gets: ['The General Ledger', 'Taxes, pricing rules and warehouses', 'Every New Item field'],
  },
  {
    level: 5,
    name: 'Everything, by Hand',
    summary: 'Every screen and field, as the full system is. Nothing is set up for you beyond the basics.',
    gets: ['The chart of accounts, fiscal years and every setting', 'Tax categories and rules, unit conversions, naming series', 'No register made for you, and item codes typed by you'],
  },
];

/** A store's level as the picker and the Features box name it; an unknown number reads as level 5, the whole system. */
export const levelInfo = (level: number) => LEVELS.find((info) => info.level === level) ?? LEVELS[LEVELS.length - 1];

// The first level each Features key shows at (screenKey / pageKey, src/features/feature-preferences/visibility.ts). A
// key not here shows at every level: Home, Dashboard, Features, Sell's session and Register, Stock's Items. A screen
// hidden at a level hides its pages' keys too, as its own switch does (setScreen), so showing it again shows them all.
const MENU_FROM = {
  'sell/pos-invoices': 2,
  'stock/item-prices': 2,
  'stock/stock-entries': 2,
  'stock/stock-balance': 2,

  'screen:employees': 3,
  'sell/pos-opening-entries': 3,
  'sell/pos-closing-entries': 3,
  'stock/import-items': 3,
  'stock/stock-reconciliations': 3,
  'stock/stock-ledger': 3,
  'screen:setup': 3,
  'setup/company': 3,
  'setup/modes-of-payment': 3,
  'setup/uoms': 3,
  'setup/price-lists': 3,
  'setup/brands': 3,
  'setup/item-groups': 3,
  'setup/pos-profiles': 3,
  'setup/print-formats': 3,
  'setup/letter-heads': 3,
  'setup/print-settings': 3,

  'screen:accounts': 4,
  'accounts/general-ledger': 4,
  'setup/currency': 4,
  'setup/sales-tax-templates': 4,
  'setup/item-tax-templates': 4,
  'setup/warehouses': 4,
  'setup/stock-settings': 4,
  'setup/selling-settings': 4,
  'setup/pricing-rules': 4,

  'setup/fiscal-years': 5,
  'setup/global-defaults': 5,
  'setup/system-settings': 5,
  'setup/chart-of-accounts': 5,
  'setup/accounts-settings': 5,
  'setup/tax-categories': 5,
  'setup/tax-rules': 5,
  'setup/uom-conversion-factors': 5,
  'setup/document-naming-settings': 5,
} satisfies Record<string, Level>;

/** The Features keys a level hides: what a person's menu starts from in a store at that level. */
export const levelHidden = (level: number) =>
  Object.entries(MENU_FROM)
    .filter(([, from]) => from > level)
    .map(([key]) => key);

// The first level each part of the New Item form shows at; the name, barcode, price, cost and stock show at every one.
const ITEM_FROM = {
  item_group_id: 2,
  stock_uom: 2,
  description: 2,
  is_stock_item: 2,
  disabled: 2,
  reorder_level: 2,
  item_code: 3,
  brand_id: 3,
  units: 3,
  inventory: 3,
  defaults: 4,
  discounts: 4,
  taxes: 4,
} satisfies Record<string, Level>;

/** The New Item form's parts that come and go with the level. */
export type ItemPart = keyof typeof ITEM_FROM;

/** Whether a part of the New Item form shows at a level. The form still shows one the system cannot fill. */
export const itemPartShown = (level: number, part: ItemPart) => level >= ITEM_FROM[part];

/** Levels 1-2 read the price, cost and stock fields in a shop's words, not the books'. */
export const plainWords = (level: number) => level <= 2;
