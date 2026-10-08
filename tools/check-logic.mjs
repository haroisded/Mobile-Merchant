// npm run check:logic — the runnable check for the app's pure calculation modules. Each section imports
// one import-free module from src/ (Node 24 strips its types) and asserts the cases that would break if
// its logic did. No test runner: this repo proves device behaviour with acceptance tests
// (.claude/instruction_mds/testing-workflow.md), and this file covers only what arithmetic can settle.
import assert from 'node:assert/strict';

import { fullYearEnd, yearName } from '../src/lib/dates.ts';

// src/lib/dates.ts — must agree with fiscal_years_length:
// end = (start + interval '1 year')::date - 1. Expected values were read back from Postgres.
assert.equal(fullYearEnd('2026-01-01'), '2026-12-31');
assert.equal(fullYearEnd('2026-04-01'), '2027-03-31');
assert.equal(fullYearEnd('2026-07-15'), '2027-07-14');
assert.equal(fullYearEnd('2027-03-01'), '2028-02-29');
assert.equal(fullYearEnd('2028-02-29'), '2029-02-27');
assert.equal(yearName('2026-01-01', '2026-12-31'), '2026');
assert.equal(yearName('2026-04-01', '2027-03-31'), '2026-2027');

console.log('check:logic — all assertions passed.');
