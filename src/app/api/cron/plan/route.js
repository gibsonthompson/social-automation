/**
 * Cron: Plan Daily Content
 * Vercel cron: 6am EST daily (0 11 * * * UTC)
 * Creates queue entries for all active businesses. No AI calls.
 */
import { NextResponse } from 'next/server';
import { planDailyContent, logCron } from '@/lib/content-farm/pipeline';

export const maxDuration = 30;

export async function GET(request) {
  const isVercelCron = request.headers.get('x-vercel-cron');
  const auth = request.headers.get('authorization');
  if (!isVercelCron && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await planDailyContent();
    return NextResponse.json(result);
  } catch (e) {
    await logCron('daily_plan', null, 'failed', 0, e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}