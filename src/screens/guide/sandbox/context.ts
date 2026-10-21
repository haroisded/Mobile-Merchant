import { createContext, use } from 'react';

import type { PermissionKey, Role } from '../roles';
import type { NewItem, SetupId, Store } from '../sandbox-state';
import type { Page, Target } from '../tasks';

/** What a page of the practice store was opened on: the sale, session, document, Setup page or person. */
export type Params = { saleId?: string; sessionId?: string; entryId?: string; reconId?: string; setupId?: SetupId; employeeId?: string; itemCode?: string };

export type Sandbox = {
  role: Role;
  store: Store;
  /** Apply a practice action (src/screens/guide/sandbox-state.ts) to the store. */
  act: (change: (store: Store) => Store) => void;
  page: Page;
  params: Params;
  /** Open a page over this one. */
  go: (page: Page, params?: Params) => void;
  /** Open a page in place of this one: a return's receipt over the return. */
  replace: (page: Page, params?: Params) => void;
  /** Start again from a destination's first page: the side menu, a receipt's Done. */
  reset: (page: Page) => void;
  /** The page under this one, or out of the practice store from its first page. */
  back: () => void;
  /** Whether the role holds a permission: the owner holds every one. */
  holds: (key: PermissionKey) => boolean;
  /** The person did what `target` names: the guided step advances when it was the one asked for. */
  did: (target: Target, setupId?: SetupId) => void;
  /** Whether `target` is the control the guided step points at now. */
  isTarget: (target: Target, setupId?: SetupId) => boolean;
  /** What Scan Product read from the practice label, for the New Item form it returns to. */
  scanned: NewItem | null;
  setScanned: (item: NewItem | null) => void;
  /** Open the role's task list. */
  showTasks: () => void;
};

export const SandboxContext = createContext<Sandbox | null>(null);

export function useSandbox() {
  const sandbox = use(SandboxContext);
  if (!sandbox) throw new Error('useSandbox is called outside the Store Guide sandbox');
  return sandbox;
}
