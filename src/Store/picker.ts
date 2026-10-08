import { create } from 'zustand';

/** One choice in a searchable select. `hint` is a second, searchable line ("PHP · Philippine Peso"). */
export type PickOption = { value: string; label: string; hint?: string };

type PickRequest = {
  title: string;
  options: PickOption[];
  value: string;
  onPick: (value: string) => void;
};

/**
 * The open narrow picker. A searchable select on a phone opens as the native sheet route
 * src/app/(app)/sheets/pick.tsx (.claude/instruction_mds/frontend.md §4.4), and a route cannot take a
 * list of options or a callback as params, so the field leaves them here and the sheet reads them.
 * Client state, nothing fetched (.claude/instruction_mds/data-layer.md rule 9). Each open replaces the last.
 */
const usePickerStore = create<{ request: PickRequest | null }>(() => ({ request: null }));

export const openPicker = (request: PickRequest) => usePickerStore.setState({ request });

export const usePickRequest = () => usePickerStore((state) => state.request);
