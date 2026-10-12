// The Dashboard's periods as date ranges. Import-free, so tools/check-logic.mjs can assert it. Dates are stored
// dates ("YYYY-MM-DD"), and `today` is the system's day (todayIn, src/lib/dates.ts) — the day a sale is dated
// by — never the device's.

/** The Dashboard's period switch (POS-System-Added-Features.md 22.1): Today, Last 7 Days, This Month. */
export type Period = 'today' | 'week' | 'month';

const DAY = 24 * 60 * 60 * 1000;

/** A stored date moved by whole days. In UTC, so no time zone can land it on a neighbouring day. */
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** The first and last day a period covers, both included. Every period ends today; a month starts on its 1st. */
export function periodRange(period: Period, today: string) {
  if (period === 'today') return { from: today, to: today };
  if (period === 'week') return { from: addDays(today, -6), to: today };
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

/** The days the sales chart draws: the period's own — or the last seven when the period is one day, one bar being no chart. */
export const chartRange = (period: Period, today: string) => periodRange(period === 'today' ? 'week' : period, today);
