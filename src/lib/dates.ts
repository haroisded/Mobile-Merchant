// Calendar dates as the app holds them: "YYYY-MM-DD" strings, the shape Postgres `date` takes and
// returns. Converted to a Date only to show or pick one.

/** A stored date as a local Date. Built from local parts: new Date("2026-09-14") parses as UTC midnight and
 * shows the day before anywhere west of Greenwich. */
export function toLocalDate(value: string) {
  return new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
}

/** "14 Sep 2026" for a stored date; '' for none, so an empty input shows its placeholder, not today. */
export function displayDate(value: string) {
  if (value === '') return '';
  return toLocalDate(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The last day of a full fiscal year starting on `start` ("2026-04-01" → "2027-03-31"), as the
 * fiscal_years_length constraint computes it: the same date a year on, minus a day. A 29 February start
 * steps to 28 February first, as Postgres' `+ interval '1 year'` does, so the two never disagree
 * (tools/check-logic.mjs).
 */
export function fullYearEnd(start: string) {
  const [year, month, day] = start.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
  const yearOn = Date.UTC(year + 1, month - 1, Math.min(day, daysInMonth));
  return new Date(yearOn - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** ERPNext's name for a fiscal year: "2026", or "2026-2027" when it spans two calendar years. */
export function yearName(start: string, end: string) {
  return start.slice(0, 4) === end.slice(0, 4) ? start.slice(0, 4) : `${start.slice(0, 4)}-${end.slice(0, 4)}`;
}

/** A local Date as a stored date: its own calendar day, wherever the device is. */
export function storedDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Today in the device's own time zone, as a stored date. */
export const todayDate = () => storedDate(new Date());
