// The Store Guide's practice store: mock records and what each practice action does to them. No database — the
// sandbox holds one of these in memory and drops it on exit. Import-free: asserted in tools/check-logic.mjs.
//
// It mimics the real rules a person meets (a sale takes stock out and adds to the drawer's expected cash, a return
// puts both back, a void needs the sale's session open, a submitted document is locked), not the real posting engine
// (supabase/migrations/20261011165554_ledgers.sql): the figures are kept simple enough to follow on screen.

/** The practice store's day: fixed, so a tester reads the same dates every run. */
export const TODAY = '2026-10-22';
const YESTERDAY = '2026-10-21';
/** Who the person practising is, wherever a name is printed. */
export const ME = 'You';
const VAT = 0.12;

export type Item = { code: string; name: string; barcode: string; group: string; price: number; stock: number; cost: number; reorder: number };
/** A line as sold: `discount` is its Discount (%), off the rate (the cart card's chip). */
export type OrderLine = { code: string; name: string; qty: number; rate: number; discount?: number };
export type Order = {
  id: string;
  number: string;
  date: string;
  cashier: string;
  sessionId: string;
  lines: OrderLine[];
  net: number;
  tax: number;
  total: number;
  status: 'Submitted' | 'Cancelled';
  /** A return: the sale it takes back. Its lines and figures are below zero. */
  returnAgainst?: string;
};
export type Session = { id: string; number: string; cashier: string; register: string; date: string; opening: number; status: 'Open' | 'Closed'; counted?: number };
export type DocStatus = 'Draft' | 'Submitted' | 'Cancelled';
export type StockEntry = { id: string; number: string; date: string; rows: { code: string; qty: number; rate: number }[]; status: DocStatus };
export type Reconciliation = { id: string; number: string; date: string; rows: { code: string; qty: number }[]; status: DocStatus };
export type Move = { date: string; code: string; qty: number; voucher: string };
export type Price = { code: string; list: string; rate: number };
export type SetupId = 'fiscal-years' | 'modes-of-payment' | 'tax-templates' | 'warehouses' | 'pricing-rules' | 'pos-profiles' | 'print-formats';
export type SetupRow = { page: SetupId; name: string; detail: string };
export type Employee = { id: string; name: string; email: string; role: string | null };

export type Store = {
  items: Item[];
  prices: Price[];
  sales: Order[];
  sessions: Session[];
  /** The session the person practising has open, if any. */
  mine: string | null;
  /** The Register's cart: each line's quantity and its Discount (%). */
  cart: { code: string; qty: number; discount: number }[];
  entries: StockEntry[];
  recons: Reconciliation[];
  moves: Move[];
  setup: SetupRow[];
  employees: Employee[];
  codes: string[];
  level: number;
  /** The next number any new record takes. */
  seq: number;
};

/** One Setup page a setup permission opens in the practice store (src/screens/guide/pages/setup.tsx). */
export type SetupPage = {
  id: SetupId;
  title: string;
  section: string;
  line: string;
  newLabel: string;
  nameLabel: string;
  /** What the guide asks the person to type. */
  sample: string;
  detailLabel: string;
  sampleDetail: string;
};

