import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3); the same object is save_role_profile's
// payload. role_profiles_name_length bounds the trimmed name at 1..60.
export const roleProfileSchema = z.object({
  role_profile_name: z.string().trim().min(1, 'Enter a name.').max(60, 'Use 60 characters or fewer.'),
  role_ids: z.array(z.string()).min(1, 'Choose at least one role.'),
});

export type RoleProfileValues = z.infer<typeof roleProfileSchema>;
