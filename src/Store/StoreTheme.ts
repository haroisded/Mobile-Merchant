import { useColorScheme } from 'react-native';
import { create } from 'zustand';

import { secureStorage } from '../lib/secure-storage';


type ThemeMode = 'light' | 'dark';


type ThemeStore = {
  /**
   * `null` means "follow the OS", which is what every install starts as and what the row has never
   * moved off until the user taps it. Once they do, the choice wins over the OS setting until they
   * change it again — an in-app preference the system cannot know about.
   */
  mode: ThemeMode | null;
};


/**
 * The app's theme preference. Separate from StoreUser because it outlives the session: signing out
 * drops the user, not the choice of what the app looks like.
 */
const useThemeStore = create<ThemeStore>( () => ({ mode: null }) );

/**
 * The theme the app is actually in. app.json sets `userInterfaceStyle: "automatic"`, so the OS
 * setting is the default — but only the default: once the Themes row has written a mode, it wins.
 *
 * Both sources are read unconditionally. `mode ?? useColorScheme()` would skip the hook whenever a
 * mode is stored, and a hook that runs on some renders and not others breaks the order React
 * relies on.
 */
export function useIsDarkTheme() {
  const mode = useThemeStore((s) => s.mode);
  const scheme = useColorScheme();
  return (mode ?? scheme) === 'dark';
}


// secureStorage rather than a second storage library: it is the only key/value store installed
// (AsyncStorage was removed with the web target), and a theme name in the Keystore costs nothing.
const KEY = 'mobile-merchant.theme-mode';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

/**
 * Flips the theme and remembers it. The current mode is passed in rather than read here: the OS
 * fallback lives behind useColorScheme(), a hook, and the caller is already rendering under the
 * resolved theme.
 *
 * The write is not awaited. The store is what renders, so the screen flips on the next frame either
 * way; the storage write only decides what the next launch starts as.
 */
export function toggleThemeMode(current: ThemeMode) {
  const next = current === 'dark' ? 'light' : 'dark';
  useThemeStore.setState({ mode: next });
  void secureStorage.setItem(KEY, next);
}


// Read at module scope, like the auth subscription in StoreUser.ts: importing this module starts
// it. It resolves while the splash is still up — the session restore it races is the slower of the
// two, being a SecureStore read plus a token refresh — so there is no loading gate here. A stored
// value that is neither name is treated as absent rather than thrown on.
void secureStorage.getItem(KEY).then((value) => {
  if (isThemeMode(value)) useThemeStore.setState({ mode: value });
});
