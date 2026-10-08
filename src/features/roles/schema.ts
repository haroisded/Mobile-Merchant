import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). roles_name_length bounds the trimmed name
// at 1..60.
export const roleSchema = z.object({
  role_name: z.string().trim().min(1, 'Enter a name.').max(60, 'Use 60 characters or fewer.'),
  disabled: z.boolean(),
});

export type RoleValues = z.infer<typeof roleSchema>;
