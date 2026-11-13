/**
 * Cadence
 *
 * The single source of truth for "when is a business allowed to post".
 * Pure functions only: no database, no Node APIs. The scheduler, the
 * publishing cron, the Settings API and the Settings screen (for its live
 * preview) all import this file, so they can never disagree.
 *
 * Every calculation is done on calendar dates (YYYY-MM-DD) in the business's
 * own timezone. Nothing depends on the timezone of the machine running it,
 * which matters because Vercel servers run in UTC. The old scheduler read the
 * weekday of a UTC-midnight date and got the previous day, so "Mon/Wed" was
 * really "Sun/Tue" in practice.
 *
 * Path: src/lib/content-farm/cadence.js
 */

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DEFAULT_TIMEZONE = 'America/New_York';
export const DEFAULT_TIMES = ['12:00'];
export const MAX_POSTS_PER_DAY = 6;

// ── Validation and normalisation ────────────────────────────────

export function normalizeTime(t) {
  if (typeof t !== 'string') return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function normalizeTimes(times) {
  const list = Array.isArray(times) ? times : [];
  const clean = [...new Set(list.map(normalizeTime).filter(Boolean))].sort();
  return clean.slice(0, MAX_POSTS_PER_DAY);
}

export function normalizeDays(days) {
  let list = days;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { list = []; }
  }
  if (!Array.isArray(list)) return [...WEEK_ORDER];
  const clean = WEEK_ORDER.filter(d => list.map(x => String(x).toLowerCase().slice(0, 3)).includes(d));
  return clean.length ? clean : [...WEEK_ORDER];
}

export function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/**
 * Turns a cf_businesses row into the cadence that is actually enforced.
 * posts per day is always the number of posting times. There is no separate
 * number that can drift out of sync with the list of times.
 */
export function normalizeCadence(business = {}) {
  const times = normalizeTimes(business.posting_times);
  const finalTimes = times.length ? times : [...DEFAULT_TIMES];
  return {
    times: finalTimes,
    postsPerDay: finalTimes.length,
    activeDays: normalizeDays(business.active_days),
    timezone: isValidTimezone(business.timezone) ? business.timezone : DEFAULT_TIMEZONE,
    publishing: business.auto_post === true,
  };
}

// ── Calendar date helpers (timezone independent) ────────────────

export function weekdayKey(dateStr) {
  // Noon UTC on that calendar date: the weekday can never slip.
  return DAY_KEYS[new Date(`${dateStr}T12:00:00Z`).getUTCDay()];
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromDateStr, toDateStr) {
  const a = new Date(`${fromDateStr}T12:00:00Z`).getTime();
  const b = new Date(`${toDateStr}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

// ── Timezone conversion ─────────────────────────────────────────

function zonedParts(ms, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const part of dtf.formatToParts(new Date(ms))) p[part.type] = part.value;
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second),
  };
}

// Minutes the zone is ahead of UTC at that instant (New York in winter: -300).
function zoneOffsetMinutes(ms, tz) {
  const p = zonedParts(ms, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / 60000);
}

/** "2026-11-16" + "09:00" in America/New_York -> Date for 14:00 UTC. */
export function localToUTC(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = zoneOffsetMinutes(guess, tz);
  let utc = guess - off1 * 60000;
  const off2 = zoneOffsetMinutes(utc, tz);
  if (off2 !== off1) utc = guess - off2 * 60000; // daylight saving boundary
  return new Date(utc);
}

/** Instant -> { date: 'YYYY-MM-DD', time: 'HH:MM', weekday: 'mon' } in tz. */
export function utcToLocal(value, tz) {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  const p = zonedParts(ms, tz);
  const date = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  const time = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  return { date, time, weekday: weekdayKey(date) };
}

export function todayLocal(tz, nowMs = Date.now()) {
  return utcToLocal(nowMs, tz).date;
}

export function timeSlotLabel(timeStr) {
  const h = Number(String(timeStr).split(':')[0]);
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

export function formatTime12(timeStr) {
  const [h, m] = String(timeStr).split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

// ── Slot generation ─────────────────────────────────────────────

/**
 * Produces the next `count` posting slots for a business.
 *
 * options
 *   fromMs      earliest instant a slot may land on (default: now + 2 min)
 *   usedPerDay  { 'YYYY-MM-DD': n } posts already published or claimed that
 *               local day. A day never gets more than postsPerDay in total,
 *               so a post that already went out today blocks the rest of
 *               today when the cadence is one a day.
 *   taken       Set of ISO strings already occupied (avoids exact collisions)
 *
 * Returns [{ iso, date, time, weekday }]
 */
export function generateSlots(business, count, options = {}) {
  const cad = normalizeCadence(business);
  const nowMs = options.nowMs ?? Date.now();
  const fromMs = options.fromMs ?? nowMs + 2 * 60000;
  const usedPerDay = { ...(options.usedPerDay || {}) };
  const taken = options.taken || new Set();
  const slots = [];
  if (!count || count <= 0) return slots;

  // Start the walk on the local date of fromMs, never earlier than today.
  let date = utcToLocal(fromMs, cad.timezone).date;
  const today = todayLocal(cad.timezone, nowMs);
  if (daysBetween(today, date) < 0) date = today;

  for (let guard = 0; guard < 2200 && slots.length < count; guard++) {
    if (cad.activeDays.includes(weekdayKey(date))) {
      for (const time of cad.times) {
        if (slots.length >= count) break;
        if ((usedPerDay[date] || 0) >= cad.postsPerDay) break;
        const at = localToUTC(date, time, cad.timezone);
        if (at.getTime() < fromMs) continue;
        const iso = at.toISOString();
        if (taken.has(iso)) continue;
        slots.push({ iso, date, time, weekday: weekdayKey(date) });
        usedPerDay[date] = (usedPerDay[date] || 0) + 1;
      }
    }
    date = addDays(date, 1);
  }
  return slots;
}

/** Plain-English summary, e.g. "1 post a day at 9:00 AM on Mon and Wed". */
export function describeCadence(business) {
  const cad = normalizeCadence(business);
  const times = cad.times.map(formatTime12);
  const timeText = times.length === 1 ? times[0] : `${times.slice(0, -1).join(', ')} and ${times[times.length - 1]}`;
  const labels = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  let dayText;
  if (cad.activeDays.length === 7) dayText = 'every day';
  else if (cad.activeDays.join() === 'mon,tue,wed,thu,fri') dayText = 'on weekdays';
  else if (cad.activeDays.join() === 'sat,sun') dayText = 'on weekends';
  else {
    const d = cad.activeDays.map(k => labels[k]);
    dayText = `on ${d.length === 1 ? d[0] : `${d.slice(0, -1).join(', ')} and ${d[d.length - 1]}`}`;
  }
  const perWeek = cad.postsPerDay * cad.activeDays.length;
  return {
    text: `${cad.postsPerDay} ${cad.postsPerDay === 1 ? 'post' : 'posts'} a day at ${timeText} ${dayText}`,
    perWeek,
  };
}
