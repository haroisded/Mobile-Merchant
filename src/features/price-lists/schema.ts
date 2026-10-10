import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). Selling only; the currency is one of the
// system's own (price_lists_currency_fk).
export const priceListSchema = z.object({
  price_list_name: z.string().trim().min(1, 'Enter a name.').max(140, 'Use 140 characters or fewer.'),
  currency: z.string().min(1, 'Pick a currency.'),
  enabled: z.boolean(),
  price_not_uom_dependent: z.boolean(),
});

export type PriceListValues = z.infer<typeof priceListSchema>;
