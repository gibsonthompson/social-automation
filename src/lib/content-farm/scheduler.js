/**
 * Content Scheduler
 * 
 * Distributes captioned uploads across a posting calendar.
 * Enforces content pillar ratios, visual variety, and hook-strength-based timing.
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
  const totalDays = Math.ceil(uploads.length / postsPerDay);

  // Start date: tomorrow or specified
  const start = startDate
    ? new Date(startDate)
    : new Date(new Date().toLocaleDateString('en-CA', { timeZone: timezone }) + 'T00:00:00');
  if (!startDate) start.setDate(start.getDate() + 1); // Default: start tomorrow

  // Bucket by content pillar
  const buckets = { educate: [], engage: [], inspire: [], promote: [] };
  uploads.forEach(u => {
    const pillar = u.content_pillar || 'educate';
    if (buckets[pillar]) buckets[pillar].push(u);
    else buckets.educate.push(u);
  });

  // Target ratios per day
  const pillarOrder = ['educate', 'engage', 'inspire', 'promote'];
  const pillarWeights = { educate: 0.4, engage: 0.3, inspire: 0.2, promote: 0.1 };

  const scheduled = [];

  for (let day = 0; day < totalDays; day++) {
    const currentDate = new Date(start);
    currentDate.setDate(currentDate.getDate() + day);
    const dateStr = currentDate.toISOString().split('T')[0];

    const usedPillars = [];
    const usedModes = [];

    for (let slot = 0; slot < postsPerDay; slot++) {
      // Pick the best pillar for this slot
      const pillar = pickPillar(pillarWeights, usedPillars, buckets);
      if (!pillar) continue;

      // Pick the best post from that bucket (avoid same visual mode as previous)
      const post = pickPost(buckets[pillar], usedModes);
      if (!post) {
        // Try any bucket with content
        const fallbackPost = pickFromAnyBucket(buckets, usedModes);
        if (!fallbackPost) continue;
        scheduled.push(buildSlot(fallbackPost, dateStr, times[slot], timezone, day + 1, slot));
        usedPillars.push(fallbackPost.content_pillar);
        usedModes.push(fallbackPost.visual_mode);
        continue;
      }

      scheduled.push(buildSlot(post, dateStr, times[slot], timezone, day + 1, slot));
      usedPillars.push(pillar);
      usedModes.push(post.visual_mode);
    }
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

  return {
    scheduled: scheduled.length,
    totalDays,
    startDate: start.toISOString().split('T')[0],
    endDate: new Date(start.getTime() + (totalDays - 1) * 86400000).toISOString().split('T')[0],
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

// ── Helper: Pick post from bucket, avoiding visual mode repeat ──

function pickPost(bucket, usedModes) {
  if (!bucket?.length) return null;

  const lastMode = usedModes[usedModes.length - 1];

  // Prefer different visual mode than previous
  const differentMode = bucket.findIndex(p => p.visual_mode !== lastMode);
  if (differentMode >= 0) return bucket.splice(differentMode, 1)[0];

  // Otherwise just take the first (highest hook strength)
  return bucket.shift();
}

// ── Helper: Pick from any bucket ────────────────────────────────

function pickFromAnyBucket(buckets, usedModes) {
  for (const pillar of ['educate', 'engage', 'inspire', 'promote']) {
    const post = pickPost(buckets[pillar], usedModes);
    if (post) return post;
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