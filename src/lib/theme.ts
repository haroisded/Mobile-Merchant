import { customText, useTheme } from 'react-native-paper';
import type { MD3TypescaleKey } from 'react-native-paper';

import type { LightTheme } from '../themes';

/**
 * The theme's type, Merchant colour keys and added font variants included. themes.js is plain JS, so
 * this is inferred from the object itself — adding a key there is the whole change, with no interface
 * to keep in step. LightTheme and DarkTheme carry the same keys.
 */
export type AppTheme = typeof LightTheme;

/**
 * Paper's useTheme() with the Merchant keys typed. Paper types `theme.colors` to MD3's roles only, so
 * `colors.accent` does not compile through the plain hook. A generic, not a type assertion, so it
 * passes .oxlintrc.json (docs/visual-language.md §3).
 */
export const useAppTheme = () => useTheme<AppTheme>();

/**
 * Paper's own Text, typed to also accept `display` and `amount`. customText is a cast of the same
 * component (Text.tsx:185), not a second primitive, so CLAUDE.md §3 rule 1 still holds
 * (docs/typography.md §2). Import it only where one of those two variants is used.
 */
export const AppText = customText<`${MD3TypescaleKey}` | 'display' | 'amount'>();
