/**
 * Metrics Cron — v2
 * 
 * Runs daily at midnight (Vercel cron).
 * Pulls Instagram insights for published posts at 24h, 48h, 7d, 30d windows.
 * Also cleans up old media files from storage after 7 days.
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

const GRAPH_API = 'https://graph.facebook.com/v21.0';

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (process.env.CRON_SECRET && authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = { metrics_pulled: 0, errors: 0, cleaned: 0 };

    // ── Pull metrics for published posts ──
    const now = new Date();
    const windows = [
      { name: '24h', minHours: 22, maxHours: 26 },
      { name: '48h', minHours: 46, maxHours: 50 },
      { name: '7d', minHours: 166, maxHours: 170 },
      { name: '30d', minHours: 718, maxHours: 722 },
    ];

    for (const window of windows) {
      const minTime = new Date(now.getTime() - window.maxHours * 3600000).toISOString();
      const maxTime = new Date(now.getTime() - window.minHours * 3600000).toISOString();

      const { data: posts } = await supabase
        .from('cf_content_uploads')
        .select('id, platform_post_id, business_id, content_pillar, content_type, visual_mode, mood, industry_target, hook_strength, time_slot, posted_at')
        .eq('status', 'posted')
        .not('platform_post_id', 'is', null)
        .gte('posted_at', minTime)
        .lte('posted_at', maxTime);

      if (!posts?.length) continue;

      // Get token for each business (cache per business)
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

          // Pull metrics from Instagram
          const metricsResp = await fetch(
            `${GRAPH_API}/${post.platform_post_id}/insights?metric=impressions,reach,likes,comments,shares,saved&access_token=${accessToken}`
          );
          const metricsData = await metricsResp.json();

          if (metricsData.error) {
            console.error(`[METRICS] Failed for ${post.platform_post_id}: ${metricsData.error.message}`);
            results.errors++;
            continue;
          }

          // Parse metrics
          const metrics = {};
          (metricsData.data || []).forEach(m => {
            metrics[m.name] = m.values?.[0]?.value || 0;
          });

          // Calculate composite score
          // Weights: saves 25%, shares 25%, comments 20%, likes 10%, impressions 10%, reach 10%
          const composite = (
            (metrics.saved || 0) * 0.25 +
            (metrics.shares || 0) * 0.25 +
            (metrics.comments || 0) * 0.20 +
            (metrics.likes || 0) * 0.10 +
            (metrics.impressions || 0) * 0.001 * 0.10 +  // Normalize large numbers
            (metrics.reach || 0) * 0.001 * 0.10
          );

          // Store in cf_content_performance
          await supabase.from('cf_content_performance').upsert({
            upload_id: post.id,
            business_id: post.business_id,
            platform_post_id: post.platform_post_id,
            window: window.name,
            impressions: metrics.impressions || 0,
            reach: metrics.reach || 0,
            likes: metrics.likes || 0,
            comments: metrics.comments || 0,
            saves: metrics.saved || 0,
            shares: metrics.shares || 0,
            composite_score: composite,
            // Content attributes for correlation
            content_pillar: post.content_pillar,
            content_type: post.content_type,
            visual_mode: post.visual_mode,
            mood: post.mood,
            industry_target: post.industry_target,
            hook_strength: post.hook_strength,
            time_slot: post.time_slot,
            pulled_at: now.toISOString(),
          }, { onConflict: 'upload_id,window' });

          results.metrics_pulled++;
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
        .not('storage_path', 'is', null);

      if (oldPosts?.length) {
        for (const post of oldPosts) {
          try {
            // Delete from Supabase Storage
            if (post.storage_path) {
              await supabase.storage.from('content-media').remove([post.storage_path]);
            }

            // Mark as cleaned (null out backup_url)
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