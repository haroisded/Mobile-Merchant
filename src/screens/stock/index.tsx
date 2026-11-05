import { router } from 'expo-router';

import type { IndexSection } from '../../components/record-index';
import { SectionBrowser } from '../../components/section-browser';

/** The pages under src/app/(app)/systems/[id]/stock/ this index opens. */
type StockRoute = 'items' | 'item-prices' | 'import-items' | 'stock-entries' | 'stock-reconciliations' | 'stock-balance' | 'stock-ledger';

// What is sold and what is on hand, grouped as .claude/erpnext-docs/POS-System-Added-Features.md groups it. A
// section appears once its first screen exists. Items is the core: every other page works on items, so it hides only
// with Stock (src/features/feature-preferences/visibility.ts).
export const STOCK_SECTIONS: IndexSection<StockRoute>[] = [
  {
    title: 'Items & Pricing',
    icon: 'selling',
    hint: 'What is sold, and what it sells for',
    entries: [
      {
        label: 'Items',
        icon: 'stock',
        hint: 'Products and services: units, defaults, tax',
        purpose: 'Every product and service the store sells: its code, barcode, name, group, unit and price.',
        useCase: 'Every other Stock page works on these items.',
        doctype: 'Item',
        route: 'items',
        core: true,
      },
      {
        label: 'Item Prices',
        icon: 'price-change',
        hint: 'The rate of an item in a price list',
        purpose: 'The selling price of an item in a price list, for one unit, with optional start and end dates.',
        useCase: 'Use it to change a price, or to set a seasonal price beside the regular one.',
        doctype: 'Item Price',
        route: 'item-prices',
      },
      // An action, not a list: it shows to whoever may create an Item (POS-System-Added-Features.md 23.1).
      {
        label: 'Import Items',
        icon: 'upload-file',
        hint: 'Add many items at once from a CSV file',
        purpose: 'Adds many items at once from a spreadsheet file, with their prices and opening stock.',
        useCase: 'Use it when you first stock the store or bring in a large range; every mistake is shown before anything is saved.',
        doctype: 'Item',
        ptype: 'create',
        route: 'import-items',
      },
    ],
  },
  {
    title: 'Stock Transactions',
    icon: 'swap-horiz',
    hint: 'Stock coming in, going out, moved and counted',
    entries: [
      {
        label: 'Stock Entries',
        icon: 'move-to-inbox',
        hint: 'Receive, issue or transfer stock',
        purpose: 'Records stock coming in, going out or moving between warehouses.',
        useCase: 'Use it when a delivery arrives, when goods are used up or thrown away, or when you move stock from the stockroom to the shelf.',
        doctype: 'Stock Entry',
        route: 'stock-entries',
      },
      {
        label: 'Stock Reconciliations',
        icon: 'fact-check',
        hint: 'Opening stock, and a count against the books',
        purpose: 'Sets the stock you start with, or corrects the books to what you actually counted.',
        useCase: 'Use it on your first day and after every stock count.',
        doctype: 'Stock Reconciliation',
        route: 'stock-reconciliations',
      },
    ],
  },
  {
    title: 'Reports',
    icon: 'assessment',
    hint: 'What is on hand, and every movement behind it',
    entries: [
      {
        label: 'Stock Balance',
        icon: 'inventory',
        hint: 'Quantity and value of each item in each warehouse',
        purpose: 'Shows how much of each item is in each warehouse, and what it is worth.',
        useCase: 'Use it to check what is on hand before you order more.',
        doctype: 'Bin',
        route: 'stock-balance',
      },
      {
        label: 'Stock Ledger',
        icon: 'history',
        hint: 'Every stock movement, newest first',
        purpose: 'Lists every stock movement behind the balance, newest first, each one opening the sale or document that made it.',
        useCase: 'Use it when a quantity looks wrong and you want to know why.',
        doctype: 'Stock Ledger Entry',
        route: 'stock-ledger',
      },
    ],
  },
];

/** Stock: a store's items, prices and stock, by the section its sidebar dropdown picks. */
export function StockIndex({ merchantId, isOwner }: { merchantId: string; isOwner: boolean }) {
  return (
    <SectionBrowser
      merchantId={merchantId}
      screen="stock"
      isOwner={isOwner}
      sections={STOCK_SECTIONS}
      onOpen={(route) => router.push(`/systems/${merchantId}/stock/${route}`)}
      offline="You're offline. Stock will load when you reconnect."
      failure="Couldn't load Stock. Try again."
      empty="Your permissions give you nothing to see here. Ask the owner if you need more."
      placeholder="Search stock"
      noun="pages"
      tryWords="Try a word like item, price or count."
    />
  );
}
