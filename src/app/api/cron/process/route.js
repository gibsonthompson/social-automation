/**
 * Process Cron — v2
 * 
 * Called every 5 min by cron-job.org.
 * Finds approved uploads whose scheduled_for has passed, publishes them.
 * 
 * Path: src/app/api/cron/process/route.js
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publishPost } from '@/lib/content-farm/poster';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Find the next approved upload that's due
    const { data: nextPost, error: fetchErr } = await supabase
      .from('cf_content_uploads')
      .select('*, cf_businesses(*)')
      .eq('status', 'approved')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);
    if (!nextPost) return NextResponse.json({ processed: false, reason: 'no_due_posts' });

    const business = nextPost.cf_businesses;
    const startTime = Date.now();

    // Claim the post
    const { error: claimErr } = await supabase
      .from('cf_content_uploads')
      .update({ status: 'posting', updated_at: new Date().toISOString() })
      .eq('id', nextPost.id)
      .eq('status', 'approved');

    if (claimErr) throw new Error(`Claim failed: ${claimErr.message}`);

    console.log(`[PROCESS] Publishing: "${nextPost.content_description}" for ${business.name}`);

    try {
      // Build the post object that poster.js expects
      const isVideo = nextPost.media_type?.includes('video');
      const caption = nextPost.instagram_caption || '';
      const hashtags = nextPost.hashtags || [];

      const postForPublish = {
        business_id: business.id,
        render_output_url: nextPost.media_url,
        render_output_type: isVideo ? 'video/mp4' : 'image/png',
        caption,
        hashtags,
        platform: business.publish_to || 'both',
      };

      const result = await publishPost(postForPublish);

      // Success
      await supabase.from('cf_content_uploads').update({
        status: 'posted',
        platform_post_id: result.platform_post_id,
        posted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', nextPost.id);

      const duration = Date.now() - startTime;
      console.log(`[PROCESS] Published: ${result.platform_post_id} (${duration}ms)`);

      return NextResponse.json({
        processed: true,
        id: nextPost.id,
        business: business.name,
        description: nextPost.content_description,
        platform_post_id: result.platform_post_id,
        status: 'posted',
        durationMs: duration,
      });

    } catch (pubErr) {
      // Publish failed
      console.error(`[PROCESS] Publish failed: ${pubErr.message}`);
      await supabase.from('cf_content_uploads').update({
        status: 'failed',
        error_log: pubErr.message,
        updated_at: new Date().toISOString(),
      }).eq('id', nextPost.id);

      return NextResponse.json({
        processed: true,
        id: nextPost.id,
        status: 'failed',
        error: pubErr.message,
        durationMs: Date.now() - startTime,
      });
    }

  } catch (err) {
    console.error('[PROCESS] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}