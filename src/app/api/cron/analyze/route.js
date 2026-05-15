/**
 * Weekly Analysis Cron — v2 (May 2026)
 * 
 * Runs every Sunday at 11am UTC via Vercel cron.
 * For each business, analyzes all performance data from cf_content_performance,
 * identifies patterns between content attributes and engagement metrics,
 * and generates specific recommendations that feed into caption generation.
 * 
 * The output (stored in cf_content_analysis) is read by intake.js generateCaption()
 * and injected into the prompt so the AI writes in the style of what's working.
 * 
 * Path: src/app/api/cron/analyze/route.js
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (process.env.CRON_SECRET && authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = { analyzed: 0, skipped: 0, errors: 0 };

    // Get all active businesses
    const { data: businesses } = await supabase.rpc('get_all_businesses');
    if (!businesses?.length) return NextResponse.json({ error: 'No businesses' });

    for (const business of businesses) {
      try {
        // Get all performance data for this business (prefer 7d window — most stable signal)
        const { data: perfData } = await supabase
          .from('cf_content_performance')
          .select('*')
          .eq('business_id', business.id)
          .eq('metric_window', '7d')
          .order('composite_score', { ascending: false });

        if (!perfData?.length || perfData.length < 5) {
          console.log(`[ANALYZE] Skipping ${business.name}: only ${perfData?.length || 0} data points (need 5+)`);
          results.skipped++;
          continue;
        }

        // ── Build the analysis dataset ──────────────────────────

        // Aggregate by content pillar
        const byPillar = {};
        perfData.forEach(p => {
          const key = p.content_pillar || 'unknown';
          if (!byPillar[key]) byPillar[key] = { count: 0, totalComposite: 0, totalShares: 0, totalSaves: 0, totalReach: 0, totalComments: 0, totalLikes: 0, totalEngRate: 0, totalShareToReach: 0 };
          byPillar[key].count++;
          byPillar[key].totalComposite += p.composite_score || 0;
          byPillar[key].totalShares += p.shares || 0;
          byPillar[key].totalSaves += p.saves || 0;
          byPillar[key].totalReach += p.reach || 0;
          byPillar[key].totalComments += p.comments || 0;
          byPillar[key].totalLikes += p.likes || 0;
          byPillar[key].totalEngRate += p.engagement_rate || 0;
          byPillar[key].totalShareToReach += p.share_to_reach || 0;
        });

        // Aggregate by content type
        const byType = {};
        perfData.forEach(p => {
          const key = p.content_type || 'unknown';
          if (!byType[key]) byType[key] = { count: 0, totalComposite: 0, totalShares: 0, totalSaves: 0, totalReach: 0 };
          byType[key].count++;
          byType[key].totalComposite += p.composite_score || 0;
          byType[key].totalShares += p.shares || 0;
          byType[key].totalSaves += p.saves || 0;
          byType[key].totalReach += p.reach || 0;
        });

        // Aggregate by posting hour
        const byHour = {};
        perfData.forEach(p => {
          const key = p.post_hour ?? 'unknown';
          if (!byHour[key]) byHour[key] = { count: 0, totalComposite: 0, totalReach: 0 };
          byHour[key].count++;
          byHour[key].totalComposite += p.composite_score || 0;
          byHour[key].totalReach += p.reach || 0;
        });

        // Aggregate by mood
        const byMood = {};
        perfData.forEach(p => {
          const key = p.mood || 'unknown';
          if (!byMood[key]) byMood[key] = { count: 0, totalComposite: 0 };
          byMood[key].count++;
          byMood[key].totalComposite += p.composite_score || 0;
        });

        // Aggregate by visual mode
        const byVisual = {};
        perfData.forEach(p => {
          const key = p.visual_mode || 'unknown';
          if (!byVisual[key]) byVisual[key] = { count: 0, totalComposite: 0 };
          byVisual[key].count++;
          byVisual[key].totalComposite += p.composite_score || 0;
        });

        // Top and bottom performing posts
        const topPosts = perfData.slice(0, 5).map(p => ({
          composite: p.composite_score,
          pillar: p.content_pillar,
          type: p.content_type,
          mood: p.mood,
          hook: p.hook_text,
          hookStrength: p.hook_strength,
          shares: p.shares,
          saves: p.saves,
          reach: p.reach,
          engRate: p.engagement_rate,
          shareToReach: p.share_to_reach,
          hour: p.post_hour,
          day: p.post_day,
        }));

        const bottomPosts = perfData.slice(-3).map(p => ({
          composite: p.composite_score,
          pillar: p.content_pillar,
          type: p.content_type,
          mood: p.mood,
          hook: p.hook_text,
          shares: p.shares,
          saves: p.saves,
          reach: p.reach,
          engRate: p.engagement_rate,
        }));

        // Calculate averages per group
        const pillarAvgs = Object.entries(byPillar).map(([k, v]) => ({
          pillar: k, count: v.count,
          avgComposite: (v.totalComposite / v.count).toFixed(1),
          avgShares: (v.totalShares / v.count).toFixed(1),
          avgSaves: (v.totalSaves / v.count).toFixed(1),
          avgReach: (v.totalReach / v.count).toFixed(0),
          avgEngRate: (v.totalEngRate / v.count).toFixed(2),
          avgShareToReach: (v.totalShareToReach / v.count).toFixed(2),
        })).sort((a, b) => b.avgComposite - a.avgComposite);

        const typeAvgs = Object.entries(byType).map(([k, v]) => ({
          type: k, count: v.count,
          avgComposite: (v.totalComposite / v.count).toFixed(1),
          avgShares: (v.totalShares / v.count).toFixed(1),
          avgSaves: (v.totalSaves / v.count).toFixed(1),
        })).sort((a, b) => b.avgComposite - a.avgComposite);

        const hourAvgs = Object.entries(byHour).map(([k, v]) => ({
          hour: k, count: v.count,
          avgComposite: (v.totalComposite / v.count).toFixed(1),
          avgReach: (v.totalReach / v.count).toFixed(0),
        })).sort((a, b) => b.avgComposite - a.avgComposite);

        const moodAvgs = Object.entries(byMood).map(([k, v]) => ({
          mood: k, count: v.count,
          avgComposite: (v.totalComposite / v.count).toFixed(1),
        })).sort((a, b) => b.avgComposite - a.avgComposite);

        // Overall stats
        const totalPosts = perfData.length;
        const avgComposite = (perfData.reduce((s, p) => s + (p.composite_score || 0), 0) / totalPosts).toFixed(1);
        const avgEngRate = (perfData.reduce((s, p) => s + (p.engagement_rate || 0), 0) / totalPosts).toFixed(2);
        const avgShareToReach = (perfData.reduce((s, p) => s + (p.share_to_reach || 0), 0) / totalPosts).toFixed(2);
        const totalShares = perfData.reduce((s, p) => s + (p.shares || 0), 0);
        const totalSaves = perfData.reduce((s, p) => s + (p.saves || 0), 0);

        // ── AI Analysis ─────────────────────────────────────────

        const analysisPrompt = `You are a data-driven social media strategist analyzing Instagram performance for ${business.name} (${business.industry_label}).

Here is the performance data from the last measurement cycle (${totalPosts} posts analyzed at the 7-day mark):

OVERALL PERFORMANCE:
- Total posts analyzed: ${totalPosts}
- Average composite score: ${avgComposite}
- Average engagement rate: ${avgEngRate}%
- Average share-to-reach ratio: ${avgShareToReach}%
- Total shares: ${totalShares}, Total saves: ${totalSaves}

PERFORMANCE BY CONTENT PILLAR (ranked by composite score):
${JSON.stringify(pillarAvgs, null, 2)}

PERFORMANCE BY CONTENT TYPE (ranked by composite score):
${JSON.stringify(typeAvgs, null, 2)}

PERFORMANCE BY POSTING HOUR UTC (ranked by composite score):
${JSON.stringify(hourAvgs, null, 2)}

PERFORMANCE BY MOOD (ranked by composite score):
${JSON.stringify(moodAvgs, null, 2)}

TOP 5 PERFORMING POSTS (with hooks):
${JSON.stringify(topPosts, null, 2)}

BOTTOM 3 PERFORMING POSTS:
${JSON.stringify(bottomPosts, null, 2)}

Based on this data, provide a comprehensive analysis. Return ONLY valid JSON (no markdown, no backticks):

{
  "summary": "2-3 sentence executive summary of overall performance",
  "best_pillar": "the pillar with highest avg composite score",
  "worst_pillar": "the pillar with lowest avg composite score",
  "best_content_type": "the content type with highest avg composite",
  "worst_content_type": "the content type with lowest avg composite",
  "best_posting_hour": "the hour (UTC) with highest avg composite",
  "best_mood": "the mood with highest avg composite",
  "top_hooks": ["list of the 3-5 best performing hooks (actual text)"],
  "hook_patterns": "what the best hooks have in common — be specific about structure, length, and style",
  "share_drivers": "what content attributes correlate most with shares (the #1 algorithm signal)",
  "save_drivers": "what content attributes correlate most with saves",
  "recommendations": [
    "specific actionable recommendation 1 with numbers",
    "specific actionable recommendation 2 with numbers",
    "specific actionable recommendation 3 with numbers",
    "specific actionable recommendation 4 with numbers",
    "specific actionable recommendation 5 with numbers"
  ],
  "content_mix": {
    "educate_pct": "recommended percentage of educate posts",
    "engage_pct": "recommended percentage of engage posts",
    "inspire_pct": "recommended percentage of inspire posts",
    "promote_pct": "recommended percentage of promote posts"
  },
  "avoid": ["list of 3 things to stop doing based on underperforming patterns"],
  "double_down": ["list of 3 things to do more of based on top-performing patterns"],
  "engagement_trend": "improving, stable, or declining based on the data",
  "data_quality_note": "any caveats about the data (sample size, missing metrics, etc.)"
}`;

        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001', // Haiku for cost efficiency — analysis doesn't need Sonnet
          max_tokens: 2000,
          messages: [{ role: 'user', content: analysisPrompt }],
        });

        const text = response.content[0]?.text || '{}';
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        let analysis;
        try {
          analysis = JSON.parse(cleaned);
        } catch (parseErr) {
          console.error(`[ANALYZE] JSON parse failed for ${business.name}: ${parseErr.message}`);
          results.errors++;
          continue;
        }

        // Store analysis
        const { error: insertErr } = await supabase.from('cf_content_analysis').insert({
          business_id: business.id,
          analyzed_at: new Date().toISOString(),
          total_posts_analyzed: totalPosts,
          avg_composite_score: parseFloat(avgComposite),
          avg_engagement_rate: parseFloat(avgEngRate),
          avg_share_to_reach: parseFloat(avgShareToReach),
          // AI analysis results
          summary: analysis.summary,
          best_pillar: analysis.best_pillar,
          worst_pillar: analysis.worst_pillar,
          best_content_type: analysis.best_content_type,
          worst_content_type: analysis.worst_content_type,
          best_posting_hour: analysis.best_posting_hour,
          best_mood: analysis.best_mood,
          top_hooks: analysis.top_hooks,
          hook_patterns: analysis.hook_patterns,
          share_drivers: analysis.share_drivers,
          save_drivers: analysis.save_drivers,
          recommendations: analysis.recommendations,
          content_mix: analysis.content_mix,
          avoid: analysis.avoid,
          double_down: analysis.double_down,
          engagement_trend: analysis.engagement_trend,
          data_quality_note: analysis.data_quality_note,
          // Raw aggregates for reference
          pillar_performance: pillarAvgs,
          type_performance: typeAvgs,
          hour_performance: hourAvgs,
          mood_performance: moodAvgs,
          top_posts: topPosts,
          bottom_posts: bottomPosts,
        });

        if (insertErr) {
          console.error(`[ANALYZE] Insert failed for ${business.name}: ${insertErr.message}`);
          results.errors++;
        } else {
          console.log(`[ANALYZE] ${business.name}: ${totalPosts} posts analyzed, avg composite ${avgComposite}, trend: ${analysis.engagement_trend}`);
          results.analyzed++;
        }
      } catch (bizErr) {
        console.error(`[ANALYZE] Error for ${business.name}: ${bizErr.message}`);
        results.errors++;
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    console.error('[ANALYZE] Fatal error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}