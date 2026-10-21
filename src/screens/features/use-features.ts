import { createContext, use } from 'react';

import type { Destination } from '../../components/destinations';
import type { IndexRule } from '../../features/permissions/access';

/**
 * What the Features page's routes share (src/app/(app)/systems/[id]/features/): the store, the screens the person may open, the
 * choices last saved, and the way out. The unsaved choices themselves are the form above them (FormProvider, field
 * `hidden`), so they outlive the push between the list and a screen's page on a phone.
 */
export type FeaturesValue = {
  merchantId: string;
  storeName: string;
  /** The store's level (src/features/merchants/levels.ts): the menu a person starts from. */
  level: number;
  /** The owner changes the level; everyone else reads it. */
  isOwner: boolean;
  /** The screens the person may open, Home and Features left out (`fixed`): the list, in rail order. */
  screens: Destination[];
  /** The choices as saved: what Reset returns to and the unsaved count compares with. */
  saved: string[];
  opensPage: (page: IndexRule) => boolean;
  /** A short message at the bottom of the page. */
  notify: (message: string) => void;
  /** Android's back on the list: true when it asked, with choices unsaved; false lets the drawer go Home. */
  leave: () => boolean;
};

export const FeaturesContext = createContext<FeaturesValue | null>(null);

export function useFeatures() {
  const value = use(FeaturesContext);
  if (!value) throw new Error('useFeatures needs the Features layout above it.');
  return value;
}
