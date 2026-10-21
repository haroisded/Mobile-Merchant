// The Store Guide's roles: .claude/full-system-context/Store_Roles_and_Permissions.xlsx, its Roles, Permission Matrix
// and Limits sheets, plus the owner and a person with no role. Import-free: asserted in tools/check-logic.mjs, which
// holds every role's permissions to the sheet's matrix and to the catalog's requirements.
//
// The keys are public.permissions' own (20261014034106_employees_and_permissions.sql), so a role here is the set of
// switches the owner would turn on for it on Employees > Roles.

export type PermissionKey =
  | 'process_sales'
  | 'apply_discounts'
  | 'process_refunds'
  | 'void_sales'
  | 'view_sales'
  | 'open_close_register'
  | 'view_shift_totals'
  | 'close_any_register'
  | 'view_stock'
  | 'manage_items'
  | 'move_stock'
  | 'adjust_inventory'
  | 'view_ledger'
  | 'manage_company'
  | 'manage_accounting'
  | 'manage_taxes'
  | 'manage_stock_setup'
  | 'manage_selling'
  | 'manage_pos_profiles'
  | 'manage_printing';

export type Permission = { key: PermissionKey; label: string; area: string; requires: PermissionKey | null };

/** The 20 permissions in the sheet's column order, with the one each needs (public.permissions.requires). */
export const PERMISSIONS: Permission[] = [
  { key: 'process_sales', label: 'Process Sales', area: 'Sales & POS', requires: 'open_close_register' },
  { key: 'apply_discounts', label: 'Apply Discounts', area: 'Sales & POS', requires: 'process_sales' },
  { key: 'process_refunds', label: 'Process Refunds', area: 'Sales & POS', requires: 'open_close_register' },
  { key: 'void_sales', label: 'Void Transactions', area: 'Sales & POS', requires: null },
  { key: 'view_sales', label: 'View Sales', area: 'Sales & POS', requires: null },
  { key: 'open_close_register', label: 'Open/Close Register', area: 'Payment & Cash', requires: null },
  { key: 'view_shift_totals', label: 'View Shift Totals', area: 'Payment & Cash', requires: null },
  { key: 'close_any_register', label: 'Close Any Register', area: 'Payment & Cash', requires: null },
  { key: 'view_stock', label: 'View Stock Levels', area: 'Inventory', requires: null },
  { key: 'manage_items', label: 'Manage Items', area: 'Inventory', requires: null },
  { key: 'move_stock', label: 'Receive Shipments', area: 'Inventory', requires: null },
  { key: 'adjust_inventory', label: 'Adjust Inventory', area: 'Inventory', requires: null },
  { key: 'view_ledger', label: 'View General Ledger', area: 'Accounting', requires: null },
  { key: 'manage_company', label: 'Store & Calendar', area: 'Setup', requires: null },
  { key: 'manage_accounting', label: 'Accounting & Payments', area: 'Setup', requires: null },
  { key: 'manage_taxes', label: 'Taxes', area: 'Setup', requires: null },
  { key: 'manage_stock_setup', label: 'Stock Setup', area: 'Setup', requires: null },
  { key: 'manage_selling', label: 'Selling & Pricing', area: 'Setup', requires: null },
  { key: 'manage_pos_profiles', label: 'POS Profiles', area: 'Setup', requires: null },
  { key: 'manage_printing', label: 'Naming & Printing', area: 'Setup', requires: null },
];

const ALL_PERMISSIONS: PermissionKey[] = PERMISSIONS.map((permission) => permission.key);

export const permissionLabel = (key: PermissionKey) => PERMISSIONS.find((permission) => permission.key === key)?.label ?? key;

export type RoleKind = 'Built-in' | 'Custom' | 'Owner' | 'No role';

