// styles/theme.js
import { MD3DarkTheme, MD3LightTheme, configureFonts } from 'react-native-paper';

const lightColors = {
  primary: "#1E293B",
  onPrimary: "#FFFFFF",
  primaryContainer: "#DDE4EE",
  onPrimaryContainer: "#151E2C",
  secondary: "#475569",
  onSecondary: "#FFFFFF",
  secondaryContainer: "#E2E8F0",
  onSecondaryContainer: "#2B3646",
  tertiary: "#5A6B85",
  onTertiary: "#FFFFFF",
  tertiaryContainer: "#E4EBF5",
  onTertiaryContainer: "#3B4759",
  error: "#BA1A1A",
  onError: "#FFFFFF",
  errorContainer: "#FFDAD6",
  onErrorContainer: "#93000A",
  background: "#FFFFFF",
  onBackground: "#1E293B",
  surface: "#FFFFFF",
  onSurface: "#1E293B",
  surfaceVariant: "#E2E8F0",
  onSurfaceVariant: "#4A5768",
  outline: "#7C8898",
  outlineVariant: "#CBD5E1",
  shadow: "#000000",
  scrim: "#000000",
  inverseSurface: "#2F3B4B",
  inverseOnSurface: "#F1F5F9",
  inversePrimary: "#AEC3E0",
  surfaceDisabled: "rgba(30, 41, 59, 0.12)",
  onSurfaceDisabled: "rgba(30, 41, 59, 0.38)",
  backdrop: "rgba(45, 55, 72, 0.4)",
  elevation: {
    level0: "transparent",
    level1: "#F6F8FB",
    level2: "#F1F4F9",
    level3: "#EBEFF6",
    level4: "#E8EDF4",
    level5: "#E4EAF2",
  },
  // The Merchant keys, from instruction_mds/visual-language.md §3 — roles the mockups need and MD3 lacks. Read
  // them through useAppTheme() (src/lib/theme.ts); Paper's plain useTheme() types colors to MD3 only.
  accent: "#EC3013",
  onAccent: "#FFFFFF",
  onSurfaceMuted: "#64748B",
  onSurfaceFaint: "#94A3B8",
  surfaceMuted: "#F1F5F9",
  surfaceSubtle: "#F8FAFC",
  primaryHighlight: "rgba(255, 255, 255, 0.14)",
  // The press colour for Pressable's android_ripple on a light surface. Paper's TouchableRipple
  // derived it from the text colour at 12%; Pressable reads nothing, so it is a key
  // (instruction_mds/visual-language.md §5). On `primary` the ripple is `primaryHighlight`.
  ripple: "rgba(30, 41, 59, 0.12)",
};



const darkColors = {
  primary: "#AEC3E0",
  onPrimary: "#1B2637",
  primaryContainer: "#33415A",
  onPrimaryContainer: "#DDE4EE",
  secondary: "#BDC7D6",
  onSecondary: "#29323F",
  secondaryContainer: "#3F4959",
  onSecondaryContainer: "#E2E8F0",
  tertiary: "#BCC9DE",
  onTertiary: "#2A3646",
  tertiaryContainer: "#42506A",
  onTertiaryContainer: "#E4EBF5",
  error: "#FFB4AB",
  onError: "#690005",
  errorContainer: "#93000A",
  onErrorContainer: "#FFDAD6",
  background: "#111721",
  onBackground: "#E1E7EF",
  surface: "#111721",
  onSurface: "#E1E7EF",
  surfaceVariant: "#414B59",
  onSurfaceVariant: "#C3CCDA",
  outline: "#8D97A6",
  outlineVariant: "#414B59",
  shadow: "#000000",
  scrim: "#000000",
  inverseSurface: "#E1E7EF",
  inverseOnSurface: "#2F3B4B",
  inversePrimary: "#1E293B",
  surfaceDisabled: "rgba(225, 231, 239, 0.12)",
  onSurfaceDisabled: "rgba(225, 231, 239, 0.38)",
  backdrop: "rgba(45, 55, 72, 0.4)",
  elevation: {
    level0: "transparent",
    level1: "#1A212C",
    level2: "#1E2632",
    level3: "#232B38",
    level4: "#252D3A",
    level5: "#29323F",
  },
  // The accent stays the same red on dark, as POS Shell draws it. The rest follow the dark ramp
  // above; `primaryHighlight` darkens instead of lightening, because `primary` is light here.
  accent: "#EC3013",
  onAccent: "#FFFFFF",
  onSurfaceMuted: "#A3AEBE",
  onSurfaceFaint: "#7C8898",
  surfaceMuted: "#1E2632",
  surfaceSubtle: "#1A212C",
  primaryHighlight: "rgba(0, 0, 0, 0.12)",
  ripple: "rgba(225, 231, 239, 0.12)",
};



