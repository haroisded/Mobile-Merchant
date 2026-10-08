// Money as ERPNext computes and shows it: rounding at a precision, cash rounding to the smallest coin, a
// number format, and the amount in words. Pure and import-free, so tools/check-logic.mjs asserts it under
// Node and the POS reuses it unchanged. Sources: frappe/utils/data.py (rounded, flt,
// round_based_on_smallest_currency_fraction, money_in_words, in_words) and get_number_format_info.

export type RoundingMethod = "Banker's Rounding" | 'Commercial Rounding';

/** A stored rounding_method as the union; Banker's, ERPNext's default, for anything else. */
export const asRoundingMethod = (value: string): RoundingMethod => (value === 'Commercial Rounding' ? 'Commercial Rounding' : "Banker's Rounding");

/** The display rules a Currency row carries (public.currencies). */
export type CurrencyFormat = {
  code: string;
  symbol: string | null;
  symbol_on_right: boolean;
  fraction: string | null;
  number_format: string;
};

/**
 * `value` at `precision` decimals. Banker's Rounding sends an exact half to the even neighbour (2.5 → 2,
 * 3.5 → 4); Commercial Rounding sends it away from zero (2.5 → 3, -2.5 → -3). As frappe does, the scaled
 * value is first cut to 8 decimals, so 1.005 × 100 = 100.49999999999999 counts as the half it was meant to be.
 */
export function roundTo(value: number, precision: number, method: RoundingMethod) {
  const factor = 10 ** precision;
  const scaled = Number((value * factor).toFixed(8));
  const floor = Math.floor(scaled);
  const half = Math.abs(scaled - floor - 0.5) < 1e-9;
  const rounded = method === "Banker's Rounding" && half ? floor + (floor % 2 === 0 ? 0 : 1) : Math.sign(scaled) * Math.round(Math.abs(scaled));
  // `|| 0` turns a -0 into 0.
  return rounded / factor || 0;
}

/**
 * ERPNext's Rounded Total: `value` to the nearest smallest coin (0.05 for CHF), ties up. A currency with no
 * smallest coin set rounds to a whole unit, as frappe's round_based_on_smallest_currency_fraction does.
 */
export function cashRound(value: number, smallestFraction: number | null, precision: number, method: RoundingMethod) {
  if (!smallestFraction) return roundTo(value, 0, method);
  const factor = 10 ** precision;
  const remainder = roundTo(((value * factor) % (smallestFraction * factor)) / factor, precision, method);
  const adjusted = remainder > smallestFraction / 2 ? value + smallestFraction - remainder : value - remainder;
  return roundTo(adjusted, precision, method);
}

type FormatInfo = { decimal: string; group: string; decimals: number };

/** ERPNext's number formats: decimal separator, group separator, decimals (frappe get_number_format_info). */
const NUMBER_FORMATS = new Map<string, FormatInfo>([
  ['#,###.##', { decimal: '.', group: ',', decimals: 2 }],
  ['#.###,##', { decimal: ',', group: '.', decimals: 2 }],
  ['# ###.##', { decimal: '.', group: ' ', decimals: 2 }],
  ['# ###,##', { decimal: ',', group: ' ', decimals: 2 }],
  ["#'###.##", { decimal: '.', group: "'", decimals: 2 }],
  ['#, ###.##', { decimal: '.', group: ', ', decimals: 2 }],
  ['#,##,###.##', { decimal: '.', group: ',', decimals: 2 }],
  ['#,###.###', { decimal: '.', group: ',', decimals: 3 }],
  ['#.###', { decimal: '', group: '.', decimals: 0 }],
  ['#,###', { decimal: '', group: ',', decimals: 0 }],
]);

const DEFAULT_FORMAT: FormatInfo = { decimal: '.', group: ',', decimals: 2 };

/**
 * The formats as Select options: each labelled with what it does to a sample at its own decimals, so the
 * choice reads as a number, not a pattern — System Settings' and Currency's Number Format.
 */
export const NUMBER_FORMAT_OPTIONS = [...NUMBER_FORMATS].map(([format, info]) => ({
  value: format,
  label: formatNumber(1234567.891, format, info.decimals, "Banker's Rounding"),
  hint: format,
}));

