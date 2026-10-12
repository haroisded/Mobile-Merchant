// npm run check:logic — the runnable check for the app's pure calculation modules. Each section imports
// one import-free module from src/ (Node 24 strips its types) and asserts the cases that would break if
// its logic did. No test runner: this repo proves device behaviour with acceptance tests
// (.claude/instruction_mds/testing-workflow.md), and this file covers only what arithmetic can settle.
import assert from 'node:assert/strict';

import { resolvePrice } from '../src/features/item-prices/resolve.ts';
import { additionalDiscount, buildReturn, buildSale, checkoutPayload, offeredItems, returnableLines, returnPayload, settle, tenderedAmounts } from '../src/features/pos-invoices/cart.ts';
import { pickPricingRule, ruleRate } from '../src/features/pricing-rules/apply.ts';
import { itemColumns, printedTaxes } from '../src/features/print-formats/receipt.ts';
import { calculateTaxes } from '../src/features/sales-tax-templates/calculate.ts';
import { resolveTaxRule } from '../src/features/tax-rules/resolve.ts';
import { fullYearEnd, todayIn, yearName } from '../src/lib/dates.ts';
import { cashRound, formatMoney, formatNumber, inWords, moneyInWords, roundTo } from '../src/lib/money.ts';
import { childrenOf, pathTo, subtree } from '../src/lib/tree.ts';

// src/lib/dates.ts — must agree with fiscal_years_length:
// end = (start + interval '1 year')::date - 1. Expected values were read back from Postgres.
assert.equal(fullYearEnd('2026-01-01'), '2026-12-31');
assert.equal(fullYearEnd('2026-04-01'), '2027-03-31');
assert.equal(fullYearEnd('2026-07-15'), '2027-07-14');
assert.equal(fullYearEnd('2027-03-01'), '2028-02-29');
assert.equal(fullYearEnd('2028-02-29'), '2029-02-27');
assert.equal(yearName('2026-01-01', '2026-12-31'), '2026');
assert.equal(yearName('2026-04-01', '2027-03-31'), '2026-2027');
// The system's day, not the device's or UTC's — private.merchant_today's (now() at time zone …)::date.
assert.equal(todayIn('Asia/Manila', new Date('2026-10-11T17:30:00Z')), '2026-10-12');
assert.equal(todayIn('America/New_York', new Date('2026-10-12T02:00:00Z')), '2026-10-11');
assert.equal(todayIn('UTC', new Date('2026-03-05T00:00:00Z')), '2026-03-05');

// src/lib/money.ts — frappe's rounded(), round_based_on_smallest_currency_fraction(), format_number(),
// money_in_words() and in_words() (num2words). Expected values are ERPNext's.
const BANKERS = "Banker's Rounding";
const COMMERCIAL = 'Commercial Rounding';
assert.equal(roundTo(2.5, 0, BANKERS), 2);
assert.equal(roundTo(3.5, 0, BANKERS), 4);
assert.equal(roundTo(-2.5, 0, BANKERS), -2);
assert.equal(roundTo(2.345, 2, BANKERS), 2.34);
assert.equal(roundTo(1.005, 2, BANKERS), 1);
assert.equal(roundTo(2.5, 0, COMMERCIAL), 3);
assert.equal(roundTo(-2.5, 0, COMMERCIAL), -3);
assert.equal(roundTo(2.345, 2, COMMERCIAL), 2.35);
assert.equal(roundTo(1.005, 2, COMMERCIAL), 1.01);
assert.equal(roundTo(1.2375, 4, BANKERS), 1.2375);
assert.equal(cashRound(10.13, 0.05, 2, BANKERS), 10.15);
assert.equal(cashRound(10.12, 0.05, 2, BANKERS), 10.1);
assert.equal(cashRound(1234.56, null, 2, BANKERS), 1235);
// The Currency page's sample: ERPNext cash-rounds the Grand Total already at precision.
assert.equal(cashRound(roundTo(1234.565, 2, BANKERS), 0.05, 2, BANKERS), 1234.55);
assert.equal(formatNumber(1234567.891, '#,###.##', 2, BANKERS), '1,234,567.89');
assert.equal(formatNumber(1234567.891, '#.###,##', 2, BANKERS), '1.234.567,89');
assert.equal(formatNumber(1234567.891, '#,##,###.##', 2, BANKERS), '12,34,567.89');
assert.equal(formatNumber(1234567.891, "#'###.##", 2, BANKERS), "1'234'567.89");
assert.equal(formatNumber(1234567.891, '#, ###.##', 2, BANKERS), '1, 234, 567.89');
assert.equal(formatNumber(1234567.891, '#,###', 2, BANKERS), '1,234,568');
assert.equal(formatNumber(-5, '#,###.##', 2, BANKERS), '-5.00');
const PHP = { code: 'PHP', symbol: '₱', symbol_on_right: false, fraction: 'Centavo', number_format: '#,###.##' };
assert.equal(formatMoney(1234.5, PHP, 2, BANKERS), '₱ 1,234.50');
assert.equal(formatMoney(1234.5, { ...PHP, symbol: 'kr', symbol_on_right: true, number_format: '#.###,##' }, 2, BANKERS), '1.234,50 kr');
assert.equal(inWords(1234, false), 'one thousand, two hundred and thirty four');
assert.equal(inWords(1004, false), 'one thousand and four');
assert.equal(inWords(100, false), 'one hundred');
assert.equal(inWords(1200000, false), 'one million, two hundred thousand');
assert.equal(inWords(123456, true), 'one lakh, twenty three thousand, four hundred and fifty six');
assert.equal(moneyInWords(1050, PHP), 'PHP One Thousand And Fifty only.');
assert.equal(moneyInWords(1234.5, PHP), 'PHP One Thousand, Two Hundred And Thirty Four and Fifty Centavo only.');
assert.equal(moneyInWords(0.5, PHP), 'Fifty Centavo only.');
assert.equal(moneyInWords(0, PHP), 'PHP Zero only.');
assert.equal(moneyInWords(1234.55, PHP), 'PHP One Thousand, Two Hundred And Thirty Four and Fifty Five Centavo only.');