export const SETUP_PAGES: SetupPage[] = [
  {
    id: 'fiscal-years',
    title: 'Fiscal Years',
    section: 'Store & Calendar',
    line: 'The accounting years every posting date must fall in.',
    newLabel: 'New Fiscal Year',
    nameLabel: 'Year Name',
    sample: '2027',
    detailLabel: 'Year Start Date',
    sampleDetail: '2027-01-01',
  },
  {
    id: 'modes-of-payment',
    title: 'Modes of Payment',
    section: 'Payments',
    line: 'Each way a customer can pay, and the account it lands in.',
    newLabel: 'New Mode of Payment',
    nameLabel: 'Name',
    sample: 'GCash',
    detailLabel: 'Type',
    sampleDetail: 'Phone',
  },
  {
    id: 'tax-templates',
    title: 'Sales Taxes and Charges Templates',
    section: 'Taxes',
    line: 'The tax rows a sale gets.',
    newLabel: 'New Template',
    nameLabel: 'Title',
    sample: 'Zero Rated',
    detailLabel: 'Tax Rate',
    sampleDetail: '0',
  },
  {
    id: 'warehouses',
    title: 'Warehouses',
    section: 'Stock',
    line: 'The places stock is kept.',
    newLabel: 'New Warehouse',
    nameLabel: 'Warehouse Name',
    sample: 'Back Room',
    detailLabel: 'Parent Warehouse',
    sampleDetail: 'All Warehouses',
  },
  {
    id: 'pricing-rules',
    title: 'Pricing Rules',
    section: 'Selling',
    line: 'Automatic discounts on an item, an item group or a brand.',
    newLabel: 'New Pricing Rule',
    nameLabel: 'Title',
    sample: 'Coffee Week',
    detailLabel: 'Discount Percentage',
    sampleDetail: '5',
  },
  {
    id: 'pos-profiles',
    title: 'POS Profiles',
    section: 'Point of Sale',
    line: 'Each register: its warehouse, payment methods and users.',
    newLabel: 'New POS Profile',
    nameLabel: 'POS Profile Name',
    sample: 'Front Counter',
    detailLabel: 'Warehouse',
    sampleDetail: 'Stores',
  },
  {
    id: 'print-formats',
    title: 'Print Formats',
    section: 'Naming & Printing',
    line: 'The layout a receipt prints in.',
    newLabel: 'New Print Format',
    nameLabel: 'Name',
    sample: 'Small Receipt',
    detailLabel: 'Paper',
    sampleDetail: '58mm',
  },
];

const ITEMS: Item[] = [
  { code: 'ITEM-0001', name: 'Classic Instant Coffee 25g', barcode: '4800016644214', group: 'Beverages', price: 12, stock: 48, cost: 9, reorder: 10 },
  { code: 'ITEM-0002', name: 'Pandesal (pack of 10)', barcode: '4801234500012', group: 'Bakery', price: 45, stock: 12, cost: 32, reorder: 5 },
  { code: 'ITEM-0003', name: 'Bottled Water 500ml', barcode: '4800049720111', group: 'Beverages', price: 20, stock: 6, cost: 12, reorder: 12 },
  { code: 'ITEM-0004', name: 'Corned Beef 150g', barcode: '4800024556631', group: 'Canned Goods', price: 48, stock: 20, cost: 38, reorder: 8 },
  { code: 'ITEM-0005', name: 'Chicken Instant Noodles', barcode: '4807770270017', group: 'Noodles', price: 14, stock: 0, cost: 10, reorder: 15 },
  { code: 'ITEM-0006', name: 'Laundry Soap Bar', barcode: '4800888120015', group: 'Household', price: 28, stock: 30, cost: 21, reorder: 10 },
];

const round2 = (value: number) => Math.round(value * 100) / 100;

/** A cart's or a sale's figures: lines less each one's discount, VAT on top, and the Rounded Total to the peso. */
export function totals(lines: OrderLine[]) {
  const gross = round2(lines.reduce((sum, line) => sum + line.qty * line.rate, 0));
  const off = round2(lines.reduce((sum, line) => sum + (line.qty * line.rate * (line.discount ?? 0)) / 100, 0));
  const net = round2(gross - off);
  const tax = round2(net * VAT);
  const total = round2(net + tax);
  return { gross, off, net, tax, total, rounded: Math.round(total) };
}

function seededSale(id: string, number: string, date: string, sessionId: string, lines: OrderLine[]): Order {
  const figures = totals(lines);
  return { id, number, date, cashier: 'Ana Reyes', sessionId, lines, net: figures.net, tax: figures.tax, total: figures.rounded, status: 'Submitted' };
}