export type Role = {
  id: string;
  name: string;
  kind: RoleKind;
  /** The sheet's ✓ cells. The owner holds every one, and more: Employees, Access Codes, the store level. */
  permissions: PermissionKey[];
  /** The sheet's "opt" cells: add if needed. Not granted in the practice store. */
  optional?: PermissionKey[];
  /** The sheet's Responsibilities column. */
  responsibilities: string;
  /** The store's owner: no role row, every permission, and the owner-only screens. */
  owner?: true;
};

export type RoleGroup = { title: string; hint: string; roles: Role[] };

const SALES: PermissionKey[] = ['process_sales', 'apply_discounts', 'process_refunds', 'void_sales', 'view_sales'];
const CASH: PermissionKey[] = ['open_close_register', 'view_shift_totals', 'close_any_register'];
const STOCK: PermissionKey[] = ['view_stock', 'manage_items', 'move_stock', 'adjust_inventory'];

// By work area, the human's pick (2026-10-22). The ids are routes (/guide/<id>), so they never change.
export const ROLE_GROUPS: RoleGroup[] = [
  {
    title: 'Selling & Cash',
    hint: 'At the register and the drawer',
    roles: [
      {
        id: 'cashier',
        name: 'Cashier',
        kind: 'Built-in',
        permissions: ['process_sales', 'open_close_register'],
        responsibilities: 'Open own shift, ring sales, scan to sell, count drawer at close',
      },
      {
        id: 'all-around-helper',
        name: 'All-around Helper',
        kind: 'Custom',
        permissions: ['process_sales', 'open_close_register', 'view_stock', 'move_stock'],
        responsibilities: 'Sell, plus log deliveries and check stock (a sari-sari or small shop)',
      },
      {
        id: 'head-cashier',
        name: 'Senior / Head Cashier',
        kind: 'Custom',
        permissions: ['process_sales', 'apply_discounts', 'process_refunds', 'view_sales', 'open_close_register'],
        responsibilities: 'Discounts, returns, look up past orders',
      },
      {
        id: 'returns-desk',
        name: 'Returns / Customer Service Desk',
        kind: 'Custom',
        permissions: ['process_refunds', 'view_sales', 'open_close_register'],
        responsibilities: 'Returns and refunds only',
      },
      {
        id: 'shift-supervisor',
        name: 'Shift Supervisor',
        kind: 'Custom',
        permissions: [...SALES, ...CASH],
        responsibilities: 'Void sales, approve refunds, watch shift totals, close registers others left open',
      },
      {
        id: 'cash-custodian',
        name: 'Cash Custodian / Cash Office',
        kind: 'Custom',
        permissions: ['view_sales', 'view_shift_totals', 'close_any_register'],
        responsibilities: 'End-of-day cash check, close abandoned sessions',
      },
    ],
  },
  {
    title: 'Stock',
    hint: 'Products, deliveries and counts',
    roles: [
      {
        id: 'stock-clerk',
        name: 'Receiving / Stock Clerk',
        kind: 'Built-in',
        permissions: ['view_stock', 'move_stock'],
        responsibilities: "Log deliveries as stock entries (submit only, can't cancel)",
      },
      {
        id: 'inventory-controller',
        name: 'Inventory Controller / Stock Auditor',
        kind: 'Custom',
        permissions: ['view_stock', 'move_stock', 'adjust_inventory'],
        responsibilities: 'Physical counts, reconciliations, cancel wrong stock entries',
      },
      {
        id: 'product-encoder',
        name: 'Product Encoder / Merchandiser',
        kind: 'Custom',
        permissions: ['view_stock', 'manage_items'],
        responsibilities: 'Add items, scan barcodes and labels, bulk import, item prices',
      },
      {
        id: 'pricing-officer',
        name: 'Pricing / Promo Officer',
        kind: 'Custom',
        permissions: ['manage_items', 'manage_stock_setup', 'manage_selling'],
        responsibilities: 'Price lists, item prices, pricing rules and discounts',
      },
    ],
  },
  {
    title: 'Books & Setup',
    hint: 'The ledger, the reports and the settings',
    roles: [
      {
        id: 'bookkeeper',
        name: 'Bookkeeper / Accountant',
        kind: 'Custom',
        permissions: ['view_sales', 'view_shift_totals', 'view_ledger', 'manage_company', 'manage_accounting', 'manage_taxes'],
        responsibilities:
          'Review the ledger, chart of accounts, modes of payment, tax templates, fiscal years. Can be the role allowed past the frozen date',
      },
      {
        id: 'external-auditor',
        name: 'External Auditor / Silent Partner',
        kind: 'Custom',
        permissions: ['view_sales', 'view_shift_totals', 'view_stock', 'view_ledger'],
        responsibilities: 'Dashboard and reports, no changes (read-only)',
      },
      {
        id: 'setup-admin',
        name: 'System / Setup Admin',
        kind: 'Custom',
        permissions: ['manage_stock_setup', 'manage_pos_profiles', 'manage_printing'],
        optional: ['manage_company', 'manage_accounting', 'manage_taxes', 'manage_selling'],
        responsibilities: 'Registers, receipts, letter heads, naming series, warehouses, units',
      },
    ],
  },
  {
    title: 'Running the store',
    hint: 'Day-to-day managers and the owner',
    roles: [
      {
        id: 'assistant-manager',
        name: 'Assistant Manager',
        kind: 'Custom',
        permissions: [...SALES, ...CASH, ...STOCK, 'view_ledger'],
        responsibilities: 'Run day-to-day work without touching configuration',
      },
      {
        id: 'store-manager',
        name: 'Store Manager',
        kind: 'Built-in',
        permissions: ALL_PERMISSIONS,
        responsibilities: 'Everything except staff and access',
      },
      {
        id: 'owner',
        name: 'Owner',
        kind: 'Owner',
        permissions: ALL_PERMISSIONS,
        owner: true,
        responsibilities: 'Plus employees, roles, access codes and the store level — the owner alone',
      },
    ],
  },
  {
    title: 'Not working yet',
    hint: 'Let in, but given no role',
    roles: [
      {
        id: 'no-role',
        name: 'Seasonal / On-leave Staff',
        kind: 'No role',
        permissions: [],
        responsibilities: 'Nothing until the owner gives a role: the store shows Home only',
      },
    ],
  },
];