// src/lib/tree.ts — the folder walks of the Chart of Accounts and Cost Centers.
const TREE = [
  { id: 'assets', parent_id: null },
  { id: 'current', parent_id: 'assets' },
  { id: 'cash-group', parent_id: 'current' },
  { id: 'cash', parent_id: 'cash-group' },
  { id: 'income', parent_id: null },
];
assert.deepEqual(childrenOf(TREE, null).map((row) => row.id), ['assets', 'income']);
assert.deepEqual(pathTo(TREE, 'cash').map((row) => row.id), ['assets', 'current', 'cash-group', 'cash']);
assert.deepEqual(pathTo(TREE, undefined), []);
// Held to one branch by a User Permission: the branch is the top.
assert.deepEqual(childrenOf(TREE.slice(2), null).map((row) => row.id), ['cash-group', 'income']);
assert.deepEqual([...subtree(TREE, 'current')].sort(), ['cash', 'cash-group', 'current']);

// src/features/sales-tax-templates/calculate.ts — ERPNext's taxes_and_totals. Expected values are the worked
// examples of docs.frappe.io/erpnext/tax-inclusive-accounting, /types-in-tax-template, /item-tax-template.
const round2 = (value, precision) => roundTo(value, precision, BANKERS);
const tax = (row) => ({ charge_type: 'On Net Total', account: 'vat', rate: 0, tax_amount: 0, row_id: null, included_in_print_rate: false, ...row });
const run = (lines, taxes) => calculateTaxes(lines, taxes, 2, round2);
// $108 includes 8%: $100 net, $8 tax, the customer still pays $108.
let result = run([{ rate: 108, qty: 1 }], [tax({ rate: 8, included_in_print_rate: true })]);
assert.deepEqual([result.netTotal, result.rows[0].amount, result.grandTotal], [100, 8, 108]);
assert.equal(result.items[0].netRate, 100);
// $100 includes 10%: $90.91 and $9.09.
result = run([{ rate: 100, qty: 1 }], [tax({ rate: 10, included_in_print_rate: true })]);
assert.deepEqual([result.netTotal, result.totalTaxes, result.grandTotal], [90.91, 9.09, 100]);
// Without the inclusive tick, 8% is added on top: $116.64.
assert.equal(run([{ rate: 108, qty: 1 }], [tax({ rate: 8 })]).grandTotal, 116.64);
// Tax on another tax amount, and on the running total.
result = run([{ rate: 1000, qty: 1 }], [tax({ rate: 8 }), tax({ charge_type: 'On Previous Row Amount', rate: 2, row_id: 1 })]);
assert.deepEqual(result.rows, [{ amount: 80, total: 1080, byItem: [80] }, { amount: 1.6, total: 1081.6, byItem: [1.6] }]);
result = run([{ rate: 1000, qty: 1 }], [tax({ rate: 8 }), tax({ charge_type: 'On Previous Row Total', rate: 2, row_id: 1 })]);
assert.deepEqual([result.rows[1].amount, result.grandTotal, result.totalTaxes], [21.6, 1101.6, 101.6]);
// A fixed $25 charge, spread over two items with the remainder on the last.
assert.equal(run([{ rate: 1000, qty: 1 }], [tax({ charge_type: 'Actual', tax_amount: 25 })]).grandTotal, 1025);
assert.equal(run([{ rate: 333.33, qty: 1 }, { rate: 666.67, qty: 1 }], [tax({ charge_type: 'Actual', tax_amount: 25 })]).rows[0].amount, 25);
// On Item Quantity: the rate is per unit — 2 × 5 units = 10.
assert.equal(run([{ rate: 200, qty: 5 }], [tax({ charge_type: 'On Item Quantity', rate: 2 })]).rows[0].amount, 10);
// Item Tax Templates override the 8% row by account: $699 at 8%, $149 at 4%, $99 at 0% → $61.88, $1,008.88.
result = run(
  [
    { rate: 699, qty: 1 },
    { rate: 149, qty: 1, itemTaxRates: new Map([['vat', 4]]) },
    { rate: 99, qty: 1, itemTaxRates: new Map([['vat', 0]]) },
  ],
  [tax({ rate: 8 })]
);
assert.deepEqual([result.totalTaxes, result.grandTotal], [61.88, 1008.88]);
// No rows: the net total is the grand total.
assert.deepEqual([run([{ rate: 50, qty: 2 }], []).grandTotal, run([{ rate: 50, qty: 2 }], []).totalTaxes], [100, 0]);
// An additional discount (docs.frappe.io/erpnext/applying-discount, /discount_accounting): 2 × 699 at 10 % off
// is 1,258.20, and 5 % off that is 62.91 — 1,195.29.
const off = (lines, taxes, discount) => calculateTaxes(lines, taxes, 2, round2, { percentage: 0, amount: 0, ...discount });
const totalsOf = ({ discountAmount, netTotal, totalTaxes, grandTotal }) => [discountAmount, netTotal, totalTaxes, grandTotal];
const DISCOUNTED = [{ rate: 629.1, qty: 2 }];
result = off(DISCOUNTED, [], { applyOn: 'Net Total', percentage: 5 });
assert.deepEqual([...totalsOf(result), result.items[0].distributed, result.items[0].amount], [62.91, 1195.29, 0, 1195.29, 62.91, 1258.2]);
// With VAT 12 % on top: off the Net Total the tax is charged on what is left; off the Grand Total the
// discount is 5 % of 1,409.18, and its net part comes out of the line.
assert.deepEqual(totalsOf(off(DISCOUNTED, [tax({ rate: 12 })], { applyOn: 'Net Total', percentage: 5 })), [62.91, 1195.29, 143.43, 1338.72]);
assert.deepEqual(totalsOf(off(DISCOUNTED, [tax({ rate: 12 })], { applyOn: 'Grand Total', percentage: 5 })), [70.46, 1195.29, 143.43, 1338.72]);
// A tax included in the price: 10 % off $108 leaves $97.20, of which $90 net and $7.20 tax.
assert.deepEqual(totalsOf(off([{ rate: 108, qty: 1 }], [tax({ rate: 8, included_in_print_rate: true })], { applyOn: 'Grand Total', percentage: 10 })), [10.8, 90, 7.2, 97.2]);
// An amount spread over three lines: the cent rounding loses goes on the line that lost it.
result = off([{ rate: 10, qty: 1 }, { rate: 10, qty: 1 }, { rate: 10, qty: 1 }], [], { applyOn: 'Net Total', amount: 10 });
assert.deepEqual([result.items.map((item) => item.netAmount), result.items.map((item) => item.distributed), result.netTotal], [[6.67, 6.66, 6.67], [3.33, 3.34, 3.33], 20]);
// A fixed charge is not discounted, and a discount is never more than there is to take: 500 off 100 + 25 takes the 100.
assert.deepEqual(totalsOf(off([{ rate: 100, qty: 1 }], [tax({ charge_type: 'Actual', tax_amount: 25 })], { applyOn: 'Grand Total', amount: 500 })), [100, 0, 25, 25]);
assert.equal(off([{ rate: 100, qty: 1 }], [], { applyOn: 'Net Total' }).discountAmount, 0);

