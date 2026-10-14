import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3); the same object is save_member's payload.
// ERPNext: a role profile, when chosen, decides the roles in place of the list — so the list is sent only
// without one.
export const memberSchema = z
  .object({
    // Not edited: the copy taken from their account when they joined, sent back as it is — save_member writes
    // every field it is given.
    email: z.string().nullable(),
    full_name: z.string().trim().max(120, 'Use 120 characters or fewer.'),
    enabled: z.boolean(),
    // '' for none: a SearchSelect holds a string.
    role_profile_id: z.string(),
    role_ids: z.array(z.string()),
  })
  .superRefine((values, ctx) => {
    if (values.role_profile_id === '' && values.role_ids.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['role_ids'], message: 'Choose a role profile or at least one role.' });
    }
  });

export type MemberValues = z.infer<typeof memberSchema>;
