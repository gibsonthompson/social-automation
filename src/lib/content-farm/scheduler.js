/**
 * Content Scheduler
 *
 * Two jobs:
 *   scheduleUploads(batchId)    Put a freshly captioned batch on the calendar,
 *                               AFTER whatever is already queued, using the
 *                               business's current cadence.
 *   rescheduleQueue(businessId) Re-flow every queued post (scheduled or
 *                               approved) onto the current cadence. Runs
 *                               whenever Settings are saved, so changing the
 *                               times or days in the UI changes what is
 *                               already on the calendar, not only future
 *                               uploads. The publishing cron also calls it
 *                               if it ever finds a post sitting on a slot the
 *                               cadence no longer allows.
 *
 * All date math lives in cadence.js and is timezone safe.
 *
 * Path: src/lib/content-farm/scheduler.js
 */

import { createClient } from '@supabase/supabase-js';
import {
  normalizeCadence, generateSlots, utcToLocal, todayLocal, daysBetween,
  timeSlotLabel, localToUTC,
} from './cadence';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const QUEUED_STATUSES = ['scheduled', 'approved'];
const IN_FLIGHT_STATUSES = ['posting', 'publishing_video'];

// ── Shared: how many posts each local day already "spent" ───────

async function usageForBusiness(business) {
  const cad = normalizeCadence(business);
  const today = todayLocal(cad.timezone);
  const startOfToday = localToUTC(today, '00:00', cad.timezone).toISOString();

  // Posts that went out today, plus posts mid-publish right now.
  const { data: spent } = await supabase
    .from('cf_content_uploads')
    .select('id, status, posted_at, scheduled_for')
    .eq('business_id', business.id)
    .or(`and(status.eq.posted,posted_at.gte.${startOfToday}),status.in.(${IN_FLIGHT_STATUSES.join(',')})`);

  const usedPerDay = {};
  for (const row of spent || []) {
    usedPerDay[today] = (usedPerDay[today] || 0) + 1;
  }
  return { cad, today, usedPerDay, spentToday: usedPerDay[today] || 0 };
}

function dayNumberFor(dateStr, today) {
  return Math.max(1, daysBetween(today, dateStr) + 1);
}

async function writeSlots(rows, slots, today, extra = {}) {
  let changed = 0;
  const now = new Date().toISOString();
  // Small batches in parallel keeps a 200-post re-flow well inside 60s.
  const jobs = rows.map((row, i) => async () => {
    const slot = slots[i];
    if (!slot) return;
    const update = {
      scheduled_for: slot.iso,
      time_slot: timeSlotLabel(slot.time),
      day_number: dayNumberFor(slot.date, today),
      updated_at: now,
      ...extra,
    };
    const same = row.scheduled_for && new Date(row.scheduled_for).toISOString() === slot.iso && !extra.status;
    if (same) return;
    const { error } = await supabase.from('cf_content_uploads').update(update).eq('id', row.id);
    if (!error) changed++;
    else console.error(`[SCHEDULER] update failed for ${row.id}: ${error.message}`);
  });
  for (let i = 0; i < jobs.length; i += 10) {
    await Promise.all(jobs.slice(i, i + 10).map(fn => fn()));
  }
  return changed;
}

// ── Re-flow the existing queue onto the current cadence ─────────

export async function rescheduleQueue(businessId) {
  const { data: business, error: bizErr } = await supabase
    .from('cf_businesses').select('*').eq('id', businessId).maybeSingle();
  if (bizErr || !business) return { rescheduled: 0, error: bizErr?.message || 'business not found' };

  const { data: queued, error } = await supabase
    .from('cf_content_uploads')
    .select('id, status, scheduled_for, created_at')
    .eq('business_id', businessId)
    .in('status', QUEUED_STATUSES)
    .order('scheduled_for', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(2000);

  if (error) return { rescheduled: 0, error: error.message };
  if (!queued?.length) return { rescheduled: 0, queued: 0, first: null, last: null };

  const { today, usedPerDay } = await usageForBusiness(business);
  const slots = generateSlots(business, queued.length, { usedPerDay });
  const changed = await writeSlots(queued, slots, today);

  return {
    rescheduled: changed,
    queued: queued.length,
    first: slots[0]?.iso || null,
    last: slots[slots.length - 1]?.iso || null,
  };
}

// ── Schedule a newly captioned batch ────────────────────────────

export async function scheduleUploads(batchId, startDate = null) {
  const { data: uploads, error } = await supabase
    .from('cf_content_uploads')
    .select('*, cf_businesses(*)')
    .eq('batch_id', batchId)
    .eq('status', 'captioned')
    .order('hook_strength', { ascending: false });

  if (error || !uploads?.length) {
    return { scheduled: 0, error: error?.message || 'No captioned uploads found' };
  }

  const business = uploads[0].cf_businesses;
  const cad = normalizeCadence(business);

  // 1. Decide the ORDER (pillar mix, visual and type variety). Unchanged
  //    from the original logic, just separated from the dates.
  const ordered = orderByPillarMix(uploads, cad.postsPerDay);

  // 2. Find where the existing queue ends so the batch goes after it.
  //    Before this fix a new batch always started "tomorrow", on top of
  //    the posts already queued, which doubled the posting rate.
  const { data: queued } = await supabase
    .from('cf_content_uploads')
    .select('scheduled_for')
    .eq('business_id', business.id)
    .in('status', QUEUED_STATUSES)
    .not('scheduled_for', 'is', null);

  const { today, usedPerDay } = await usageForBusiness(business);
  const taken = new Set();
  let lastQueuedMs = 0;
  for (const q of queued || []) {
    const iso = new Date(q.scheduled_for).toISOString();
    taken.add(iso);
    const local = utcToLocal(iso, cad.timezone).date;
    usedPerDay[local] = (usedPerDay[local] || 0) + 1;
    lastQueuedMs = Math.max(lastQueuedMs, new Date(iso).getTime());
  }

  let fromMs = Math.max(Date.now() + 2 * 60000, lastQueuedMs + 60000);
  if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    fromMs = Math.max(fromMs, localToUTC(startDate, '00:00', cad.timezone).getTime());
  }

  const slots = generateSlots(business, ordered.length, { fromMs, usedPerDay, taken });
  await writeSlots(ordered, slots, today, { status: 'scheduled' });

  const pillars = { educate: 0, engage: 0, inspire: 0, promote: 0 };
  ordered.forEach(u => { if (pillars[u.content_pillar] !== undefined) pillars[u.content_pillar]++; });

  return {
    scheduled: Math.min(ordered.length, slots.length),
    postsPerDay: cad.postsPerDay,
    times: cad.times,
    activeDays: cad.activeDays,
    startDate: slots[0]?.date || null,
    endDate: slots[slots.length - 1]?.date || null,
    byPillar: pillars,
  };
}

