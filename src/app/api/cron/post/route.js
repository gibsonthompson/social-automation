/**
 * Cron: Post Approved Content
 * Schedule: Every 30 minutes
 * Path: src/app/api/cron/post/route.js
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publishPost } from '@/lib/content-farm/poster';
import { logCron } from '@/lib/content-farm/pipeline';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const maxDuration = 120;

export async function GET(request) {
  const isVercelCron = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');

  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  let posted = 0;
  let failed = 0;

  try {
    const { data: readyPosts } = await supabase
      .from('cf_content_queue')
      .select('*')
      .eq('status', 'approved')
      .lte('scheduled_for', new Date().toISOString())
      .not('render_output_url', 'is', null)
      .order('scheduled_for', { ascending: true })
      .limit(10);

    if (!readyPosts?.length) {
      return NextResponse.json({ posted: 0, message: 'No posts ready' });
    }

    for (const post of readyPosts) {
      // Mark as posting to prevent double-processing
      await supabase.from('cf_content_queue')
        .update({ status: 'posting' })
        .eq('id', post.id);

      try {
        const result = await publishPost(post);

        await supabase.from('cf_content_queue').update({
          status: 'posted',
          posted_at: new Date().toISOString(),
          platform_post_id: result.platform_post_id,
        }).eq('id', post.id);

        // Update history with posted_at
        await supabase.from('cf_content_history')
          .update({ posted_at: new Date().toISOString() })
          .eq('queue_id', post.id);

        posted++;
      } catch (e) {
        await supabase.from('cf_content_queue').update({
          status: 'failed',
          error_log: e.message,
          retry_count: (post.retry_count || 0) + 1,
        }).eq('id', post.id);
        failed++;
      }
    }

    await logCron('posting_check', null, 'completed', posted, failed > 0 ? `${failed} failed` : null, Date.now() - startTime);
    return NextResponse.json({ posted, failed, total: readyPosts.length });

  } catch (e) {
    await logCron('posting_check', null, 'failed', posted, e.message, Date.now() - startTime);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}