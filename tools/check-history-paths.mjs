// Verifies that every repo path named in a System-Context page's history.md still exists.
//
// Those files carry a "Where the code lives" index — the page -> file mapping that stands in for a
// features/<page>/ folder (docs/structure.md §3). An index nothing checks is an index that rots:
// rename a file and the table silently starts lying, which is worse than having no table, because a
// reader trusts it.
//
// Node with no dependencies, so it runs anywhere `npm` already does:
//   npm run check:history
//
// It only checks that listed paths EXIST. It deliberately does not check the reverse — that every
// file is listed — because that needs a definition of "belongs to this page" that does not exist,
// and would fire on every shared module.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pagesDir = join(root, '.claude', 'context', 'System-Context');

// The allowlist is the repo's own top-level entries rather than a hardcoded list, so adding a
// directory does not silently make its paths unverifiable.
const topLevel = new Set(readdirSync(root));

// `a/{b,c}.ts` -> ['a/b.ts', 'a/c.ts']. Shorthand is natural to write in a table, and a check that
// failed on it would just train people to distrust the check.
function expandBraces(token) {
  const match = /\{([^{}]*)\}/.exec(token);
  if (!match) return [token];
  return match[1]
    .split(',')
    .flatMap((option) =>
      expandBraces(token.slice(0, match.index) + option.trim() + token.slice(match.index + match[0].length))
    );
}

function isRepoPath(token) {
  if (!token.includes('/')) return false;
  // Placeholders (`src/features/<resource>/`), globs, and links are not claims about a real file.
  if (/[<>*?|]/.test(token) || token.startsWith('http')) return false;
  return topLevel.has(token.split('/')[0]);
}

function historyFiles() {
  if (!existsSync(pagesDir)) return [];
  return readdirSync(pagesDir)
    .map((entry) => join(pagesDir, entry, 'history.md'))
    .filter((file) => existsSync(file) && statSync(file).isFile());
}

const pages = historyFiles();
const missing = new Map();
let checked = 0;

for (const file of pages) {
  const text = readFileSync(file, 'utf8');
  const page = relative(root, file).replace(/\\/g, '/');

  // Paths are written in backticks in these tables. Anything outside them is prose.
  // A path usually appears more than once per page — in the prose summary and again in the index —
  // so the set is per page, and one broken file is reported once rather than once per mention.
  const seen = new Set();

  for (const [, token] of text.matchAll(/`([^`\n]+)`/g)) {
    if (!isRepoPath(token)) continue;

    for (const path of expandBraces(token)) {
      if (seen.has(path)) continue;
      seen.add(path);
      checked += 1;

      // Trailing slash means it is naming a directory, which existsSync handles either way.
      if (!existsSync(join(root, path.replace(/\/$/, '')))) {
        const forPage = missing.get(page) ?? [];
        forPage.push(path);
        missing.set(page, forPage);
      }
    }
  }
}

if (missing.size > 0) {
  const count = [...missing.values()].reduce((total, paths) => total + paths.length, 0);
  console.error(`${count} of ${checked} path(s) in a page index no longer exist:\n`);
  for (const [page, paths] of missing) {
    console.error(`  ${page}`);
    for (const path of paths) console.error(`    ${path}`);
    console.error('');
  }
  console.error('Update the "Where the code lives" table, or move the file back.');
  process.exit(1);
}

console.log(`${checked} path(s) across ${pages.length} page index(es) all resolve.`);