// ── Ordering: pillar ratios and variety ─────────────────────────

function orderByPillarMix(uploads, postsPerDay) {
  const buckets = { educate: [], engage: [], inspire: [], promote: [] };
  uploads.forEach(u => {
    const pillar = u.content_pillar || 'educate';
    (buckets[pillar] || buckets.educate).push(u);
  });
  const weights = { educate: 0.4, engage: 0.3, inspire: 0.2, promote: 0.1 };

  const out = [];
  let recentTypes = [];
  let recentPillars = [];
  let usedPillars = [];
  let usedModes = [];

  while (out.length < uploads.length) {
    if (out.length % Math.max(1, postsPerDay) === 0) { usedPillars = []; usedModes = []; }
    const history = [...recentPillars.slice(-2), ...usedPillars];
    const pillar = pickPillar(weights, history, buckets);
    let post = pillar ? pickPost(buckets[pillar], usedModes, recentTypes) : null;
    if (!post) post = pickFromAnyBucket(buckets, usedModes, recentTypes);
    if (!post) break;
    out.push(post);
    usedPillars.push(post.content_pillar);
    usedModes.push(post.visual_mode);
    recentTypes = [...recentTypes.slice(-2), post.content_type];
    recentPillars = [...recentPillars.slice(-2), post.content_pillar];
  }
  return out;
}

function pickPillar(weights, used, buckets) {
  const candidates = Object.entries(weights)
    .filter(([pillar]) => buckets[pillar]?.length > 0)
    .filter(([pillar]) => !used.includes(pillar) || used.length >= Object.keys(weights).length)
    .sort((a, b) => {
      const aRatio = used.filter(p => p === a[0]).length / (a[1] * 100 || 1);
      const bRatio = used.filter(p => p === b[0]).length / (b[1] * 100 || 1);
      return aRatio - bRatio;
    });
  return candidates[0]?.[0] || null;
}

function pickPost(bucket, usedModes, recentTypes = []) {
  if (!bucket?.length) return null;
  const lastMode = usedModes[usedModes.length - 1];
  const lastType = recentTypes[recentTypes.length - 1];
  const best = bucket.findIndex(p => p.visual_mode !== lastMode && p.content_type !== lastType);
  if (best >= 0) return bucket.splice(best, 1)[0];
  const diffType = bucket.findIndex(p => p.content_type !== lastType);
  if (diffType >= 0) return bucket.splice(diffType, 1)[0];
  const diffMode = bucket.findIndex(p => p.visual_mode !== lastMode);
  if (diffMode >= 0) return bucket.splice(diffMode, 1)[0];
  return bucket.shift();
}

function pickFromAnyBucket(buckets, usedModes, recentTypes = []) {
  const lastType = recentTypes[recentTypes.length - 1];
  for (const pillar of ['educate', 'engage', 'inspire', 'promote']) {
    if (!buckets[pillar]?.length) continue;
    const idx = buckets[pillar].findIndex(p => p.content_type !== lastType);
    if (idx >= 0) return buckets[pillar].splice(idx, 1)[0];
  }
  for (const pillar of ['educate', 'engage', 'inspire', 'promote']) {
    if (buckets[pillar]?.length) return buckets[pillar].shift();
  }
  return null;
}

// ── Approvals ───────────────────────────────────────────────────

export async function approveBatch(batchId) {
  const { data, error } = await supabase
    .from('cf_content_uploads')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('batch_id', batchId)
    .eq('status', 'scheduled')
    .select('id');
  return { approved: data?.length || 0, error: error?.message };
}

export async function approvePost(uploadId) {
  const { error } = await supabase
    .from('cf_content_uploads')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', uploadId);
  return { success: !error, error: error?.message };
}
