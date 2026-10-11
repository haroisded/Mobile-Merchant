// The price a sale's line takes (docs.frappe.io/erpnext/item-price, /Selling-in-different-UOM; ERPNext's
// get_price_list_rate_for): the item's price in the sale's price list for the line's unit on the sale's
// date; then, on a Price Not UOM Dependent list, its stock-unit price times the conversion factor; then the
// same two steps in Selling Settings' default price list when its fallback is on. Used by the POS Invoice.
//
// Import-free, so tools/check-logic.mjs can run it under plain Node.

export type PriceRow = {
  item_id: string;
  price_list_id: string;
  uom_id: string;
  price_list_rate: number;
  /** "YYYY-MM-DD", or null for no start / no end. */
  valid_from: string | null;
  valid_upto: string | null;
};

type PriceListRule = { id: string; price_not_uom_dependent: boolean };

export type PriceRequest = {
  itemId: string;
  /** The unit the line is sold in. */
  uomId: string;
  stockUomId: string;
  /** How many stock units make one `uomId`: 1 for the stock unit itself. */
  conversionFactor: number;
  /** "YYYY-MM-DD". */
  date: string;
  priceList: PriceListRule;
  /** Selling Settings' default price list while its fallback is on, else null. */
  fallback: PriceListRule | null;
};

export type ResolvedPrice = { rate: number; priceListId: string };

// Valid on the date, both ends included. Among several, the later Valid From wins — a dated price over an
// open-ended one — and at the same start the one that ends sooner.
function best(prices: PriceRow[], request: PriceRequest, priceListId: string, uomId: string) {
  return prices
    .filter(
      (price) =>
        price.item_id === request.itemId &&
        price.price_list_id === priceListId &&
        price.uom_id === uomId &&
        (price.valid_from === null || price.valid_from <= request.date) &&
        (price.valid_upto === null || price.valid_upto >= request.date)
    )
    .sort((a, b) => (b.valid_from ?? '').localeCompare(a.valid_from ?? '') || (a.valid_upto ?? '9999').localeCompare(b.valid_upto ?? '9999'))[0];
}

/** Null when no price list gives the line a rate: the sale has no price for it. */
export function resolvePrice(prices: PriceRow[], request: PriceRequest): ResolvedPrice | null {
  const lists = [request.priceList, ...(request.fallback && request.fallback.id !== request.priceList.id ? [request.fallback] : [])];

  for (const list of lists) {
    const exact = best(prices, request, list.id, request.uomId);
    if (exact) return { rate: exact.price_list_rate, priceListId: list.id };

    // "Each unit needs its own price" unless the list says a price per stock unit also prices bigger units.
    if (list.price_not_uom_dependent && request.uomId !== request.stockUomId) {
      const perStockUnit = best(prices, request, list.id, request.stockUomId);
      if (perStockUnit) return { rate: perStockUnit.price_list_rate * request.conversionFactor, priceListId: list.id };
    }
  }

  return null;
}
