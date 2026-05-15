/**
 * Metrics Cron — v3 (May 2026)
 * 
 * Runs daily at midnight via Vercel cron.
 * Pulls Instagram insights for published posts using Graph API v22.0.
 * Stores performance data with content attributes for the learning system.
 * Auto-cleans media files 7 days after posting.
 * 
 * Metric hierarchy (2026 algorithm):
 *   #1 Shares (30%) — DM sends, strongest discovery signal
 *   #2 Saves (25%) — long-term value indicator
 *   #3 Comments (20%) — conversation depth
 *   #4 Reach (10%) — distribution indicator
 *   #5 Likes (10%) — baseline engagement
 *   #6 Views (5%) — visibility floor
 * 
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

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (process.env.CRON_SECRET && authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = { metrics_pulled: 0, errors: 0, cleaned: 0, details: [] };
    const now = new Date();

    // ── Pull metrics at multiple time windows ──
    // 24h: early signal (is this post getting traction?)
    // 48h: confirmation (did it sustain?)
    // 7d: medium-term (algorithm distribution complete)
    // 30d: final score (long-tail performance)
    const windows = [
      { name: '24h', minHours: 22, maxHours: 28 },
      { name: '48h', minHours: 46, maxHours: 52 },
      { name: '7d', minHours: 164, maxHours: 172 },
      { name: '30d', minHours: 716, maxHours: 724 },
    ];

    for (const window of windows) {
      const minTime = new Date(now.getTime() - window.maxHours * 3600000).toISOString();
      const maxTime = new Date(now.getTime() - window.minHours * 3600000).toISOString();

      const { data: posts } = await supabase
        .from('cf_content_uploads')
        .select('id, platform_post_id, business_id, content_pillar, content_type, visual_mode, mood, industry_target, hook_strength, instagram_caption, scheduled_for, posted_at')
        .eq('status', 'posted')
        .not('platform_post_id', 'is', null)
        .gte('posted_at', minTime)
        .lte('posted_at', maxTime);

      if (!posts?.length) continue;

      // Token cache per business
      const tokenCache = {};

      for (const post of posts) {
        try {
          if (!tokenCache[post.business_id]) {
            const { data: token } = await supabase
              .from('cf_platform_tokens')
              .select('access_token')
              .eq('business_id', post.business_id)
              .eq('platform', 'instagram')
              .eq('status', 'active')
              .single();
            tokenCache[post.business_id] = token?.access_token;
          }

          const accessToken = tokenCache[post.business_id];
          if (!accessToken) continue;

          // Pull metrics using v22.0 compatible metrics
          // Try primary set first, fall back if any fail
          let metrics = {};
          
          try {
            const metricsResp = await fetch(
              `${GRAPH_API}/${post.platform_post_id}/insights?metric=reach,saved,shares,total_interactions&access_token=${accessToken}`
            );
            const metricsData = await metricsResp.json();

            if (!metricsData.error && metricsData.data) {
              metricsData.data.forEach(m => {
                metrics[m.name] = m.values?.[0]?.value || 0;
              });
            }
          } catch (e) { /* handled below */ }

          // Also pull likes, comments, views from the media object fields (more reliable)
          try {
            const mediaResp = await fetch(
              `${GRAPH_API}/${post.platform_post_id}?fields=like_count,comments_count,timestamp&access_token=${accessToken}`
            );
            const mediaData = await mediaResp.json();
            if (!mediaData.error) {
              if (mediaData.like_count != null) metrics.likes = mediaData.like_count;
              if (mediaData.comments_count != null) metrics.comments = mediaData.comments_count;
            }
          } catch (e) { /* non-fatal */ }

          // Derive missing values
          const shares = metrics.shares || 0;
          const saves = metrics.saved || 0;
          const comments = metrics.comments || 0;
          const likes = metrics.likes || 0;
          const reach = metrics.reach || 1; // avoid division by zero
          const views = metrics.views || metrics.total_interactions || 0;
          const totalInteractions = metrics.total_interactions || (likes + comments + saves + shares);

          // Engagement rate = total interactions / reach * 100
          const engagementRate = reach > 0 ? (totalInteractions / reach * 100) : 0;

          // Share-to-reach ratio (the #1 growth metric)
          const shareToReach = reach > 0 ? (shares / reach * 100) : 0;

          // Save-to-reach ratio (quality indicator)
          const saveToReach = reach > 0 ? (saves / reach * 100) : 0;

          // Comment-to-like ratio (conversation depth)
          const commentToLike = likes > 0 ? (comments / likes * 100) : 0;

          // Composite score (weighted by 2026 algorithm priorities)
          const composite = (
            shares * 3.0 +      // 30% weight, normalized by multiplier
            saves * 2.5 +       // 25% weight
            comments * 2.0 +    // 20% weight
            (reach / 100) * 1.0 + // 10% weight, scaled down
            likes * 1.0 +       // 10% weight
            (views / 100) * 0.5  // 5% weight, scaled down
          );

          // Extract posting time and day for time-based analysis
          const postedDate = new Date(post.posted_at || post.scheduled_for);
          const postHour = postedDate.getUTCHours();
          const postDay = postedDate.toLocaleDateString('en-US', { weekday: 'long' });

          // Extract hook (first line of caption)
          const hook = (post.instagram_caption || '').split('\n')[0]?.trim() || '';

          // Upsert into cf_content_performance
          const { error: upsertErr } = await supabase.from('cf_content_performance').upsert({
            upload_id: post.id,
            business_id: post.business_id,
            platform_post_id: post.platform_post_id,
            metric_window: window.name,
            // Raw metrics
            views: views,
            reach: reach,
            likes: likes,
            comments: comments,
            saves: saves,
            shares: shares,
            total_interactions: totalInteractions,
            // Calculated ratios
            engagement_rate: Math.round(engagementRate * 100) / 100,
            share_to_reach: Math.round(shareToReach * 100) / 100,
            save_to_reach: Math.round(saveToReach * 100) / 100,
            comment_to_like: Math.round(commentToLike * 100) / 100,
            composite_score: Math.round(composite * 100) / 100,
            // Content attributes (for correlation)
            content_pillar: post.content_pillar,
            content_type: post.content_type,
            visual_mode: post.visual_mode,
            mood: post.mood,
            industry_target: post.industry_target,
            hook_strength: post.hook_strength,
            hook_text: hook.slice(0, 200),
            post_hour: postHour,
            post_day: postDay,
            // Meta
            pulled_at: now.toISOString(),
          }, { onConflict: 'upload_id,metric_window' });

          if (upsertErr) {
            console.error(`[METRICS] Upsert failed for ${post.id}/${window.name}: ${upsertErr.message}`);
            results.errors++;
          } else {
            results.metrics_pulled++;
            results.details.push({ id: post.id, metric_window: window.name, composite, shares, saves, reach });
          }
        } catch (err) {
          console.error(`[METRICS] Error for ${post.id}: ${err.message}`);
          results.errors++;
        }
      }
    }

    // ── Cleanup: delete media files 7+ days after posting ──
    try {
      const cutoff = new Date(now.getTime() - 7 * 24 * 3600000).toISOString();
      const { data: oldPosts } = await supabase
        .from('cf_content_uploads')
        .select('id, storage_path, backup_url')
        .eq('status', 'posted')
        .lt('posted_at', cutoff)
        .not('storage_path', 'is', null)
        .not('backup_url', 'is', null); // Only clean if backup exists (already cleaned if null)

      if (oldPosts?.length) {
        for (const post of oldPosts) {
          try {
            if (post.storage_path) {
              await supabase.storage.from('content-media').remove([post.storage_path]);
            }
            await supabase.from('cf_content_uploads')
              .update({ backup_url: null, updated_at: now.toISOString() })
              .eq('id', post.id);
            results.cleaned++;
          } catch (cleanErr) {
            console.error(`[CLEANUP] Failed for ${post.id}: ${cleanErr.message}`);
          }
        }
      }
    } catch (cleanErr) {
      console.error(`[CLEANUP] Error: ${cleanErr.message}`);
    }

    console.log(`[METRICS] Done: ${results.metrics_pulled} pulled, ${results.errors} errors, ${results.cleaned} cleaned`);
    return NextResponse.json(results);
  } catch (err) {
    console.error('[METRICS] Fatal error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}