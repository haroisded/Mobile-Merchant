import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). Each default is an id or '' — the mutation
// sends null for blank. Which warehouse and unit they may name is the database's rule
// (private.validate_defaults); the two choices are its check constraints.
export const stockSettingsSchema = z.object({
  item_naming_by: z.enum(['Item Code', 'Naming Series']),
  item_group: z.string(),
  stock_uom: z.string(),
  default_warehouse: z.string(),
  valuation_method: z.enum(['FIFO', 'Moving Average']),
  allow_negative_stock: z.boolean(),
  auto_insert_price_list_rate_if_missing: z.boolean(),
});

export type StockSettingsValues = z.infer<typeof stockSettingsSchema>;
