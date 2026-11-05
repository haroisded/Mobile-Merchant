import { createContext, use } from 'react';

/** The destinations whose sidebar row opens a dropdown of their sections. */
export type MenuName = 'setup' | 'stock';

type ShellMenu = {
  /** The open dropdown; null: the sidebar as usual. */
  menu: MenuName | null;
  /** Each screen's picked section, by title. None yet: its first. */
  picked: Partial<Record<MenuName, string>>;
  openMenu: (menu: MenuName) => void;
  closeMenu: () => void;
  pick: (menu: MenuName, section: string) => void;
};

/**
 * The store shell's sidebar dropdowns (src/app/(app)/systems/[id]/_layout.tsx), read by the two screens they drive
 * (src/components/section-browser.tsx) and by Home's shortcuts. State, not a route param: the drawer's content sits
 * outside the routes it opens, and a screen is told its section without a push.
 */
export const ShellMenuContext = createContext<ShellMenu>({ menu: null, picked: {}, openMenu: () => undefined, closeMenu: () => undefined, pick: () => undefined });

export const useShellMenu = () => use(ShellMenuContext);