// src/features/tax-rules/resolve.ts — the Tax Rule a sale takes (docs.frappe.io/erpnext/tax-rule): blank
// conditions match anything, the most conditions filled in win, then priority 1 over 2.
const rule = (id, conditions) => ({ id, sales_tax_template_id: `t-${id}`, tax_category_id: null, item_group_id: null, from_date: null, to_date: null, priority: 1, ...conditions });
const sale = (context) => ({ taxCategoryId: null, itemGroupIds: [], date: '2026-10-10', ...context });
const pick = (rules, context, disabled) => resolveTaxRule(rules, sale(context), disabled)?.id ?? null;
const RULES = [
  rule('every'),
  rule('exempt', { tax_category_id: 'exempt' }),
  rule('services', { item_group_id: 'services' }),
  rule('exempt-services', { tax_category_id: 'exempt', item_group_id: 'services' }),
];
assert.equal(pick([], {}), null);
assert.equal(pick(RULES, {}), 'every');
assert.equal(pick(RULES, { taxCategoryId: 'exempt' }), 'exempt');
assert.equal(pick(RULES, { taxCategoryId: 'standard' }), 'every');
// An item group matches the items of every group under it.
assert.equal(pick(RULES, { itemGroupIds: ['all', 'services', 'repairs'] }), 'services');
assert.equal(pick(RULES, { itemGroupIds: ['all', 'products'] }), 'every');
assert.equal(pick(RULES, { taxCategoryId: 'exempt', itemGroupIds: ['all', 'services'] }), 'exempt-services');
// Dates bound a rule, both ends included; outside them the next match wins.
const DATED = [rule('every'), rule('promo', { tax_category_id: 'exempt', from_date: '2026-10-01', to_date: '2026-10-31' })];
assert.equal(pick(DATED, { taxCategoryId: 'exempt', date: '2026-10-31' }), 'promo');
assert.equal(pick(DATED, { taxCategoryId: 'exempt', date: '2026-11-01' }), 'every');
// Equal conditions: priority 1 beats 2, whichever comes first; equal priority keeps the earlier rule.
assert.equal(pick([rule('second', { priority: 2 }), rule('first')], {}), 'first');
assert.equal(pick([rule('older', { tax_category_id: 'a' }), rule('newer', { item_group_id: 'g' })], { taxCategoryId: 'a', itemGroupIds: ['g'] }), 'older');
// A winning rule whose template is disabled picks nothing — ERPNext's get_tax_template.
assert.equal(pick(RULES, {}, new Set(['t-every'])), null);

