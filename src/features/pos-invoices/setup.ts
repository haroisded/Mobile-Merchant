import { todayIn } from '../../lib/dates';
import { asRoundingMethod, cashRound, roundTo } from '../../lib/money';
import { pathTo } from '../../lib/tree';
import { accountLabel, useAccountsQuery } from '../accounts/queries';
import { useAccountsSettingsQuery } from '../accounts-settings/queries';
import { useTotalsSettings } from '../currencies/queries';
import { useItemGroupsQuery } from '../item-groups/queries';
import { useItemPricesQuery } from '../item-prices/queries';
import { resolvePrice } from '../item-prices/resolve';
import { itemTaxRates, useItemTaxTemplatesQuery } from '../item-tax-templates/queries';
import { useItemsQuery } from '../items/queries';
import type { Merchant } from '../merchants/queries';
import type { PosProfile } from '../pos-profiles/queries';
import { usePriceListsQuery } from '../price-lists/queries';
import { calculateTaxes } from '../sales-tax-templates/calculate';
import { useSalesTaxTemplatesQuery } from '../sales-tax-templates/queries';
import { useSellingSettingsQuery } from '../selling-settings/queries';
import { useTaxRulesQuery } from '../tax-rules/queries';
import { resolveTaxRule } from '../tax-rules/resolve';
import type { Engines, SaleSetup } from './cart';

/** What is sold and for how much: the items, their groups, the prices and the price lists. Undefined until all have loaded. */
function useCatalog(merchantId: string) {
  const args = { merchantId };
  const items = useItemsQuery(args).data;
  const groups = useItemGroupsQuery(args).data;
  const prices = useItemPricesQuery(args).data;
  const priceLists = usePriceListsQuery(args).data;
  const selling = useSellingSettingsQuery(args).data;

  return items && groups && prices && priceLists && selling ? { items, groups, prices, priceLists, selling } : undefined;
}

/** How a sale is taxed: the templates, the rules, and the switch that adds an item's own taxes. Undefined until all have loaded. */
function useTaxRecords(merchantId: string) {
  const args = { merchantId };
  const templates = useSalesTaxTemplatesQuery(args).data;
  const itemTaxTemplates = useItemTaxTemplatesQuery(args).data;
  const rules = useTaxRulesQuery(args).data;
  const accountsSettings = useAccountsSettingsQuery(args).data;
  // The name a tax added from an Item Tax Template prints under; a cashier who cannot read accounts gets "Tax".
  const accounts = useAccountsQuery(args).data;

  return templates && itemTaxTemplates && rules && accountsSettings && accounts ? { templates, itemTaxTemplates, rules, accountsSettings, accounts } : undefined;
}

/** Every record a sale reads besides the POS Profile; undefined until all of them have loaded. */
function useSaleRecords(merchant: Merchant) {
  const catalog = useCatalog(merchant.id);
  const taxes = useTaxRecords(merchant.id);
  const rounding = useTotalsSettings(merchant);

  return catalog && taxes && rounding ? { ...catalog, ...taxes, ...rounding } : undefined;
}

/**
 * What src/features/pos-invoices/cart.ts needs to turn a cart into a sale on one POS Profile: the masters and
 * settings as `setup`, and the app's price, tax-rule, tax and rounding engines. Undefined while loading.
 *
 * ponytail: every item, price and group of the system is in memory (each query's 1,000-row cap is the
 * ceiling). Past it the Register needs a search the server answers and a price looked up per line.
 */
export function useSaleSetup(merchant: Merchant, profile: PosProfile) {
  const records = useSaleRecords(merchant);
  if (!records) return undefined;

  const { system, currency, selling } = records;
  const method = asRoundingMethod(system.rounding_method);
  const precision = system.currency_precision;
  const listOf = (id: string | null) => records.priceLists.find((list) => list.id === id && list.enabled) ?? null;
  const defaultList = listOf(selling.default_price_list);
  const templates = records.templates.filter((template) => !template.disabled);
  const accountNames = new Map(records.accounts.map((account) => [account.id, accountLabel(account, merchant.abbr)]));

  const setup: SaleSetup = {
    date: todayIn(system.time_zone),
    items: new Map(records.items.map((item) => [item.id, item])),
    prices: records.prices,
    priceList: listOf(profile.selling_price_list) ?? defaultList,
    fallback: selling.fallback_to_default_price_list ? defaultList : null,
    groupPath: (groupId) =>
      pathTo(records.groups, groupId)
        .map((group) => group.id)
        .reverse(),
    groupTaxes: new Map(records.groups.map((group) => [group.id, group.item_group_taxes])),
    itemTaxRates: new Map(records.itemTaxTemplates.map((template) => [template.id, itemTaxRates(template)])),
    templates: templates.map((template) => ({ id: template.id, rows: template.sales_tax_template_rows })),
    profileTemplateId: profile.taxes_and_charges,
    defaultTemplateId: templates.find((template) => template.is_default)?.id ?? null,
    taxCategoryId: profile.tax_category,
    rules: records.rules,
    addTaxesFromItemTemplates: records.accountsSettings.add_taxes_from_item_tax_template,
    accountName: (accountId) => accountNames.get(accountId) ?? 'Tax',
    precision,
    roundedTotalDisabled: records.globals.disable_rounded_total,
  };
  const engines: Engines = {
    resolvePrice,
    resolveTaxRule,
    calculateTaxes,
    round: (value, places) => roundTo(value, places, method),
    cashRound: (value) => cashRound(value, currency.smallest_currency_fraction_value, precision, method),
  };

  return { setup, engines, items: records.items, groups: records.groups };
}