const line = (code: string, qty: number): OrderLine => {
  const item = ITEMS.find((candidate) => candidate.code === code);
  return { code, name: item?.name ?? code, qty, rate: item?.price ?? 0 };
};

/** The practice store as it opens: Ana's shift yesterday (closed) and today (left open), a delivery, a count. */
export function initialStore(): Store {
  return {
    items: ITEMS.map((item) => ({ ...item })),
    prices: ITEMS.map((item) => ({ code: item.code, list: 'Standard Selling', rate: item.price })),
    sessions: [
      { id: 's1', number: 'POS-OPE-2026-00001', cashier: 'Ana Reyes', register: 'Main Register', date: YESTERDAY, opening: 500, status: 'Closed', counted: 905 },
      { id: 's2', number: 'POS-OPE-2026-00002', cashier: 'Ana Reyes', register: 'Main Register', date: TODAY, opening: 500, status: 'Open' },
    ],
    sales: [
      seededSale('v1', 'ACC-PSINV-2026-00001', YESTERDAY, 's1', [line('ITEM-0002', 3), line('ITEM-0001', 10)]),
      seededSale('v2', 'ACC-PSINV-2026-00002', YESTERDAY, 's1', [line('ITEM-0004', 2), line('ITEM-0006', 1)]),
      seededSale('v3', 'ACC-PSINV-2026-00003', TODAY, 's2', [line('ITEM-0003', 4), line('ITEM-0001', 5)]),
      seededSale('v4', 'ACC-PSINV-2026-00004', TODAY, 's2', [line('ITEM-0004', 1)]),
    ],
    mine: null,
    cart: [],
    entries: [{ id: 'e1', number: 'MAT-STE-2026-00001', date: YESTERDAY, rows: [{ code: 'ITEM-0006', qty: 12, rate: 21 }], status: 'Submitted' }],
    recons: [{ id: 'r1', number: 'MAT-RECO-2026-00001', date: '2026-10-01', rows: ITEMS.map((item) => ({ code: item.code, qty: item.stock })), status: 'Submitted' }],
    moves: [
      { date: '2026-10-01', code: 'ITEM-0001', qty: 63, voucher: 'MAT-RECO-2026-00001' },
      { date: YESTERDAY, code: 'ITEM-0006', qty: 12, voucher: 'MAT-STE-2026-00001' },
      { date: YESTERDAY, code: 'ITEM-0001', qty: -10, voucher: 'ACC-PSINV-2026-00001' },
      { date: TODAY, code: 'ITEM-0001', qty: -5, voucher: 'ACC-PSINV-2026-00003' },
    ],
    setup: [
      { page: 'fiscal-years', name: '2026', detail: '2026-01-01 to 2026-12-31 · Default' },
      { page: 'modes-of-payment', name: 'Cash', detail: 'Cash · Cash' },
      { page: 'modes-of-payment', name: 'Credit Card', detail: 'Bank · no account yet' },
      { page: 'tax-templates', name: 'Philippines Tax', detail: 'VAT @ 12' },
      { page: 'warehouses', name: 'Stores', detail: 'Under All Warehouses · Stock In Hand' },
      { page: 'pos-profiles', name: 'Main Register', detail: 'Stores · Cash' },
      { page: 'print-formats', name: 'POS Receipt', detail: '80mm · Default' },
    ],
    employees: [
      { id: 'm1', name: 'Ana Reyes', email: 'ana@example.com', role: 'Cashier' },
      { id: 'm2', name: 'Ben Cruz', email: 'ben@example.com', role: 'Stock Clerk' },
      { id: 'm3', name: 'Carla Santos', email: 'carla@example.com', role: null },
    ],
    codes: [],
    level: 5,
    seq: 1,
  };
}

/** A practice action that made a record: the store after it, and the new record's id. */
export type Created = { store: Store; id: string };