// The nine-role scale from instruction_mds/typography.md §2, shared by both themes — size does not change with
// the palette. Keyed by variant, never flat: a config whose values are all non-objects is merged into
// ALL fifteen variants (fonts.tsx:88-98), so `{ fontSize: 26 }` one level up would resize everything.
const fonts = configureFonts({
  config: {
    // An MD3 key merges over its default (fonts.tsx:101-110), so only what changes is named.
    headlineMedium: { fontSize: 24, lineHeight: 28, fontWeight: '800' },
    headlineSmall: { fontSize: 19, lineHeight: 24, fontWeight: '800' },
    // Never typed at a call site: Appbar.Content picks it for a small header's title (§3).
    titleLarge: { fontSize: 19, lineHeight: 24, fontWeight: '700' },
    titleMedium: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
    bodyMedium: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
    bodySmall: { fontSize: 11, lineHeight: 15, fontWeight: '400' },
    labelLarge: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
    // The uppercase lives in the token: Paper's Text spreads the whole variant object into the style
    // (Text.tsx:99), so copy is written in normal case and rendered in capitals.
    labelMedium: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    // New keys have no default to merge over, so each carries every property itself. Type them
    // through AppText (src/lib/theme.ts); Paper's own Text only accepts MD3 variant names.
    display: {
      fontFamily: MD3LightTheme.fonts.default.fontFamily,
      fontSize: 30,
      lineHeight: 34,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    amount: {
      fontFamily: MD3LightTheme.fonts.default.fontFamily,
      fontSize: 20,
      lineHeight: 24,
      fontWeight: '800',
      letterSpacing: 0,
    },
  },
});



// Paper multiplies `roundness` into each component's corners — Button and SegmentedButtons ×5, Card
// ×3, Dialog ×7, Chip ×2, TextInput, Menu and Snackbar ×1 (instruction_mds/visual-language.md §5) — so this one
// value rounds the whole app. 2 was chosen by the human on 2026-09-17 over 1 (barely rounded) and
// MD3's 4 (pill buttons, furthest from the mockups).
const ROUNDNESS = 2;

// The 4-point spacing scale from instruction_mds/layout.md §11. `ms` and `ml` are the two in-between steps (12,
// 20). Exported as plain constants because StyleSheet.create runs at module scope, where no hook can
// read the theme; the same objects ride on both themes for code that already holds the theme.
export const spacing = { xs: 4, sm: 8, ms: 12, md: 16, ml: 20, lg: 24, xl: 32, xxl: 48 };

// Radii for surfaces drawn by hand, in step with what Paper derives from ROUNDNESS: `sm` for a note
// callout or an input-like box (×1), `md` for a badge or chip-like tag (×2), `lg` for a thumbnail or
// card-like block (×3), `xl` for a modal surface that stands in for a Dialog (×7). Never a number at a
// call site (instruction_mds/visual-language.md rule 4).
export const radius = { sm: ROUNDNESS, md: ROUNDNESS * 2, lg: ROUNDNESS * 3, xl: ROUNDNESS * 7 };

// Both themes need every key: they are separate objects, and a key on one never reaches the other.
export const LightTheme = {
  ...MD3LightTheme,
  roundness: ROUNDNESS,
  colors: {
    ...MD3LightTheme.colors,
    ...lightColors,
  },
  fonts,
  spacing,
  radius,
};



export const DarkTheme = {
  ...MD3DarkTheme,
  roundness: ROUNDNESS,
  colors: {
    ...MD3DarkTheme.colors,
    ...darkColors,
  },
  fonts,
  spacing,
  radius,
};
