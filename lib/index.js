/**
 * Host half of the peak-pricing indicator.
 *
 * The host owns the one piece of this feature that is data rather than UI: the
 * Chinese statutory holiday / make-up-workday table DeepSeek's price rule refers
 * to ("excluding statutory holidays"). It lives in `peak-calendar.json`, which
 * the browser half fetches over HTTP; this half reads the same file so a broken
 * or missing calendar is visible in the loader log instead of only in the
 * browser console.
 *
 * The host half deliberately imports nothing: it is loaded from the profile by
 * absolute path, where only the app's own runtime can resolve bare specifiers.
 */

import { readFileSync } from "node:fs";

/** Absolute path of the maintained calendar file, beside this module. */
const CALENDAR_PATH = new URL("../peak-calendar.json", import.meta.url);

/**
 * Collect `YYYY-MM-DD` keys from either raw strings or annotated entries.
 * @param rows - calendar rows.
 * @returns the accepted keys.
 */
function keysOf(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (typeof row === "string" ? row : row?.date))
    .filter((date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date));
}

/**
 * Read and flatten the maintained calendar for one year.
 * @param year - the schedule year to read.
 * @returns the year's tables, or empty tables plus an error when unreadable.
 */
function loadCalendar(year) {
  try {
    const raw = JSON.parse(readFileSync(CALENDAR_PATH, "utf8"));
    const years = Object.keys(raw?.schedules ?? {}).sort();
    const selected = raw?.schedules?.[String(year)];
    return {
      scheduleYear: selected === undefined ? Number(years[years.length - 1]) || undefined : Number(year),
      holidays: keysOf(selected?.holidays),
      makeupWorkdays: keysOf(selected?.makeupWorkdays),
      registeredYears: years,
    };
  } catch (error) {
    /* A missing or malformed calendar must not break the composer: the browser
       half falls back to weekday-only arithmetic. */
    return { scheduleYear: undefined, holidays: [], makeupWorkdays: [], registeredYears: [], error: String(error) };
  }
}

/**
 * Run the plugin on the Host.
 *
 * The browser half does the rendering. This half only reports the calendar it
 * reads, because the calendar is the one input a user maintains by hand and a
 * silent fallback would be hard to notice.
 *
 * Reporting is best-effort: a logger shape this runtime does not offer must
 * never make the plugin's Host half fail to mount.
 * @param ctx - the Host plugin context.
 * @param config - optional `{ scheduleYear }` override.
 */
export function apply(ctx, config) {
  const year = typeof config?.scheduleYear === "number" ? config.scheduleYear : new Date().getUTCFullYear();
  const calendar = loadCalendar(year);
  const report = (level, args) => {
    try {
      const logger = ctx?.logger;
      const scoped = typeof logger === "function" ? logger("peak-pricing-status") : logger;
      if (typeof scoped?.[level] === "function") scoped[level](...args);
    } catch (error) {
      /* Best-effort diagnostics only. */
    }
  };
  if (calendar.error !== undefined) {
    report("warn", ["peak-calendar.json unreadable (%s); the indicator falls back to weekdays only", calendar.error]);
    return;
  }
  if (!calendar.registeredYears.includes(String(year))) {
    report("warn", [
      "no %d schedule in peak-calendar.json (registered: %s); %d falls back to weekdays only",
      year,
      calendar.registeredYears.join(", ") || "none",
      year,
    ]);
    return;
  }
  report("info", [
    "calendar %d: %d holiday days, %d make-up workdays",
    calendar.scheduleYear,
    calendar.holidays.length,
    calendar.makeupWorkdays.length,
  ]);
}
