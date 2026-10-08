import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). TextInput returns strings, so the numbers
// are checked as text here and parsed by the mutation; the table's checks bound the same values.
export const currencySchema = z.object({
  symbol: z.string().trim().max(10, 'Use 10 characters or fewer.'),
  symbol_on_right: z.boolean(),
  fraction: z.string().trim().max(40, 'Use 40 characters or fewer.'),
  fraction_units: z.string().trim().regex(/^\d{0,6}$/, 'Enter a whole number, or leave it empty.'),
  // The smallest coin, as a decimal (0.05). Empty: Rounded Total rounds to a whole unit.
  smallest_currency_fraction_value: z
    .string()
    .trim()
    .regex(/^(\d+(\.\d+)?)?$/, 'Enter an amount such as 0.05, or leave it empty.')
    .refine((value) => value === '' || Number(value) > 0, 'Enter an amount above zero, or leave it empty.'),
  number_format: z.string().min(1, 'Select a number format.'),
});

export type CurrencyValues = z.infer<typeof currencySchema>;
