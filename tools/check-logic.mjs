// npm run check:logic — the runnable check for the app's pure calculation modules. Each section imports
// one import-free module from src/ (Node 24 strips its types) and asserts the cases that would break if
// its logic did. No test runner: this repo proves device behaviour with acceptance tests
// (.claude/instruction_mds/testing-workflow.md), and this file covers only what arithmetic can settle.
import assert from 'node:assert/strict';

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

console.log('check:logic — all assertions passed.');
