import { createContext, use } from 'react';

import type { Destination } from '../../components/destinations';
import type { IndexRule } from '../../features/permissions/access';

/**
 * What the Features page's routes share (src/app/(app)/features/): the store, the screens the person may open, the
 * choices last saved, and the way out. The unsaved choices themselves are the form above them (FormProvider, field
 * `hidden`), so they outlive the push between the list and a screen's page on a phone.
 */
export type FeaturesValue = {
  merchantId: string;
  storeName: string;
  /** The screens the person may open, Home left out: the list, in rail order. */
  screens: Destination[];
  /** The choices as saved: what Reset returns to and the unsaved count compares with. */
  saved: string[];
  opensPage: (page: IndexRule) => boolean;
  /** A short message at the bottom of the page. */
  notify: (message: string) => void;
  /** Leave the page — asking first while choices are unsaved. */
  leave: () => void;
};

export const FeaturesContext = createContext<FeaturesValue | null>(null);

export function useFeatures() {
  const value = use(FeaturesContext);
  if (!value) throw new Error('useFeatures needs the Features layout above it.');
  return value;
}
