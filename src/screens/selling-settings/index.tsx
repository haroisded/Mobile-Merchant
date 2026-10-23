import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { saveOnce } from '../../components/adaptive-dialog';
import { ControlledSwitch, FieldGrid } from '../../components/form-fields';
import { PageForm } from '../../components/form-footer';
import { NoteCallout } from '../../components/note-callout';
import { PageHeader } from '../../components/page-header';
import { QueryState } from '../../components/query-state';
import { ControlledSelect } from '../../components/search-select';
import { priceListOptions, usePriceListsQuery } from '../../features/price-lists/queries';
import type { PriceList } from '../../features/price-lists/queries';
import { can, usePermissions } from '../../features/role-permissions/queries';
import { useSellingSettingsQuery, useUpdateSellingSettingsMutation } from '../../features/selling-settings/queries';
import type { SellingSettings } from '../../features/selling-settings/queries';
import { FALLBACK_WITH_AUTO_INSERT, sellingSettingsSchema } from '../../features/selling-settings/schema';
import type { SellingSettingsValues } from '../../features/selling-settings/schema';
import { useStockSettingsQuery } from '../../features/stock-settings/queries';
import { failureMessage, mutationNotice, postgrestError } from '../../lib/errors';
import { spacing } from '../../themes';

/**
 * Selling Settings, the Pricing tab (docs.frappe.io/erpnext/selling-settings): the price list a sale starts
 * on, falling back to it, editing a line's Price List Rate, and refusing a sale below the item's cost.
 */
export function SellingSettingsScreen({ merchantId }: { merchantId: string }) {
  const settings = useSellingSettingsQuery({ merchantId });
  // Every member may select price lists (All's Select on Price List).
  const priceLists = usePriceListsQuery({ merchantId });

  return (
    <View style={styles.fill}>
      <PageHeader kicker="Setup" title="Selling Settings" meta="The price list a sale starts on, and how prices may change" onBack={() => router.back()} form />
      {settings.data && priceLists.data ? (
        <SettingsForm merchantId={merchantId} saved={settings.data} priceLists={priceLists.data} />
      ) : (
        <View style={styles.state}>
          <QueryState
            query={settings.data ? priceLists : settings}
            offline="You're offline. Selling Settings will load when you reconnect."
            failure="Couldn't load Selling Settings. Try again."
          />
        </View>
      )}
    </View>
  );
}

const defaults = (saved: SellingSettings): SellingSettingsValues => ({
  default_price_list: saved.default_price_list ?? '',
  fallback_to_default_price_list: saved.fallback_to_default_price_list,
  editable_price_list_rate: saved.editable_price_list_rate,
  validate_selling_price: saved.validate_selling_price,
});

const saveFailure = (error: Error | null) =>
  postgrestError(error)?.message === 'default_invalid'
    ? "That price list can't be used any more — pick another."
    : failureMessage("Couldn't save Selling Settings. Try again.");

function SettingsForm({ merchantId, saved, priceLists }: { merchantId: string; saved: SellingSettings; priceLists: PriceList[] }) {
  const update = useUpdateSellingSettingsMutation({ merchantId });
  const editable = can(usePermissions({ merchantId }).data, 'Selling Settings', 'write');
  // Every member may read Stock Settings (All's Read); without it, there is simply no warning.
  const autoInsert = useStockSettingsQuery({ merchantId }).data?.auto_insert_price_list_rate_if_missing;
  const notice = mutationNotice(update, saveFailure(update.error));

  const { control, handleSubmit, reset, formState } = useForm<SellingSettingsValues>({
    resolver: zodResolver(sellingSettingsSchema),
    defaultValues: defaults(saved),
    mode: 'onTouched',
  });
  const fallback = useWatch({ control, name: 'fallback_to_default_price_list' });
  const save = handleSubmit(saveOnce(update, reset));

  return (
    <PageForm editable={editable} readOnly="Changing it needs Selling Settings write." notice={notice} mutation={update} dirty={formState.isDirty} onSave={save}>
      {fallback && autoInsert ? <NoteCallout tone="error">{FALLBACK_WITH_AUTO_INSERT}</NoteCallout> : null}
      <FieldGrid>
        <ControlledSelect
          control={control}
          name="default_price_list"
          label="Default Price List"
          hint="Where a sale's prices come from"
          title="Default Price List"
          options={priceListOptions(priceLists, saved.default_price_list)}
          disabled={!editable}
        />
        <ControlledSwitch
          control={control}
          name="fallback_to_default_price_list"
          label="Use Prices from the Default Price List as Fallback"
          span="full"
          on="An item with no price in the sale's price list takes the default list's"
          off="An item with no price in the sale's price list has none"
          disabled={!editable}
        />
        <ControlledSwitch
          control={control}
          name="editable_price_list_rate"
          label="Allow Editing the Price List Rate"
          span="full"
          on="A cashier can change a line's Price List Rate"
          off="A line's Price List Rate always comes from the price list"
          disabled={!editable}
        />
        <ControlledSwitch
          control={control}
          name="validate_selling_price"
          label="Validate Selling Price"
          span="full"
          on="A sale below the item's purchase or valuation rate is refused"
          off="An item may be sold below what it cost"
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
