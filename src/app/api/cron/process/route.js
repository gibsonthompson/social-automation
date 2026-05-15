/**
 * Process Cron — v2
 * 
 * Called every 5 min by cron-job.org.
 * Finds approved uploads whose scheduled_for has passed, publishes them.
 * For videos: two-step publish (create container → poll on next cron run).
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

const GRAPH_API = 'https://graph.facebook.com/v21.0';

// ── SMS Notification on publish ─────────────────────────────────
async function notifyPostPublished(businessName, caption, platformPostId) {
  const apiKey = process.env.TELNYX_API_KEY;
  const from = process.env.TELNYX_FROM_NUMBER;
  const to = process.env.NOTIFY_PHONE_NUMBER;
  if (!apiKey || !from || !to) return;

  const preview = (caption || '').split('\n')[0].slice(0, 60);
  const igLink = platformPostId ? `https://www.instagram.com/reel/${platformPostId}/` : '';
  const body = `✅ ${businessName} posted\n"${preview}"\n${igLink}`;

  try {
    await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, text: body }),
    });
  } catch (e) { console.log('[SMS] Notification failed (non-fatal):', e.message); }
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // ── Step A: Check for videos waiting on container processing ──
    const pendingResult = await checkPendingVideoContainers();
    if (pendingResult) return NextResponse.json(pendingResult);

    // ── Step B: Find the next approved upload that's due ──
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
    const isVideo = nextPost.media_type?.includes('video');

    // Claim the post
    const { error: claimErr } = await supabase
      .from('cf_content_uploads')
      .update({ status: 'posting', updated_at: new Date().toISOString() })
      .eq('id', nextPost.id)
      .eq('status', 'approved');

    if (claimErr) throw new Error(`Claim failed: ${claimErr.message}`);

    console.log(`[PROCESS] Publishing: "${nextPost.content_description}" for ${business.name} (${isVideo ? 'video' : 'image'})`);

    // ── Pre-publish: ensure media file is accessible ──
    let mediaUrl = nextPost.media_url;
    try {
      const headCheck = await fetch(mediaUrl, { method: 'HEAD' });
      if (!headCheck.ok && nextPost.backup_url) {
        // DO file was wiped by a deploy — restore from Supabase backup
        console.log(`[PROCESS] DO file missing (${headCheck.status}), restoring from backup...`);
        const doUrl = (process.env.RENDER_SERVICE_URL || 'https://urchin-app-bqb4i.ondigitalocean.app').replace('/api/content-render', '');
        const restoreResp = await fetch(`${doUrl}/api/media/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storage_path: nextPost.storage_path, backup_url: nextPost.backup_url }),
        });
        const restoreData = await restoreResp.json();
        if (restoreData.restored) {
          mediaUrl = restoreData.url;
          console.log(`[PROCESS] Restored: ${mediaUrl}`);
        } else {
          throw new Error(`Restore failed: ${restoreData.error || 'unknown'}`);
        }
      }
    } catch (checkErr) {
      if (nextPost.backup_url) {
        console.log(`[PROCESS] HEAD check failed, attempting restore...`);
        try {
          const doUrl = (process.env.RENDER_SERVICE_URL || 'https://urchin-app-bqb4i.ondigitalocean.app').replace('/api/content-render', '');
          const restoreResp = await fetch(`${doUrl}/api/media/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storage_path: nextPost.storage_path, backup_url: nextPost.backup_url }),
          });
          const restoreData = await restoreResp.json();
          if (restoreData.restored) {
            mediaUrl = restoreData.url;
            console.log(`[PROCESS] Restored: ${mediaUrl}`);
          }
        } catch (restoreErr) {
          console.error(`[PROCESS] Restore failed: ${restoreErr.message}`);
        }
      }
    }

    try {
      const caption = nextPost.instagram_caption || '';
      const hashtags = nextPost.hashtags || [];

      if (isVideo) {
        // ── Video: Create containers only, don't wait for processing ──
        const igResult = await createVideoContainers(nextPost, business, caption, hashtags, mediaUrl);

        // Save container IDs for next cron run to poll
        await supabase.from('cf_content_uploads').update({
          status: 'publishing_video',
          error_log: JSON.stringify(igResult), // Store container IDs temporarily
          updated_at: new Date().toISOString(),
        }).eq('id', nextPost.id);

        console.log(`[PROCESS] Video containers created, will poll next cron run`);
        return NextResponse.json({
          processed: true,
          id: nextPost.id,
          status: 'publishing_video',
          message: 'Video containers created, polling on next cron run',
          durationMs: Date.now() - startTime,
        });

      } else {
        // ── Image: Full publish in one call (fast enough) ──
        const postForPublish = {
          business_id: business.id,
          render_output_url: mediaUrl,
          render_output_type: 'image/png',
          caption,
          facebook_caption: nextPost.facebook_caption || '',
          hashtags,
          platform: business.publish_to || 'both',
        };

        const result = await publishPost(postForPublish);

        await supabase.from('cf_content_uploads').update({
          status: 'posted',
          platform_post_id: result.platform_post_id,
          posted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', nextPost.id);

        const duration = Date.now() - startTime;
        console.log(`[PROCESS] Published image: ${result.platform_post_id} (${duration}ms)`);
        await notifyPostPublished(business.name, caption, result.platform_post_id);

        return NextResponse.json({
          processed: true,
          id: nextPost.id,
          business: business.name,
          platform_post_id: result.platform_post_id,
          status: 'posted',
          durationMs: duration,
        });
      }

    } catch (pubErr) {
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

// ── Video: Create containers without waiting ────────────────────

async function createVideoContainers(post, business, caption, hashtags, mediaUrl) {
  const fullCaption = `${caption}\n\n${hashtags.map(h => '#' + h).join(' ')}`;
  const videoUrl = mediaUrl || post.media_url;
  const result = {};

  // Instagram container
  if (business.publish_to === 'instagram' || business.publish_to === 'both' || !business.publish_to) {
    const { data: token } = await supabase
      .from('cf_platform_tokens')
      .select('*')
      .eq('business_id', business.id)
      .eq('platform', 'instagram')
      .eq('status', 'active')
      .single();

    if (token) {
      const resp = await fetch(`${GRAPH_API}/${token.ig_user_id}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url: videoUrl,
          caption: fullCaption,
          media_type: 'REELS',
          thumb_offset: 3000,
          share_to_feed: true,
          access_token: token.access_token,
        }),
      });
      const container = await resp.json();
      if (container.error) throw new Error(`IG container failed: ${container.error.message}`);
      result.ig_container_id = container.id;
      result.ig_user_id = token.ig_user_id;
      result.ig_token = token.access_token;
    }
  }

  // Facebook — post video directly (no container flow needed)
  if (business.publish_to === 'facebook' || business.publish_to === 'both' || !business.publish_to) {
    const { data: token } = await supabase
      .from('cf_platform_tokens')
      .select('*')
      .eq('business_id', business.id)
      .eq('platform', 'facebook')
      .eq('status', 'active')
      .single();

    if (token) {
      try {
        // Get Page Access Token
        const pageTokenResp = await fetch(`${GRAPH_API}/${token.fb_page_id}?fields=access_token&access_token=${token.access_token}`);
        const pageTokenData = await pageTokenResp.json();

        if (pageTokenData.access_token) {
          const fbCaption = post.facebook_caption || caption;
          const fbResp = await fetch(`${GRAPH_API}/${token.fb_page_id}/videos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_url: videoUrl,
              description: `${fbCaption}\n\n${hashtags.map(h => '#' + h).join(' ')}`,
              access_token: pageTokenData.access_token,
            }),
          });
          const fbResult = await fbResp.json();
          if (fbResult.error) {
            console.error(`[PROCESS] FB video post failed: ${fbResult.error.message}`);
            result.fb_error = fbResult.error.message;
          } else {
            result.fb_post_id = fbResult.id;
          }
        }
      } catch (fbErr) {
        console.error(`[PROCESS] FB video error: ${fbErr.message}`);
        result.fb_error = fbErr.message;
      }
    }
  }

  return result;
}

// ── Check pending video containers ──────────────────────────────

async function checkPendingVideoContainers() {
  const { data: pending } = await supabase
    .from('cf_content_uploads')
    .select('*, cf_businesses(*)')
    .eq('status', 'publishing_video')
    .order('updated_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pending) return null;

  console.log(`[PROCESS] Checking video container status for ${pending.id}`);

  try {
    const containerData = JSON.parse(pending.error_log || '{}');

    if (!containerData.ig_container_id) {
      // No IG container — maybe FB-only, mark as posted
      await supabase.from('cf_content_uploads').update({
        status: 'posted',
        platform_post_id: containerData.fb_post_id || null,
        posted_at: new Date().toISOString(),
        error_log: null,
        updated_at: new Date().toISOString(),
      }).eq('id', pending.id);

      await notifyPostPublished(pending.cf_businesses?.name || 'Unknown', pending.instagram_caption, containerData.fb_post_id);
      return { processed: true, id: pending.id, status: 'posted', platform_post_id: containerData.fb_post_id };
    }

    // Poll IG container status
    const checkResp = await fetch(
      `${GRAPH_API}/${containerData.ig_container_id}?fields=status_code&access_token=${containerData.ig_token}`
    );
    const check = await checkResp.json();
    const status = check.status_code;

    console.log(`[PROCESS] IG container ${containerData.ig_container_id} status: ${status}`);

    if (status === 'FINISHED') {
      // Publish to IG
      const publishResp = await fetch(`${GRAPH_API}/${containerData.ig_user_id}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerData.ig_container_id,
          access_token: containerData.ig_token,
        }),
      });
      const published = await publishResp.json();

      if (published.error) throw new Error(`IG publish failed: ${published.error.message}`);

      const platformPostId = published.id;

      await supabase.from('cf_content_uploads').update({
        status: 'posted',
        platform_post_id: platformPostId,
        posted_at: new Date().toISOString(),
        error_log: null,
        updated_at: new Date().toISOString(),
      }).eq('id', pending.id);

      console.log(`[PROCESS] Video published: ${platformPostId}`);
      await notifyPostPublished(pending.cf_businesses?.name || 'Unknown', pending.instagram_caption, platformPostId);
      return { processed: true, id: pending.id, status: 'posted', platform_post_id: platformPostId };
    }

    if (status === 'ERROR' || status === 'EXPIRED') {
      await supabase.from('cf_content_uploads').update({
        status: 'failed',
        error_log: `IG container ${status}`,
        updated_at: new Date().toISOString(),
      }).eq('id', pending.id);

      return { processed: true, id: pending.id, status: 'failed', error: `IG container ${status}` };
    }

    // Still processing — do nothing, check again next cron run
    console.log(`[PROCESS] Video still processing (${status}), will check again`);
    return { processed: false, reason: 'video_still_processing', status };

  } catch (err) {
    console.error(`[PROCESS] Video container check failed: ${err.message}`);
    await supabase.from('cf_content_uploads').update({
      status: 'failed',
      error_log: err.message,
      updated_at: new Date().toISOString(),
    }).eq('id', pending.id);

    return { processed: true, id: pending.id, status: 'failed', error: err.message };
  }
}