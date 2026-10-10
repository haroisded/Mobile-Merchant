import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). The value is held as the TextInput's text and
// sent as Number(); the database checks the same two rules (uom_conversion_factors_value, _two_units).
export const uomConversionFactorSchema = z
  .object({
    from_uom: z.string().min(1, 'Pick a unit.'),
    to_uom: z.string().min(1, 'Pick a unit.'),
    value: z
      .string()
      .trim()
      .regex(/^\d+(\.\d+)?$/, 'Enter a number.')
      .refine((value) => Number(value) > 0, 'Enter a number above 0.'),
  })
  .refine((values) => values.from_uom !== values.to_uom, { path: ['to_uom'], message: 'Pick a different unit from the first.' });

export type UomConversionFactorValues = z.infer<typeof uomConversionFactorSchema>;
