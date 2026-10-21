import { router } from 'expo-router';

import { RecordIndex } from '../../components/record-index';
import type { IndexSection } from '../../components/record-index';

/** The pages under src/app/(app)/systems/[id]/accounts/ this index opens. */
type AccountsRoute = 'general-ledger';

// What the books say. A section appears once its first screen exists; the Chart of Accounts and the
// accounting settings stay under Setup, where the foundation is kept.
export const ACCOUNTS_SECTIONS: IndexSection<AccountsRoute>[] = [
  {
    title: 'Reports',
    hint: 'What every submitted document posted',
    entries: [
      {
        label: 'General Ledger',
        hint: 'Every debit and credit, by account, date and voucher',
        details:
          'Lists every amount the books record: each debit and credit, by account, date and document. Use it to check where the money from a sale, a return or a stock change went.',
        doctype: 'GL Entry',
        route: 'general-ledger',
      },
    ],
  },
];

/** Accounts: the index of a system's books, a rail destination. */
export function AccountsIndex({ merchantId, merchantName, isOwner }: { merchantId: string; merchantName: string; isOwner: boolean }) {
  return (
    <RecordIndex
      merchantId={merchantId}
      screen="accounts"
      kicker={merchantName}
      title="Accounts"
      meta="The books your documents post to"
      isOwner={isOwner}
      sections={ACCOUNTS_SECTIONS}
      onOpen={(route) => router.push(`/systems/${merchantId}/accounts/${route}`)}
      offline="You're offline. Accounts will load when you reconnect."
      failure="Couldn't load Accounts. Try again."
      empty="Your permissions give you nothing to see here. Ask the owner if you need more."
    />
  );
}
