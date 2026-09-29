/**
 * Cross-check the browser half's phase arithmetic against the tested module.
 *
 * `lib/client.js` is a self-contained classic script (the module system serves
 * it straight to the page), so it cannot import `lib/peak-window.js`; the
 * arithmetic is transcribed there. This test loads the bundle under a stub
 * `window.__ModuleLoader__`, then asserts that both implementations agree on
 * every case in the table below — so a drift between the twins fails here.
 *
 * Run: node lib/client.test.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { normalizeCalendar, phaseAt, resolvePhase } from "./peak-window.js";

/** Captured bundle registration, filled by the stub loader below. */
let registration;

/** Minimal loader stub: capture what the bundle registers, load nothing else. */
globalThis.window = {
  __ModuleLoader__: {
    load(value) {
      registration = value;
    },
  },
};

/** The bundle needs nothing but `require` at factory time. */
const bundle = await import("./client.js").catch(() => undefined);
if (registration === undefined) {
  /* Importing a bare script in Node executes it, which is the point. */
  assert.fail(`client.js did not register with window.__ModuleLoader__ (${bundle === undefined ? "import failed" : "no load call"})`);
}

assert.equal(registration.id, "dsh-plugin-peak-pricing-status", "bundle id matches the loader row");

const module = registration.factory((specifier) => {
  throw new Error(`client bundle required ${specifier} at factory time`);
});
assert.equal(typeof module.apply, "function", "the bundle exports an apply");
assert.equal(module.name, "dsh-plugin-peak-pricing-status", "the exported name matches the row");

const { scheduleOf, isPeak, resolve, countdownText, siblingUrl } = module.internals;
const calendar = JSON.parse(readFileSync(new URL("../peak-calendar.json", import.meta.url), "utf8"));
const model = { schedules: {} };
for (const [year, entry] of Object.entries(calendar.schedules)) model.schedules[year] = scheduleOf(entry);
assert.ok(Object.keys(model.schedules).length > 0, "the calendar file carried at least one year");

/**
 * Build the epoch instant of a Beijing wall-clock reading.
 * @param iso - Beijing date, `YYYY-MM-DD`.
 * @param clock - Beijing time, `HH:MM`.
 * @returns the instant in epoch milliseconds.
 */
function beijing(iso, clock) {
  return Date.parse(`${iso}T${clock}:00+08:00`);
}

const normalized = normalizeCalendar(calendar.schedules["2026"]);

/** Instants, including every boundary the price rule turns on. */
const instants = [];
for (const iso of ["2026-01-01", "2026-01-04", "2026-02-14", "2026-02-15", "2026-02-28", "2026-04-04", "2026-05-01", "2026-06-19", "2026-07-03", "2026-07-04", "2026-09-20", "2026-09-25", "2026-09-26", "2026-09-28", "2026-10-01", "2026-10-07", "2026-10-08", "2026-10-10", "2026-12-31"]) {
  for (const clock of ["00:00", "08:59", "09:00", "11:59", "12:00", "13:59", "14:00", "17:59", "18:00", "23:59"]) {
    instants.push([iso, clock, beijing(iso, clock)]);
  }
}

for (const [iso, clock, at] of instants) {
  const expected = phaseAt(at, normalized) === "peak";
  assert.equal(isPeak(at, model), expected, `${iso} ${clock} peak phase`);

  const browserSide = resolve(at, model);
  const moduleSide = resolvePhase(at, calendar.schedules["2026"]);
  assert.equal(browserSide.peak, expected, `${iso} ${clock} resolve peak`);
  assert.equal(browserSide.countdown, moduleSide.countdownText, `${iso} ${clock} countdown copy`);
  assert.equal(browserSide.transition, moduleSide.transition, `${iso} ${clock} next transition instant`);
}

/* Copy checks. */
assert.equal(countdownText(0), "0分钟后", "zero");
assert.equal(countdownText(59_000), "1分钟后", "seconds round up");
assert.equal(countdownText(26 * 60 * 60_000), "1天2小时后", "days and hours");
assert.equal(resolve(beijing("2026-09-30", "01:55"), model).title, "空闲时段", "an early-morning weekday reads idle");
assert.equal(resolve(beijing("2026-09-30", "10:30"), model).title, "高峰时段", "a mid-morning weekday reads peak");
assert.equal(resolve(beijing("2026-10-01", "10:30"), model).title, "空闲时段", "a National Day mid-morning reads idle");

/* An unregistered year must still behave: weekends idle, weekdays peak. */
const future = { schedules: {} };
assert.equal(isPeak(beijing("2030-07-06", "10:30"), future), false, "2030-07-06 Saturday idle without a schedule");
assert.equal(isPeak(beijing("2030-07-08", "10:30"), future), true, "2030-07-08 Monday peak without a schedule");

/* The calendar sits beside the bundle, whose URL is a batch combo URL with a rev. */
const origin = "http://127.0.0.1:19387/";
assert.equal(
  siblingUrl("/plugins/??a/client.js,b/client.js&rev=abc123", "peak-calendar.json", origin),
  "/plugins/dsh-plugin-peak-pricing-status/peak-calendar.json",
  "a batch combo URL falls back to the conventional package path without forwarding its query",
);
assert.equal(
  siblingUrl("/plugins/??dsh-plugin-peak-pricing-status/client.js&rev=abc123", "peak-calendar.json", origin),
  "/plugins/dsh-plugin-peak-pricing-status/peak-calendar.json?rev=abc123",
  "a single-resource combo URL keeps its rev",
);
assert.equal(
  siblingUrl(`${origin}plugins/dsh-plugin-peak-pricing-status/client.js?rev=9`, "peak-calendar.json", origin),
  "/plugins/dsh-plugin-peak-pricing-status/peak-calendar.json?rev=9",
  "an absolute bundle URL",
);
assert.equal(
  siblingUrl(undefined, "peak-calendar.json", origin),
  "/plugins/dsh-plugin-peak-pricing-status/peak-calendar.json",
  "an unreadable script URL falls back to the conventional path",
);

console.log(`client bundle: twin arithmetic agrees on ${instants.length} instants + copy`);
