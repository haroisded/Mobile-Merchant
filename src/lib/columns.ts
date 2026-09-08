import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

// ponytail: one number, tune it on a real tablet.
//
// Not a breakpoint. It is a card's *minimum* width, and the column count falls out of it — a phone
// gets one or two, a small tablet three, a large one more, with no device check anywhere
// (docs/layout.md §1).
export const MIN_CARD = 260;

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
