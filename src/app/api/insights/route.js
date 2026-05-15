/**
 * Insights API
 * GET /api/insights?business_id=xxx
 * 
 * Returns the latest weekly analysis + top performing posts + raw metrics
 * for the Insights dashboard.
 * 
 * Path: src/app/api/insights/route.js
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get('business_id');
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  // Latest weekly analysis
  const { data: analysis } = await supabase
    .from('cf_content_analysis')
    .select('*')
    .eq('business_id', businessId)
    .order('analyzed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Top performing posts (7d window, sorted by composite)
  const { data: topPosts } = await supabase
    .from('cf_content_performance')
    .select('*')
    .eq('business_id', businessId)
    .eq('metric_window', '7d')
    .order('composite_score', { ascending: false })
    .limit(10);

  // All performance data for charts (7d window)
  const { data: allPerf } = await supabase
    .from('cf_content_performance')
    .select('composite_score, engagement_rate, share_to_reach, save_to_reach, shares, saves, reach, likes, comments, content_pillar, content_type, mood, post_hour, post_day, hook_text, hook_strength, pulled_at')
    .eq('business_id', businessId)
    .eq('metric_window', '7d')
    .order('pulled_at', { ascending: false })
    .limit(100);

  // Analysis history (last 8 weeks for trend)
  const { data: analysisHistory } = await supabase
    .from('cf_content_analysis')
    .select('analyzed_at, avg_composite_score, avg_engagement_rate, avg_share_to_reach, total_posts_analyzed, engagement_trend')
    .eq('business_id', businessId)
    .order('analyzed_at', { ascending: false })
    .limit(8);

  return NextResponse.json({
    analysis: analysis || null,
    topPosts: topPosts || [],
    performance: allPerf || [],
    history: analysisHistory || [],
  });
}