const pad = (value: number) => String(value).padStart(5, '0');
const findItem = (store: Store, code: string) => store.items.find((item) => item.code === code);
const withStock = (store: Store, code: string, delta: number): Item[] =>
  store.items.map((item) => (item.code === code ? { ...item, stock: item.stock + delta } : item));

/** The cart as sale lines, at today's price. */
export function cartLines(store: Store): OrderLine[] {
  return store.cart.map((entry) => {
    const item = findItem(store, entry.code);
    return { code: entry.code, name: item?.name ?? entry.code, qty: entry.qty, rate: item?.price ?? 0, discount: entry.discount };
  });
}

export function openSession(store: Store, opening: number): Store {
  if (store.mine) return store;
  const id = `s-me-${store.seq}`;
  const session: Session = { id, number: `POS-OPE-2026-${pad(store.sessions.length + 1)}`, cashier: ME, register: 'Main Register', date: TODAY, opening, status: 'Open' };
  return { ...store, sessions: [...store.sessions, session], mine: id, seq: store.seq + 1 };
}

/** One more of an item: a scan, or a row tapped while out of the cart. */
export function addToCart(store: Store, code: string): Store {
  const has = store.cart.some((entry) => entry.code === code);
  const cart = has ? store.cart.map((entry) => (entry.code === code ? { ...entry, qty: entry.qty + 1 } : entry)) : [...store.cart, { code, qty: 1, discount: 0 }];
  return { ...store, cart };
}

/** The whole line out: a row tapped while in the cart, or the card's trash. */
export function removeFromCart(store: Store, code: string): Store {
  return { ...store, cart: store.cart.filter((entry) => entry.code !== code) };
}

/** One less, the line going at none: a scan taken back from the Scanned list. */
export function takeFromCart(store: Store, code: string): Store {
  const cart = store.cart.map((entry) => (entry.code === code ? { ...entry, qty: entry.qty - 1 } : entry)).filter((entry) => entry.qty > 0);
  return { ...store, cart };
}

/** The card's stepper: a whole quantity, 1 at least. */
export const setQty = (store: Store, code: string, qty: number): Store => ({
  ...store,
  cart: store.cart.map((entry) => (entry.code === code ? { ...entry, qty: Math.max(1, Math.round(qty)) } : entry)),
});

/** A line's Discount (%), held to 0–100. */
export const setDiscount = (store: Store, code: string, percent: number): Store => ({
  ...store,
  cart: store.cart.map((entry) => (entry.code === code ? { ...entry, discount: Math.min(100, Math.max(0, percent)) } : entry)),
});

/** Complete Order: the cart becomes a sale in the person's session, its stock goes out. Null without a session or a line. */
export function completeOrder(store: Store): Created | null {
  if (!store.mine || store.cart.length === 0) return null;
  const lines = cartLines(store);
  const figures = totals(lines);
  const id = `v-me-${store.seq}`;
  const number = `ACC-PSINV-2026-${pad(store.sales.length + 1)}`;
  const sale: Order = { id, number, date: TODAY, cashier: ME, sessionId: store.mine, lines, net: figures.net, tax: figures.tax, total: figures.rounded, status: 'Submitted' };
  let items = store.items;
  for (const entry of lines) items = items.map((item) => (item.code === entry.code ? { ...item, stock: item.stock - entry.qty } : item));
  const moves = [...store.moves, ...lines.map((entry) => ({ date: TODAY, code: entry.code, qty: -entry.qty, voucher: number }))];
  return { store: { ...store, items, moves, sales: [...store.sales, sale], cart: [], seq: store.seq + 1 }, id };
}

