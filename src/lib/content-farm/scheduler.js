/**
 * Content Scheduler
 * 
 * Distributes captioned uploads across a posting calendar.
 * Enforces content pillar ratios, visual variety, and hook-strength-based timing.
 * Respects each business's active_days: scheduling only lands on active weekdays
 * and skips the rest (this is what the Settings "Active Days" control drives).
 * 
 * Path: src/lib/content-farm/scheduler.js
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Timezone helper ─────────────────────────────────────────────

function getTimezoneOffset(timeZone, date) {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const localStr = date.toLocaleString('en-US', { timeZone });
  return (new Date(utcStr) - new Date(localStr)) / 60000;
}

function localToUTC(dateStr, timeStr, timezone) {
  const local = new Date(`${dateStr}T${timeStr}:00`);
  const offset = getTimezoneOffset(timezone, local);
  local.setMinutes(local.getMinutes() + offset);
  return local;
}

// ── Active-day helpers ──────────────────────────────────────────

// Maps a Date's weekday to the short keys used by the Settings UI.
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function dayKeyFor(date, timezone) {
  // Get the weekday in the business's own timezone, not the server's.
  const wd = new Date(date.toLocaleString('en-US', { timeZone: timezone })).getDay();
  return DAY_KEYS[wd];
}

function isActiveDay(date, activeDays, timezone) {
  if (!activeDays || activeDays.length === 0) return true; // no restriction set
  return activeDays.includes(dayKeyFor(date, timezone));
}

// Advance from `date` by one calendar day until we land on an active day.
// Returns a new Date. Guards against an all-inactive config (returns the input
// so we never loop forever).
function nextActiveDay(date, activeDays, timezone, includeToday) {
  if (!activeDays || activeDays.length === 0) return new Date(date);
  const d = new Date(date);
  if (!includeToday) d.setDate(d.getDate() + 1);
  for (let guard = 0; guard < 14; guard++) {
    if (isActiveDay(d, activeDays, timezone)) return d;
    d.setDate(d.getDate() + 1);
  }
  return new Date(date); // all days inactive: fall back, do not hang
}

// ── Schedule a batch of uploads ─────────────────────────────────

export async function scheduleUploads(batchId, startDate = null) {
  // Get all captioned uploads in this batch
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
  const postsPerDay = business.posts_per_day || 3;
  const times = business.posting_times || ['10:00', '15:00', '19:00'];
  const timezone = business.timezone || 'America/New_York';
  const activeDays = business.active_days || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const totalDays = Math.ceil(uploads.length / postsPerDay);

  // Start date: tomorrow (or the specified date), then rolled forward to the
  // next active day so day one itself is never an inactive day.
  let start = startDate
    ? new Date(startDate)
    : new Date(new Date().toLocaleDateString('en-CA', { timeZone: timezone }) + 'T00:00:00');
  if (!startDate) start.setDate(start.getDate() + 1); // Default: start tomorrow
  start = nextActiveDay(start, activeDays, timezone, true); // include the start day if it's active

  // Bucket by content pillar
  const buckets = { educate: [], engage: [], inspire: [], promote: [] };
  uploads.forEach(u => {
    const pillar = u.content_pillar || 'educate';
    if (buckets[pillar]) buckets[pillar].push(u);
    else buckets.educate.push(u);
  });

  // Target ratios per day
  const pillarWeights = { educate: 0.4, engage: 0.3, inspire: 0.2, promote: 0.1 };

  const scheduled = [];
  let recentTypes = []; // Track last 3 content_types globally
  let recentPillars = []; // Track last 3 pillars globally for cross-day diversity

  // Walk active days only. `cursor` moves one active day at a time, so an
  // "every other day" or "Mon/Thu only" config posts on exactly those days.
  let cursor = new Date(start);

  for (let day = 0; day < totalDays; day++) {
    const currentDate = new Date(cursor);
    const dateStr = currentDate.toISOString().split('T')[0];

    const usedPillars = []; // Within-day (for multi-post days)
    const usedModes = [];

    for (let slot = 0; slot < postsPerDay; slot++) {
      // Combine within-day and global history for pillar selection
      const combinedPillarHistory = [...recentPillars.slice(-2), ...usedPillars];
      let pillar = pickPillar(pillarWeights, combinedPillarHistory, buckets);

      if (!pillar) {
        const fallbackPost = pickFromAnyBucket(buckets, usedModes, recentTypes);
        if (!fallbackPost) continue;
        scheduled.push(buildSlot(fallbackPost, dateStr, times[slot], timezone, day + 1, slot));
        usedPillars.push(fallbackPost.content_pillar);
        usedModes.push(fallbackPost.visual_mode);
        recentTypes = [...recentTypes.slice(-2), fallbackPost.content_type];
        recentPillars = [...recentPillars.slice(-2), fallbackPost.content_pillar];
        continue;
      }

      const post = pickPost(buckets[pillar], usedModes, recentTypes);
      if (!post) {
        const fallbackPost = pickFromAnyBucket(buckets, usedModes, recentTypes);
        if (!fallbackPost) continue;
        scheduled.push(buildSlot(fallbackPost, dateStr, times[slot], timezone, day + 1, slot));
        usedPillars.push(fallbackPost.content_pillar);
        usedModes.push(fallbackPost.visual_mode);
        recentTypes = [...recentTypes.slice(-2), fallbackPost.content_type];
        recentPillars = [...recentPillars.slice(-2), fallbackPost.content_pillar];
        continue;
      }

      scheduled.push(buildSlot(post, dateStr, times[slot], timezone, day + 1, slot));
      usedPillars.push(pillar);
      usedModes.push(post.visual_mode);
      recentTypes = [...recentTypes.slice(-2), post.content_type];
      recentPillars = [...recentPillars.slice(-2), pillar];
    }

    // Move the cursor to the next active day for the following batch-day.
    cursor = nextActiveDay(cursor, activeDays, timezone, false);
  }

  // Write schedule to database
  const updates = scheduled.map(s => ({
    id: s.uploadId,
    scheduled_for: s.scheduledFor,
    time_slot: s.timeSlot,
    day_number: s.dayNumber,
    status: 'scheduled',
    updated_at: new Date().toISOString(),
  }));

  for (const update of updates) {
    await supabase.from('cf_content_uploads')
      .update({
        scheduled_for: update.scheduled_for,
        time_slot: update.time_slot,
        day_number: update.day_number,
        status: update.status,
        updated_at: update.updated_at,
      })
      .eq('id', update.id);
  }

  const lastDate = scheduled.length
    ? scheduled[scheduled.length - 1].scheduledFor.split('T')[0]
    : start.toISOString().split('T')[0];

  return {
    scheduled: scheduled.length,
    totalDays,
    activeDays,
    startDate: start.toISOString().split('T')[0],
    endDate: lastDate,
    byPillar: {
      educate: scheduled.filter(s => s.pillar === 'educate').length,
      engage: scheduled.filter(s => s.pillar === 'engage').length,
      inspire: scheduled.filter(s => s.pillar === 'inspire').length,
      promote: scheduled.filter(s => s.pillar === 'promote').length,
    },
  };
}

// ── Helper: Pick pillar based on weights, avoiding repeats ──────

function pickPillar(weights, used, buckets) {
  // Sort pillars by how underrepresented they are
  const candidates = Object.entries(weights)
    .filter(([pillar]) => buckets[pillar]?.length > 0)
    .filter(([pillar]) => !used.includes(pillar) || used.length >= Object.keys(weights).length)
    .sort((a, b) => {
      const aUsed = used.filter(p => p === a[0]).length;
      const bUsed = used.filter(p => p === b[0]).length;
      const aRatio = aUsed / (a[1] * 100 || 1);
      const bRatio = bUsed / (b[1] * 100 || 1);
      return aRatio - bRatio;
    });

  return candidates[0]?.[0] || null;
}

// ── Helper: Pick post from bucket, avoiding visual mode AND content type repeats ──

function pickPost(bucket, usedModes, recentTypes = []) {
  if (!bucket?.length) return null;

  const lastMode = usedModes[usedModes.length - 1];
  const lastType = recentTypes[recentTypes.length - 1];

  // Best: different visual mode AND different content type
  const best = bucket.findIndex(p => p.visual_mode !== lastMode && p.content_type !== lastType);
  if (best >= 0) return bucket.splice(best, 1)[0];

  // Good: different content type (even if same mode)
  const diffType = bucket.findIndex(p => p.content_type !== lastType);
  if (diffType >= 0) return bucket.splice(diffType, 1)[0];

  // Okay: different visual mode (even if same type)
  const diffMode = bucket.findIndex(p => p.visual_mode !== lastMode);
  if (diffMode >= 0) return bucket.splice(diffMode, 1)[0];

  // Fallback: just take the first
  return bucket.shift();
}

// ── Helper: Pick from any bucket ────────────────────────────────

function pickFromAnyBucket(buckets, usedModes, recentTypes = []) {
  const lastType = recentTypes[recentTypes.length - 1];

  // First pass: find any post with a different content_type
  for (const pillar of ['educate', 'engage', 'inspire', 'promote']) {
    if (!buckets[pillar]?.length) continue;
    const idx = buckets[pillar].findIndex(p => p.content_type !== lastType);
    if (idx >= 0) return buckets[pillar].splice(idx, 1)[0];
  }

  // Second pass: just take anything
  for (const pillar of ['educate', 'engage', 'inspire', 'promote']) {
    if (buckets[pillar]?.length) return buckets[pillar].shift();
  }
  return null;
}

// ── Helper: Build schedule slot ─────────────────────────────────

function buildSlot(upload, dateStr, timeStr, timezone, dayNumber, slotIndex) {
  const scheduledFor = localToUTC(dateStr, timeStr, timezone);
  const hour = parseInt(timeStr.split(':')[0]);
  const timeSlot = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  return {
    uploadId: upload.id,
    pillar: upload.content_pillar,
    visualMode: upload.visual_mode,
    hookStrength: upload.hook_strength,
    scheduledFor: scheduledFor.toISOString(),
    timeSlot,
    dayNumber,
    slotIndex,
  };
}

// ── Approve all scheduled posts in a batch ──────────────────────

export async function approveBatch(batchId) {
  const { data, error } = await supabase
    .from('cf_content_uploads')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('batch_id', batchId)
    .eq('status', 'scheduled');

  return { approved: data?.length || 0, error: error?.message };
}

// ── Approve single post ─────────────────────────────────────────

export async function approvePost(uploadId) {
  const { error } = await supabase
    .from('cf_content_uploads')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', uploadId);

  return { success: !error, error: error?.message };
}