/** A format's separators; the Indian format also groups by two above the first three digits. */
function formatInfo(format: string) {
  return { ...(NUMBER_FORMATS.get(format) ?? DEFAULT_FORMAT), indian: format === '#,##,###.##' };
}

/** Thousands groups: 1234567 → 1,234,567; the Indian format groups by two above the first three (12,34,567). */
function groupDigits(digits: string, separator: string, indian: boolean) {
  if (digits.length <= 3) return digits;
  const last = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const size = indian ? 2 : 3;
  const groups = [];
  for (let end = rest.length; end > 0; end -= size) groups.unshift(rest.slice(Math.max(0, end - size), end));
  return [...groups, last].join(separator);
}

/**
 * `value` in a number format at `precision` decimals ("#,###.##", 2 → "1,234.50"). A format with no decimal
 * part ("#,###", the yen's) shows none whatever the precision.
 */
export function formatNumber(value: number, format: string, precision: number, method: RoundingMethod) {
  const info = formatInfo(format);
  const places = info.decimal ? precision : 0;
  const fixed = Math.abs(roundTo(value, places, method)).toFixed(places);
  const [whole, part] = fixed.split('.');
  const sign = roundTo(value, places, method) < 0 ? '-' : '';
  return sign + groupDigits(whole, info.group, info.indian) + (part ? info.decimal + part : '');
}

/** `value` with its currency's symbol, on the side the currency puts it ("₱ 1,234.50", "1.234,50 kr"). */
export function formatMoney(value: number, currency: CurrencyFormat, precision: number, method: RoundingMethod) {
  const amount = formatNumber(value, currency.number_format, precision, method);
  const symbol = currency.symbol ?? currency.code;
  return currency.symbol_on_right ? `${amount} ${symbol}` : `${symbol} ${amount}`;
}

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 1..99 in words: "forty two" (frappe's in_words turns num2words' hyphen into a space). */
function underHundred(n: number) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '');
}

/** 1..999 in words, num2words' English: "two hundred and five". */
function underThousand(n: number) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (!hundreds) return underHundred(rest);
  return `${ONES[hundreds]} hundred${rest ? ` and ${underHundred(rest)}` : ''}`;
}

/**
 * A whole number in English words, as num2words writes it: "one thousand, two hundred and thirty four";
 * "and" before a last group under a hundred ("one thousand and four"). Indian scales for the lakh format.
 */
export function inWords(n: number, indian: boolean) {
  if (n === 0) return 'zero';
  const scales: [number, string][] = indian
    ? [[1e7, 'crore'], [1e5, 'lakh'], [1e3, 'thousand'], [1, '']]
    : [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand'], [1, '']];
  const parts: string[] = [];
  let left = n;
  for (const [size, name] of scales) {
    const count = Math.floor(left / size);
    left %= size;
    if (count) parts.push(name ? `${inWords(count, indian)} ${name}` : underThousand(count));
  }
  // num2words joins groups with commas, but a final group under a hundred with "and".
  const last = n % 1000;
  if (parts.length > 1 && last > 0 && last < 100) {
    const tail = parts.pop();
    return `${parts.join(', ')} and ${tail}`;
  }
  return parts.join(', ');
}

const titleCase = (text: string) => text.replace(/\b\w/g, (letter) => letter.toUpperCase());

/**
 * The amount in words, frappe's money_in_words: "PHP One Thousand, Two Hundred And Thirty Four and Fifty
 * Centavo only." The fraction is read at the currency format's own decimals.
 */
export function moneyInWords(value: number, currency: CurrencyFormat) {
  const info = formatInfo(currency.number_format);
  const [whole, part = ''] = Math.abs(value).toFixed(info.decimals).split('.');
  const fraction = Number(part || '0');
  const fractionName = currency.fraction ?? 'Cent';
  if (whole === '0' && fraction === 0) return `${currency.code} Zero only.`;
  if (whole === '0') return `${titleCase(inWords(fraction, info.indian))} ${fractionName} only.`;
  const main = `${currency.code} ${titleCase(inWords(Number(whole), info.indian))}`;
  return `${fraction ? `${main} and ${titleCase(inWords(fraction, info.indian))} ${fractionName}` : main} only.`;
}
