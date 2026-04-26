/**
 * Content Farm — Metrics Puller
 * Pulls performance data from platform APIs at multiple windows
 * 
 * Path: src/lib/content-farm/metrics.js
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GRAPH_API = 'https://graph.facebook.com/v21.0';

// ── Pull Windows ────────────────────────────────────────────────

const PULL_WINDOWS = [
  { label: '24h', hoursAgo: 24, tolerance: 4 },
  { label: '48h', hoursAgo: 48, tolerance: 4 },
  { label: '7d',  hoursAgo: 168, tolerance: 12 },
  { label: '30d', hoursAgo: 720, tolerance: 24 },
];


// ── Instagram Metrics ───────────────────────────────────────────

async function pullInstagramMetrics(mediaId, accessToken) {
  // Basic fields
  const basicResp = await fetch(
    `${GRAPH_API}/${mediaId}?fields=like_count,comments_count,media_type,timestamp&access_token=${accessToken}`
  );
  const basic = await basicResp.json();

  // Insights — different metrics for images vs reels
  const isReel = basic.media_type === 'VIDEO';
  const metricList = isReel
    ? 'plays,reach,saved,shares,total_interactions'
    : 'impressions,reach,saved,total_interactions';

  const insightsResp = await fetch(
    `${GRAPH_API}/${mediaId}/insights?metric=${metricList}&access_token=${accessToken}`
  );
  const insights = await insightsResp.json();

  const metricsMap = {};
  if (insights.data) {
    for (const item of insights.data) {
      metricsMap[item.name] = item.values?.[0]?.value || 0;
    }
  }

  const views = metricsMap.plays || metricsMap.impressions || 0;
  const reach = metricsMap.reach || 0;
  const saves = metricsMap.saved || 0;
  const shares = metricsMap.shares || 0;
  const likes = basic.like_count || 0;
  const comments = basic.comments_count || 0;
  const engagement = likes + comments + saves + shares;

  return {
    views,
    reach,
    impressions: metricsMap.impressions || views,
    engagement,
    engagement_rate: reach > 0 ? parseFloat((engagement / reach).toFixed(6)) : 0,
    likes,
    comments,
    saves,
    shares_sends: shares,
    plays: metricsMap.plays || 0,
    raw_response: { basic, insights: insights.data },
  };
}


// ── Composite Score ─────────────────────────────────────────────

function calculateCompositeScore(metrics, averages) {
  if (!averages) {
    // No historical data — use raw engagement
    return Math.min(
      (metrics.likes + metrics.comments * 2 + metrics.saves * 3 + metrics.shares_sends * 3),
      100
    );
  }

  const raw = (
    (metrics.views / Math.max(averages.views, 1)) * 0.10 +
    (metrics.reach / Math.max(averages.reach, 1)) * 0.10 +
    (metrics.likes / Math.max(averages.likes, 1)) * 0.10 +
    (metrics.comments / Math.max(averages.comments, 1)) * 0.20 +
    (metrics.saves / Math.max(averages.saves, 1)) * 0.25 +
    (metrics.shares_sends / Math.max(averages.shares, 1)) * 0.25
  );

  return Math.min(Math.round(raw * 50 * 100) / 100, 100);
}


// ── Main Pull Function ──────────────────────────────────────────

export async function pullMetricsForWindow(windowConfig) {
  const now = Date.now();
  const targetMs = windowConfig.hoursAgo * 60 * 60 * 1000;
  const toleranceMs = windowConfig.tolerance * 60 * 60 * 1000;

  // Find posts that were posted within this window
  const { data: posts } = await supabase
    .from('cf_content_queue')
    .select('id, business_id, platform, platform_post_id, posted_at')
    .eq('status', 'posted')
    .not('platform_post_id', 'is', null)
    .gte('posted_at', new Date(now - targetMs - toleranceMs).toISOString())
    .lte('posted_at', new Date(now - targetMs + toleranceMs).toISOString());

  if (!posts?.length) return { pulled: 0, window: windowConfig.label };

  let pulled = 0;
  for (const post of posts) {
    // Check if already pulled for this window
    const { data: existing } = await supabase
      .from('cf_content_performance')
      .select('id')
      .eq('queue_id', post.id)
      .eq('pull_window', windowConfig.label)
      .limit(1);

    if (existing?.length) continue;

    try {
      // Get token for this business
      const { data: token } = await supabase
        .from('cf_platform_tokens')
        .select('access_token')
        .eq('business_id', post.business_id)
        .eq('platform', 'instagram')
        .eq('status', 'active')
        .single();

      if (!token) continue;

      const metrics = await pullInstagramMetrics(post.platform_post_id, token.access_token);

      // Get business averages for composite score
      const { data: avgData } = await supabase
        .from('cf_content_performance')
        .select('views, reach, likes, comments, saves, shares_sends')
        .eq('business_id', post.business_id)
        .eq('pull_window', '7d')
        .gte('pulled_at', new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString());

      let averages = null;
      if (avgData?.length >= 3) {
        averages = {
          views: avgData.reduce((s, r) => s + (r.views || 0), 0) / avgData.length,
          reach: avgData.reduce((s, r) => s + (r.reach || 0), 0) / avgData.length,
          likes: avgData.reduce((s, r) => s + (r.likes || 0), 0) / avgData.length,
          comments: avgData.reduce((s, r) => s + (r.comments || 0), 0) / avgData.length,
          saves: avgData.reduce((s, r) => s + (r.saves || 0), 0) / avgData.length,
          shares: avgData.reduce((s, r) => s + (r.shares_sends || 0), 0) / avgData.length,
        };
      }

      const compositeScore = calculateCompositeScore(metrics, averages);

      await supabase.from('cf_content_performance').insert({
        queue_id: post.id,
        business_id: post.business_id,
        platform: post.platform,
        platform_post_id: post.platform_post_id,
        pull_window: windowConfig.label,
        composite_score: compositeScore,
        ...metrics,
      });

      // Update history with composite score (on 7d window)
      if (windowConfig.label === '7d') {
        await supabase.from('cf_content_history')
          .update({ composite_score: compositeScore })
          .eq('queue_id', post.id);
      }

      pulled++;
    } catch (e) {
      console.error(`[METRICS] Failed for post ${post.id}:`, e.message);
    }
  }

  return { pulled, window: windowConfig.label, checked: posts.length };
}

export async function pullAllMetrics() {
  const results = [];
  for (const window of PULL_WINDOWS) {
    const result = await pullMetricsForWindow(window);
    results.push(result);
  }
  return results;
}

export { PULL_WINDOWS };