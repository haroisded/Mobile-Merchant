// Produces the Expo Atlas bundle report, then opens its viewer.
//
// Atlas is switched on by an environment variable rather than a CLI flag, and `EXPO_ATLAS=1 npx ...`
// only parses in a POSIX shell — npm runs scripts through cmd.exe on Windows, where that same line
// is a syntax error. Setting the variable here instead means `npm run atlas` behaves the same on
// every shell, which a package.json one-liner cannot do without adding cross-env for it.
//
// Node with no dependencies, matching check-history-paths.mjs:
//   npm run atlas
//
// The export writes to dist/ and the report to .expo/atlas.jsonl. Both are gitignored.
//
// Reads the *production* bundle: --dev is false by default for `expo export`, which is the point.
// A development bundle carries the dev-only code that `if (__DEV__)` strips, so its sizes answer a
// question nobody is asking.

import { spawnSync } from 'node:child_process';

// SDK 57 reads EXPO_ATLAS. EXPO_UNSTABLE_ATLAS is still honoured as an alias for the name the
// feature shipped under while experimental (@expo/cli utils/env.js), but is no longer the one to
// reach for — see the doc comment on the EXPO_ATLAS getter there.
const env = { ...process.env, EXPO_ATLAS: '1' };

// shell: true because npx resolves through a .cmd shim on Windows.
const run = (args) => spawnSync('npx', args, { stdio: 'inherit', shell: true, env });

const platform = process.argv[2] ?? 'android';

const exported = run(['expo', 'export', '--platform', platform]);
if (exported.status !== 0) process.exit(exported.status ?? 1);

process.exit(run(['expo-atlas']).status ?? 0);
