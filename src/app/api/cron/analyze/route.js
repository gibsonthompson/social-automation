/**
 * Cron: Weekly Performance Analysis
 * Schedule: Sunday 6:00 AM EST
 * Path: src/app/api/cron/analyze/route.js
 *
 * Claude analyzes all performance data, identifies patterns,
 * and generates recommendations that feed back into content generation.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { logCron } from '@/lib/content-farm/pipeline';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const maxDuration = 300;

export async function GET(request) {
  const isVercelCron = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');

  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const results = [];

  try {
    const { data: businesses } = await supabase
      .from('cf_businesses')
      .select('*')
      .eq('active', true);

    for (const business of (businesses || [])) {
      try {
        const result = await analyzeBusinessPerformance(business);
        results.push(result);
      } catch (e) {
        results.push({ business: business.name, error: e.message });
      }
    }

    await logCron('weekly_analysis', null, 'completed', results.length, null, Date.now() - start);
    return NextResponse.json({ analyzed: results.length, results, durationMs: Date.now() - start });

  } catch (e) {
    await logCron('weekly_analysis', null, 'failed', 0, e.message, Date.now() - start);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


async function analyzeBusinessPerformance(business) {
  // Gather 30 days of 7d performance data
  const { data: performance } = await supabase
    .from('cf_content_performance')
    .select(`
      *,
      cf_content_queue (
        ai_content,
        type,
        content_attributes,
        caption,
        hashtags
      )
    `)
    .eq('business_id', business.id)
    .eq('pull_window', '7d')
    .gte('pulled_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  if (!performance?.length || performance.length < 5) {
    return { business: business.name, skipped: true, reason: `Only ${performance?.length || 0} data points` };
  }

  // Build dataset
  const dataset = performance.map(p => ({
    headline: p.cf_content_queue?.ai_content?.headline,
    template: p.cf_content_queue?.content_attributes?.template_type,
    hook_type: p.cf_content_queue?.content_attributes?.hook_type,
    content_angle: p.cf_content_queue?.content_attributes?.content_angle,
    industry_target: p.cf_content_queue?.content_attributes?.industry_target,
    emotional_trigger: p.cf_content_queue?.content_attributes?.emotional_trigger,
    has_statistic: p.cf_content_queue?.content_attributes?.has_statistic,
    storytelling_level: p.cf_content_queue?.content_attributes?.storytelling_level,
    caption_length: p.cf_content_queue?.content_attributes?.caption_length,
    type: p.cf_content_queue?.type,
    views: p.views,
    reach: p.reach,
    engagement: p.engagement,
    engagement_rate: p.engagement_rate,
    saves: p.saves,
    shares: p.shares_sends,
    comments: p.comments,
    composite_score: p.composite_score,
  }));

  const sorted = [...dataset].sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0));
  const top5 = sorted.slice(0, 5);
  const bottom5 = sorted.slice(-5);

  const prompt = `You are a social media performance analyst for ${business.name} (${business.industry_label}).

${dataset.length} posts analyzed over the last 30 days.

TOP 5 PERFORMERS:
${JSON.stringify(top5, null, 2)}

BOTTOM 5 PERFORMERS:
${JSON.stringify(bottom5, null, 2)}

FULL DATASET SUMMARY:
- Avg composite score: ${(dataset.reduce((s, d) => s + (d.composite_score || 0), 0) / dataset.length).toFixed(1)}
- Avg engagement rate: ${(dataset.reduce((s, d) => s + (d.engagement_rate || 0), 0) / dataset.length * 100).toFixed(2)}%
- Total views: ${dataset.reduce((s, d) => s + (d.views || 0), 0)}

Analyze and provide:

1. TOP PATTERNS: What do top performers share? (hook types, templates, industries, angles)
2. BOTTOM PATTERNS: What do worst performers share? What to stop doing?
3. BEST HOOKS: Rank hook types by effectiveness.
4. TEMPLATE RECOMMENDATIONS: Which templates to use more/less?
5. CONTENT ATTRIBUTES: Which combinations of attributes correlate with high performance?
6. SPECIFIC BRIEFS: 5 content briefs for next week with topic, hook, template, and reasoning.
7. PROMPT TUNING: Specific changes to make in the generation prompts.

Be specific and data-driven. Reference actual posts.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const analysisText = response.content[0].text;

  await supabase.from('cf_content_analysis').insert({
    business_id: business.id,
    analysis_text: analysisText,
    top_performing: top5,
    worst_performing: bottom5,
    best_hooks: extractSection(analysisText, 'BEST HOOKS'),
    best_formats: extractSection(analysisText, 'TEMPLATE RECOMMENDATIONS'),
    best_content_attributes: extractSection(analysisText, 'CONTENT ATTRIBUTES'),
    recommendations: extractSection(analysisText, 'SPECIFIC BRIEFS'),
    prompt_tuning: extractSection(analysisText, 'PROMPT TUNING'),
    posts_analyzed: dataset.length,
    period_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    period_end: new Date().toISOString(),
  });

  return { business: business.name, posts_analyzed: dataset.length };
}

function extractSection(text, header) {
  const regex = new RegExp(`${header}[:\\s]*([\\s\\S]*?)(?=\\n\\d+\\.|$)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim().substring(0, 2000) : null;
}