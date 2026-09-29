/**
 * DeepSeek peak/off-peak pricing window arithmetic, in Beijing time.
 *
 * Official rule (https://api-docs.deepseek.com/zh-cn/quick_start/pricing/):
 * idle-period prices are half of peak-period prices; peak hours are Beijing
 * time Monday to Friday 09:00-12:00 and 14:00-18:00, excluding Chinese
 * statutory holidays. Every other moment — including weekends and holidays —
 * is an idle period.
 *
 * This module is pure: every entry point takes the instant to evaluate, so the
 * caller owns "now" and tests can inject any instant they like.
 */

/** One peak window inside a Beijing-time day. */
const PEAK_WINDOWS = [
  { start: 9 * 60, end: 12 * 60 },
  { start: 14 * 60, end: 18 * 60 },
];

const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

/** Beijing has been a fixed UTC+8 offset since 1991, so no time-zone database is needed. */
const BEIJING_OFFSET_MS = 8 * 60 * MINUTE_MS;

const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** The phase of the calendar: `peak` costs full price, `idle` costs half. */
export const PEAK = "peak";
export const IDLE = "idle";

/**
 * Anchor used to derive weekday numbers from a Beijing day count. 1970-01-01
 * (day 0) was a Thursday, so day 0 maps to weekday 4.
 */
const EPOCH_WEEKDAY = 4;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Shift an instant onto the Beijing-time wall clock, expressed as a UTC
 * timestamp. Reading the UTC fields of the result yields Beijing fields.
 * @param timestamp - instant to shift, in epoch milliseconds.
 * @returns the shifted instant.
 */
function toBeijingWallClock(timestamp) {
  return new Date(timestamp + BEIJING_OFFSET_MS);
}

/**
 * Epoch instant of Beijing midnight on a Beijing day number.
 * @param dayNumber - Beijing day number.
 * @returns the real epoch timestamp, offset back from the Beijing wall clock.
 */
function midnightOfDay(dayNumber) {
  return dayNumber * DAY_MINUTES * MINUTE_MS - BEIJING_OFFSET_MS;
}

/**
 * Whole days elapsed in Beijing since 1970-01-01 for an instant.
 * @param timestamp - instant to inspect, in epoch milliseconds.
 * @returns the Beijing day number.
 */
function beijingDayNumber(timestamp) {
  return Math.floor((timestamp + BEIJING_OFFSET_MS) / (DAY_MINUTES * MINUTE_MS));
}

/**
 * Minutes elapsed inside the Beijing day for an instant.
 * @param timestamp - instant to inspect, in epoch milliseconds.
 * @returns minutes since Beijing midnight, in `[0, 1440)`.
 */
