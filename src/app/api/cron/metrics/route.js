/**
 * Metrics Cron — v4 (June 2026)
 *
 * FIX: v3 used narrow time windows (e.g. only posts 164-172h old for "7d").
 * A once-daily cron missed almost every post's single eligibility window,
 * so 200+ posts never got metrics. v4 re-pulls EVERY post younger than 35
 * days on each run and computes its age bucket at pull time. Upsert on
 * (upload_id, metric_window) means the same post's 7d row gets created the
 * first day it crosses 7 days and refreshed every day after — no missed windows.
 *
 * Runs daily via Vercel cron. Graph API v22.0.
 * Path: src/app/api/cron/metrics/route.js
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GRAPH_API = 'https://graph.facebook.com/v22.0';

// Given a post's age in hours, return which buckets it qualifies for.
// A 10-day-old post qualifies for 24h, 48h, AND 7d (all thresholds it has passed),
// so we always have the latest snapshot at each maturity level.
function bucketsForAge(ageHours) {
  const buckets = [];
  if (ageHours >= 22) buckets.push('24h');
  if (ageHours >= 46) buckets.push('48h');
  if (ageHours >= 160) buckets.push('7d');
  if (ageHours >= 696) buckets.push('30d');
  // Very fresh posts (< 22h) still get a "24h" provisional row so the
  // dashboard shows something immediately.
  if (!buckets.length) buckets.push('24h');
  return buckets;
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (process.env.CRON_SECRET && authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = { posts_processed: 0, rows_upserted: 0, errors: 0, cleaned: 0 };
    const now = new Date();

    // Pull EVERY posted item younger than 35 days, in one query.
    const oldest = new Date(now.getTime() - 35 * 24 * 3600000).toISOString();
    const { data: posts, error: postsErr } = await supabase
      .from('cf_content_uploads')
      .select('id, platform_post_id, business_id, content_pillar, content_type, visual_mode, mood, industry_target, hook_strength, instagram_caption, scheduled_for, posted_at')
      .eq('status', 'posted')
      .not('platform_post_id', 'is', null)
      .gte('posted_at', oldest);

    if (postsErr) {
      console.error('[METRICS] Query failed:', postsErr.message);
      return NextResponse.json({ error: postsErr.message }, { status: 500 });
    }

    const tokenCache = {};

    for (const post of posts || []) {
      try {
        if (!(post.business_id in tokenCache)) {
          const { data: token } = await supabase
            .from('cf_platform_tokens')
            .select('access_token')
            .eq('business_id', post.business_id)
            .eq('platform', 'instagram')
            .eq('status', 'active')
            .single();
          tokenCache[post.business_id] = token?.access_token || null;
        }
        const accessToken = tokenCache[post.business_id];
        if (!accessToken) { results.errors++; continue; }

        // Insights metrics
        let metrics = {};
        try {
          const r = await fetch(`${GRAPH_API}/${post.platform_post_id}/insights?metric=reach,saved,shares,total_interactions&access_token=${accessToken}`);
          const j = await r.json();
          if (!j.error && j.data) j.data.forEach(m => { metrics[m.name] = m.values?.[0]?.value || 0; });
          else if (j.error) console.log(`[METRICS] insights error ${post.platform_post_id}: ${j.error.message}`);
        } catch (e) { /* continue */ }

        // like/comment counts from media fields
        try {
          const r = await fetch(`${GRAPH_API}/${post.platform_post_id}?fields=like_count,comments_count&access_token=${accessToken}`);
          const j = await r.json();
          if (!j.error) {
            if (j.like_count != null) metrics.likes = j.like_count;
            if (j.comments_count != null) metrics.comments = j.comments_count;
          }
        } catch (e) { /* non-fatal */ }

        const shares = metrics.shares || 0;
        const saves = metrics.saved || 0;
        const comments = metrics.comments || 0;
        const likes = metrics.likes || 0;
        const reach = metrics.reach || 0;
        const views = metrics.views || metrics.total_interactions || 0;
        const totalInteractions = metrics.total_interactions || (likes + comments + saves + shares);

        const safeReach = reach > 0 ? reach : 1;
        const engagementRate = totalInteractions / safeReach * 100;
        const shareToReach = shares / safeReach * 100;
        const saveToReach = saves / safeReach * 100;
        const commentToLike = likes > 0 ? (comments / likes * 100) : 0;

        const composite = shares * 3.0 + saves * 2.5 + comments * 2.0 + (reach / 100) * 1.0 + likes * 1.0 + (views / 100) * 0.5;

        const postedDate = new Date(post.posted_at || post.scheduled_for);
        const postHour = postedDate.getUTCHours();
        const postDay = postedDate.toLocaleDateString('en-US', { weekday: 'long' });
        const hook = (post.instagram_caption || '').split('\n')[0]?.trim() || '';

        const ageHours = (now - postedDate) / 3600000;
        const buckets = bucketsForAge(ageHours);

        results.posts_processed++;

        for (const bucket of buckets) {
          const { error: upErr } = await supabase.from('cf_content_performance').upsert({
            upload_id: post.id,
            business_id: post.business_id,
            platform_post_id: post.platform_post_id,
            metric_window: bucket,
            views, reach, likes, comments, saves, shares,
            total_interactions: totalInteractions,
            engagement_rate: Math.round(engagementRate * 100) / 100,
            share_to_reach: Math.round(shareToReach * 100) / 100,
            save_to_reach: Math.round(saveToReach * 100) / 100,
            comment_to_like: Math.round(commentToLike * 100) / 100,
            composite_score: Math.round(composite * 100) / 100,
            content_pillar: post.content_pillar,
            content_type: post.content_type,
            visual_mode: post.visual_mode,
            mood: post.mood,
            industry_target: post.industry_target,
            hook_strength: post.hook_strength,
            hook_text: hook.slice(0, 200),
            post_hour: postHour,
            post_day: postDay,
            pulled_at: now.toISOString(),
          }, { onConflict: 'upload_id,metric_window' });

          if (upErr) { console.error(`[METRICS] upsert ${post.id}/${bucket}: ${upErr.message}`); results.errors++; }
          else results.rows_upserted++;
        }
      } catch (err) {
        console.error(`[METRICS] error ${post.id}: ${err.message}`);
        results.errors++;
      }
    }

    // Cleanup media files 10+ days after posting (metrics no longer need the file).
    // Learning data stays in cf_content_performance forever.
    try {
      const cutoff = new Date(now.getTime() - 10 * 24 * 3600000).toISOString();
      const { data: oldPosts } = await supabase
        .from('cf_content_uploads')
        .select('id, storage_path, backup_url')
        .eq('status', 'posted')
        .lt('posted_at', cutoff)
        .not('backup_url', 'is', null);

      for (const p of oldPosts || []) {
        try {
          if (p.storage_path) await supabase.storage.from('content-media').remove([p.storage_path]);
          await supabase.from('cf_content_uploads').update({ backup_url: null, updated_at: now.toISOString() }).eq('id', p.id);
          results.cleaned++;
        } catch (e) { /* non-fatal */ }
      }
    } catch (e) { /* non-fatal */ }

    console.log(`[METRICS] ${results.posts_processed} posts, ${results.rows_upserted} rows, ${results.errors} errors, ${results.cleaned} cleaned`);
    return NextResponse.json(results);
  } catch (err) {
    console.error('[METRICS] fatal:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}