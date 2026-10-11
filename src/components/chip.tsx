// A re-export, so a Paper-wide change lands in one file (.claude/instruction_mds/structure.md rule 7).
//
// Do not pass `onClose` to a Chip in a wrapping row: Paper positions its close button `absolute` with
// `height: '100%'` (Chip.tsx, `closeButtonStyle`), and there the percentage resolved against the row, not the
// chip — the × was drawn under the chip on the phone (2026-10-12). `icon="close"` with `onPress` is in the
// flow and cannot drift (.claude/instruction_mds/frontend.md §7).
export { Chip } from 'react-native-paper';
