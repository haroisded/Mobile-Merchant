import type { PermissionKey, Role } from './roles';
import type { Prepare, SetupId } from './sandbox-state';

// What a role practises in the Store Guide's sandbox: the practice store's pages, who may open each (the same rule
// the real shell and indexes follow — src/components/destinations.ts, src/features/permissions/access.ts — written
// here by permission key, since the practice store has no my_permissions), the side menu that follows, and the tasks.
// Import-free (types only): asserted in tools/check-logic.mjs.

export type Page =
  | 'home'
  | 'dashboard'
  | 'sell'
  | 'open-session'
  | 'register'
  | 'scan-sell'
  | 'receipt'
  | 'orders'
  | 'sale'
  | 'return'
  | 'close-session'
  | 'opening-entries'
  | 'closing-entries'
  | 'stock'
  | 'items'
  | 'item'
  | 'scan-item'
  | 'item-prices'
  | 'item-price'
  | 'import'
  | 'stock-entries'
  | 'stock-entry'
  | 'recons'
  | 'recon'
  | 'stock-balance'
  | 'stock-ledger'
  | 'accounts'
  | 'general-ledger'
  | 'setup'
  | 'setup-list'
  | 'setup-form'
  | 'employees'
  | 'employee'
  | 'access-codes'
  | 'features'
  | 'store-level';

export type DestinationName = 'home' | 'dashboard' | 'sell' | 'stock' | 'accounts' | 'employees' | 'setup' | 'access-codes' | 'features';

export type SandboxDestination = { name: DestinationName; label: string; icon: 'home' | 'dashboard' | 'sell' | 'stock' | 'accounts' | 'group' | 'settings' | 'key' | 'tune'; page: Page };

/** The practice store's side menu, in the real rail's order. Access Codes is a tab outside the store in the app. */
const SANDBOX_DESTINATIONS: SandboxDestination[] = [
  { name: 'home', label: 'Home', icon: 'home', page: 'home' },
  { name: 'dashboard', label: 'Dashboard', icon: 'dashboard', page: 'dashboard' },
  { name: 'sell', label: 'Sell', icon: 'sell', page: 'sell' },
  { name: 'stock', label: 'Stock', icon: 'stock', page: 'stock' },
  { name: 'accounts', label: 'Accounts', icon: 'accounts', page: 'accounts' },
  { name: 'employees', label: 'Employees', icon: 'group', page: 'employees' },
  { name: 'setup', label: 'Setup', icon: 'settings', page: 'setup' },
  { name: 'access-codes', label: 'Access Codes', icon: 'key', page: 'access-codes' },
  { name: 'features', label: 'Features', icon: 'tune', page: 'features' },
];

type PageRule = { destination: DestinationName; any?: PermissionKey[]; owner?: true };

const SELLING: PermissionKey[] = ['process_sales'];
const ORDERS: PermissionKey[] = ['view_sales', 'process_refunds', 'void_sales'];
const ITEMS: PermissionKey[] = ['manage_items'];
const SETUP: PermissionKey[] = ['manage_company', 'manage_accounting', 'manage_taxes', 'manage_stock_setup', 'manage_selling', 'manage_pos_profiles', 'manage_printing'];

