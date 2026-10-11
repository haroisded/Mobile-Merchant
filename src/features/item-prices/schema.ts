import * as z from 'zod';

import { numberText } from '../item-tax-templates/schema';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). Which price list and unit a price may name is
// the database's rule (private.validate_item_price); dates are "YYYY-MM-DD", or '' for no start or no end.
export const itemPriceSchema = z
  .object({
    item_id: z.string().min(1, 'Pick an item.'),
    price_list_id: z.string().min(1, 'Pick a price list.'),
    uom_id: z.string().min(1, 'Pick a unit.'),
    price_list_rate: numberText.refine((value) => value !== '' && Number(value) >= 0, 'Enter a rate of 0 or more.'),
    valid_from: z.string(),
    valid_upto: z.string(),
  })
  // item_prices_dates.
  .refine((price) => !price.valid_from || !price.valid_upto || price.valid_from <= price.valid_upto, {
    path: ['valid_upto'],
    message: 'Enter a date on or after Valid From.',
  });

export type ItemPriceValues = z.infer<typeof itemPriceSchema>;
