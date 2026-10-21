// What a person's Features page hides in a store: whole screens (the side menu's destinations) and pages (the rows of
// a screen's index). Import-free: asserted in tools/check-logic.mjs. Hidden is not disabled — every route stays
// registered and RLS still decides; this only answers what the menu and the indexes list.
//
// A page is CORE when the screen's job cannot be done from its other pages: the start of the chain the others
// continue (Sell's session and Register), or the record they all act on (Stock's Items). A core page has no switch
// of its own — it goes only with its screen. A screen with no core is a set of pages that each stand alone (Setup,
// Accounts): it is shown while one of its pages is, so hiding its last page hides it, and turning it on again shows
// every page. A screen that is off locks its pages' switches. A key no page names any more
// (a page renamed) matches nothing and counts for nothing. Core counts only where the
// person may open it: a Sell without the session box (no POS Opening Entry create) is pages that stand alone.

/** A page of a screen: its route, and whether it is the screen's core. */
export type FeaturePage = { route: string; core?: boolean };

/** A screen: its route name, the core it has outside its index (Sell's session box), and its index. */
export type FeatureScreen<P extends FeaturePage = FeaturePage> = { name: string; core?: P; sections?: { entries: P[] }[] };

/** The key a hidden screen is saved under. */
export const screenKey = (screen: string) => `screen:${screen}`;

/** The key a hidden page is saved under. */
export const pageKey = (screen: string, route: string) => `${screen}/${route}`;

/** Every page of a screen, its core first. */
function pagesOf<P extends FeaturePage>(screen: FeatureScreen<P>): P[] {
  return [...(screen.core ? [screen.core] : []), ...(screen.sections ?? []).flatMap((section) => section.entries)];
}

/** Whether the screen keeps a core for someone who opens what `opens` says. */
export const hasCore = <P extends FeaturePage>(screen: FeatureScreen<P>, opens: (page: P) => boolean) =>
  pagesOf(screen).some((page) => page.core && opens(page));

/** Whether a page is listed on its screen. A core page always is: a stored key for one counts for nothing. */
export const pageShown = (hidden: readonly string[], screen: string, page: FeaturePage) => !!page.core || !hidden.includes(pageKey(screen, page.route));

/**
 * Whether a screen is in the side menu, by the person's choice — permissions are showsDestination's. Home always is;
 * a screen whose switch is off never is; one with an index and no core only while a page it may open is shown.
 */
export function screenShown<P extends FeaturePage>(hidden: readonly string[], screen: FeatureScreen<P>, opens: (page: P) => boolean) {
  if (screen.name === 'index') return true;
  if (hidden.includes(screenKey(screen.name))) return false;
  if (!screen.sections || hasCore(screen, opens)) return true;
  return pagesOf(screen).some((page) => opens(page) && pageShown(hidden, screen.name, page));
}

const without = (hidden: readonly string[], keys: string[]) => hidden.filter((key) => !keys.includes(key));
const withKeys = (hidden: readonly string[], keys: string[]) => [...without(hidden, keys), ...keys];

/**
 * A screen's switch. Off hides it; a screen with no core hides its pages with it, so its page switches read off.
 * On shows it; a screen with no core shows every page again — its pages are what it is.
 */
export function setScreen<P extends FeaturePage>(hidden: readonly string[], screen: FeatureScreen<P>, on: boolean, opens: (page: P) => boolean) {
  const own = hasCore(screen, opens) ? [] : pagesOf(screen).map((page) => pageKey(screen.name, page.route));
  const keys = [screenKey(screen.name), ...own];
  return on ? without(hidden, keys) : withKeys(hidden, keys);
}

/**
 * Pages' switches — one page's, or a section's Hide all / Show all. A screen that is off locks its page switches, so
 * this runs only while it is on; a core page has no switch and is skipped.
 */
export function setPages(hidden: readonly string[], screen: { name: string }, pages: FeaturePage[], on: boolean) {
  const keys = pages.filter((page) => !page.core).map((page) => pageKey(screen.name, page.route));
  return on ? without(hidden, keys) : withKeys(hidden, keys);
}

export type ScreenStatus = { state: 'shown' | 'partial' | 'hidden'; shown: number; total: number };

/** What the screens list says of a screen: shown, some pages hidden, or hidden — and how many of its pages show. */
export function screenStatus<P extends FeaturePage>(hidden: readonly string[], screen: FeatureScreen<P>, opens: (page: P) => boolean): ScreenStatus {
  const pages = pagesOf(screen).filter(opens);
  const on = screenShown(hidden, screen, opens);
  const shown = on ? pages.filter((page) => pageShown(hidden, screen.name, page)).length : 0;
  return { state: !on ? 'hidden' : shown < pages.length ? 'partial' : 'shown', shown, total: pages.length };
}

/** A screen's switch, then each of its pages' choices — what the unsaved count compares. */
const switches = <P extends FeaturePage>(hidden: readonly string[], screen: FeatureScreen<P>, opens: (page: P) => boolean) => [
  screenShown(hidden, screen, opens),
  ...pagesOf(screen)
    .filter((page) => opens(page) && !page.core)
    .map((page) => pageShown(hidden, screen.name, page)),
];

/** How many of a screen's switches differ between two choices: a page and the screen its last page took with it are two. */
export function changedSwitches<P extends FeaturePage>(saved: readonly string[], draft: readonly string[], screen: FeatureScreen<P>, opens: (page: P) => boolean) {
  const before = switches(saved, screen, opens);
  return switches(draft, screen, opens).filter((value, index) => value !== before[index]).length;
}