// Who may open each page. No `any` and no `owner`: everyone (Home, Features).
export const PAGE_RULES = {
  home: { destination: 'home' },
  dashboard: { destination: 'dashboard', any: ['view_sales', 'view_shift_totals', 'close_any_register', 'view_stock'] },
  sell: { destination: 'sell', any: ['open_close_register', ...ORDERS, 'view_shift_totals', 'close_any_register'] },
  'open-session': { destination: 'sell', any: ['open_close_register'] },
  register: { destination: 'sell', any: SELLING },
  'scan-sell': { destination: 'sell', any: SELLING },
  receipt: { destination: 'sell', any: [...SELLING, ...ORDERS] },
  orders: { destination: 'sell', any: ORDERS },
  sale: { destination: 'sell', any: ORDERS },
  return: { destination: 'sell', any: ['process_refunds'] },
  'close-session': { destination: 'sell', any: ['open_close_register', 'close_any_register'] },
  'opening-entries': { destination: 'sell', any: ['view_shift_totals', 'close_any_register'] },
  'closing-entries': { destination: 'sell', any: ['view_shift_totals'] },
  stock: { destination: 'stock', any: ['view_stock', 'manage_items', 'move_stock', 'adjust_inventory'] },
  items: { destination: 'stock', any: ['view_stock', ...ITEMS] },
  item: { destination: 'stock', any: ['view_stock', ...ITEMS] },
  'scan-item': { destination: 'stock', any: ITEMS },
  'item-prices': { destination: 'stock', any: ITEMS },
  'item-price': { destination: 'stock', any: ITEMS },
  import: { destination: 'stock', any: ITEMS },
  'stock-entries': { destination: 'stock', any: ['move_stock', 'adjust_inventory'] },
  'stock-entry': { destination: 'stock', any: ['move_stock', 'adjust_inventory'] },
  recons: { destination: 'stock', any: ['adjust_inventory'] },
  recon: { destination: 'stock', any: ['adjust_inventory'] },
  'stock-balance': { destination: 'stock', any: ['view_stock'] },
  'stock-ledger': { destination: 'stock', any: ['view_stock'] },
  accounts: { destination: 'accounts', any: ['view_ledger'] },
  'general-ledger': { destination: 'accounts', any: ['view_ledger'] },
  setup: { destination: 'setup', any: SETUP },
  'setup-list': { destination: 'setup', any: SETUP },
  'setup-form': { destination: 'setup', any: SETUP },
  employees: { destination: 'employees', owner: true },
  employee: { destination: 'employees', owner: true },
  'access-codes': { destination: 'access-codes', owner: true },
  features: { destination: 'features' },
  'store-level': { destination: 'features', owner: true },
} satisfies Record<Page, PageRule>;

/** Whether the role may do what `key` allows: the owner holds every permission. */
export const holds = (role: Role, key: PermissionKey) => !!role.owner || role.permissions.includes(key);

/** Whether the role may open `page`. */
export function canOpen(role: Role, page: Page) {
  const rule: PageRule = PAGE_RULES[page];
  if (rule.owner) return !!role.owner;
  return !rule.any || rule.any.some((key) => holds(role, key));
}

/** The practice store's side menu for a role: a destination shows when the role may open one of its pages. */
export function menuFor(role: Role): SandboxDestination[] {
  // SAFETY: PAGE_RULES satisfies Record<Page, PageRule>, so its keys are exactly Page.
  const pages = Object.keys(PAGE_RULES) as Page[];
  return SANDBOX_DESTINATIONS.filter((destination) => pages.some((page) => PAGE_RULES[page].destination === destination.name && canOpen(role, page)));
}

