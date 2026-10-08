import * as z from 'zod';

// Form input, so Zod (.claude/instruction_mds/data-layer.md §3). The database checks the rest: that Allow is
// restrictable and For Value is one of its records in this system (private.validate_user_permission).
export const userPermissionSchema = z
  .object({
    member_id: z.string().min(1, 'Select a user.'),
    allow: z.string().min(1, 'Select a document type.'),
    for_value: z.string().min(1, 'Select a value.'),
    is_default: z.boolean(),
    apply_to_all_doctypes: z.boolean(),
    applicable_for: z.string(),
    hide_descendants: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (!values.apply_to_all_doctypes && values.applicable_for === '') {
      ctx.addIssue({ code: 'custom', path: ['applicable_for'], message: 'Select the document type this applies to.' });
    }
  });

export type UserPermissionValues = z.infer<typeof userPermissionSchema>;
