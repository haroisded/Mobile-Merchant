// What a Setup or Stock search finds (src/components/section-browser.tsx). Import-free, so tools/check-logic.mjs runs it.

type Section<E> = { title: string; entries: E[] };

/** Every page whose section, name or hint holds the words typed, whatever their case, with the section it is in. */
export function searchEntries<E extends { label: string; hint: string }, S extends Section<E>>(sections: S[], term: string): { section: S; entry: E }[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];
  return sections.flatMap((section) =>
    section.entries.filter((entry) => `${section.title} ${entry.label} ${entry.hint}`.toLowerCase().includes(needle)).map((entry) => ({ section, entry })),
  );
}

/** A text cut around each place it holds the words typed, for drawing those places marked. Not a RegExp: nothing typed is special. */
export function markParts(text: string, term: string): { text: string; hit: boolean }[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const parts: { text: string; hit: boolean }[] = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    parts.push({ text: text.slice(at, at + needle.length), hit: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts;
}