/** What a sale still has to give back: each line less what earlier returns took. */
export function returnable(store: Store, saleId: string): OrderLine[] {
  const sale = store.sales.find((candidate) => candidate.id === saleId);
  if (!sale) return [];
  const returns = store.sales.filter((candidate) => candidate.returnAgainst === saleId && candidate.status === 'Submitted');
  return sale.lines
    .map((entry) => ({ ...entry, qty: entry.qty + returns.reduce((sum, back) => sum + (back.lines.find((other) => other.code === entry.code)?.qty ?? 0), 0) }))
    .filter((entry) => entry.qty > 0);
}

/** What a refund takes back of each line: what was typed, else all that is left; lines at none go. */
export function refundLines(store: Store, saleId: string, taking: Record<string, number> = {}): OrderLine[] {
  return returnable(store, saleId)
    .map((entry) => ({ ...entry, qty: taking[entry.code] ?? entry.qty }))
    .filter((entry) => entry.qty > 0);
}

/**
 * Return to Register on an approved refund: what `taking` names (all that is left by default) comes back, in the
 * person's own open session (as the real poster asks). Null for more than is left, or for nothing.
 */
export function returnSale(store: Store, saleId: string, taking: Record<string, number> = {}): Created | null {
  const sale = store.sales.find((candidate) => candidate.id === saleId);
  const left = returnable(store, saleId);
  const back = refundLines(store, saleId, taking);
  const over = back.some((entry) => entry.qty > (left.find((other) => other.code === entry.code)?.qty ?? 0));
  if (!store.mine || !sale || sale.status !== 'Submitted' || sale.returnAgainst || back.length === 0 || over) return null;
  const lines = back.map((entry) => ({ ...entry, qty: -entry.qty }));
  const figures = totals(lines);
  const id = `v-me-${store.seq}`;
  const number = `ACC-PSINV-2026-${pad(store.sales.length + 1)}`;
  const refund: Order = { id, number, date: TODAY, cashier: ME, sessionId: store.mine, lines, net: figures.net, tax: figures.tax, total: figures.rounded, status: 'Submitted', returnAgainst: saleId };
  let items = store.items;
  for (const entry of back) items = items.map((item) => (item.code === entry.code ? { ...item, stock: item.stock + entry.qty } : item));
  const moves = [...store.moves, ...back.map((entry) => ({ date: TODAY, code: entry.code, qty: entry.qty, voucher: number }))];
  return { store: { ...store, items, moves, sales: [...store.sales, refund], seq: store.seq + 1 }, id };
}

/** Why a sale cannot be cancelled, or null when it can: its session must be open and no return may stand. */
export function voidRefusal(store: Store, saleId: string) {
  const sale = store.sales.find((candidate) => candidate.id === saleId);
  if (!sale || sale.status !== 'Submitted') return 'This sale is already cancelled.';
  if (sale.returnAgainst) return 'A return is undone with a sale, not cancelled.';
  if (store.sales.some((candidate) => candidate.returnAgainst === saleId && candidate.status === 'Submitted')) return 'This sale has a return, so it cannot be cancelled.';
  if (store.sessions.find((session) => session.id === sale.sessionId)?.status !== 'Open') return "This sale's session is closed. Take a return instead.";
  return null;
}

/** Cancel: the sale stays listed as Cancelled and its stock comes back. */
export function voidSale(store: Store, saleId: string): Store {
  if (voidRefusal(store, saleId)) return store;
  const sale = store.sales.find((candidate) => candidate.id === saleId);
  if (!sale) return store;
  let items = store.items;
  for (const entry of sale.lines) items = items.map((item) => (item.code === entry.code ? { ...item, stock: item.stock + entry.qty } : item));
  const moves = [...store.moves, ...sale.lines.map((entry) => ({ date: TODAY, code: entry.code, qty: entry.qty, voucher: `${sale.number} (cancelled)` }))];
  return { ...store, items, moves, sales: store.sales.map((candidate) => (candidate.id === saleId ? { ...candidate, status: 'Cancelled' } : candidate)) };
}

