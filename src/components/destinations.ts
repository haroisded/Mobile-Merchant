import { screenShown } from '../features/feature-preferences/visibility';
import { opens, showsDestination } from '../features/permissions/access';
import type { DestinationRule, IndexRule, Permissions } from '../features/permissions/access';
import type { IconName } from '../lib/icons';
import { ACCOUNTS_SECTIONS } from '../screens/accounts';
import { SELL_SECTIONS } from '../screens/sell';
import { SETUP_SECTIONS } from '../screens/setup';
import { STOCK_SECTIONS } from '../screens/stock';
import type { IndexEntry, IndexSection } from './record-index';

// A store's side-menu destinations, for the two that list them: the shell (src/app/(app)/systems/[id]/_layout.tsx)
// and the Features page (src/screens/features/), which hides them.
//
// Who sees a destination (src/features/permissions/access.ts, showsDestination): `sections`, its index (the same
// list its screen draws), for someone who may open one of its rows; `permissions` for someone who holds one — the
// Dashboard's blocks, and Sell's session for a cashier who opens one without reading the list; `ownerOnly` for
// Employees. With none of them — Home — the item always shows. What the person chose to hide is
// src/features/feature-preferences/visibility.ts: `core` is a part of the screen outside its index that its job
// cannot do without (Sell's session box), listed on the Features page with no switch of its own.
// The index carries what a page shows, not only the rule that shows it, hence `sections` of its own.
export type Destination = Omit<DestinationRule, 'sections'> & {
  name: string;
  label: string;
  icon: IconName;
  stack?: boolean;
  /**
   * Its sidebar row opens a dropdown of its sections: `hoist` also takes the row to the top and hides the other
   * destinations until it is toggled off (Setup), `inline` opens where it is (Stock).
   */
  dropdown?: 'hoist' | 'inline';
  /** Always in the menu, with no switch on the Features page: Home, the way in, and Features, the way back to anything hidden. */
  fixed?: true;
  /** One line: what the screen is, under its name on the Features page. */
  summary: string;
  /** What the screen is for, in plain words: the Features page's About for the screen. */
  purpose: string;
  /** When to use it: under Purpose in that About. */
  useCase: string;
  core?: IndexEntry<string>;
  sections?: IndexSection<string>[];
};

// Rail order. `name` is the route file or directory under src/app/(app)/systems/[id]/; icons are the app's own
// names, drawn as each platform's symbol (src/lib/icons.tsx, .claude/instruction-mds/frontend.md §6). Stock is the
// items, their prices and their stock (./stock/); Accounts is the books every document posts to (./accounts/);
// Employees is who works here and what each may do (./employees/), the owner's alone; Setup is the company's
// foundation records (./setup/) — each a stack of its own. Sell is the Register and its sessions (./sell/).
// Dashboard is the numbers they add up to (./dashboard.tsx) — its own destination, not Home, which stays as it is.
// Features, last, is what the person keeps in this menu (./features/, src/screens/features/).
export const DESTINATIONS: Destination[] = [
  {
    name: 'index',
    label: 'Home',
    icon: 'home',
    fixed: true,
    summary: 'The first screen of the store.',
    purpose: 'The first screen of the store: a greeting, a way into each screen in your menu, and a short guide to where to start.',
    useCase: 'Open it to land in the store.',
  },
  {
    name: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    permissions: ['view_sales', 'view_shift_totals', 'close_any_register', 'view_stock'],
    summary: 'A quick look at how the store is doing.',
    purpose: 'A quick look at how the store is doing: sales, gross profit, open registers and low stock, with sales per day, the best sellers and the items running out.',
    useCase: 'Use it at the start or end of a day to see where things stand without opening a list.',
  },
  {
    name: 'sell',
    label: 'Sell',
    icon: 'sell',
    stack: true,
    sections: SELL_SECTIONS,
    permissions: ['open_close_register'],
    summary: 'Where the store makes its sales.',
    purpose: 'Where the store makes its sales. A cashier opens a session with the cash in the drawer, rings items up at the Register, takes payment and closes the session against a count.',
    useCase: 'Use it every time you sell.',
    // The session box above the index (src/screens/sell/index.tsx): it shows to whoever may open a session.
    core: {
      label: 'Sessions & Register',
      hint: 'Open a session, sell at the Register, close the session',
      purpose: 'Open a session with the cash in the drawer, ring items up at the Register, take payment in the Cart, then close the session against a count.',
      useCase: 'This is what Sell is for: use it every time you sell.',
      doctype: 'POS Opening Entry',
      ptype: 'create',
      route: 'session',
      core: true,
    },
  },
  {
    name: 'stock',
    label: 'Stock',
    icon: 'stock',
    stack: true,
    dropdown: 'inline',
    sections: STOCK_SECTIONS,
    summary: 'What the store sells and what it has on hand.',
    purpose: 'What the store sells and what it has on hand: the items, their prices, stock coming in and going out, and what it is all worth.',
    useCase: 'Use it to add products, receive deliveries, count stock and see what is running low.',
  },
  {
    name: 'accounts',
    label: 'Accounts',
    icon: 'accounts',
    stack: true,
    sections: ACCOUNTS_SECTIONS,
    summary: "The store's books.",
    purpose: "The store's books. Every sale, return and stock change writes its money here.",
    useCase: 'Use it when you or your accountant want to check where an amount went.',
  },
  {
    name: 'employees',
    label: 'Employees',
    icon: 'group',
    stack: true,
    ownerOnly: true,
    summary: 'Who works in the store and what each person may do.',
    purpose: "Who works in the store and what each person may do. Give each person a role, and make an exception for one person when the role doesn't fit.",
    useCase: 'Use it whenever someone joins or their job changes.',
  },
  {
    name: 'setup',
    label: 'Setup',
    icon: 'settings',
    stack: true,
    dropdown: 'hoist',
    sections: SETUP_SECTIONS,
    summary: "The store's settings and the lists everything else picks from.",
    purpose: "The store's settings and the lists everything else picks from: its details, taxes, payment methods, warehouses, units, prices, registers and receipts.",
    useCase: 'Use it when you set the store up, and whenever the way you sell changes.',
  },
  {
    name: 'features',
    label: 'Features',
    icon: 'tune',
    stack: true,
    fixed: true,
    summary: 'Which screens and pages show in your menu.',
    purpose: "Which of the store's screens and pages show in your own menu. Hiding only takes them out of your menu: nothing is deleted or turned off, and nobody else's menu changes.",
    useCase: 'Use it to keep your menu to the screens you use.',
  },
];

/**
 * The side menu: the destinations the person may open (showsDestination), less those they hid on the Features page
 * or their store's level hides (visibility.ts, src/features/merchants/levels.ts). Until that loads, only Home and
 * Features: a destination appears, never vanishes. `hiddenByChoice`, the ones hidden only by that choice, is null till then.
 */
export function menuOf(isOwner: boolean, permissions: Permissions | null | undefined, hidden: string[] | undefined) {
  const permitted = DESTINATIONS.filter((entry) => isOwner || showsDestination(entry, permissions));
  const opensPage = (page: IndexRule) => isOwner || opens(page, permissions);
  const shown = hidden ? permitted.filter((entry) => screenShown(hidden, entry, opensPage)) : permitted.filter((entry) => entry.fixed);
  const hiddenByChoice = hidden ? permitted.filter((entry) => !shown.includes(entry)).map((entry) => entry.name) : null;
  return { shown, hiddenByChoice };
}
