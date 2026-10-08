import * as z from 'zod';

import { displayDate, fullYearEnd } from '../../lib/dates';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). The date rules mirror the table's own
// constraints, so a wrong year is explained on the field before a round trip; the database still
// enforces them, and alone decides overlaps with the other years.
export const fiscalYearSchema = z
  .object({
    year: z.string().trim().min(1, 'Enter a name.').max(20, 'Use 20 characters or fewer.'),
    year_start_date: z.string().min(1, 'Select the first day.'),
    year_end_date: z.string().min(1, 'Select the last day.'),
    is_short_year: z.boolean(),
    is_default: z.boolean(),
    disabled: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.year_start_date === '' || values.year_end_date === '') return;
    if (values.year_end_date <= values.year_start_date) {
      ctx.addIssue({ code: 'custom', path: ['year_end_date'], message: 'The last day must come after the first.' });
      return;
    }
    const full = fullYearEnd(values.year_start_date);
    if (!values.is_short_year && values.year_end_date !== full) {
      ctx.addIssue({
        code: 'custom',
        path: ['year_end_date'],
        message: `A full year ends on ${displayDate(full)}. Turn on Short year for a shorter one.`,
      });
    }
    if (values.is_short_year && values.year_end_date >= full) {
      ctx.addIssue({
        code: 'custom',
        path: ['year_end_date'],
        message: `A short year ends before ${displayDate(full)}. Turn off Short year for a full one.`,
      });
    }
  });

export type FiscalYearValues = z.infer<typeof fiscalYearSchema>;