/** Every control a step can point at. Pages and steps both use these, so a misspelt target is a type error. */
export const T = {
  sellOpen: 'sell:open',
  sellRegister: 'sell:register',
  sellClose: 'sell:close',
  sellOrders: 'sell:orders',
  sellOpenings: 'sell:openings',
  sellClosings: 'sell:closings',
  openAmount: 'open:amount',
  openSubmit: 'open:submit',
  registerItem: 'register:item',
  registerScan: 'register:scan',
  registerCart: 'register:cart',
  registerPay: 'register:pay',
  scanBarcode: 'scan:barcode',
  scanDone: 'scan:done',
  cartMore: 'cart:more',
  cartChip: 'cart:chip',
  cartDiscount: 'cart:discount',
  cartComplete: 'cart:complete',
  receiptDone: 'receipt:done',
  ordersSale: 'orders:sale',
  saleReturn: 'sale:return',
  saleCancel: 'sale:cancel',
  saleBack: 'sale:back',
  returnComplete: 'return:complete',
  returnSave: 'return:save',
  closeCounted: 'close:counted',
  closeSubmit: 'close:submit',
  openingsOpenRow: 'openings:open-row',
  closingsRow: 'closings:row',
  confirmYes: 'confirm:yes',
  dashboardPeriod: 'dashboard:period',
  stockItems: 'stock:items',
  stockPrices: 'stock:prices',
  stockImport: 'stock:import',
  stockEntries: 'stock:entries',
  stockRecons: 'stock:recons',
  stockBalance: 'stock:balance',
  itemsNew: 'items:new',
  itemScan: 'item:scan',
  scanLabel: 'scan:label',
  itemSave: 'item:save',
  pricesNew: 'prices:new',
  priceRate: 'price:rate',
  priceSave: 'price:save',
  importChoose: 'import:choose',
  importRun: 'import:run',
  entriesNew: 'entries:new',
  entriesSubmitted: 'entries:submitted',
  entryAddRow: 'entry:add-row',
  entrySave: 'entry:save',
  entrySubmit: 'entry:submit',
  entryCancel: 'entry:cancel',
  reconsNew: 'recons:new',
  reconCount: 'recon:count',
  reconSave: 'recon:save',
  reconSubmit: 'recon:submit',
  balanceRow: 'balance:row',
  accountsLedger: 'accounts:ledger',
  ledgerFilters: 'ledger:filters',
  ledgerRow: 'ledger:row',
  setupRow: 'setup:row',
  listNew: 'list:new',
  formName: 'form:name',
  formSave: 'form:save',
  employeesRow: 'employees:row',
  employeeRole: 'employee:role',
  employeeSave: 'employee:save',
  codesCreate: 'codes:create',
  codesShare: 'codes:share',
  featuresChange: 'features:change',
  levelPick: 'level:pick',
  levelSave: 'level:save',
  homeOk: 'home:ok',
} as const;

export type Target = (typeof T)[keyof typeof T];

export type Step = {
  page: Page;
  target: Target;
  title: string;
  body: string;
  /** Only on a phone: the tablet shows what this step opens beside the page already (the Register's Cart tab). */
  narrowOnly?: true;
};

export type Task = {
  id: string;
  title: string;
  /** What the person will do: the pop-up before the first step. */
  line: string;
  /** What really happens in a store: the pop-up after the last step. */
  done: string;
  /** Any one of these lets a role practise it. */
  needs: PermissionKey[];
  /** The owner's alone. */
  owner?: true;
  /** For a person with no role only. */
  noRole?: true;
  prepare?: Prepare;
  /** A Setup task: the Setup page it practises on. */
  setup?: SetupId;
  steps: Step[];
};

const setupTask = (id: SetupId, key: PermissionKey, title: string, page: string, name: string, done: string): Task => ({
  id: `setup-${id}`,
  title,
  line: `Open ${page} under Setup, add one, type its name and save it.`,
  done,
  needs: [key],
  setup: id,
  steps: [
    { page: 'setup', target: T.setupRow, title: `Open ${page}`, body: `Tap ${page} in Setup's list.` },
    { page: 'setup-list', target: T.listNew, title: 'Start a new one', body: 'Tap the New button at the top of the list.' },
    { page: 'setup-form', target: T.formName, title: 'Name it', body: `Type ${name} in the first field.` },
    { page: 'setup-form', target: T.formSave, title: 'Save it', body: 'Tap Save at the bottom. It joins the list.' },
  ],
});

