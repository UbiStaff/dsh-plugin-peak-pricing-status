/**
 * Phase-arithmetic checks for the peak/off-peak indicator. Injectable instants
 * are the point: 09:30 and a holiday date cannot be waited for in real time.
 *
 * Run: node lib/peak-window.test.js
 */
import assert from "node:assert/strict";

import {
  IDLE,
  PEAK,
  beijingClock,
  beijingDateKey,
  formatCountdown,
  nextTransition,
  normalizeCalendar,
  phaseAt,
  resolvePhase,
} from "./peak-window.js";

/** Official 2026 schedule: State Council notice 国办发明电〔2025〕7号. */
const CALENDAR = {
  holidays: [
    "2026-01-01", "2026-01-02", "2026-01-03",
    "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19",
    "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23",
    "2026-04-04", "2026-04-05", "2026-04-06",
    "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
    "2026-06-19", "2026-06-20", "2026-06-21",
    "2026-09-25", "2026-09-26", "2026-09-27",
    "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05",
    "2026-10-06", "2026-10-07",
  ],
  makeupWorkdays: ["2026-01-04", "2026-02-14", "2026-02-28", "2026-05-09", "2026-09-20", "2026-10-10"],
};

/**
 * Build the epoch instant of a Beijing wall-clock reading.
 * @param iso - Beijing date, `YYYY-MM-DD`.
 * @param clock - Beijing time, `HH:MM`.
 * @returns the instant in epoch milliseconds.
 */
function beijing(iso, clock) {
  return Date.parse(`${iso}T${clock}:00+08:00`);
}

const normalized = normalizeCalendar(CALENDAR);

/** One phase expectation, including its rationale. */
const cases = [
  // Ordinary weekdays around the four daily boundaries.
  ["2026-09-30", "00:00", IDLE, "周三凌晨，空闲"],
  ["2026-09-30", "08:59", IDLE, "高峰前一分钟"],
  ["2026-09-30", "09:00", PEAK, "上午高峰开始"],
  ["2026-09-30", "11:59", PEAK, "上午高峰最后一分钟"],
  ["2026-09-30", "12:00", IDLE, "午间空闲开始"],
  ["2026-09-30", "13:59", IDLE, "下午高峰前一分钟"],
  ["2026-09-30", "14:00", PEAK, "下午高峰开始"],
  ["2026-09-30", "17:59", PEAK, "下午高峰最后一分钟"],
  ["2026-09-30", "18:00", IDLE, "下午高峰结束"],
  ["2026-09-30", "23:59", IDLE, "深夜空闲"],
  // Weekends.
  ["2026-09-26", "10:00", IDLE, "周六上午，空闲"],
  ["2026-09-27", "15:00", IDLE, "周日下午，空闲"],
  // Statutory holidays.
  ["2026-10-01", "10:00", IDLE, "国庆节全天，空闲"],
  ["2026-10-07", "15:00", IDLE, "国庆假期最后一天，空闲"],
  ["2026-02-17", "10:00", IDLE, "春节假期，空闲"],
  ["2026-06-19", "10:00", IDLE, "端午节，空闲"],
  // Make-up workdays: a weekend that bills at peak rates.
  ["2026-10-10", "10:00", PEAK, "国庆调休周六上班，高峰"],
  ["2026-09-20", "10:00", PEAK, "调休周日上班，高峰"],
  ["2026-02-14", "15:00", PEAK, "春节调休周六上班，高峰"],
  ["2026-02-28", "09:30", PEAK, "春节调休周六上班，高峰"],
  // A make-up workday still keeps its off-peak hours.
  ["2026-10-10", "12:30", IDLE, "调休周六午间，空闲"],
];

for (const [iso, clock, expected, why] of cases) {
  const at = beijing(iso, clock);
  assert.equal(beijingDateKey(at), iso, `${iso} date key`);
  assert.equal(beijingClock(at), clock, `${iso} ${clock} clock`);
  assert.equal(phaseAt(at, normalized), expected, `${iso} ${clock} ${why}`);
}

/* The very instant a holiday begins is idle, even when it starts on a workday. */
assert.equal(phaseAt(beijing("2026-10-01", "09:30"), normalized), IDLE, "holiday peak window is idle");
assert.equal(phaseAt(beijing("2026-10-09", "09:30"), normalized), PEAK, "Friday after the holiday is peak");
assert.equal(phaseAt(beijing("2026-10-12", "09:30"), normalized), PEAK, "Monday after the make-up Saturday is peak");

/* Transitions: the countdown target must be the next instant of a different phase. */
const lunch = nextTransition(beijing("2026-09-30", "10:30"), normalized);
assert.equal(beijingClock(lunch), "12:00", "10:30 peak ends at lunch");
assert.equal(phaseAt(lunch, normalized), IDLE, "phase differs at the transition");

