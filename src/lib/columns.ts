import { createContext, use, useState } from 'react';
import { PixelRatio, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ponytail: one number, tune it on a real tablet.
//
// Not a breakpoint. It is a card's *minimum* width, and the column count falls out of it — a phone
// gets one or two, a small tablet three, a large one more, with no device check anywhere
// (.claude/instruction_mds/frontend.md §4.2).
const MIN_CARD = 260;

// ponytail: M3's "medium" window class. Tune it on a real tablet.
//
// The one width threshold (.claude/instruction_mds/frontend.md §4.1). Compared against the window's width,
// once, in src/app/(app)/_layout.tsx; every wide/narrow pair (§4.4) flips on it together. 600, not M3's
// "expanded" 840 (the value until 2026-10-19): a tablet held upright (800dp on the Medium Tablet) is wide too,
// and a phone — portrait-locked, under 600 — never is.
export const WIDE_MIN = 600;

// Measures: the widest a column of text or fields grows, left-aligned (.claude/instruction_mds/frontend.md rule 18).
export const FORM_MEASURE = 720; // a full-page form, its footer, a document's page
export const READING_MEASURE = 560; // a paragraph or a short block of controls under a page header
export const DIALOG_MAX = 560; // a Dialog over the screen, and a small form's page

// Chrome widths, not card widths: panes are named so no screen writes its own (.claude/instruction_mds/frontend.md §1).
export const RAIL_EXPANDED = 128; // icons + labels; fits a nine-letter label in labelLarge
export const RAIL_COLLAPSED = 72; // icons only, after the menu action
// The narrow shell's off-canvas drawer. A multiple of 8 so it is whole pixels at the 1.75-3.5 densities: at 300 a
// 2.625 phone lays it 787.5px wide, and the closed drawer, translated by that, leaves a 1px sliver at the left edge.
export const DRAWER_WIDTH = 304;
// The product scan's panel beside the camera on a tablet: its hint, buttons and Scanned list.
export const SCAN_PANEL = 380;

// The Home systems grid's card: three across a 1180dp tablet, four at 1440, five at 1920. A system card
// carries two buttons under its name, so it is wider than MIN_CARD.
export const SYSTEM_CARD = 360;

// The sample receipt's width on each roll: about 32 characters of bodyMedium on 58mm paper and 48 on 80mm.
// A page (A4) takes the form's own measure. ponytail: tune against a printer's real line length when printing
// lands with the POS Invoice.
export const RECEIPT_58MM = 232;
export const RECEIPT_80MM = 336;

/**
 * The one wide/narrow decision (.claude/instruction_mds/frontend.md §4.1).
 *
 * Provided by src/app/(app)/_layout.tsx from the window's width. A screen reads this instead of
 * measuring its own pane: the pane is narrower than the window by the rail, so a second measurement
 * would flip the anatomy at a different width from the rail beside it.
 */
export const ShellWideContext = createContext(false);

export const useShellWide = () => use(ShellWideContext);

/**
 * How far the end of a scrolling page or a floating control keeps above the system navigation bar. The Android
 * build is edge-to-edge, so the bar — three buttons, or the gesture handle — lies over the window's bottom; the
 * last row or button of a page that ignores it sits under the Back / Home / Recents buttons.
 *
 * `underTabs`: a (tabs) screen. On a phone the tab bar sits over the navigation bar and pads itself, while Android
 * still reports the bar's height here (expo-router adds no SafeAreaProvider under its tabs there) — a second gap.
 * On a tablet the tab bar is hidden, and the page meets the navigation bar itself.
 */
export function useBottomInset(underTabs = false) {
  const { bottom } = useSafeAreaInsets();
  const wide = useShellWide();
  return underTabs && !wide ? 0 : bottom;
}

/**
 * A width that holds text, grown with the OS font scale up to the Text wrapper's 1.5 cap on scanned
 * labels (src/components/text.tsx). Layout, not type: the type itself is never scaled by width
 * (.claude/instruction_mds/frontend.md rule 10). For the rail, whose labels would otherwise truncate at a
 * large font size.
 */
export const fontScaled = (width: number) => width * Math.min(PixelRatio.getFontScale(), 1.5);

// ponytail: one number, tune it on a real tablet. Above this OS font scale a wide table's column
// titles truncate, so the list falls back to its narrow rows (.claude/instruction_mds/frontend.md §3.5).
const TABLE_FONT_MAX = 1.15;

/**
 * Whether a list draws its DataTable: wide, and the font scale small enough for the columns to read.
 * Only the table-vs-rows choice reads this; dialogs vs sheets stay on useShellWide(). fontScale, not
 * width, so this is not a second breakpoint.
 *
 * Both hooks run every render: `wide && useWindowDimensions()` skipped the second while narrow, and a
 * window widening past WIDE_MIN (rotation, split-screen) then crashed on a changed hook order.
 */
export function useTableFits() {
  const wide = useShellWide();
  const { fontScale } = useWindowDimensions();
  return wide && fontScale <= TABLE_FONT_MAX;
}

/**
 * Column count derived from the container's measured width.
 *
 * Spread `onLayout` onto the element whose width actually constrains the cards, never onto the
 * screen: `useWindowDimensions()` describes the window, and under iPadOS Stage Manager or Android
 * split-screen the window is not what the list received. `Dimensions.get()` at module scope is
 * worse — a snapshot taken at import time that never updates, not on rotation, resize, or fold.
 *
 * First frame reports width 0, so `columns` is 1 until layout runs. A wide container therefore
 * shows the narrow presentation for exactly one frame. The flip is monotonic, so there is no
 * thrash; if you ever see one, something is measuring the window instead of the container.
 */
export function useColumns(minWidth = MIN_CARD) {
  const [width, setWidth] = useState(0);

  return {
    columns: Math.max(1, Math.floor(width / minWidth)),
    onLayout: (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width),
  };
}
