import type { StyleProp, ViewStyle } from 'react-native';
import { SegmentedButtons as PaperSegmentedButtons } from 'react-native-paper';

// Paper draws a segment's label itself — labelLarge, on one line, with no font-scale cap — so the cap that
// variant takes everywhere else (.claude/instruction_mds/frontend.md §3.1) is applied here, once, as
// src/components/text.tsx does for the app's own text. Uncapped, "Last 7 Days" read "Last 7 …" at the
// largest font size (emulator, 2026-10-13).
const LABEL_CAP = 1.5;

type Props<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  buttons: { value: T; label: string }[];
  style?: StyleProp<ViewStyle>;
};

/** Paper's SegmentedButtons, one choice at a time, its labels capped as the rest of the app's are. */
export function SegmentedButtons<T extends string>({ value, onValueChange, buttons, style }: Props<T>) {
  return (
    <PaperSegmentedButtons
      value={value}
      onValueChange={onValueChange}
      buttons={buttons.map((button) => ({ ...button, labelMaxFontSizeMultiplier: LABEL_CAP }))}
      style={style}
    />
  );
}
