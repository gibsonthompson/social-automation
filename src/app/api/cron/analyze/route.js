/**
 * Weekly Analysis Cron — v3 (June 2026)
 *
 * FIX from v2: threshold lowered 5 -> 3, and falls back to whatever metric
 * window has the most data (7d preferred) so younger accounts still analyze.
 * Added visual_mode aggregation for the scheduler's alternation logic.
 *
 * Runs Sundays 11am UTC. Path: src/app/api/cron/analyze/route.js
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

    const { data: businesses } = await supabase.rpc('get_all_businesses');
    if (!businesses?.length) return NextResponse.json({ error: 'No businesses' });

    for (const business of businesses) {
      try {
        // Prefer 7d, fall back to window with most rows (min 3 to run)
        let perfData = null;
        let usedWindow = '7d';
        for (const win of ['7d', '48h', '24h', '30d']) {
          const { data } = await supabase
            .from('cf_content_performance')
            .select('*')
            .eq('business_id', business.id)
            .eq('metric_window', win)
            .order('composite_score', { ascending: false });
          if (data && data.length >= 3) { perfData = data; usedWindow = win; break; }
          if (data && (!perfData || data.length > perfData.length)) { perfData = data; usedWindow = win; }
        }

        if (!perfData?.length || perfData.length < 3) {
          console.log(`[ANALYZE] Skipping ${business.name}: ${perfData?.length || 0} points (need 3+)`);
          results.skipped++;
          continue;
        }
        console.log(`[ANALYZE] ${business.name}: ${usedWindow} window, ${perfData.length} posts`);

        const agg = (keyFn) => {
          const m = {};
          perfData.forEach(p => {
            const k = keyFn(p) ?? 'unknown';
            if (!m[k]) m[k] = { count: 0, comp: 0, shares: 0, saves: 0, reach: 0 };
            m[k].count++; m[k].comp += p.composite_score || 0;
            m[k].shares += p.shares || 0; m[k].saves += p.saves || 0; m[k].reach += p.reach || 0;
          });
          return Object.entries(m).map(([k, v]) => ({
            key: k, count: v.count,
            avgComposite: +(v.comp / v.count).toFixed(1),
            avgShares: +(v.shares / v.count).toFixed(1),
            avgSaves: +(v.saves / v.count).toFixed(1),
            avgReach: +(v.reach / v.count).toFixed(0),
          })).sort((a, b) => b.avgComposite - a.avgComposite);
        };

        const pillarAvgs = agg(p => p.content_pillar);
        const typeAvgs = agg(p => p.content_type);
        const hourAvgs = agg(p => p.post_hour);
        const moodAvgs = agg(p => p.mood);
        const visualAvgs = agg(p => p.visual_mode);

        const topPosts = perfData.slice(0, 5).map(p => ({
          composite: p.composite_score, pillar: p.content_pillar, type: p.content_type,
          mood: p.mood, hook: p.hook_text, shares: p.shares, saves: p.saves, reach: p.reach,
          engRate: p.engagement_rate, hour: p.post_hour, day: p.post_day,
        }));
        const bottomPosts = perfData.slice(-3).map(p => ({
          composite: p.composite_score, pillar: p.content_pillar, type: p.content_type,
          mood: p.mood, hook: p.hook_text, shares: p.shares, saves: p.saves, reach: p.reach,
        }));

        const totalPosts = perfData.length;
        const avgComposite = (perfData.reduce((s, p) => s + (p.composite_score || 0), 0) / totalPosts).toFixed(1);
        const avgEngRate = (perfData.reduce((s, p) => s + (p.engagement_rate || 0), 0) / totalPosts).toFixed(2);
        const avgShareToReach = (perfData.reduce((s, p) => s + (p.share_to_reach || 0), 0) / totalPosts).toFixed(2);
        const totalShares = perfData.reduce((s, p) => s + (p.shares || 0), 0);
        const totalSaves = perfData.reduce((s, p) => s + (p.saves || 0), 0);

        const analysisPrompt = `You are a data-driven social media strategist analyzing Instagram performance for ${business.name} (${business.industry_label}).

Performance data (${totalPosts} posts at the ${usedWindow} mark):

OVERALL:
- Posts: ${totalPosts}, Avg composite: ${avgComposite}, Avg engagement: ${avgEngRate}%, Avg share-to-reach: ${avgShareToReach}%
- Total shares: ${totalShares}, Total saves: ${totalSaves}

BY PILLAR: ${JSON.stringify(pillarAvgs)}
BY CONTENT TYPE: ${JSON.stringify(typeAvgs)}
BY POSTING HOUR (UTC): ${JSON.stringify(hourAvgs)}
BY MOOD: ${JSON.stringify(moodAvgs)}
BY VISUAL MODE: ${JSON.stringify(visualAvgs)}
TOP 5 POSTS: ${JSON.stringify(topPosts)}
BOTTOM 3 POSTS: ${JSON.stringify(bottomPosts)}

Return ONLY valid JSON (no markdown):
{
  "summary": "2-3 sentence executive summary",
  "best_pillar": "", "worst_pillar": "",
  "best_content_type": "", "worst_content_type": "",
  "best_posting_hour": "", "best_mood": "",
  "top_hooks": ["3-5 best hooks, actual text"],
  "hook_patterns": "what the best hooks share, be specific",
  "share_drivers": "attributes correlating with shares",
  "save_drivers": "attributes correlating with saves",
  "recommendations": ["5 specific actionable recs with numbers"],
  "content_mix": {"educate_pct":"","engage_pct":"","inspire_pct":"","promote_pct":""},
  "avoid": ["3 things to stop"],
  "double_down": ["3 things to do more"],
  "engagement_trend": "improving|stable|declining",
  "data_quality_note": "caveats"
}`;

        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{ role: 'user', content: analysisPrompt }],
        });

        const text = response.content[0]?.text || '{}';
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        let analysis;
        try { analysis = JSON.parse(cleaned); }
        catch (e) { console.error(`[ANALYZE] parse fail ${business.name}: ${e.message}`); results.errors++; continue; }

        const { error: insErr } = await supabase.from('cf_content_analysis').insert({
          business_id: business.id,
          analyzed_at: new Date().toISOString(),
          total_posts_analyzed: totalPosts,
          avg_composite_score: parseFloat(avgComposite),
          avg_engagement_rate: parseFloat(avgEngRate),
          avg_share_to_reach: parseFloat(avgShareToReach),
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
          pillar_performance: pillarAvgs,
          type_performance: typeAvgs,
          hour_performance: hourAvgs,
          mood_performance: moodAvgs,
          top_posts: topPosts,
          bottom_posts: bottomPosts,
        });

        if (insErr) { console.error(`[ANALYZE] insert ${business.name}: ${insErr.message}`); results.errors++; }
        else { console.log(`[ANALYZE] ${business.name}: done, trend ${analysis.engagement_trend}`); results.analyzed++; }
      } catch (e) {
        console.error(`[ANALYZE] error ${business.name}: ${e.message}`); results.errors++;
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    console.error('[ANALYZE] fatal:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}