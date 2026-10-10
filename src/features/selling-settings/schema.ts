import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). The price list is an id or '' — the mutation
// sends null for blank. Which price list it may name is the database's rule (private.validate_defaults).
export const sellingSettingsSchema = z.object({
  default_price_list: z.string(),
  fallback_to_default_price_list: z.boolean(),
  editable_price_list_rate: z.boolean(),
  validate_selling_price: z.boolean(),
});

export type SellingSettingsValues = z.infer<typeof sellingSettingsSchema>;

// The Selling Settings docs: do not combine the fallback with Stock Settings' automatic insertion of missing
// Item Prices, "because a fallback rate could be written into another Price List". Shown on both screens.
export const FALLBACK_WITH_AUTO_INSERT =
  "Selling Settings' fallback to the default price list and Stock Settings' auto insert are both on: a fallback price could be written into another price list as the item's own. Turn one of them off.";
