/**
 * Businesses API
 *
 * GET  /api/businesses
 *   Every business plus live queue stats (queued, next post, last post,
 *   posted today) so the sidebar and Overview can show real status.
 *
 * POST /api/businesses
 *   { business_id, posting_times, active_days, auto_post, timezone,
 *     publish_to, apply_to_queue = true }
 *   Validates, saves, READS THE ROW BACK, and (by default) re-flows every
 *   queued post onto the new cadence so the change takes effect on posts
 *   that are already scheduled.
 *
 * WHY SETTINGS SEEMED NOT TO STICK BEFORE
 *   Saves did reach cf_businesses, but nothing read them at the right
 *   moment. Posts already in the queue kept the times they were given at
 *   upload, the publishing cron never checked days or the daily count, the
 *   Auto-Post switch was ignored, and the weekday math was a day off on
 *   Vercel's UTC servers. So a Mon/Wed setting still posted every day.
 *   Saving now re-times the queue and the cron enforces the cadence.
 *   force-dynamic below is extra insurance against any cached response.
 *
 * Path: src/app/api/businesses/route.js
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeTimes, normalizeDays, isValidTimezone, todayLocal, localToUTC } from '@/lib/content-farm/cadence';
import { rescheduleQueue } from '@/lib/content-farm/scheduler';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PUBLISH_TARGETS = ['instagram', 'facebook', 'both'];

function noStore(body, init = {}) {
  return NextResponse.json(body, { ...init, headers: { 'Cache-Control': 'no-store, max-age=0', ...(init.headers || {}) } });
}

async function statsFor(business) {
  const tz = isValidTimezone(business.timezone) ? business.timezone : 'America/New_York';
  const startOfToday = localToUTC(todayLocal(tz), '00:00', tz).toISOString();

  const [queuedQ, reviewQ, nextQ, lastQ, todayQ, failedQ] = await Promise.all([
    supabase.from('cf_content_uploads').select('id', { count: 'exact', head: true })
      .eq('business_id', business.id).eq('status', 'approved'),
    supabase.from('cf_content_uploads').select('id', { count: 'exact', head: true })
      .eq('business_id', business.id).eq('status', 'scheduled'),
    supabase.from('cf_content_uploads').select('scheduled_for')
      .eq('business_id', business.id).in('status', ['approved', 'scheduled'])
      .order('scheduled_for', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('cf_content_uploads').select('posted_at')
      .eq('business_id', business.id).eq('status', 'posted')
      .order('posted_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('cf_content_uploads').select('id', { count: 'exact', head: true })
      .eq('business_id', business.id).eq('status', 'posted').gte('posted_at', startOfToday),
    supabase.from('cf_content_uploads').select('id', { count: 'exact', head: true })
      .eq('business_id', business.id).eq('status', 'failed'),
  ]);

  return {
    approved: queuedQ.count || 0,
    needs_review: reviewQ.count || 0,
    next_post_at: nextQ.data?.scheduled_for || null,
    last_post_at: lastQ.data?.posted_at || null,
    posted_today: todayQ.count || 0,
    failed: failedQ.count || 0,
  };
}

export async function GET() {
  const { data, error } = await supabase.from('cf_businesses').select('*').order('name');
  if (error) return noStore({ error: error.message }, { status: 500 });

  const businesses = await Promise.all((data || []).map(async b => {
    try { return { ...b, stats: await statsFor(b) }; }
    catch { return { ...b, stats: null }; }
  }));

  return noStore({ businesses });
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return noStore({ error: 'Invalid JSON' }, { status: 400 }); }

  const { business_id, posting_times, active_days, auto_post, timezone, publish_to } = body;
  const applyToQueue = body.apply_to_queue !== false;
  if (!business_id) return noStore({ error: 'business_id required' }, { status: 400 });

  const update = { updated_at: new Date().toISOString() };
  const problems = [];

  if (posting_times !== undefined) {
    const times = normalizeTimes(posting_times);
    if (!times.length) problems.push('Add at least one posting time.');
    else {
      update.posting_times = times;
      update.posts_per_day = times.length; // always derived, never typed in
    }
  }

  if (active_days !== undefined) {
    if (!Array.isArray(active_days) || active_days.length === 0) problems.push('Pick at least one active day.');
    else update.active_days = normalizeDays(active_days);
  }

  if (auto_post !== undefined) update.auto_post = auto_post === true;

  if (timezone !== undefined) {
    if (!isValidTimezone(timezone)) problems.push(`Unknown timezone: ${timezone}`);
    else update.timezone = timezone;
  }

  if (publish_to !== undefined) {
    if (!PUBLISH_TARGETS.includes(publish_to)) problems.push('publish_to must be instagram, facebook or both.');
    else update.publish_to = publish_to;
  }

  if (problems.length) return noStore({ error: problems.join(' ') }, { status: 400 });

  const { data: saved, error } = await supabase
    .from('cf_businesses')
    .update(update)
    .eq('id', business_id)
    .select('*')
    .maybeSingle();

  if (error) return noStore({ error: error.message }, { status: 500 });
  if (!saved) return noStore({ error: 'Business not found, nothing was saved.' }, { status: 404 });

  const cadenceChanged = ['posting_times', 'active_days', 'timezone'].some(k => k in update);
  let reschedule = null;
  if (applyToQueue && (cadenceChanged || body.force_reschedule)) {
    try { reschedule = await rescheduleQueue(business_id); }
    catch (e) { reschedule = { error: e.message }; }
  }

  let stats = null;
  try { stats = await statsFor(saved); } catch { /* non-fatal */ }

  return noStore({ success: true, business: { ...saved, stats }, reschedule });
}
