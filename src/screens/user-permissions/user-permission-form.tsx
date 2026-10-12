import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';

import { AdaptiveDialog, FormActions, saveOnce } from '../../components/adaptive-dialog';
import { closesForm, useConfirm } from '../../components/confirm-dialog';
import { ControlledSwitch, FieldGrid } from '../../components/form-fields';
import { ControlledSelect } from '../../components/search-select';
import { useDoctypeLinksQuery, useDoctypesQuery } from '../../features/doctypes/queries';
import type { Doctype, DoctypeLink } from '../../features/doctypes/queries';
import { useMembersQuery } from '../../features/members/queries';
import type { Member } from '../../features/members/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useDeleteUserPermissionMutation, useSaveUserPermissionMutation, useUserPermissionsQuery } from '../../features/user-permissions/queries';
import type { UserPermission } from '../../features/user-permissions/queries';
import { userPermissionSchema } from '../../features/user-permissions/schema';
import type { UserPermissionValues } from '../../features/user-permissions/schema';
import { useShellWide } from '../../lib/columns';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';
import { useRestrictableRecords } from './records';

type Props = { merchantId: string; userPermissionId?: string; memberId?: string; onDismiss: () => void };

/** Create or edit a User Permission — the body of src/app/(app)/forms/user-permission.tsx. */
export function UserPermissionForm({ merchantId, userPermissionId, memberId, onDismiss }: Props) {
  const list = useUserPermissionsQuery({ merchantId });
  const members = useMembersQuery({ merchantId });
  const doctypes = useDoctypesQuery();
  const links = useDoctypeLinksQuery();
  if (!list.data || !members.data || !doctypes.data || !links.data) return null;
  const existing = userPermissionId ? list.data.find((permission) => permission.id === userPermissionId) : undefined;

  return (
    <Form
      merchantId={merchantId}
      existing={existing}
      memberId={memberId}
      members={members.data}
      doctypes={doctypes.data}
      links={links.data}
      onDismiss={onDismiss}
    />
  );
}

type FormProps = {
  merchantId: string;
  existing: UserPermission | undefined;
  memberId: string | undefined;
  members: Member[];
  doctypes: Doctype[];
  links: DoctypeLink[];
  onDismiss: () => void;
};

const saveFailure = (error: Error | null) =>
  postgrestError(error)?.code === '23505'
    ? 'This user already has this permission, or another default for this document type.'
    : failureMessage("Couldn't save this user permission. Try again.");

function defaults(existing: UserPermission | undefined, memberId: string | undefined, allow: string): UserPermissionValues {
  if (existing) {
    return {
      member_id: existing.member_id,
      allow: existing.allow,
      for_value: existing.for_value,
      is_default: existing.is_default,
      apply_to_all_doctypes: existing.apply_to_all_doctypes,
      applicable_for: existing.applicable_for ?? '',
      hide_descendants: existing.hide_descendants,
    };
  }
  return {
    member_id: memberId ?? '',
    allow,
    for_value: '',
    is_default: false,
    apply_to_all_doctypes: true,
    applicable_for: '',
    hide_descendants: false,
  };
}

function Form({ merchantId, existing, memberId, members, doctypes, links, onDismiss }: FormProps) {
  const wide = useShellWide();
  const save = useSaveUserPermissionMutation({ merchantId, userPermissionId: existing?.id });
  const remove = useDeleteUserPermissionMutation();
  const confirm = useConfirm();
  const deletable = can(usePermissions({ merchantId }).data, 'User Permission', 'delete');
  const restrictable = doctypes.filter((doctype) => doctype.restrictable);
  const notice = mutationNotice(save, saveFailure(save.error));

  const { control, handleSubmit, setValue } = useForm<UserPermissionValues>({
    resolver: zodResolver(userPermissionSchema),
    defaultValues: defaults(existing, memberId, restrictable[0]?.name ?? ''),
    mode: 'onTouched',
  });

  const submit = handleSubmit(saveOnce(save, onDismiss));

  const askDelete = (permission: UserPermission) =>
    confirm.ask({
      title: 'Delete this user permission?',
      body: `The user is no longer restricted to this ${permission.allow}. Their roles still decide what they may do.`,
      confirmLabel: 'Delete',
      run: () => remove.mutateAsync(permission.id),
      failure: () => failureMessage("Couldn't delete this user permission. Try again."),
      onDone: closesForm(wide, onDismiss),
    });

  return (
    <>
      <AdaptiveDialog
        asPage
        onDismiss={onDismiss}
        dismissable={!(save.isPending && !save.isPaused)}
        kicker="User permission"
        title={existing ? existing.allow : 'New user permission'}
        notice={notice}
        actions={
          <FormActions mutation={save} onCancel={onDismiss} onSave={submit} onDelete={existing && deletable ? () => askDelete(existing) : undefined} />
        }
      >
        <FieldGrid>
          <ControlledSelect
            control={control}
            name="member_id"
            label="User"
            required
            title="User"
            span="full"
            options={members.map((member) => ({ value: member.id, label: member.email, hint: member.full_name ?? undefined }))}
          />
          <ControlledSelect
            control={control}
            name="allow"
            label="Allow"
            hint="The document type to restrict"
            required
            title="Allow"
            options={restrictable.map((doctype) => ({ value: doctype.name, label: doctype.name }))}
            // A value of the old type means nothing under the new one, and neither does where it applied.
            onPicked={() => {
              setValue('for_value', '');
              setValue('applicable_for', '');
            }}
          />
          <Scope merchantId={merchantId} control={control} doctypes={doctypes} links={links} />
        </FieldGrid>
      </AdaptiveDialog>
      {confirm.dialog}
    </>
  );
}

type ScopeProps = { merchantId: string; control: Control<UserPermissionValues>; doctypes: Doctype[]; links: DoctypeLink[] };

/** For Value and the switches that decide where the restriction holds. */
function Scope({ merchantId, control, doctypes, links }: ScopeProps) {
  const records = useRestrictableRecords({ merchantId });
  const allow = useWatch({ control, name: 'allow' });
  const applyToAll = useWatch({ control, name: 'apply_to_all_doctypes' });
  const tree = doctypes.find((doctype) => doctype.name === allow)?.kind === 'tree';
  // Where a restriction on `allow` can hold: its own records, and the document types that link to it. A
  // document type with two such columns (a Stock Entry's two warehouses) is listed once.
  const applicable = [...new Set([allow, ...links.filter((link) => link.link_doctype === allow).map((link) => link.doctype)])];

  return (
    <>
      <ControlledSelect control={control} name="for_value" label="For Value" required title={allow} options={records.options.get(allow) ?? []} />
      <ControlledSwitch control={control} name="is_default" label="Is Default" span="full" on="New records of this user start with this value" off="Not the default" />
      <ControlledSwitch
        control={control}
        name="apply_to_all_doctypes"
        label="Apply To All Document Types"
        span="full"
        on="The restriction holds wherever this value is used"
        off="Only under the document type below"
      />
      {applyToAll ? null : (
        <ControlledSelect
          control={control}
          name="applicable_for"
          label="Applicable For"
          required
          title="Applicable For"
          span="full"
          options={applicable.map((name) => ({ value: name, label: name }))}
        />
      )}
      {tree ? (
        <ControlledSwitch
          control={control}
          name="hide_descendants"
          label="Hide Descendants"
          span="full"
          on="Only this record, not the ones under it"
          off="This record and everything under it"
        />
      ) : null}
    </>
  );
}
