/**
 * A product's label, read into an Item's fields — the scan screen's Read Label and Choose Photo
 * (src/screens/scan). ML Kit hands back lines of print and how tall each stood on the picture; this guesses
 * which line is which. A guess only fills a field still empty (src/screens/items/item-form.tsx), so a wrong
 * one costs a correction, never a typed value. Import-free: npm run check:logic runs it.
 *
 * - Price: the first amount marked ₱, PHP or P ("₱ 185.00", "PHP185", "P 1,250").
 * - Brand: an existing Brand named on the label as a whole word, the longest name first. Never a new one.
 * - Name: the tallest line left — a pack prints its product's name largest. A line that is only the brand
 *   is left out: the brand is often printed larger still.
 * - Description: up to four of the rest, in reading order.
 * A line of digits and separators alone (the numbers under a barcode, a batch code, a date or a time stamped
 * on the pack — or by a camera) is none of them.
 */
type Line = { text: string; height: number };

const PRICE = /(?:₱|\bPHP|\bP)\s?\.?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(?![\d,])/i;
const DIGITS = /^[\d\s.:/-]+$/;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = (all: string, name: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(name)}($|[^\\p{L}\\p{N}])`, 'iu').test(all);

export function readLabel(lines: Line[], brands: { id: string; brand: string }[]) {
  const read = lines.map((line) => ({ text: line.text.trim(), height: line.height })).filter((line) => line.text !== '' && !DIGITS.test(line.text));
  const priced = read.map((line) => PRICE.exec(line.text)).find((match) => match !== null);
  const brand = [...brands].sort((a, b) => b.brand.length - a.brand.length).find((candidate) => names(read.map((line) => line.text).join('\n'), candidate.brand));
  const rest = read.filter((line) => !PRICE.test(line.text) && line.text.toLowerCase() !== brand?.brand.toLowerCase());
  const name = rest.reduce<Line | undefined>((tallest, line) => (!tallest || line.height > tallest.height ? line : tallest), undefined);

  return {
    item_name: name?.text.slice(0, 140) ?? '',
    description: rest
      .filter((line) => line !== name)
      .slice(0, 4)
      .map((line) => line.text)
      .join('\n')
      .slice(0, 1000),
    brand_id: brand?.id ?? '',
    standard_rate: priced ? priced[1].replace(/,/g, '') + (priced[2] ?? '') : '',
  };
}