// src/features/print-formats/receipt.ts — what a receipt prints (docs.frappe.io/erpnext/print-settings §2.2,
// §2.7): Compact Item Print's four columns, a hidden item code, and taxes of zero.
const SOLD = { code: 'ITEM-001', name: 'Notebook', uom: 'Nos', qty: '2', rate: '120.00', amount: '240.00' };
const labels = (options) => itemColumns(SOLD, options).map((column) => column.label);
assert.deepEqual(labels({ compact: true, showItemCode: true }), ['Description', 'Qty', 'Rate', 'Amount']);
assert.deepEqual(itemColumns(SOLD, { compact: true, showItemCode: true }).slice(0, 2).map((column) => column.value), ['ITEM-001 Notebook', '2 Nos']);
assert.equal(itemColumns(SOLD, { compact: true, showItemCode: false })[0].value, 'Notebook');
assert.deepEqual(labels({ compact: false, showItemCode: true }), ['Item Code', 'Item Name', 'UOM', 'Qty', 'Rate', 'Amount']);
assert.deepEqual(labels({ compact: false, showItemCode: false }), ['Item Name', 'UOM', 'Qty', 'Rate', 'Amount']);
const PRINTED = [{ description: 'VAT @ 12', amount: 34.38 }, { description: 'Service Charge', amount: 0 }];
assert.deepEqual(printedTaxes(PRINTED, false).map((row) => row.description), ['VAT @ 12']);
assert.deepEqual(printedTaxes(PRINTED, true).map((row) => row.description), ['VAT @ 12', 'Service Charge']);

// src/features/item-prices/resolve.ts — the price a sale's line takes (docs.frappe.io/erpnext/item-price 2.1,
// 2.6; /Selling-in-different-UOM): the line's unit in the sale's list on its date, a Price Not UOM Dependent
// list's stock-unit price times the conversion factor, then Selling Settings' fallback list.
const price = (rate, row) => ({ item_id: 'rice', price_list_id: 'retail', uom_id: 'kg', price_list_rate: rate, valid_from: null, valid_upto: null, ...row });
const RETAIL = { id: 'retail', price_not_uom_dependent: false };
const line = (request) => ({ itemId: 'rice', uomId: 'kg', stockUomId: 'kg', conversionFactor: 1, date: '2026-12-15', priceList: RETAIL, fallback: null, ...request });
const rateOf = (prices, request) => resolvePrice(prices, line(request))?.rate ?? null;
assert.equal(rateOf([], {}), null);
assert.equal(rateOf([price(60), price(99, { item_id: 'beans' }), price(55, { price_list_id: 'wholesale' })], {}), 60);
// Validity bounds a price, both ends included; the later Valid From wins over an open-ended one.
const DATED_PRICES = [price(60), price(50, { valid_from: '2026-12-01', valid_upto: '2026-12-31' }), price(70, { valid_from: '2027-01-01' })];
assert.equal(rateOf(DATED_PRICES, { date: '2026-12-31' }), 50);
assert.equal(rateOf(DATED_PRICES, { date: '2026-11-30' }), 60);
assert.equal(rateOf(DATED_PRICES, { date: '2027-01-01' }), 70);
assert.equal(rateOf([price(60, { valid_upto: '2026-12-14' })], {}), null);
// A sack of 25 Kg: its own price when it has one; otherwise none, unless the list prices units by conversion.
const SACK = { uomId: 'sack', conversionFactor: 25 };
assert.equal(rateOf([price(60), price(1400, { uom_id: 'sack' })], SACK), 1400);
assert.equal(rateOf([price(60)], SACK), null);
assert.equal(rateOf([price(60)], { ...SACK, priceList: { id: 'retail', price_not_uom_dependent: true } }), 1500);
// Selling Settings' fallback: the default list answers when the sale's own has no price, by the same steps.
const WHOLESALE = { id: 'wholesale', price_not_uom_dependent: true };
assert.deepEqual(resolvePrice([price(55, { price_list_id: 'wholesale' })], line({ fallback: WHOLESALE })), { rate: 55, priceListId: 'wholesale' });
assert.equal(rateOf([price(55, { price_list_id: 'wholesale' })], { ...SACK, fallback: WHOLESALE }), 1375);
assert.equal(rateOf([price(60), price(55, { price_list_id: 'wholesale' })], { fallback: WHOLESALE }), 60);

