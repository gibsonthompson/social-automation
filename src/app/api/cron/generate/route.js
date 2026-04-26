/**
 * Cron: Daily Content Generation
 * Schedule: 6:00 AM EST daily
 * Path: src/app/api/cron/generate/route.js
 *
 * Runs the full pipeline for all active businesses:
 * Plan → Research → Generate → Render → Review
 */

import { NextResponse } from 'next/server';
import { runDailyPipeline, runPipelineForBusiness, logCron } from '@/lib/content-farm/pipeline';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const maxDuration = 300; // 5 minutes (Vercel Pro plan)

export async function GET(request) {
  // Verify cron or manual trigger
  const isVercelCron = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');

  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if a specific business was requested
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('business_id');

    if (businessId) {
      const { data: business, error } = await supabase
        .from('cf_businesses')
        .select('*')
        .eq('id', businessId)
        .single();

      if (error || !business) {
        return NextResponse.json({ error: 'Business not found' }, { status: 404 });
      }

      const result = await runPipelineForBusiness(business);
      return NextResponse.json(result);
    }

    // Run for all active businesses
    const result = await runDailyPipeline();
    return NextResponse.json(result);

  } catch (e) {
    console.error('[CRON:GENERATE] Fatal error:', e);
    await logCron('daily_generation', null, 'failed', 0, e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}