import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { ControlledDate, ControlledSwitch, FieldGrid } from '../../components/form-fields';
import { saveOnce } from '../../components/adaptive-dialog';
import { PageForm } from '../../components/form-footer';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { ControlledSelect } from '../../components/search-select';
import { useAccountsSettingsQuery, useUpdateAccountsSettingsMutation } from '../../features/accounts-settings/queries';
import type { AccountsSettings } from '../../features/accounts-settings/queries';
import { accountsSettingsSchema } from '../../features/accounts-settings/schema';
import type { AccountsSettingsValues } from '../../features/accounts-settings/schema';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { ALL_ROLE, useRolesQuery } from '../../features/roles/queries';
import type { Role } from '../../features/roles/queries';
import { failureMessage, mutationNotice } from '../../lib/errors';
import { spacing } from '../../themes';

/**
 * Accounts Settings (docs.frappe.io/erpnext/accounts-settings, /immutable-ledger-in-erpnext,
 * /discount_accounting, /freeze-accounting-entries): how cancellation, discounts and item taxes are
 * accounted, and the date before which the books are closed.
 */
export function AccountsSettingsScreen({ merchantId }: { merchantId: string }) {
  const settings = useAccountsSettingsQuery({ merchantId });
  // Read through the All role's Select on Role — a link field, not the Roles page.
  const roles = useRolesQuery({ merchantId });

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Setup" title="Accounts Settings" meta="Cancellation, discounts and frozen dates" onBack={() => router.back()} />
      {settings.data && roles.data ? (
        <SettingsForm merchantId={merchantId} saved={settings.data} roles={roles.data} />
      ) : (
        <View style={styles.state}>
          <QueryState
            query={settings.data ? roles : settings}
            offline="You're offline. Accounts Settings will load when you reconnect."
            failure="Couldn't load Accounts Settings. Try again."
          />
        </View>
      )}
    </View>
  );
}

const defaults = (saved: AccountsSettings): AccountsSettingsValues => ({
  unlink_payment_on_cancellation: saved.unlink_payment_on_cancellation,
  delete_linked_ledger_entries: saved.delete_linked_ledger_entries,
  enable_immutable_ledger: saved.enable_immutable_ledger,
  enable_discount_accounting: saved.enable_discount_accounting,
  add_taxes_from_item_tax_template: saved.add_taxes_from_item_tax_template,
  accounts_frozen_till_date: saved.accounts_frozen_till_date ?? '',
  frozen_accounts_modifier: saved.frozen_accounts_modifier ?? '',
});

/** Roles that can hold an exception: every role but All, which every member holds. The saved one stays listed. */
const roleOptions = (roles: Role[], keep: string | null) => [
  { value: '', label: 'None' },
  ...roles
    .filter((role) => role.id === keep || (role.role_name !== ALL_ROLE && !role.disabled))
    .map((role) => ({ value: role.id, label: role.role_name, hint: role.is_standard ? 'Standard' : 'Custom' })),
];

function SettingsForm({ merchantId, saved, roles }: { merchantId: string; saved: AccountsSettings; roles: Role[] }) {
  const update = useUpdateAccountsSettingsMutation({ merchantId });
  const editable = can(usePermissions({ merchantId }).data, 'Accounts Settings', 'write');
  const notice = mutationNotice(update, failureMessage("Couldn't save Accounts Settings. Try again."));

  const { control, handleSubmit, reset, formState } = useForm<AccountsSettingsValues>({
    resolver: zodResolver(accountsSettingsSchema),
    defaultValues: defaults(saved),
    mode: 'onTouched',
  });
  const save = handleSubmit(saveOnce(update, reset));

  return (
    <PageForm editable={editable} readOnly="Changing it needs Accounts Settings write." notice={notice} mutation={update} dirty={formState.isDirty} onSave={save}>
      <FieldGrid>
        <ControlledSwitch
          control={control}
          name="enable_immutable_ledger"
          label="Immutable Ledger"
          span="full"
          on="A cancelled sale keeps its entries and gains reversing ones"
          off="A cancelled sale's entries are rewritten"
          disabled={!editable}
        />
        <ControlledSwitch
          control={control}
          name="unlink_payment_on_cancellation"
          label="Unlink Payment on Cancellation"
          span="full"
          on="Cancelling an invoice frees the payments made against it"
          off="Payments stay matched to a cancelled invoice"
          disabled={!editable}
        />
        <ControlledSwitch
          control={control}
          name="delete_linked_ledger_entries"
          label="Delete Ledger Entries with the Document"
          span="full"
          on="Deleting a cancelled document removes its entries too"
          off="A cancelled document's entries stay in the books"
          disabled={!editable}
        />
        <ControlledSwitch
          control={control}
          name="enable_discount_accounting"
          label="Discount Accounting"
          span="full"
          on="Discounts post to their own account; sales show the full price"
          off="Discounts reduce the sale"
          disabled={!editable}
        />
        <ControlledSwitch
          control={control}
          name="add_taxes_from_item_tax_template"
          label="Taxes from Item Tax Templates"
          span="full"
          on="A tax an item's template names is added when the sale lacks it"
          off="Only the sale's own taxes apply"
          disabled={!editable}
        />
        <ControlledDate
          control={control}
          name="accounts_frozen_till_date"
          label="Accounts Frozen Till"
          hint="No entries on or before it"
          clearable
          disabled={!editable}
        />
        <ControlledSelect
          control={control}
          name="frozen_accounts_modifier"
          label="Role Allowed Past the Frozen Date"
          title="Role"
          options={roleOptions(roles, saved.frozen_accounts_modifier)}
          disabled={!editable}
        />
      </FieldGrid>
    </PageForm>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  state: { gap: spacing.ms, alignItems: 'flex-start', padding: spacing.md },
});