// src/features/pos-invoices/cart.ts — the sale a cart becomes. The Philippine case the database probe posted:
// 2 at 80 with VAT 12 % on top is 160 + 19.20.
const VAT_ROW = { charge_type: 'On Net Total', account: 'vat', rate: 12, tax_amount: 0, row_id: null, included_in_print_rate: false, description: 'VAT @ 12', cost_center: null };
const ENGINES = {
  resolvePrice,
  resolveTaxRule,
  calculateTaxes,
  pickPricingRule,
  ruleRate,
  round: (value, places) => roundTo(value, places, BANKERS),
  cashRound: (value) => cashRound(value, 0.25, 2, BANKERS),
};
const coffee = { id: 'coffee', item_name: 'Coffee', item_group_id: 'drinks', stock_uom: 'nos', item_uoms: [{ uom_id: 'box', conversion_factor: 12 }], item_taxes: [] };
const cake = { id: 'cake', item_name: 'Cake', item_group_id: 'food', stock_uom: 'nos', item_uoms: [], item_taxes: [{ item_tax_template_id: 'zero', tax_category_id: null, valid_from: null }] };
const GROUPS = { drinks: ['drinks', 'products', 'all'], food: ['food', 'products', 'all'] };
const setupOf = (over = {}) => ({
  date: '2026-10-12',
  items: new Map([coffee, cake].map((item) => [item.id, item])),
  prices: [
    { item_id: 'coffee', price_list_id: 'retail', uom_id: 'nos', price_list_rate: 80, valid_from: null, valid_upto: null },
    { item_id: 'cake', price_list_id: 'retail', uom_id: 'nos', price_list_rate: 100, valid_from: null, valid_upto: null },
  ],
  priceList: { id: 'retail', price_not_uom_dependent: true },
  fallback: null,
  groupPath: (groupId) => GROUPS[groupId] ?? [],
  groupTaxes: new Map(),
  itemTaxRates: new Map([['zero', new Map([['vat', 0]])], ['sin', new Map([['sin-tax', 5]])]]),
  templates: [{ id: 'ph', rows: [VAT_ROW] }, { id: 'none', rows: [] }],
  profileTemplateId: 'ph',
  defaultTemplateId: null,
  taxCategoryId: null,
  rules: [],
  pricingRules: [],
  addTaxesFromItemTemplates: false,
  accountName: (accountId) => `Account ${accountId}`,
  precision: 2,
  roundedTotalDisabled: true,
  ...over,
});
const cartOf = (...lines) => lines.map(([itemId, qty, uomId = 'nos', rate = null]) => ({ itemId, qty, uomId, rate }));
const saleOf = (cart, over) => buildSale(cart, setupOf(over), ENGINES);

