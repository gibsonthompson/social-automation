/**
 * Process Next Post
 * External cron: every 5 minutes via cron-job.org
 * Picks up ONE planned post → research → generate → render → QC
 * ~30-40 seconds per post, well within 60s limit.
 */
import { NextResponse } from 'next/server';
import { processNextPost, logCron } from '@/lib/content-farm/pipeline';

export const maxDuration = 60;

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await processNextPost();
    return NextResponse.json(result);
  } catch (e) {
    await logCron('process_post', null, 'failed', 0, e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}