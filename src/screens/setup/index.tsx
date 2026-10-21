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
// groups it. A section appears once its first screen exists; the rest arrive step by step. No row is core: each
// page is a setting whose seeded record keeps working while it is hidden (src/features/feature-preferences/
// visibility.ts), so hiding the last one hides Setup.
export const SETUP_SECTIONS: IndexSection<SetupRoute>[] = [
  {
    title: 'Store & Calendar',
    hint: 'Whose books these are, and the years they are kept in',
    entries: [
      {
        label: 'Store',
        hint: 'Name, currency, default accounts, stock',
        purpose: "The store's name, country and currency, and the accounts its sales and stock fall back on.",
        useCase: "Use it when the store's details change, or when your accountant asks for different default accounts.",
        doctype: 'Company',
        route: 'company',
      },
      {
        label: 'Fiscal Years',
        hint: 'The accounting years every sale is dated in',
        purpose: "The store's accounting years. Every sale and stock change must be dated inside one that is turned on.",
        useCase: "Add next year's before it starts.",
        doctype: 'Fiscal Year',
        route: 'fiscal-years',
      },
    ],
  },
  {
    title: 'Defaults & Money',
    hint: 'How numbers, amounts and times read on every screen and receipt',
    entries: [
      {
        label: 'Global Defaults',
        hint: 'Rounded total and amount in words on receipts',
        purpose: 'Two switches for the bottom of a receipt: the rounded total and the amount written in words.',
        useCase: "Use it if you don't want either one printed.",
        doctype: 'Global Defaults',
        route: 'global-defaults',
      },
      {
        label: 'System Settings',
        hint: 'Time zone, number format, precision, rounding',
        purpose: 'How the store counts "today", writes numbers and rounds amounts.',
        useCase: 'Set the time zone before the first sale; change the rest only if your country writes numbers differently.',
        doctype: 'System Settings',
        route: 'system-settings',
      },
      {
        label: 'Currency',
        hint: 'Symbol, smallest coin, amount in words',
        purpose: 'How an amount looks: its symbol, its decimals and the smallest coin you give change in.',
        useCase: 'Use it so totals match the money your customers actually pay with.',
        doctype: 'Currency',
        route: 'currency',
      },
    ],
  },
  {
    title: 'Accounting',
    hint: 'Where every sale, purchase and payment is recorded',
    entries: [
      {
        label: 'Chart of Accounts',
        hint: 'Cash, stock, sales and the groups they sit in',
        purpose: 'Every place the books record money, kept in folders. Sales, payments and stock all post to these accounts.',
        useCase: 'Use it with your accountant to add or rename an account.',
        doctype: 'Account',
        route: 'chart-of-accounts',
      },
      {
        label: 'Accounts Settings',
        hint: 'Cancellation, discounts, frozen dates',
        purpose: 'What happens to the books when a document is cancelled or deleted, whether discounts get their own account, and the date before which the books are closed.',
        useCase: 'Use it when your accountant closes a period.',
        doctype: 'Accounts Settings',
        route: 'accounts-settings',
      },
    ],
  },
  {
    title: 'Payments',
    hint: 'The ways a sale can be paid',
    entries: [
      {
        label: 'Modes of Payment',
        hint: 'Cash, card, wallets and their accounts',
        purpose: "The ways customers pay, such as cash, card or an e-wallet, and the account each one's money goes to.",
        useCase: 'Add one when you start accepting a new way to pay.',
        doctype: 'Mode of Payment',
        route: 'modes-of-payment',
      },
    ],
  },
  {
    title: 'Taxes',
    hint: 'What tax a sale carries, and how it is worked out',
    entries: [
      {
        label: 'Sales Taxes and Charges Templates',
        hint: 'The tax rows a sale gets, in or on top of the price',
        purpose: 'The tax lines a sale gets, such as VAT, and the account each tax goes to.',
        useCase: 'Use it to set up your tax, and test it on a sample sale before you sell.',
        doctype: 'Sales Taxes and Charges Template',
        route: 'sales-tax-templates',
      },
      {
        label: 'Item Tax Templates',
        hint: 'A different rate for particular items',
        purpose: 'A different tax rate for some items, such as zero-rated goods.',
        useCase: 'Use it when not everything you sell is taxed the same way.',
        doctype: 'Item Tax Template',
        route: 'item-tax-templates',
      },
      {
        label: 'Tax Categories',
        hint: 'Names for tax treatments: standard, exempt',
        purpose: 'Names for the ways a sale is taxed, such as Exempt or Zero Rated, that a tax rule can choose by.',
        useCase: 'You need it only if different sales are taxed differently.',
        doctype: 'Tax Category',
        route: 'tax-categories',
      },
      {
        label: 'Tax Rules',
        hint: 'Which template a sale takes, by category, group and date',
        purpose: 'Picks the tax a sale gets from its category, its item group and its date.',
        useCase: "Use it when a single tax setup doesn't fit every sale.",
        doctype: 'Tax Rule',
        route: 'tax-rules',
      },
    ],
  },
  {
    title: 'Stock',
    hint: 'Where stock is kept, what it is counted in, and what it sells for',
    entries: [
      {
        label: 'Warehouses',
        hint: 'Stores, rooms and shelves, and their stock account',
        purpose: 'The places stock is kept, such as a stockroom or a shelf, in folders. A sale takes its stock from one.',
        useCase: 'Add one when you start keeping stock somewhere new.',
        doctype: 'Warehouse',
        route: 'warehouses',
      },
      {
        label: 'UOMs',
        hint: 'Units items are counted in: Nos, Kg, Box',
        purpose: 'The units items are counted and sold in: pieces, boxes, kilos.',
        useCase: "Add one when you sell in a unit that isn't on the list yet.",
        doctype: 'UOM',
        route: 'uoms',
      },
      {
        label: 'UOM Conversion Factors',
        hint: 'How many of one unit make another',
        purpose: 'How two units relate, such as 1 Kg = 1000 Gram, so an item kept in one unit can be sold in another.',
        useCase: 'Add one when you sell an item in a different unit than you stock it in.',
        doctype: 'UOM Conversion Factor',
        route: 'uom-conversion-factors',
      },
      {
        label: 'Price Lists',
        hint: 'The books selling prices are kept in',
        purpose: 'Named sets of selling prices. Most stores need only Standard Selling.',
        useCase: 'Add another for a second set of prices, such as wholesale.',
        doctype: 'Price List',
        route: 'price-lists',
      },
      {
        label: 'Brands',
        hint: 'Brand names, and the sales defaults their items take',
        purpose: 'Optional trade names for your items, each with defaults its items start from.',
        useCase: 'Use it if you sort your products by brand.',
        doctype: 'Brand',
        route: 'brands',
      },
      {
        label: 'Item Groups',
        hint: 'How items are classified, and the defaults they take',
        purpose: 'Folders that sort your items, such as Products and Services, with the defaults and taxes their items take.',
        useCase: 'Use it to organise what you sell.',
        doctype: 'Item Group',
        route: 'item-groups',
      },
      {
        label: 'Stock Settings',
        hint: 'What new items start with; FIFO or Moving Average',
        purpose: 'What a new item starts with, how stock is valued (FIFO or Moving Average), and whether stock may go below zero.',
        useCase: 'Set it before you add your first items.',
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
        purpose: 'Where a sale gets its prices from, and how far a cashier may change them.',
        useCase: 'Use it to choose the price list sales start with.',
        doctype: 'Selling Settings',
        route: 'selling-settings',
      },
      {
        label: 'Pricing Rules',
        hint: 'Automatic discounts by item, item group or brand',
        purpose: 'Automatic discounts or prices for an item, an item group or a brand, within the quantities and dates you set.',
        useCase: 'Use it for promotions and bulk prices.',
        doctype: 'Pricing Rule',
        route: 'pricing-rules',
      },
    ],
  },
  {
    title: 'Point of Sale',
    hint: 'The registers a cashier sells from',
    entries: [
      {
        label: 'POS Profiles',
        hint: 'A register: warehouse, payment methods, users, accounts',
        purpose: "A register's setup: its warehouse, prices, taxes, payment methods, who may use it and which items it sells.",
        useCase: 'You need one before anyone can open a session.',
        doctype: 'POS Profile',
        route: 'pos-profiles',
      },
    ],
  },
  {
    title: 'Naming & Printing',
    hint: 'How documents are numbered, and what a receipt looks like',
    entries: [
      {
        label: 'Document Naming Settings',
        hint: 'The series invoices and items are numbered by',
        purpose: 'How sales, items and stock documents are numbered, with the year in the number.',
        useCase: 'Change it only if you want your own numbering.',
        doctype: 'Document Naming Settings',
        route: 'document-naming-settings',
      },
      {
        label: 'Print Formats',
        hint: 'The receipt: paper, heading, a sample',
        purpose: 'The layout of a receipt: its paper size, heading and footer note, with a sample to check it by.',
        useCase: 'Use it to fit your receipt printer.',
        doctype: 'Print Format',
        route: 'print-formats',
      },
      {
        label: 'Letter Heads',
        hint: 'The name and address at the top of a receipt',
        purpose: "The block at the top and bottom of a receipt: your store's name, address and a closing line.",
        useCase: 'Use it to put your own words on every receipt.',
        doctype: 'Letter Head',
        route: 'letter-heads',
      },
      {
        label: 'Print Settings',
        hint: 'Letter head, compact items, zero taxes',
        purpose: 'What every receipt includes: the letter head, a compact list of items, and taxes that come to zero.',
        useCase: 'Use it to make receipts shorter or fuller.',
        doctype: 'Print Settings',
        route: 'print-settings',
      },
    ],
  },
];

/** Setup: the index of a store's foundation records, the rail's last destination. */
export function SetupIndex({ merchantId, merchantName, isOwner }: { merchantId: string; merchantName: string; isOwner: boolean }) {
  return (
    <RecordIndex
      merchantId={merchantId}
      screen="setup"
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
