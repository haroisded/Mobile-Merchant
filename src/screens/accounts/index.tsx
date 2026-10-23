import type { IndexSection } from '../../components/record-index';

/** The pages under src/app/(app)/systems/[id]/accounts/ this index opens. */
type AccountsRoute = 'general-ledger';

// What the books say. A section appears once its first screen exists; the Chart of Accounts and the
// accounting settings stay under Setup, where the foundation is kept. Accounts has no index screen: it opens on
// its one page, the General Ledger (src/app/(app)/systems/[id]/accounts/index.tsx). These sections still say who may
// open it (showsDestination) and what Features can hide — hiding the General Ledger hides Accounts.
export const ACCOUNTS_SECTIONS: IndexSection<AccountsRoute>[] = [
  {
    title: 'Reports',
    hint: 'What every submitted document posted',
    entries: [
      {
        label: 'General Ledger',
        hint: 'Every debit and credit, by account, date and voucher',
        purpose: 'Lists every amount the books record: each debit and credit, by account, date and document.',
        useCase: 'Use it to check where the money from a sale, a return or a stock change went.',
        doctype: 'GL Entry',
        route: 'general-ledger',
      },
    ],
  },
];
