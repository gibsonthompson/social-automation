/**
 * Cron: Pull Performance Metrics
 * Schedule: Daily at midnight EST
 * Path: src/app/api/cron/metrics/route.js
 */

import { NextResponse } from 'next/server';
import { pullAllMetrics } from '@/lib/content-farm/metrics';
import { refreshExpiredTokens } from '@/lib/content-farm/poster';
import { logCron } from '@/lib/content-farm/pipeline';

export const maxDuration = 120;

export async function GET(request) {
  const isVercelCron = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');

  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  try {
    // Refresh any expiring tokens first
    const tokenResult = await refreshExpiredTokens();

    // Pull metrics across all windows
    const metricsResults = await pullAllMetrics();

    const totalPulled = metricsResults.reduce((s, r) => s + r.pulled, 0);
    await logCron('metrics_pull', null, 'completed', totalPulled, null, Date.now() - start, { windows: metricsResults, tokens: tokenResult });

    return NextResponse.json({
      pulled: totalPulled,
      windows: metricsResults,
      tokens_refreshed: tokenResult,
      durationMs: Date.now() - start,
    });
  } catch (e) {
    await logCron('metrics_pull', null, 'failed', 0, e.message, Date.now() - start);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}