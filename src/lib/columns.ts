import { createContext, use, useState } from 'react';
import { PixelRatio, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

// ponytail: one number, tune it on a real tablet.
//
// Not a breakpoint. It is a card's *minimum* width, and the column count falls out of it — a phone
// gets one or two, a small tablet three, a large one more, with no device check anywhere
// (.claude/instruction_mds/frontend.md §4.2).
const MIN_CARD = 260;

// ponytail: M3's "expanded" window class. Tune it on a real tablet.
//
// The one width threshold (.claude/instruction_mds/frontend.md §4.1). Compared against the window's width,
// once, in src/app/(app)/_layout.tsx; every wide/narrow pair (§4.4) flips on it together.
export const WIDE_MIN = 840;

// Chrome widths, not card widths: panes are named so no screen writes its own (.claude/instruction_mds/frontend.md §1).
export const RAIL_EXPANDED = 128; // icons + labels; fits a nine-letter label in labelLarge
export const RAIL_COLLAPSED = 72; // icons only, after the menu action
export const DRAWER_WIDTH = 300; // the narrow shell's off-canvas drawer

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
