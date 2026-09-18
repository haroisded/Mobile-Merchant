// Runs fallow's review gate and prints a compact verdict instead of the raw JSON report.
//
// `fallow review --format json` returns the whole gate report — ~15 KB even on a clean tree — and an
// agent that runs it directly pays for all of it in context on every pass. This script is the only
// thing that should call it: it parses the report here and prints the verdict plus the top findings
// (instruction_mds/token-budget.md §1). Coverage is unchanged — every finding still counts toward the
// verdict and the total, only the listing is capped.
//
// It runs the audit brief, not `--walkthrough-guide`: the guide carries the decision surface and the
// judgment contract but none of the dead-code, complexity or duplication findings. When the brief
// reports a decision, this prints its signal ids and the fallow-review skill takes over from there.
//
//   node tools/fallow-verdict.mjs          top 5 findings
//   node tools/fallow-verdict.mjs 20       top 20
//
// Exit code: 1 when the verdict is fail, 0 otherwise.

import { execSync } from 'node:child_process';

const TOP = Number(process.argv[2]) || 5;

// Registered in instruction_mds/false-positives.md §1 — collapsed to one line, never listed.
const REGISTERED_DEPS = new Set([
  'expo-build-properties', 'expo-image', 'expo-glass-effect', 'expo-symbols',
  'react-native-gesture-handler', 'react-native-reanimated', 'react-native-worklets',
  'react-native-web', 'react-native-vector-icons', 'expo-dev-client', 'expo-atlas',
  'expo-device', 'expo-status-bar', 'expo-system-ui',
]);

// `review` always exits 0 (the verdict is in the JSON), so a throw here is fallow itself failing.
const report = JSON.parse(
  execSync('npx --yes fallow review --gate all --format json', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  }),
);

const findings = [];
let registered = 0;

// Not findings: notes that a detector did not run (no boundaries / rule packs configured).
const skipped = (report.dead_code?.workspace_diagnostics ?? []).map((d) => d.kind);

for (const [category, items] of Object.entries(report.dead_code ?? {})) {
  if (!Array.isArray(items) || category === 'workspace_diagnostics') continue;
  for (const item of items) {
    if (item.package_name && REGISTERED_DEPS.has(item.package_name)) {
      registered++;
      continue;
    }
    findings.push({
      severity: 'error',
      rule: category,
      where: `${item.path ?? '?'}:${item.line ?? '?'}`,
      what: item.package_name ?? item.name ?? item.export_name ?? '',
    });
  }
}

for (const item of report.complexity?.findings ?? []) {
  findings.push({
    severity: item.severity ?? 'warn',
    rule: 'complexity',
    where: `${item.path ?? item.file ?? '?'}:${item.line ?? '?'}`,
    what: item.name ?? item.function_name ?? '',
  });
}

for (const group of report.duplication?.clone_groups ?? []) {
  const instances = group.instances ?? [];
  findings.push({
    severity: 'warn',
    rule: 'duplication',
    where: instances.map((i) => `${i.file ?? i.path}:${i.start_line ?? '?'}`).join(', '),
    what: `${instances.length} copies`,
  });
}

const verdict = String(report.verdict ?? 'unknown').toUpperCase();
const shown = findings.slice(0, TOP);
console.log(
  `fallow: ${verdict} (${findings.length} findings${findings.length > TOP ? `, top ${TOP} shown` : ''}, ` +
    `${report.changed_files_count ?? '?'} changed files)`,
);
shown.forEach((f, i) => console.log(`${i + 1}. [${f.severity}] ${f.rule} ${f.where} ${f.what}`.trimEnd()));
if (registered) console.log(`unused deps: ${registered} — registered, false-positives.md §1`);
if (verdict === 'FAIL' && !findings.length) console.log('the fail is registered findings only — nothing to fix');
if (skipped.length) console.log(`not run: ${skipped.join(', ')}`);

const decisions = report.decisions?.decisions ?? [];
if (decisions.length) {
  const ids = report.decisions.emitted_signal_ids ?? [];
  console.log(`decisions: ${decisions.length} (${ids.join(', ')}) — run the fallow-review skill for these`);
}

process.exit(report.verdict === 'fail' ? 1 : 0);
