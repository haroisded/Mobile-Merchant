// Prices on screen. The currency is the merchant's (merchants.currency, an ISO 4217 code); the grouping
// and decimal marks follow the device locale. Intl.NumberFormat ships in Hermes, so there is no package.
//
// One formatter per currency, built on first use. Constructing an Intl.NumberFormat is the expensive
// part, and a product list formats a price per row per render.
const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  let found = formatters.get(currency);
  if (!found) {
    found = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    formatters.set(currency, found);
  }
  return found;
}

/**
 * "₱" — the affix a price field carries. Read off a formatted zero rather than formatToParts, which
 * leaves nothing to depend on beyond format() itself.
 */
export function currencySymbol(currency: string): string {
  return formatter(currency).format(0).replace(/[\d.,\s ]/g, '') || currency;
}

/** "₱4,800.00". A price that is not set yet renders as an em dash rather than a zero it isn't. */
export function formatMoney(amount: number | null | undefined, currency: string): string {
  return amount === null || amount === undefined ? '—' : formatter(currency).format(amount);
}
