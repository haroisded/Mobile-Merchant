import * as z from 'zod';

/** The role palette: each key a `role…` colour in both themes (src/themes.js) and in roles_color. */
export const ROLE_COLORS = ['grey', 'slate', 'red', 'maroon', 'orange', 'amber', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink'] as const;

export type RoleColor = (typeof ROLE_COLORS)[number];

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3); the same object is save_role's payload.
// roles_name_length bounds the trimmed name at 1..60, roles_description_length the description at 200.
export const roleSchema = z.object({
  role_name: z.string().trim().min(1, 'Enter a name.').max(60, 'Use 60 characters or fewer.'),
  description: z.string().trim().max(200, 'Use 200 characters or fewer.'),
  color: z.enum(ROLE_COLORS),
  // Turned on with what they require (src/features/permissions/access.ts, toggle), as save_role insists.
  permissions: z.array(z.string()),
  // The Members tab: who holds this role. Moving someone here takes them off their old one.
  member_ids: z.array(z.string()),
});

export type RoleValues = z.infer<typeof roleSchema>;