const twoCoffees = saleOf(cartOf(['coffee', 2]));
assert.deepEqual([twoCoffees.netTotal, twoCoffees.totalTaxes, twoCoffees.grandTotal, twoCoffees.roundedTotal, twoCoffees.roundingAdjustment], [160, 19.2, 179.2, 179.2, 0]);
assert.deepEqual(twoCoffees.taxes.map((tax) => [tax.description, tax.tax_amount, tax.total]), [['VAT @ 12', 19.2, 179.2]]);
// Global Defaults keeps the Rounded Total: the grand total at the smallest coin, the difference recorded.
assert.deepEqual((({ roundedTotal, roundingAdjustment }) => [roundedTotal, roundingAdjustment])(saleOf(cartOf(['coffee', 2]), { roundedTotalDisabled: false })), [179.25, 0.05]);
// A box of 12 on a Price Not UOM Dependent list: 12 times the unit's price, and 12 stock units a box.
assert.deepEqual((({ rate, stockQty, amount }) => [rate, stockQty, amount])(saleOf(cartOf(['coffee', 2, 'box'])).lines[0]), [960, 24, 1920]);
// The item's own Item Tax Template zero-rates it; the line beside it is still taxed.
assert.deepEqual((({ netTotal, totalTaxes }) => [netTotal, totalTaxes])(saleOf(cartOf(['coffee', 1], ['cake', 1]))), [180, 9.6]);
// With none on the item, its Item Group's row applies — the nearest group first.
assert.equal(saleOf(cartOf(['coffee', 1]), { groupTaxes: new Map([['products', [{ item_tax_template_id: 'zero', tax_category_id: null, valid_from: null }]]]) }).totalTaxes, 0);
// A row for another tax category, or not yet valid, is passed over.
assert.equal(saleOf(cartOf(['coffee', 1]), { groupTaxes: new Map([['drinks', [{ item_tax_template_id: 'zero', tax_category_id: 'export', valid_from: null }, { item_tax_template_id: 'zero', tax_category_id: null, valid_from: '2027-01-01' }]]]) }).totalTaxes, 9.6);
// Taxes from Item Tax Templates: the account the sale lacks is added, and taxes only the items that name it.
const sin = saleOf(cartOf(['coffee', 1], ['cake', 1]), { addTaxesFromItemTemplates: true, groupTaxes: new Map([['drinks', [{ item_tax_template_id: 'sin', tax_category_id: null, valid_from: null }]]]) });
assert.deepEqual(sin.taxes.map((tax) => [tax.description, tax.tax_amount]), [['VAT @ 12', 9.6], ['Account sin-tax', 4]]);
// No profile template: the Tax Rule for a group every line is under, else the default; a disabled rule's template picks none.
const RULE = { sales_tax_template_id: 'none', tax_category_id: null, item_group_id: 'drinks', from_date: null, to_date: null, priority: 1 };
assert.equal(saleOf(cartOf(['coffee', 1]), { profileTemplateId: null, defaultTemplateId: 'ph', rules: [RULE] }).templateId, 'none');
assert.equal(saleOf(cartOf(['coffee', 1], ['cake', 1]), { profileTemplateId: null, defaultTemplateId: 'ph', rules: [RULE] }).templateId, 'ph');
assert.equal(saleOf(cartOf(['coffee', 1]), { profileTemplateId: null, rules: [{ ...RULE, sales_tax_template_id: 'gone' }] }).templateId, null);
// A typed rate wins over the price list's; an item no list prices is unpriced until one is typed.
assert.deepEqual((({ rate, priceListRate, priced }) => [rate, priceListRate, priced])(saleOf(cartOf(['coffee', 1, 'nos', 70])).lines[0]), [70, 80, true]);
assert.equal(saleOf(cartOf(['coffee', 1]), { prices: [] }).lines[0].priced, false);
// What the Register offers: the profile's item groups (a parent group covers its children), on hand when it
// hides the rest, the search by name or code; a disabled item never.
const SHELF = [{ ...coffee, item_code: 'COF', disabled: false, is_stock_item: true }, { ...cake, item_code: 'CAK', disabled: false, is_stock_item: true }, { ...cake, id: 'tip', item_name: 'Service', item_code: 'SVC', disabled: false, is_stock_item: false }, { ...coffee, id: 'old', item_code: 'OLD', disabled: true, is_stock_item: true }];
const offer = (over) => offeredItems(SHELF, setupOf(), { groupIds: [], hideUnavailable: false, onHand: new Map([['coffee', 3]]), search: '', ...over }).map((item) => item.item_code);
assert.deepEqual(offer({}), ['COF', 'CAK', 'SVC']);
assert.deepEqual(offer({ groupIds: ['drinks'] }), ['COF']);
assert.deepEqual(offer({ groupIds: ['products'] }), ['COF', 'CAK', 'SVC']);
assert.deepEqual(offer({ hideUnavailable: true }), ['COF', 'SVC']);
assert.deepEqual([offer({ search: ' cak ' }), offer({ search: 'coff' })], [['CAK'], ['COF']]);
// Paid, change, and the shortfall a write-off would cover.
const cents = (value) => roundTo(value, 2, BANKERS);
assert.deepEqual(settle(179.2, [200], cents), { paid: 200, change: 20.8, shortfall: 0 });
assert.deepEqual(settle(179.2, [100, 79], cents), { paid: 179, change: 0, shortfall: 0.2 });
// The default method starts at the total until it is typed over — a blank then means nothing was handed over.
const METHODS = [{ mode_of_payment_id: 'cash', is_default: true }, { mode_of_payment_id: 'card', is_default: false }];
assert.deepEqual(tenderedAmounts(METHODS, {}, 179.2).map((row) => [row.shown, row.amount]), [[179.2, 179.2], [null, 0]]);
assert.deepEqual(tenderedAmounts(METHODS, { cash: null, card: 50 }, 179.2).map((row) => [row.shown, row.amount]), [[null, 0], [50, 50]]);
assert.deepEqual(tenderedAmounts(METHODS, {}, null).map((row) => row.amount), [0, 0]);
const sent = checkoutPayload(twoCoffees, { id: 'session', pos_profile_id: 'front' }, [{ mode_of_payment_id: 'cash', amount: 200 }, { mode_of_payment_id: 'card', amount: 0 }], settle(179.2, [200], cents));
assert.deepEqual([sent.paid_amount, sent.change_amount, sent.payments.length, sent.items[0].stock_qty, sent.taxes[0].account_head], [200, 20.8, 1, 2, 'vat']);
// Each tax row says what it charged each line: what a return takes its share of.
assert.deepEqual(sent.taxes[0].item_wise_tax_detail, [19.2]);