/** The cash a session's drawer should hold: its opening amount plus what its submitted sales and returns took in. */
export function expectedCash(store: Store, sessionId: string) {
  const session = store.sessions.find((candidate) => candidate.id === sessionId);
  const taken = store.sales.filter((sale) => sale.sessionId === sessionId && sale.status === 'Submitted').reduce((sum, sale) => sum + sale.total, 0);
  return (session?.opening ?? 0) + taken;
}

/** Close Session: the count is kept against what was expected. */
export function closeSession(store: Store, sessionId: string, counted: number): Store {
  const sessions = store.sessions.map((session) => (session.id === sessionId && session.status === 'Open' ? { ...session, status: 'Closed' as const, counted } : session));
  return { ...store, sessions, mine: store.mine === sessionId ? null : store.mine, cart: store.mine === sessionId ? [] : store.cart };
}

/** A new draft Material Receipt, with no rows yet. */
export function newEntry(store: Store): Created {
  const id = `e-me-${store.seq}`;
  const entry: StockEntry = { id, number: `MAT-STE-2026-${pad(store.entries.length + 1)}`, date: TODAY, rows: [], status: 'Draft' };
  return { store: { ...store, entries: [...store.entries, entry], seq: store.seq + 1 }, id };
}

export function addEntryRow(store: Store, id: string, code: string, qty: number): Store {
  const rate = findItem(store, code)?.cost ?? 0;
  return { ...store, entries: store.entries.map((entry) => (entry.id === id && entry.status === 'Draft' ? { ...entry, rows: [...entry.rows, { code, qty, rate }] } : entry)) };
}

/** Submit: a Material Receipt's rows come in. A draft with no rows stays a draft. */
export function submitEntry(store: Store, id: string): Store {
  const entry = store.entries.find((candidate) => candidate.id === id);
  if (!entry || entry.status !== 'Draft' || entry.rows.length === 0) return store;
  let next: Store = { ...store, entries: store.entries.map((candidate) => (candidate.id === id ? { ...candidate, status: 'Submitted' } : candidate)) };
  for (const row of entry.rows) next = { ...next, items: withStock(next, row.code, row.qty), moves: [...next.moves, { date: TODAY, code: row.code, qty: row.qty, voucher: entry.number }] };
  return next;
}

/** Cancel: a submitted entry's rows go back out. */
export function cancelEntry(store: Store, id: string): Store {
  const entry = store.entries.find((candidate) => candidate.id === id);
  if (!entry || entry.status !== 'Submitted') return store;
  let next: Store = { ...store, entries: store.entries.map((candidate) => (candidate.id === id ? { ...candidate, status: 'Cancelled' } : candidate)) };
  for (const row of entry.rows) next = { ...next, items: withStock(next, row.code, -row.qty), moves: [...next.moves, { date: TODAY, code: row.code, qty: -row.qty, voucher: `${entry.number} (cancelled)` }] };
  return next;
}

/** A draft count: every item at what the books say, for the person to correct. */
export function newRecon(store: Store): Created {
  const id = `r-me-${store.seq}`;
  const recon: Reconciliation = { id, number: `MAT-RECO-2026-${pad(store.recons.length + 1)}`, date: TODAY, rows: store.items.map((item) => ({ code: item.code, qty: item.stock })), status: 'Draft' };
  return { store: { ...store, recons: [...store.recons, recon], seq: store.seq + 1 }, id };
}

export function setCount(store: Store, id: string, code: string, qty: number): Store {
  return {
    ...store,
    recons: store.recons.map((recon) =>
      recon.id === id && recon.status === 'Draft' ? { ...recon, rows: recon.rows.map((row) => (row.code === code ? { ...row, qty: Math.max(0, qty) } : row)) } : recon,
    ),
  };
}