// In the order the task list shows them: a cashier's day first, then stock, the books, setup, the owner's work.
export const TASKS: Task[] = [
  {
    id: 'open-session',
    title: 'Open your session',
    line: 'Start a shift: open a session on the register with the cash in your drawer.',
    done: 'In a real store the session is yours alone: every sale you ring goes into it, and the drawer is checked against it when you close.',
    needs: ['open_close_register'],
    prepare: 'no-session',
    steps: [
      { page: 'sell', target: T.sellOpen, title: 'Open a session', body: 'In Sell, tap Open Session in the session card.' },
      { page: 'open-session', target: T.openAmount, title: 'Count your drawer', body: 'Type the cash in your drawer in the CASH field — for example 500.' },
      { page: 'open-session', target: T.openSubmit, title: 'Start the shift', body: 'Tap Open Session at the bottom.' },
    ],
  },
  {
    id: 'ring-sale',
    title: 'Ring up a sale',
    line: 'Sell two items: tick them at the Register, set a quantity in the cart, then take payment.',
    done: 'A real sale takes the stock out of the warehouse and posts to the books at once. Its receipt reopens from Orders.',
    needs: ['process_sales'],
    prepare: 'session',
    steps: [
      { page: 'sell', target: T.sellRegister, title: 'Go to the Register', body: 'In Sell, tap Register in the session card.' },
      { page: 'register', target: T.registerItem, title: 'Add an item', body: 'Tap an item: it goes into the cart at one, with a tick. Tapping it again takes it out.' },
      { page: 'register', target: T.registerItem, title: 'Add another', body: 'Tap a different item.' },
      { page: 'register', target: T.registerCart, title: 'Open the cart', body: 'Tap the Cart tab at the top.', narrowOnly: true },
      { page: 'register', target: T.cartMore, title: 'Sell two', body: "Tap + on a card's quantity: two of that item." },
      { page: 'register', target: T.registerPay, title: 'Take payment', body: 'Tap Complete Order at the bottom.' },
      { page: 'register', target: T.cartComplete, title: 'Complete the order', body: 'Cash is filled with the total, or tap a quick amount. Tap Complete Order.' },
      { page: 'receipt', target: T.receiptDone, title: 'Read the receipt', body: 'This is the receipt the customer gets. Tap Return to Register.' },
    ],
  },
  {
    id: 'scan-sell',
    title: 'Scan to sell',
    line: "Ring an item up by its barcode with the phone's camera.",
    done: 'In a real store the camera reads the barcode in a fraction of a second, with no internet. Show the same product again after two seconds to add another.',
    needs: ['process_sales'],
    prepare: 'session',
    steps: [
      { page: 'sell', target: T.sellRegister, title: 'Go to the Register', body: 'In Sell, tap Register in the session card.' },
      { page: 'register', target: T.registerScan, title: 'Open the scanner', body: 'Tap the barcode button beside the search box.' },
      { page: 'scan-sell', target: T.scanBarcode, title: 'Point at a barcode', body: 'This practice camera has a barcode ready: tap Show a Barcode.' },
      { page: 'scan-sell', target: T.scanDone, title: 'Back to the Register', body: 'The Scanned list shows what went into the cart; its ✕ takes it back out. Tap Done.' },
    ],
  },
  {
    id: 'discount',
    title: 'Give a discount',
    line: 'Take 10% off a cart line before payment.',
    done: 'In a real store a discount needs Apply Discounts and a register that allows it, and the database checks both when the sale is saved.',
    needs: ['apply_discounts'],
    prepare: 'cart-line',
    steps: [
      { page: 'sell', target: T.sellRegister, title: 'Go to the Register', body: 'A coffee is already in the cart. In Sell, tap Register.' },
      { page: 'register', target: T.registerCart, title: 'Open the cart', body: 'Tap the Cart tab at the top.', narrowOnly: true },
      { page: 'register', target: T.cartChip, title: 'Open the discount', body: "Tap Discount on the coffee's card." },
      { page: 'register', target: T.cartDiscount, title: 'Type the discount', body: 'Type 10 in Discount (%). Watch the line and the total change.' },
      { page: 'register', target: T.registerPay, title: 'Take payment', body: 'Tap Complete Order at the bottom.' },
      { page: 'register', target: T.cartComplete, title: 'Complete the order', body: 'Tap Complete Order.' },
      { page: 'receipt', target: T.receiptDone, title: 'Read the receipt', body: 'The discount is on the receipt. Tap Return to Register.' },
    ],
  },
  {
    id: 'return',
    title: 'Take a return',
    line: 'A customer brings items back: find their sale and refund it.',
    done: 'In a real store a refund goes into your own open session, all of it back by one payment method that allows returns.',
    needs: ['process_refunds'],
    prepare: 'session',
    steps: [
      { page: 'sell', target: T.sellOrders, title: 'Find the sale', body: 'Tap Orders in Sell.' },
      { page: 'orders', target: T.ordersSale, title: 'Open it', body: 'Tap a sale marked SUBMITTED.' },
      { page: 'sale', target: T.saleReturn, title: 'Start the refund', body: 'Tap Refund under the receipt.' },
      { page: 'return', target: T.returnComplete, title: 'Approve it', body: 'Everything left on the sale is filled in; change a quantity if less comes back. Tap Approve Refund.' },
      { page: 'return', target: T.returnSave, title: 'Save it', body: "The refund's receipt shows. Nothing is saved yet: tap Return to Register." },
    ],
  },
  {
    id: 'void',
    title: 'Cancel (void) a sale',
    line: "Cancel a sale rung up by mistake in today's open session.",
    done: 'A real void writes reversing entries and puts the stock back. It is refused once the session is closed or a return stands — take a return then.',
    needs: ['void_sales'],
    prepare: 'ana-open',
    steps: [
      { page: 'sell', target: T.sellOrders, title: 'Find the sale', body: 'Tap Orders in Sell.' },
      { page: 'orders', target: T.ordersSale, title: "Open today's sale", body: "Tap one of today's sales by Ana Reyes." },
      { page: 'sale', target: T.saleCancel, title: 'Cancel it', body: 'Tap the red Cancel under the receipt.' },
      { page: 'sale', target: T.confirmYes, title: 'Confirm', body: 'Tap Cancel Sale in the box that opens.' },
    ],
  },
  {
    id: 'orders',
    title: 'Look up a past order',
    line: "Reopen an old sale's receipt for a customer's question.",
    done: 'In a real store Orders lists every sale and return, newest first, and only people with View Sales see it.',
    needs: ['view_sales'],
    steps: [
      { page: 'sell', target: T.sellOrders, title: 'Open Orders', body: 'Tap Orders in Sell.' },
      { page: 'orders', target: T.ordersSale, title: 'Open a sale', body: 'Tap any sale.' },
      { page: 'sale', target: T.saleBack, title: 'Read and go back', body: 'Read the receipt, then tap the back arrow.' },
    ],
  },
  {
    id: 'shift-totals',
    title: 'Check a shift',
    line: "Read yesterday's closing: what the drawer should have held and what was counted.",
    done: 'A real closing entry keeps, per payment method, the opening, expected and counted amounts and the difference.',
    needs: ['view_shift_totals'],
    steps: [
      { page: 'sell', target: T.sellClosings, title: 'Open the closings', body: 'Tap POS Closing Entries in Sell.' },
      { page: 'closing-entries', target: T.closingsRow, title: 'Read one', body: 'Tap the closing to see its figures.' },
    ],
  },
  {
    id: 'close-any',
    title: 'Close a register someone left open',
    line: "Ana went home without closing. Count her drawer and close her session.",
    done: 'In a real store only the cashier, or someone with Close Any Register, may close a session.',
    needs: ['close_any_register'],
    steps: [
      { page: 'sell', target: T.sellOpenings, title: 'Find the open session', body: 'Tap POS Opening Entries in Sell.' },
      { page: 'opening-entries', target: T.openingsOpenRow, title: 'Open it', body: "Tap Ana Reyes' session marked OPEN." },
      { page: 'close-session', target: T.closeCounted, title: 'Count the drawer', body: 'Type the cash you counted in the CASH field.' },
      { page: 'close-session', target: T.closeSubmit, title: 'Close it', body: 'Tap Close Session at the bottom.' },
    ],
  },
  {
    id: 'close-own',
    title: 'Close your session',
    line: 'End your shift: count the drawer and close your session.',
    done: 'A real closing posts the difference between what you counted and what the drawer should hold.',
    needs: ['open_close_register'],
    prepare: 'session',
    steps: [
      { page: 'sell', target: T.sellClose, title: 'Close the session', body: 'In Sell, tap Close Session in the session card.' },
      { page: 'close-session', target: T.closeCounted, title: 'Count your drawer', body: 'Type the cash you counted in the CASH field.' },
      { page: 'close-session', target: T.closeSubmit, title: 'Close it', body: 'Tap Close Session at the bottom.' },
    ],
  },
  {
    id: 'dashboard',
    title: 'Read the Dashboard',
    line: 'See how the store is doing over the last seven days.',
    done: 'A real Dashboard adds up only what you may read: each card and list shows with its permission.',
    needs: ['view_sales', 'view_shift_totals', 'close_any_register', 'view_stock'],
    steps: [{ page: 'dashboard', target: T.dashboardPeriod, title: 'Pick a period', body: 'Tap Last 7 Days at the top, then read the cards.' }],
  },
  {
    id: 'check-stock',
    title: 'Check stock on hand',
    line: 'See what each item has and what is running low.',
    done: 'A real Stock Balance is kept by every sale, return and stock document, valued by FIFO or Moving Average.',
    needs: ['view_stock'],
    steps: [
      { page: 'stock', target: T.stockBalance, title: 'Open Stock Balance', body: 'Tap Stock Balance in Stock.' },
      { page: 'stock-balance', target: T.balanceRow, title: 'Read an item', body: 'Tap an item to see its movements.' },
    ],
  },
  {
    id: 'add-item',
    title: 'Add a product',
    line: 'Add a new item, letting the camera read its barcode and label.',
    done: 'A real scan reads the barcode and the label on the phone (Google ML Kit) and fills only empty fields. Nothing is saved until Save.',
    needs: ['manage_items'],
    steps: [
      { page: 'stock', target: T.stockItems, title: 'Open Items', body: 'Tap Items in Stock.' },
      { page: 'items', target: T.itemsNew, title: 'Start a new item', body: 'Tap New Item at the top.' },
      { page: 'item', target: T.itemScan, title: 'Scan the product', body: 'Tap Scan Product at the top of the form.' },
      { page: 'scan-item', target: T.scanLabel, title: 'Read the label', body: 'The practice camera sees a jar of peanut butter: tap Read Label.' },
      { page: 'item', target: T.itemSave, title: 'Save it', body: 'The fields are filled. Check them, then tap Save.' },
    ],
  },
  {
    id: 'item-price',
    title: 'Set a price',
    line: "Change an item's selling price.",
    done: "A real Item Price is the item's rate in one price list for one unit. The Register sells at Standard Selling's.",
    needs: ['manage_items'],
    steps: [
      { page: 'stock', target: T.stockPrices, title: 'Open Item Prices', body: 'Tap Item Prices in Stock.' },
      { page: 'item-prices', target: T.pricesNew, title: 'Start a new price', body: 'Tap New Item Price.' },
      { page: 'item-price', target: T.priceRate, title: 'Type the rate', body: 'Type the new rate — for example 13.' },
      { page: 'item-price', target: T.priceSave, title: 'Save it', body: 'Tap Save.' },
    ],
  },
  {
    id: 'import',
    title: 'Import items from a file',
    line: 'Add many items at once from a spreadsheet.',
    done: 'A real import reads every row first and imports nothing until every row is right — up to 500 items a file.',
    needs: ['manage_items'],
    steps: [
      { page: 'stock', target: T.stockImport, title: 'Open Import Items', body: 'Tap Import Items in Stock.' },
      { page: 'import', target: T.importChoose, title: 'Choose the file', body: 'Tap Choose File. The practice file has three items.' },
      { page: 'import', target: T.importRun, title: 'Import', body: 'Nothing is wrong with it. Tap Import 3 Items.' },
    ],
  },
  {
    id: 'delivery',
    title: 'Log a delivery',
    line: 'Two dozen bottled water arrived: record them as a stock entry.',
    done: 'A real Stock Entry posts to the Stock Ledger, and to the books with Perpetual Inventory. Once submitted it cannot change.',
    needs: ['move_stock'],
    steps: [
      { page: 'stock', target: T.stockEntries, title: 'Open Stock Entries', body: 'Tap Stock Entries in Stock.' },
      { page: 'stock-entries', target: T.entriesNew, title: 'Start a new entry', body: 'Tap New Stock Entry. Its purpose is Material Receipt.' },
      { page: 'stock-entry', target: T.entryAddRow, title: 'Add the delivery', body: 'Tap + Add Bottled Water × 24.' },
      { page: 'stock-entry', target: T.entrySave, title: 'Save the draft', body: 'Tap Save.' },
      { page: 'stock-entry', target: T.entrySubmit, title: 'Submit it', body: 'Tap Submit at the top.' },
      { page: 'stock-entry', target: T.confirmYes, title: 'Confirm', body: 'Tap Submit in the box that opens. The stock comes in.' },
    ],
  },
  {
    id: 'count',
    title: 'Count stock',
    line: 'Correct the books to a shelf count.',
    done: 'A real Stock Reconciliation sets each item to what was counted and posts the difference.',
    needs: ['adjust_inventory'],
    steps: [
      { page: 'stock', target: T.stockRecons, title: 'Open Stock Reconciliations', body: 'Tap Stock Reconciliations in Stock.' },
      { page: 'recons', target: T.reconsNew, title: 'Start a count', body: 'Tap New Stock Reconciliation.' },
      { page: 'recon', target: T.reconCount, title: 'Type a count', body: 'Every item starts at what the books say. Change one quantity to what you counted.' },
      { page: 'recon', target: T.reconSave, title: 'Save the draft', body: 'Tap Save.' },
      { page: 'recon', target: T.reconSubmit, title: 'Submit it', body: 'Tap Submit at the top.' },
      { page: 'recon', target: T.confirmYes, title: 'Confirm', body: 'Tap Submit in the box that opens.' },
    ],
  },
  {
    id: 'cancel-entry',
    title: 'Cancel a wrong stock entry',
    line: 'Undo a delivery that was logged by mistake.',
    done: 'A real cancel writes reversing entries: the document stays, marked Cancelled.',
    needs: ['adjust_inventory'],
    steps: [
      { page: 'stock', target: T.stockEntries, title: 'Open Stock Entries', body: 'Tap Stock Entries in Stock.' },
      { page: 'stock-entries', target: T.entriesSubmitted, title: 'Open the entry', body: 'Tap the entry marked SUBMITTED.' },
      { page: 'stock-entry', target: T.entryCancel, title: 'Cancel it', body: 'Tap the red Cancel at the top.' },
      { page: 'stock-entry', target: T.confirmYes, title: 'Confirm', body: 'Tap Cancel Entry in the box that opens.' },
    ],
  },
  {
    id: 'ledger',
    title: 'Read the General Ledger',
    line: 'See every debit and credit the sales wrote.',
    done: 'A real General Ledger lists every entry of the books; a row opens the document that wrote it.',
    needs: ['view_ledger'],
    steps: [
      { page: 'accounts', target: T.accountsLedger, title: 'Open the General Ledger', body: 'Tap General Ledger in Accounts.' },
      { page: 'general-ledger', target: T.ledgerFilters, title: 'Narrow it', body: 'Tap Filters, then Cash.' },
      { page: 'general-ledger', target: T.ledgerRow, title: 'Read a row', body: 'Tap a row to see the sale behind it.' },
    ],
  },
  setupTask('fiscal-years', 'manage_company', 'Add a fiscal year', 'Fiscal Years', '2027', 'A real fiscal year is checked: a full year ends the day before the same date a year on, and two years cannot share a day.'),
  setupTask('modes-of-payment', 'manage_accounting', 'Add a way to pay', 'Modes of Payment', 'GCash', 'A real mode of payment needs a ledger of the right type before a register can offer it.'),
  setupTask('tax-templates', 'manage_taxes', 'Add a tax template', 'Sales Taxes and Charges Templates', 'Zero Rated', "A real template's rows are checked, and Test Template runs it on a sample sale."),
  setupTask('warehouses', 'manage_stock_setup', 'Add a warehouse', 'Warehouses', 'Back Room', "A real warehouse sits in a tree, and posts to its own stock account or its parent's."),
  setupTask('pricing-rules', 'manage_selling', 'Add a pricing rule', 'Pricing Rules', 'Coffee Week', "A real pricing rule applies itself at the Register: an item's rule wins over its group's, then its brand's."),
  setupTask('pos-profiles', 'manage_pos_profiles', 'Set up a register', 'POS Profiles', 'Front Counter', 'A real POS Profile needs exactly one default payment method, each with an account.'),
  setupTask('print-formats', 'manage_printing', 'Add a receipt layout', 'Print Formats', 'Small Receipt', 'A real print format draws a sample receipt as you type.'),
  {
    id: 'give-role',
    title: 'Give someone a role',
    line: 'Carla got in with an access code. Make her a Cashier.',
    done: 'In a real store the person is told once with an Access changed notification, and their app follows within a minute.',
    needs: [],
    owner: true,
    steps: [
      { page: 'employees', target: T.employeesRow, title: 'Open Carla', body: 'Tap Carla Santos — she has No role.' },
      { page: 'employee', target: T.employeeRole, title: 'Pick a role', body: 'Tap Cashier.' },
      { page: 'employee', target: T.employeeSave, title: 'Save it', body: 'Tap Save Changes.' },
    ],
  },
  {
    id: 'access-code',
    title: 'Let someone in',
    line: 'Make an access code and send it to a new employee.',
    done: 'A real code is six letters and numbers. The person types it in, and you approve them on Requests.',
    needs: [],
    owner: true,
    steps: [
      { page: 'access-codes', target: T.codesCreate, title: 'Make a code', body: 'Tap Create Code.' },
      { page: 'access-codes', target: T.codesShare, title: 'Send it', body: "Tap the share button beside the code. (The practice store doesn't send anything.)" },
    ],
  },
  {
    id: 'store-level',
    title: "Change the store's level",
    line: 'Show the store only what it uses.',
    done: "A real level change sets things up for the store and starts everyone's menu from the new level. Nothing is turned off.",
    needs: [],
    owner: true,
    steps: [
      { page: 'features', target: T.featuresChange, title: 'Open Change Level', body: 'Tap Change Level in the Store Level box.' },
      { page: 'store-level', target: T.levelPick, title: 'Pick a level', body: 'Tap Level 2 · Sell & Restock.' },
      { page: 'store-level', target: T.levelSave, title: 'Save it', body: 'Tap Save.' },
    ],
  },
  {
    id: 'no-role',
    title: 'Wait for a role',
    line: 'See what the store shows someone the owner let in but gave no role.',
    done: 'Once the owner gives you a role, your menu fills within a minute — no need to sign out.',
    needs: [],
    noRole: true,
    steps: [{ page: 'home', target: T.homeOk, title: 'Read Home', body: "Home says why it is empty. Tap Got It." }],
  },
];

/** The tasks a role practises: the owner every one but No role's, No role its own, anyone else by permission. */
export function tasksFor(role: Role): Task[] {
  if (role.owner) return TASKS.filter((task) => !task.noRole);
  if (role.permissions.length === 0) return TASKS.filter((task) => task.noRole);
  return TASKS.filter((task) => !task.owner && !task.noRole && task.needs.some((key) => role.permissions.includes(key)));
}

/** A task's steps at this width: a phone opens the Register's Cart tab, a tablet shows the cart beside the items. */
export const stepsAt = (task: Task, wide: boolean) => task.steps.filter((step) => !(wide && step.narrowOnly));