function beijingMinuteOfDay(timestamp) {
  const shifted = toBeijingWallClock(timestamp);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/**
 * Weekday of a Beijing day number.
 * @param dayNumber - Beijing day number.
 * @returns `0` for Sunday through `6` for Saturday.
 */
function weekdayOfDayNumber(dayNumber) {
  return (((dayNumber + EPOCH_WEEKDAY) % 7) + 7) % 7;
}

/**
 * Render an instant as a `YYYY-MM-DD` Beijing calendar date.
 * @param timestamp - instant to render, in epoch milliseconds.
 * @returns the Beijing date key.
 */
export function beijingDateKey(timestamp) {
  const shifted = toBeijingWallClock(timestamp);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Render an instant as a Beijing `HH:MM` clock reading.
 * @param timestamp - instant to render, in epoch milliseconds.
 * @returns the Beijing time of day.
 */
export function beijingClock(timestamp) {
  const shifted = toBeijingWallClock(timestamp);
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Render an instant as `MM-DD 周X`, for tooltip copy.
 * @param timestamp - instant to render, in epoch milliseconds.
 * @returns the Beijing date label.
 */
export function beijingDayLabel(timestamp) {
  const shifted = toBeijingWallClock(timestamp);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${month}-${day} ${weekdayNames(weekdayOfDayNumber(beijingDayNumber(timestamp)))}`;
}

/**
 * Chinese weekday name for a weekday number.
 * @param weekday - `0` (Sunday) through `6` (Saturday).
 * @returns the weekday name.
 */
function weekdayNames(weekday) {
  return WEEKDAY_NAMES[weekday] ?? "";
}

/**
 * Normalize the user-maintained holiday tables into lookup sets.
 * @param calendar - holiday and make-up-workday tables, either one optional.
 * @returns date-key sets; malformed or blank entries are dropped.
 */
export function normalizeCalendar(calendar) {
  return {
    holidays: toDateKeySet(calendar?.holidays),
    makeupWorkdays: toDateKeySet(calendar?.makeupWorkdays),
  };
}

/**
 * Build a set of `YYYY-MM-DD` keys, ignoring anything that is not one.
 *
 * Entries may be bare keys or the annotated `{ date, note }` rows the calendar
 * file uses, because the annotation is the point of that file.
 * @param values - candidate date keys or annotated rows.
 * @returns the accepted keys.
 */
function toDateKeySet(values) {
  const set = new Set();
  if (!Array.isArray(values)) return set;
  for (const value of values) {
    const candidate = typeof value === "string" ? value : value?.date;
    if (typeof candidate !== "string") continue;
    const key = candidate.trim();
    if (DAY_PATTERN.test(key)) set.add(key);
  }
  return set;
}

/**
 * Why a Beijing day is idle, for tooltip copy.
 * @param dayNumber - Beijing day number.
 * @param calendar - normalized calendar.
 * @returns the idle reason, or `undefined` when the day is an ordinary weekday.
 */
export function idleDayReason(dayNumber, calendar) {
  const key = dateKeyOfDayNumber(dayNumber);
  if (calendar.holidays.has(key)) return "holiday";
  const weekday = weekdayOfDayNumber(dayNumber);
  if (weekday === 0 || weekday === 6) return "weekend";
  return undefined;
}

/**
 * Whether a Beijing day bills at peak rates inside its peak windows.
 * @param dayNumber - Beijing day number.
 * @param calendar - normalized calendar.
 * @returns `true` when 09:00-12:00 and 14:00-18:00 bill at peak rates.
 */
export function isPeakDay(dayNumber, calendar) {
  if (calendar.makeupWorkdays.has(dateKeyOfDayNumber(dayNumber))) return true;
  return idleDayReason(dayNumber, calendar) === undefined;
}

/**
 * Render a Beijing day number as its `YYYY-MM-DD` key.
 *
 * The day number is a Beijing-wall-clock quantity, so the conversion must not
 * re-apply the offset: `new Date(dayNumber * DAY_MINUTES * MINUTE_MS)` would
 * land eight hours earlier, i.e. on the previous calendar day for the first
 * eight hours of any Beijing day — which silently shifted holiday lookups.
 * @param dayNumber - Beijing day number.
 * @returns the date key.
 */
function dateKeyOfDayNumber(dayNumber) {
  return new Date(dayNumber * DAY_MINUTES * MINUTE_MS).toISOString().slice(0, 10);
}

/**
 * Epoch instant of Beijing midnight on a day number.
 * @param dayNumber - Beijing day number.
 * @returns the instant, offset back from the Beijing wall clock.
 */
function startOfDay(dayNumber) {
  return midnightOfDay(dayNumber);
}

/**
 * Whether an instant bills at peak rates.
 * @param timestamp - instant to classify, in epoch milliseconds.
 * @param calendar - holiday table, already normalized by {@link normalizeCalendar}.
 * @returns `true` for a peak instant, `false` for an idle instant.
 */
export function phaseAt(timestamp, calendar) {
  const dayNumber = beijingDayNumber(timestamp);
  if (!isPeakDay(dayNumber, calendar)) return IDLE;
  const minute = beijingMinuteOfDay(timestamp);
  for (const window of PEAK_WINDOWS) {
    if (minute >= window.start && minute < window.end) return PEAK;
  }
  return IDLE;
}

/**
 * List the peak-window boundaries of one Beijing day, as epoch timestamps.
 * @param dayNumber - Beijing day number.
 * @returns boundary instants in ascending order.
 */
function boundariesOfDay(dayNumber) {
  const midnight = startOfDay(dayNumber);
  const offsets = [];
  for (const window of PEAK_WINDOWS) {
    offsets.push(window.start, window.end);
  }
  return offsets.map((minutes) => midnight + minutes * MINUTE_MS);
}

/**
 * Find the next instant at which the phase differs from the current one.
 * @param timestamp - instant to search from, in epoch milliseconds.
 * @param calendar - normalized calendar.
 * @returns the transition instant, so callers can render a countdown.
 */
export function nextTransition(timestamp, calendar) {
  const current = phaseAt(timestamp, calendar);
  const candidates = [];
  const dayNumber = beijingDayNumber(timestamp);
  /* A weekend or holiday run can be many days long, so scan far enough ahead. */
  for (let offset = 0; offset <= 16; offset += 1) {
    for (const boundary of boundariesOfDay(dayNumber + offset)) {
      if (boundary > timestamp) candidates.push(boundary);
    }
  }
  candidates.sort((left, right) => left - right);
  for (const candidate of candidates) {
    if (phaseAt(candidate, calendar) !== current) return candidate;
  }
  /* Unreachable while PEAK_WINDOWS is non-empty; kept so the return type is total. */
  return midnightOfDay(dayNumber + 1);
}

/**
 * Resolve everything the indicator needs for one instant.
 * @param timestamp - instant to resolve, in epoch milliseconds.
 * @param calendarInput - raw holiday and make-up-workday tables.
 * @returns the phase, its copy, and the next transition plus a countdown.
 */
export function resolvePhase(timestamp, calendarInput) {
  const calendar = normalizeCalendar(calendarInput);
  const phase = phaseAt(timestamp, calendar);
  const transition = nextTransition(timestamp, calendar);
  return {
    phase,
    peak: phase === PEAK,
    dayNumber: beijingDayNumber(timestamp),
    minuteOfDay: beijingMinuteOfDay(timestamp),
    transition,
    countdownMs: transition - timestamp,
    countdownText: formatCountdown(transition - timestamp),
    windowText: "周一至周五 09:00-12:00、14:00-18:00",
    idleReason: idleDayReason(beijingDayNumber(timestamp), calendar),
  };
}

/**
 * Render a duration as Chinese coarse copy, for the tooltip countdown.
 * @param durationMs - remaining milliseconds.
 * @returns copy such as `2小时15分钟后`.
 */
export function formatCountdown(durationMs) {
  const totalMinutes = Math.max(0, Math.ceil(durationMs / MINUTE_MS));
  const days = Math.floor(totalMinutes / DAY_MINUTES);
  const hours = Math.floor((totalMinutes % DAY_MINUTES) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}分钟`);
  return `${parts.join("")}后`;
}