// A return, made from the sale as the database stored it — the figures the probe posted: 2 coffees and a
// zero-rated cake, VAT 12 % on top, the Rounded Total at a whole peso.
const stored = (sale, id) => ({
  id,
  taxes_and_charges: sale.templateId,
  net_total: sale.netTotal,
  total_taxes_and_charges: sale.totalTaxes,
  grand_total: sale.grandTotal,
  apply_discount_on: sale.applyDiscountOn,
  additional_discount_percentage: sale.additionalDiscountPercentage,
  discount_amount: sale.discountAmount,
  pos_invoice_items: sale.lines.map((line, index) => ({ id: `${id}-${index}`, item_id: line.itemId, item_name: line.itemName, qty: line.qty, uom_id: line.uomId, conversion_factor: line.conversionFactor, price_list_rate: line.priceListRate, rate: line.rate, amount: line.amount, net_rate: line.netRate, net_amount: line.netAmount, item_tax_template_id: line.itemTaxTemplateId, discount_percentage: line.discountPercentage, discount_amount: line.discountAmount, distributed_discount_amount: line.distributed, pricing_rule_id: line.pricingRule?.id ?? null })),
  pos_invoice_taxes: sale.taxes.map((tax) => ({ charge_type: tax.charge_type, account_head: tax.account, description: tax.description, rate: tax.rate, row_id: tax.row_id, included_in_print_rate: tax.included_in_print_rate, cost_center: tax.cost_center, item_wise_tax_detail: tax.byItem })),
});
const PESO = { round: cents, cashRound: (value) => cashRound(value, null, 2, BANKERS), roundedTotalDisabled: false };
const sold = stored(saleOf(cartOf(['coffee', 2], ['cake', 1])), 'sale');
const figures = (made) => [made.netTotal, made.totalTaxes, made.grandTotal, made.roundedTotal, made.roundingAdjustment];
// One of the two coffees: half the line and half its tax, below zero; the refund is the magnitude rounded.
const oneBack = buildReturn(sold, new Map([['sale-0', 1]]), PESO);
assert.deepEqual(figures(oneBack), [-80, -9.6, -89.6, -90, -0.4]);
assert.deepEqual((({ qty, stock_qty, amount, net_amount, return_against_item }) => [qty, stock_qty, amount, net_amount, return_against_item])(oneBack.items[0]), [-1, -1, -80, -80, 'sale-0']);
assert.deepEqual([oneBack.taxes[0].tax_amount, oneBack.taxes[0].total, oneBack.taxes[0].item_wise_tax_detail], [-9.6, -89.6, [-9.6]]);
// The zero-rated cake refunds no tax, and a line left at 0 is not in the return.
assert.deepEqual(figures(buildReturn(sold, new Map([['sale-0', 0], ['sale-1', 1]]), PESO)), [-100, 0, -100, -100, 0]);
// Everything back is the sale negated.
assert.deepEqual(figures(buildReturn(sold, new Map([['sale-0', 2], ['sale-1', 1]]), PESO)), [-260, -19.2, -279.2, -279, 0.2]);
// A tax included in the price: a third of 3 at 100 is the third the sale stored, not a new calculation.
const INCLUSIVE = { templates: [{ id: 'ph', rows: [{ ...VAT_ROW, included_in_print_rate: true }] }], prices: [{ item_id: 'coffee', price_list_id: 'retail', uom_id: 'nos', price_list_rate: 100, valid_from: null, valid_upto: null }] };
const inclusive = stored(saleOf(cartOf(['coffee', 3]), INCLUSIVE), 'incl');
assert.deepEqual([inclusive.net_total, inclusive.grand_total], [267.86, 300]);
assert.deepEqual(figures(buildReturn(inclusive, new Map([['incl-0', 1]]), PESO)), [-89.29, -10.71, -100, -100, 0]);
// What is left of each line after the returns already made.
assert.deepEqual(returnableLines(sold, [{ pos_invoice_items: oneBack.items }]).map((row) => row.left), [1, 1]);
assert.deepEqual(returnableLines(sold, [{ pos_invoice_items: oneBack.items }, { pos_invoice_items: oneBack.items }]).map((row) => row.left), [0, 1]);
// What is sent: the sale it returns, each line's own, and the refund below zero with nothing as change.
const back = returnPayload(sold, oneBack, { id: 'session', pos_profile_id: 'front' }, [{ mode_of_payment_id: 'cash', amount: 90 }, { mode_of_payment_id: 'card', amount: 0 }]);
assert.deepEqual([back.return_against, back.paid_amount, back.change_amount, back.write_off_amount, back.payments], ['sale', -90, 0, 0, [{ mode_of_payment_id: 'cash', amount: -90 }]]);

// src/features/pricing-rules/apply.ts — the rule a line takes (20.4), and the rate it gives.
const ruleOf = (over) => ({ id: 'r', title: 'Rule', apply_on: 'Item Code', min_qty: 0, max_qty: 0, min_amt: 0, max_amt: 0, valid_from: null, valid_upto: null, for_price_list: null, priority: 1, disable: false, rate_or_discount: 'Discount Percentage', rate: 0, discount_percentage: 10, discount_amount: 0, created_at: '2026-01-01', pricing_rule_targets: [{ item_id: 'coffee', item_group_id: null, brand_id: null }], ...over });
const LINE = { itemId: 'coffee', brandId: 'acme', groupPath: ['drinks', 'products', 'all'], stockQty: 2, amount: 160, date: '2026-10-12', priceListId: 'retail' };
const picked = (rules, line = LINE) => pickPricingRule(rules, line)?.id ?? null;
assert.equal(picked([ruleOf()]), 'r');
// Another item's; disabled; outside its dates, quantities or amounts; for another price list.
for (const miss of [{ pricing_rule_targets: [{ item_id: 'cake', item_group_id: null, brand_id: null }] }, { disable: true }, { valid_from: '2026-10-13' }, { valid_upto: '2026-10-11' }, { min_qty: 3 }, { max_qty: 1 }, { min_amt: 161 }, { max_amt: 159 }, { for_price_list: 'wholesale' }]) {
  assert.equal(picked([ruleOf(miss)]), null, JSON.stringify(miss));
}
// A group above the item's covers it, and so does its brand.
const onGroup = ruleOf({ id: 'g', apply_on: 'Item Group', pricing_rule_targets: [{ item_id: null, item_group_id: 'products', brand_id: null }] });
const onBrand = ruleOf({ id: 'b', apply_on: 'Brand', pricing_rule_targets: [{ item_id: null, item_group_id: null, brand_id: 'acme' }] });
assert.deepEqual([picked([onGroup]), picked([onBrand]), picked([onBrand], { ...LINE, brandId: null })], ['g', 'b', null]);
// Item Code over Item Group over Brand; then priority, 1 first; then the rule naming the price list; then the older.
assert.deepEqual([picked([onBrand, onGroup, ruleOf()]), picked([onBrand, onGroup])], ['r', 'g']);
assert.equal(picked([ruleOf({ id: 'p2', priority: 2 }), ruleOf({ id: 'p1' })]), 'p1');
assert.equal(picked([ruleOf({ id: 'any' }), ruleOf({ id: 'list', for_price_list: 'retail' })]), 'list');
assert.equal(picked([ruleOf({ id: 'new', created_at: '2026-02-01' }), ruleOf({ id: 'old' })]), 'old');
// A Rate per stock unit (a box of 12), a percentage and an amount off the Price List Rate — never below zero.
assert.deepEqual([ruleRate(ruleOf({ rate_or_discount: 'Rate', rate: 70 }), 960, 12), ruleRate(ruleOf(), 80, 1), ruleRate(ruleOf({ rate_or_discount: 'Discount Amount', discount_amount: 100 }), 80, 1)], [840, 72, 0]);

