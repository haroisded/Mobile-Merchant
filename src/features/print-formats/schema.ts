import * as z from 'zod';

// What a receipt is printed on (print_formats_paper): the two rolls a receipt printer takes, or a page.
export const PAPERS = ['58mm', '80mm', 'A4'] as const;

export type Paper = (typeof PAPERS)[number];

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). The lengths are the table's checks.
export const printFormatSchema = z
  .object({
    print_format_name: z.string().trim().min(1, 'Enter a name.').max(140, 'Use 140 characters or fewer.'),
    paper: z.enum(PAPERS),
    print_heading: z.string().trim().max(140, 'Use 140 characters or fewer.'),
    show_item_code: z.boolean(),
    footer_note: z.string().max(500, 'Use 500 characters or fewer.'),
    is_default: z.boolean(),
    disabled: z.boolean(),
  })
  // print_formats_default_enabled.
  .refine((format) => !(format.is_default && format.disabled), { path: ['is_default'], message: 'A disabled print format cannot be the default.' });

export type PrintFormatValues = z.infer<typeof printFormatSchema>;
