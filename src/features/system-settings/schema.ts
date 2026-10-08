import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). The precisions are held as strings — a
// select holds a string — and the mutation sends numbers. The database checks the same bounds and the time
// zone (private.validate_time_zone).
export const ROUNDING_METHODS = ["Banker's Rounding", 'Commercial Rounding'] as const;

export const systemSettingsSchema = z.object({
  time_zone: z.string().min(1, 'Select a time zone.'),
  number_format: z.string().min(1, 'Select a number format.'),
  float_precision: z.string().regex(/^[0-9]$/, 'Select 0 to 9.'),
  currency_precision: z.string().regex(/^[0-9]$/, 'Select 0 to 9.'),
  rounding_method: z.enum(ROUNDING_METHODS),
});

export type SystemSettingsValues = z.infer<typeof systemSettingsSchema>;
