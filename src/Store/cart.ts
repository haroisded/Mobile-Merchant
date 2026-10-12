import { create } from 'zustand';

import type { CartDiscount, CartLine } from '../features/pos-invoices/cart';

const NO_LINES: CartLine[] = [];
const NO_DISCOUNT: CartDiscount = { applyOn: null, percentage: null, amount: null };

/**
 * The Register's cart: its lines, and the sale's additional discount as typed. The Register and the Cart are
 * two pages of the Sell stack, so both live here rather than in either page's state — as
 * src/Store/ledger-filters.ts holds a report's filters. Client state, nothing fetched
 * (.claude/instruction_mds/data-layer.md rule 9); it is gone when the app restarts.
 */
const useCartStore = create<{ sessionId: string; lines: CartLine[]; discount: CartDiscount }>(() => ({ sessionId: '', lines: NO_LINES, discount: NO_DISCOUNT }));

// A cart belongs to one session (a POS Opening Entry), so another session starts from none.
const change = (sessionId: string, update: (lines: CartLine[], discount: CartDiscount) => { lines?: CartLine[]; discount?: CartDiscount }) =>
  useCartStore.setState((state) => {
    const mine = state.sessionId === sessionId ? state : { lines: NO_LINES, discount: NO_DISCOUNT };
    return { sessionId, lines: mine.lines, discount: mine.discount, ...update(mine.lines, mine.discount) };
  });

export const useCart = (sessionId: string) => useCartStore((state) => (state.sessionId === sessionId ? state.lines : NO_LINES));

export const useCartDiscount = (sessionId: string) => useCartStore((state) => (state.sessionId === sessionId ? state.discount : NO_DISCOUNT));

/** One more of an item: onto its line in that unit, or a new line at the price list's rate. */
export const addToCart = (sessionId: string, itemId: string, uomId: string) =>
  change(sessionId, (lines) => ({
    lines: lines.some((line) => line.itemId === itemId && line.uomId === uomId)
      ? lines.map((line) => (line.itemId === itemId && line.uomId === uomId ? { ...line, qty: line.qty + 1 } : line))
      : [...lines, { itemId, uomId, qty: 1, rate: null }],
  }));

export const updateCartLine = (sessionId: string, index: number, patch: Partial<CartLine>) =>
  change(sessionId, (lines) => ({ lines: lines.map((line, at) => (at === index ? { ...line, ...patch } : line)) }));

export const removeCartLine = (sessionId: string, index: number) => change(sessionId, (lines) => ({ lines: lines.filter((_line, at) => at !== index) }));

export const setCartDiscount = (sessionId: string, patch: Partial<CartDiscount>) => change(sessionId, (_lines, discount) => ({ discount: { ...discount, ...patch } }));

export const clearCart = (sessionId: string) => change(sessionId, () => ({ lines: NO_LINES, discount: NO_DISCOUNT }));