const afternoon = nextTransition(beijing("2026-09-30", "12:30"), normalized);
assert.equal(beijingClock(afternoon), "14:00", "12:30 idle ends at the afternoon window");

const nextMorning = nextTransition(beijing("2026-09-30", "18:30"), normalized);
assert.equal(beijingDateKey(nextMorning), "2026-10-08", "18:30 on 09-30 skips the National Day holiday to 10-08");
assert.equal(beijingClock(nextMorning), "09:00", "the next peak begins at 09:00");

const afterHoliday = nextTransition(beijing("2026-10-05", "10:00"), normalized);
assert.equal(beijingDateKey(afterHoliday), "2026-10-08", "mid-holiday idle runs to the first workday");
assert.equal(beijingClock(afterHoliday), "09:00", "holiday idle ends at the morning window");

const weekendEnd = nextTransition(beijing("2026-09-26", "10:00"), normalized);
assert.equal(beijingDateKey(weekendEnd), "2026-09-28", "Saturday idle runs to Monday");
assert.equal(beijingClock(weekendEnd), "09:00", "Monday idle ends at the morning window");

/* 09-25 is the Mid-Autumn holiday itself, so its evening idle runs to Monday 09-28. */
const festivalFridayEvening = nextTransition(beijing("2026-09-25", "19:00"), normalized);
assert.equal(beijingDateKey(festivalFridayEvening), "2026-09-28", "a holiday Friday evening runs through the holiday weekend");
assert.equal(beijingClock(festivalFridayEvening), "09:00", "and ends at Monday's morning window");

/* July carries no schedule, so this is the plain weekday/weekend cadence. */
const ordinaryFridayEvening = nextTransition(beijing("2026-07-03", "19:00"), normalized);
assert.equal(beijingDateKey(ordinaryFridayEvening), "2026-07-06", "an ordinary Friday evening runs through the weekend");
assert.equal(beijingClock(ordinaryFridayEvening), "09:00", "and ends at Monday's morning window");

/* resolvePhase carries the copy the tooltip renders. */
const idleNow = resolvePhase(beijing("2026-09-30", "01:55"), CALENDAR);
assert.equal(idleNow.phase, IDLE, "01:55 on a Wednesday is idle");
assert.equal(idleNow.peak, false, "idle flag");
assert.equal(idleNow.countdownText, "7小时5分钟后", "countdown to the 09:00 window");
assert.equal(idleNow.idleReason, undefined, "an ordinary weekday has no idle-day reason");

/* July carries no schedule, so idleness there comes from the weekend itself. */
const weekendNow = resolvePhase(beijing("2026-07-04", "10:00"), CALENDAR);
assert.equal(weekendNow.phase, IDLE, "a plain Saturday is idle");
assert.equal(weekendNow.idleReason, "weekend", "weekend reason");

/* 09-26 is both a Saturday and a Mid-Autumn holiday: the holiday wins the copy. */
const holidaySaturday = resolvePhase(beijing("2026-09-26", "10:00"), CALENDAR);
assert.equal(holidaySaturday.idleReason, "holiday", "a holiday weekend reports the holiday");

const holidayNow = resolvePhase(beijing("2026-10-02", "10:00"), CALENDAR);
assert.equal(holidayNow.idleReason, "holiday", "holiday reason");

const peakNow = resolvePhase(beijing("2026-09-30", "10:30"), CALENDAR);
assert.equal(peakNow.peak, true, "peak flag");
assert.equal(peakNow.countdownText, "1小时30分钟后", "countdown to lunch");

/* Countdown copy. */
assert.equal(formatCountdown(0), "0分钟后", "zero");
assert.equal(formatCountdown(59_000), "1分钟后", "seconds round up to a minute");
assert.equal(formatCountdown(3 * 60 * 60_000), "3小时后", "whole hours");
assert.equal(formatCountdown(26 * 60 * 60_000), "1天2小时后", "days and hours");

/* A malformed date table must not shift the phase. */
assert.equal(phaseAt(beijing("2026-09-30", "10:00"), normalizeCalendar({ holidays: ["nonsense", null, 7] })), PEAK, "junk entries are ignored");
assert.equal(phaseAt(beijing("2026-09-30", "10:00"), normalizeCalendar({})), PEAK, "an empty calendar keeps weekdays at peak");

/* The maintained file stores annotated rows, so those must normalize too: a
   string-only reader silently dropped all 33 holiday days once. */
assert.equal(phaseAt(beijing("2026-10-01", "10:00"), normalizeCalendar({ holidays: [{ date: "2026-10-01", note: "国庆" }] })), IDLE, "annotated holiday rows count");
assert.equal(phaseAt(beijing("2026-10-10", "10:00"), normalizeCalendar({ makeupWorkdays: [{ date: "2026-10-10", note: "调休" }] })), PEAK, "annotated make-up rows count");

console.log(`peak-window: ${cases.length} phase cases + transitions + copy passed`);
