import { router } from 'expo-router';

import { RecordIndex } from '../../components/record-index';
import type { IndexSection } from '../../components/record-index';

/** The pages under src/app/(app)/systems/[id]/setup/. */
type SetupRoute =
  | 'company'
  | 'fiscal-years'
  | 'global-defaults'
  | 'system-settings'
  | 'currency'
  | 'chart-of-accounts'
  | 'accounts-settings'
  | 'modes-of-payment'
  | 'tax-categories'
  | 'sales-tax-templates'
  | 'item-tax-templates'
  | 'tax-rules'
  | 'warehouses'
  | 'uoms'
  | 'uom-conversion-factors'
  | 'price-lists'
  | 'brands'
  | 'item-groups'
  | 'stock-settings'
  | 'selling-settings'
  | 'pricing-rules'
  | 'pos-profiles'
  | 'document-naming-settings'
  | 'print-formats'
  | 'letter-heads'
  | 'print-settings';

// The foundation a POS needs before its first item, grouped as .claude/erpnext-docs/POS-System-Only-Features.md
// groups it. A section appears once its first screen exists; the rest arrive step by step.
export const SETUP_SECTIONS: IndexSection<SetupRoute>[] = [
  {
    title: 'Store & Calendar',
    hint: 'Whose books these are, and the years they are kept in',
    entries: [
      { label: 'Store', hint: 'Name, currency, default accounts, stock', doctype: 'Company', route: 'company' },
      { label: 'Fiscal Years', hint: 'The accounting years every sale is dated in', doctype: 'Fiscal Year', route: 'fiscal-years' },
    ],
  },
  {
    title: 'Defaults & Money',
    hint: 'How numbers, amounts and times read on every screen and receipt',
    entries: [
      { label: 'Global Defaults', hint: 'Rounded total and amount in words on receipts', doctype: 'Global Defaults', route: 'global-defaults' },
      { label: 'System Settings', hint: 'Time zone, number format, precision, rounding', doctype: 'System Settings', route: 'system-settings' },
      { label: 'Currency', hint: 'Symbol, smallest coin, amount in words', doctype: 'Currency', route: 'currency' },
    ],
  },
  {
    title: 'Accounting',
    hint: 'Where every sale, purchase and payment is recorded',
    entries: [
      { label: 'Chart of Accounts', hint: 'Cash, stock, sales and the groups they sit in', doctype: 'Account', route: 'chart-of-accounts' },
      {
        label: 'Accounts Settings',
        hint: 'Cancellation, discounts, frozen dates',
        doctype: 'Accounts Settings',
        route: 'accounts-settings',
      },
    ],
  },
  {
    title: 'Payments',
    hint: 'The ways a sale can be paid',
    entries: [
      { label: 'Modes of Payment', hint: 'Cash, card, wallets and their accounts', doctype: 'Mode of Payment', route: 'modes-of-payment' },
    ],
  },
  {
    title: 'Taxes',
    hint: 'What tax a sale carries, and how it is worked out',
    entries: [
      {
        label: 'Sales Taxes and Charges Templates',
        hint: 'The tax rows a sale gets, in or on top of the price',
        doctype: 'Sales Taxes and Charges Template',
        route: 'sales-tax-templates',
      },
      { label: 'Item Tax Templates', hint: 'A different rate for particular items', doctype: 'Item Tax Template', route: 'item-tax-templates' },
      { label: 'Tax Categories', hint: 'Names for tax treatments: standard, exempt', doctype: 'Tax Category', route: 'tax-categories' },
      { label: 'Tax Rules', hint: 'Which template a sale takes, by category, group and date', doctype: 'Tax Rule', route: 'tax-rules' },
    ],
  },
  {
    title: 'Stock',
    hint: 'Where stock is kept, what it is counted in, and what it sells for',
    entries: [
      { label: 'Warehouses', hint: 'Stores, rooms and shelves, and their stock account', doctype: 'Warehouse', route: 'warehouses' },
      { label: 'UOMs', hint: 'Units items are counted in: Nos, Kg, Box', doctype: 'UOM', route: 'uoms' },
      {
        label: 'UOM Conversion Factors',
        hint: 'How many of one unit make another',
        doctype: 'UOM Conversion Factor',
        route: 'uom-conversion-factors',
      },
      { label: 'Price Lists', hint: 'The books selling prices are kept in', doctype: 'Price List', route: 'price-lists' },
      { label: 'Brands', hint: 'Brand names, and the sales defaults their items take', doctype: 'Brand', route: 'brands' },
      { label: 'Item Groups', hint: 'How items are classified, and the defaults they take', doctype: 'Item Group', route: 'item-groups' },
      {
        label: 'Stock Settings',
        hint: 'What new items start with; FIFO or Moving Average',
        doctype: 'Stock Settings',
        route: 'stock-settings',
      },
    ],
  },
  {
    title: 'Selling',
    hint: 'Where a sale takes its prices from',
    entries: [
      {
        label: 'Selling Settings',
        hint: 'Default price list, fallback, editing prices',
        doctype: 'Selling Settings',
        route: 'selling-settings',
      },
      { label: 'Pricing Rules', hint: 'Automatic discounts by item, item group or brand', doctype: 'Pricing Rule', route: 'pricing-rules' },
    ],
  },
  {
    title: 'Point of Sale',
    hint: 'The registers a cashier sells from',
    entries: [
      { label: 'POS Profiles', hint: 'A register: warehouse, payment methods, users, accounts', doctype: 'POS Profile', route: 'pos-profiles' },
    ],
  },
  {
    title: 'Naming & Printing',
    hint: 'How documents are numbered, and what a receipt looks like',
    entries: [
      {
        label: 'Document Naming Settings',
        hint: 'The series invoices and items are numbered by',
        doctype: 'Document Naming Settings',
        route: 'document-naming-settings',
      },
      { label: 'Print Formats', hint: 'The receipt: paper, heading, a sample', doctype: 'Print Format', route: 'print-formats' },
      { label: 'Letter Heads', hint: 'The name and address at the top of a receipt', doctype: 'Letter Head', route: 'letter-heads' },
      { label: 'Print Settings', hint: 'Letter head, compact items, zero taxes', doctype: 'Print Settings', route: 'print-settings' },
    ],
  },
];

/** Setup: the index of a store's foundation records, the rail's last destination. */
export function SetupIndex({ merchantId, merchantName, isOwner }: { merchantId: string; merchantName: string; isOwner: boolean }) {
  return (
    <RecordIndex
      merchantId={merchantId}
      kicker={merchantName}
      title="Setup"
      meta="Set these up before the first item is sold"
      isOwner={isOwner}
      sections={SETUP_SECTIONS}
      onOpen={(route) => router.push(`/systems/${merchantId}/setup/${route}`)}
      offline="You're offline. Setup will load when you reconnect."
      failure="Couldn't load Setup. Try again."
      empty="Your permissions give you nothing to set up here. Ask the owner if you need more."
    />
  );
}