// The cart with discounts. 10 % from 2 coffees by rule: one coffee, or anything typed on the line, leaves the rule out.
const PROMO = { pricingRules: [ruleOf({ id: 'promo', title: 'Coffee promo', min_qty: 2 })] };
const lineOf = (sale) => (({ rate, discountAmount, discountPercentage, amount, pricingRule }) => [rate, discountAmount, discountPercentage, amount, pricingRule?.id ?? null])(sale.lines[0]);
assert.deepEqual(lineOf(saleOf(cartOf(['coffee', 2]), PROMO)), [72, 8, 10, 144, 'promo']);
assert.deepEqual(lineOf(saleOf(cartOf(['coffee', 1]), PROMO)), [80, 0, 0, 80, null]);
// 20.1: a Discount (%) or a Discount Amount against the Price List Rate; a typed lower rate is a discount too, a higher one is not.
const typedLine = (over) => lineOf(saleOf([{ itemId: 'coffee', uomId: 'nos', qty: 2, rate: null, ...over }], PROMO));
assert.deepEqual(typedLine({ discountPercentage: 25 }), [60, 20, 25, 120, null]);
assert.deepEqual(typedLine({ discountAmount: 5 }), [75, 5, 6.25, 150, null]);
assert.deepEqual(typedLine({ rate: 70 }), [70, 10, 12.5, 140, null]);
assert.deepEqual(typedLine({ rate: 90 }), [90, 0, 0, 180, null]);
assert.deepEqual(typedLine({ discountPercentage: 150 }), [0, 80, 100, 0, null]);
// 20.2: the additional discount is the POS Profile's to allow, on its Apply Discount On unless another was picked.
const PROFILE = { apply_discount_on: 'Net Total', allow_discount_change: true };
assert.deepEqual(additionalDiscount({ applyOn: null, percentage: 5, amount: null }, PROFILE), { applyOn: 'Net Total', percentage: 5, amount: 0 });
assert.deepEqual(additionalDiscount({ applyOn: 'Grand Total', percentage: null, amount: 3 }, PROFILE), { applyOn: 'Grand Total', percentage: 0, amount: 3 });
assert.equal(additionalDiscount({ applyOn: null, percentage: 5, amount: null }, { ...PROFILE, allow_discount_change: false }), undefined);
assert.equal(additionalDiscount({ applyOn: 'Grand Total', percentage: null, amount: null }, PROFILE), undefined);
// 144 + 17.28 VAT is 161.28; 5 % off it is 8.06, leaving 153.22 — 136.80 net, the line 7.20 lighter.
const cheaper = buildSale(cartOf(['coffee', 2]), setupOf(PROMO), ENGINES, { applyOn: 'Grand Total', percentage: 5, amount: 0 });
assert.deepEqual([cheaper.discountAmount, cheaper.netTotal, cheaper.totalTaxes, cheaper.grandTotal, cheaper.lines[0].distributed], [8.06, 136.8, 16.42, 153.22, 7.2]);
const discounted = checkoutPayload(cheaper, { id: 'session', pos_profile_id: 'front' }, [{ mode_of_payment_id: 'cash', amount: 153.22 }], settle(153.22, [153.22], cents));
assert.deepEqual([discounted.apply_discount_on, discounted.additional_discount_percentage, discounted.discount_amount], ['Grand Total', 5, 8.06]);
assert.deepEqual((({ price_list_rate, discount_percentage, discount_amount, rate, distributed_discount_amount, pricing_rule_id }) => [price_list_rate, discount_percentage, discount_amount, rate, distributed_discount_amount, pricing_rule_id])(discounted.items[0]), [80, 10, 8, 72, 7.2, 'promo']);
// One of the two returned takes half of each discount back with it.
const halfBack = buildReturn(stored(cheaper, 'promo-sale'), new Map([['promo-sale-0', 1]]), { ...PESO, roundedTotalDisabled: true });
assert.deepEqual([halfBack.discountAmount, halfBack.netTotal, halfBack.totalTaxes, halfBack.grandTotal], [-4.03, -68.4, -8.21, -76.61]);
assert.deepEqual((({ discount_percentage, discount_amount, distributed_discount_amount, pricing_rule_id }) => [discount_percentage, discount_amount, distributed_discount_amount, pricing_rule_id])(halfBack.items[0]), [10, 8, -3.6, 'promo']);
assert.equal(returnPayload(stored(cheaper, 'promo-sale'), halfBack, { id: 'session', pos_profile_id: 'front' }, []).discount_amount, -4.03);

console.log('check:logic — all assertions passed.');
