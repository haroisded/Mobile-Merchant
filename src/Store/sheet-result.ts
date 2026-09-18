import { useEffect } from 'react';
import { create } from 'zustand';

type SheetResult = { key: string; id: string } | null;

/**
 * What a create sheet made, handed back to the picker that opened it.
 *
 * A narrow inline-create is a formSheet route (instruction_mds/visual-language.md §5), so the picker and the
 * dialog no longer share a component tree to pass `onCreated` down. One slot is enough: only one
 * sheet is ever open. The key names the field that asked ("category", "subcategory", …), so a result
 * never lands in a different picker on the same form.
 *
 * Rejected: `navigation.popTo(route, { createdId }, { merge: true })`. It leaves the id in the form
 * route's params after it is used, and ties every sheet to the name of each route that opens it.
 */
const useSheetResultStore = create<{ result: SheetResult }>(() => ({ result: null }));

export function setSheetResult(key: string, id: string) {
  useSheetResultStore.setState({ result: { key, id } });
}

/** Calls `take` once with the id a sheet created for `key`, then clears the slot. */
export function useSheetResult(key: string, take: (id: string) => void) {
  const result = useSheetResultStore((state) => state.result);

  useEffect(() => {
    if (result?.key !== key) return;
    useSheetResultStore.setState({ result: null });
    take(result.id);
  }, [result, key, take]);
}