export const ROLES: Role[] = ROLE_GROUPS.flatMap((group) => group.roles);

export const roleById = (id: string) => ROLES.find((role) => role.id === id);

/** Whether `keys` keep every permission's requirement: Process Sales needs Open/Close Register, and so on. */
export function requirementsKept(keys: PermissionKey[]) {
  return keys.every((key) => {
    const requires = PERMISSIONS.find((permission) => permission.key === key)?.requires;
    return !requires || keys.includes(requires);
  });
}

/** The sheet's Limits & Notes. */
export const LIMITS: { topic: string; detail: string }[] = [
  {
    topic: 'Owner-only',
    detail: 'Only the owner can manage employees, roles, access codes (invite, approve, revoke) and the store level. No HR or co-admin role is possible.',
  },
  { topic: 'One role per person', detail: 'Each person gets one role per store, plus their own on/off exceptions.' },
  {
    topic: 'Linked permissions',
    detail: 'Process Sales and Process Refunds add Open/Close Register; Apply Discounts adds Process Sales.',
  },
  {
    topic: 'Missing modules',
    detail: 'No purchasing or suppliers, customers or credit, payroll or timekeeping — so no Purchaser, Collector or HR roles yet.',
  },
  {
    topic: 'Fraud risk',
    detail: 'Keep Void Transactions, Process Refunds, Close Any Register and Adjust Inventory away from regular cashiers and clerks.',
  },
  {
    topic: 'Store level',
    detail:
      'Employees appears from Level 3, General Ledger from Level 4, Chart of Accounts and Tax Rules only at Level 5. A person with the permission can turn a hidden screen on in Features.',
  },
];