/** Submit a count: each item's stock becomes what was counted. */
export function submitRecon(store: Store, id: string): Store {
  const recon = store.recons.find((candidate) => candidate.id === id);
  if (!recon || recon.status !== 'Draft') return store;
  let next: Store = { ...store, recons: store.recons.map((candidate) => (candidate.id === id ? { ...candidate, status: 'Submitted' } : candidate)) };
  for (const row of recon.rows) {
    const delta = row.qty - (findItem(next, row.code)?.stock ?? 0);
    if (delta !== 0) next = { ...next, items: withStock(next, row.code, delta), moves: [...next.moves, { date: TODAY, code: row.code, qty: delta, voucher: recon.number }] };
  }
  return next;
}

export type NewItem = { name: string; barcode: string; price: number; stock: number; cost: number };

/** Save on New Item: numbered by the Item series, as a Level 1–2 store does. */
export function addItem(store: Store, item: NewItem): Store {
  const code = `STO-ITEM-2026-${pad(store.items.length + 1)}`;
  const added: Item = { code, name: item.name, barcode: item.barcode, group: 'Products', price: item.price, stock: item.stock, cost: item.cost, reorder: 0 };
  return { ...store, items: [...store.items, added], prices: [...store.prices, { code, list: 'Standard Selling', rate: item.price }] };
}

/** An Item Price: the item's rate in a list. In Standard Selling it is also the Register's price. */
export function addPrice(store: Store, code: string, list: string, rate: number): Store {
  const items = list === 'Standard Selling' ? store.items.map((item) => (item.code === code ? { ...item, price: rate } : item)) : store.items;
  return { ...store, items, prices: [...store.prices.filter((price) => !(price.code === code && price.list === list)), { code, list, rate }] };
}

/** The practice file's three rows (Import Items). */
export const IMPORT_ROWS: NewItem[] = [
  { name: 'Brown Sugar 1kg', barcode: '4800361000017', price: 75, stock: 10, cost: 60 },
  { name: 'Cooking Oil 1L', barcode: '4800361000024', price: 110, stock: 8, cost: 92 },
  { name: 'Table Salt 250g', barcode: '4800361000031', price: 18, stock: 25, cost: 12 },
];

export function importItems(store: Store): Store {
  return IMPORT_ROWS.reduce(addItem, store);
}

export const addSetupRow = (store: Store, page: SetupId, name: string, detail: string): Store => ({ ...store, setup: [...store.setup, { page, name, detail }] });

export const setRole = (store: Store, employeeId: string, role: string | null): Store => ({
  ...store,
  employees: store.employees.map((employee) => (employee.id === employeeId ? { ...employee, role } : employee)),
});

// Codes as the real ones look: six of 23456789ABCDEFGHJKLMNPQRSTUVWXYZ, no 0/O, 1/I. Fixed, so a run reads the same.
const SAMPLE_CODES = ['K7Q4PM', 'R2X9WD', 'H5N3TB', 'M8C6LV'];

export function createCode(store: Store): Store {
  const code = SAMPLE_CODES[store.codes.length % SAMPLE_CODES.length];
  return { ...store, codes: [...store.codes, code] };
}

export const setLevel = (store: Store, level: number): Store => ({ ...store, level: Math.min(5, Math.max(1, level)) });

/** What a task needs in place before its first step. */
export type Prepare = 'no-session' | 'session' | 'cart-line' | 'ana-open';

/**
 * Put the store in the state a task starts from: the person's own session closed, or open, or open with a line; or
 * Ana's session open again, so a void has a sale it may cancel after Close Any Register closed it.
 */
export function prepare(store: Store, need: Prepare): Store {
  if (need === 'ana-open') return { ...store, sessions: store.sessions.map((session) => (session.id === 's2' ? { ...session, status: 'Open' as const, counted: undefined } : session)) };
  if (need === 'no-session') return store.mine ? closeSession(store, store.mine, expectedCash(store, store.mine)) : store;
  const open = store.mine ? store : openSession(store, 500);
  if (need === 'session') return open;
  return open.cart.length > 0 ? open : addToCart(open, 'ITEM-0001');
}
