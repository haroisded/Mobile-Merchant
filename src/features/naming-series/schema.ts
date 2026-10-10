import * as z from 'zod';

// private.is_naming_series: letters, digits, - / _ and the dots between parts, at least one of them a
// character that prints, then at most ten # — the counter, always last.
const SERIES = /^[A-Za-z0-9_/.-]*[A-Za-z0-9_/-][A-Za-z0-9_/.-]*#{0,10}$/;

/** The series typed one per line, in order, blank lines dropped. The first is the default. */
export const seriesLines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

/** What is wrong with the box, by the line the person sees — naming_series_options' rules, in words. */
function seriesProblem(text: string) {
  const lines = text.split('\n').map((line) => line.trim());
  const count = lines.filter((line) => line !== '').length;
  if (count === 0) return 'Enter at least one series.';
  if (count > 20) return 'Use 20 series or fewer.';
  const bad = lines.findIndex((line) => line !== '' && (line.length > 140 || !SERIES.test(line)));
  if (bad >= 0) return `Line ${bad + 1}: use letters, digits, - / _ and dots, with any # at the end.`;
  const repeat = lines.findIndex((line, index) => line !== '' && lines.indexOf(line) !== index);
  return repeat >= 0 ? `Line ${repeat + 1} repeats a series above it.` : null;
}

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). One box, a series per line, as ERPNext's
// own "Series List for this Transaction"; the mutation sends the lines.
export const namingSeriesSchema = z.object({
  series: z.string().superRefine((text, ctx) => {
    const problem = seriesProblem(text);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  }),
  user_must_select: z.boolean(),
});

export type NamingSeriesValues = z.infer<typeof namingSeriesSchema>;

// Update Series. The current value is the TextInput's string; the mutation sends Number().
// naming_series_counters_current_value: zero or more.
export const seriesCounterSchema = z.object({
  series: z.string().min(1, 'Pick a series.'),
  current_value: z.string().trim().regex(/^\d{1,12}$/, 'Enter a whole number, 0 or more.'),
});

export type SeriesCounterValues = z.infer<typeof seriesCounterSchema>;
