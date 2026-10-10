// npm run check:logic — the runnable check for the app's pure calculation modules. Each section imports
// one import-free module from src/ (Node 24 strips its types) and asserts the cases that would break if
// its logic did. No test runner: this repo proves device behaviour with acceptance tests
// (.claude/instruction_mds/testing-workflow.md), and this file covers only what arithmetic can settle.
import assert from 'node:assert/strict';

import { calculateTaxes } from '../src/features/sales-tax-templates/calculate.ts';
import { resolveTaxRule } from '../src/features/tax-rules/resolve.ts';
import { fullYearEnd, yearName } from '../src/lib/dates.ts';
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
assert.deepEqual(result.rows, [{ amount: 80, total: 1080 }, { amount: 1.6, total: 1081.6 }]);
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

console.log('check:logic — all assertions passed.');
