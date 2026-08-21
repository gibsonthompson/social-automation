/**
 * Process Cron - v3
 *
 * Called every 5 min by cron-job.org.
 * Finds approved uploads whose scheduled_for has passed, publishes them.
 * For videos: create Instagram container, poll on a later cron run.
 *
 * FIXES IN v3
 * -----------
 * 1. error_log is no longer used as scratch space. In-flight publish state
 *    moves to the publish_state column. This is the actual bug: on Instagram
 *    success the old code set error_log to null, which deleted the Facebook
 *    error along with it. Every Facebook failure since launch was erased
 *    within five minutes of happening.
 * 2. The Instagram access token is no longer written into the database. It is
 *    re-read from cf_platform_tokens when the poller needs it.
 * 3. Facebook video requests are sent as form-encoded, not JSON. Meta's video
 *    endpoints do not reliably accept a JSON body.
 * 4. Facebook outcomes are persisted to fb_post_id and fb_error and survive an
 *    Instagram success.
 * 5. The full Facebook error object is captured (message, type, code, subcode,
 *    trace id), not just the message string.
 * 6. Graph version bumped to v22.0 to match the rest of the system. The old
 *    v21.0 here was inconsistent with your notes.
 * 7. Token lookups use maybeSingle() so a missing row returns null instead of
 *    throwing and aborting the whole run.
 *
 * REQUIRES: 04-publish-state.sql
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

const GRAPH_API = 'https://graph.facebook.com/v22.0';

// ── Helpers ─────────────────────────────────────────────────────

function wantsPlatform(business, platform) {
  const p = business.publish_to;
  if (!p) return true;
  return p === platform || p === 'both';
}

async function getToken(businessId, platform) {
  const { data } = await supabase
    .from('cf_platform_tokens')
    .select('*')
    .eq('business_id', businessId)
    .eq('platform', platform)
    .eq('status', 'active')
    .maybeSingle();
  return data || null;
}

// Captures everything Meta tells us, not just the message.
function describeGraphError(err) {
  if (!err) return null;
  const parts = [];
  if (err.message) parts.push(err.message);
  if (err.type) parts.push(`type=${err.type}`);
  if (err.code != null) parts.push(`code=${err.code}`);
  if (err.error_subcode != null) parts.push(`subcode=${err.error_subcode}`);
  if (err.error_user_title) parts.push(`title=${err.error_user_title}`);
  if (err.error_user_msg) parts.push(`user_msg=${err.error_user_msg}`);
  if (err.fbtrace_id) parts.push(`trace=${err.fbtrace_id}`);
  return parts.join(' | ');
}

// ── SMS Notification on publish ─────────────────────────────────

async function notifyPostPublished(businessName, caption, platformPostId, fbError) {
  const apiKey = process.env.TELNYX_API_KEY;
  const from = process.env.TELNYX_FROM_NUMBER;
  const to = process.env.NOTIFY_PHONE_NUMBER;
  if (!apiKey || !from || !to) return;

  const preview = (caption || '').split('\n')[0].slice(0, 60);
  const igLink = platformPostId ? `https://www.instagram.com/reel/${platformPostId}/` : '';
  let body = `${businessName} posted\n"${preview}"\n${igLink}`;
  if (fbError) body += `\nFACEBOOK FAILED: ${String(fbError).slice(0, 120)}`;

  try {
    await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, text: body }),
    });
  } catch (e) { console.log('[SMS] Notification failed (non-fatal):', e.message); }
}

// ── Route ───────────────────────────────────────────────────────

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

    console.log(`[PROCESS] Publishing: "${nextPost.filename}" for ${business.name} (${isVideo ? 'video' : 'image'})`);

    // ── Pre-publish: ensure media file is accessible ──
    let mediaUrl = nextPost.media_url;
    try {
      const headCheck = await fetch(mediaUrl, { method: 'HEAD' });
      if (!headCheck.ok && nextPost.backup_url) {
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
        // ── Video: Instagram container now, Facebook now, poll IG later ──
        const state = await createVideoContainers(nextPost, business, caption, hashtags, mediaUrl);

        // publish_state holds the in-flight IDs. No tokens, ever.
        await supabase.from('cf_content_uploads').update({
          status: 'publishing_video',
          publish_state: state,
          fb_post_id: state.fb_post_id || null,
          fb_error: state.fb_error || null,
          error_log: null,
          updated_at: new Date().toISOString(),
        }).eq('id', nextPost.id);

        if (state.fb_error) {
          console.error(`[PROCESS] FACEBOOK FAILED for ${nextPost.filename}: ${state.fb_error}`);
        } else if (state.fb_post_id) {
          console.log(`[PROCESS] Facebook published: ${state.fb_post_id}`);
        } else if (state.fb_skipped) {
          console.log(`[PROCESS] Facebook skipped: ${state.fb_skipped}`);
        }

        return NextResponse.json({
          processed: true,
          id: nextPost.id,
          status: 'publishing_video',
          facebook: state.fb_post_id ? 'published' : (state.fb_error || state.fb_skipped || 'not attempted'),
          message: 'Instagram container created, polling on next cron run',
          durationMs: Date.now() - startTime,
        });

      } else {
        // ── Image: Full publish in one call ──
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
          fb_post_id: result.fb_post_id || null,
          fb_error: result.fb_error || null,
          posted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', nextPost.id);

        const duration = Date.now() - startTime;
        console.log(`[PROCESS] Published image: ${result.platform_post_id} (${duration}ms)`);
        await notifyPostPublished(business.name, caption, result.platform_post_id, result.fb_error);

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

// ── Video: create IG container, publish to FB ───────────────────

async function createVideoContainers(post, business, caption, hashtags, mediaUrl) {
  const tagLine = hashtags.map(h => (String(h).startsWith('#') ? h : '#' + h)).join(' ');
  const fullCaption = tagLine ? `${caption}\n\n${tagLine}` : caption;
  const videoUrl = mediaUrl || post.media_url;
  const state = {};

  // ---- Instagram ----------------------------------------------
  if (wantsPlatform(business, 'instagram')) {
    const token = await getToken(business.id, 'instagram');
    if (!token) {
      state.ig_skipped = 'no active instagram token row';
    } else {
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
      if (container.error) throw new Error(`IG container failed: ${describeGraphError(container.error)}`);
      state.ig_container_id = container.id;
      state.ig_user_id = token.ig_user_id;
      // Token deliberately NOT stored. The poller re-reads it.
    }
  }

  // ---- Facebook ------------------------------------------------
  if (wantsPlatform(business, 'facebook')) {
    const token = await getToken(business.id, 'facebook');
    if (!token) {
      state.fb_skipped = 'no active facebook token row';
    } else if (!token.fb_page_id) {
      state.fb_skipped = 'facebook token row has no fb_page_id';
    } else {
      try {
        // Facebook Page publishing needs a Page access token, not the
        // system user token. Instagram does not. That difference is why
        // one platform can work while the other silently does not.
        // NOTE: request ONLY access_token here. Meta rejects the whole call
        // with "(#100) nonexisting field (tasks)" if tasks is requested on
        // the page node via a System User token, which killed FB posting.
        const pageTokenResp = await fetch(
          `${GRAPH_API}/${token.fb_page_id}?fields=access_token&access_token=${encodeURIComponent(token.access_token)}`
        );
        const pageTokenData = await pageTokenResp.json();

        if (pageTokenData.error) {
          state.fb_error = `page token lookup failed: ${describeGraphError(pageTokenData.error)}`;
        } else if (!pageTokenData.access_token) {
          state.fb_error = `no page access token returned for page ${token.fb_page_id}`;
        } else {
          const fbCaption = post.facebook_caption || caption;
          const description = tagLine ? `${fbCaption}\n\n${tagLine}` : fbCaption;

          // Form encoded. Meta's video endpoints do not reliably accept JSON.
          const form = new URLSearchParams();
          form.set('file_url', videoUrl);
          form.set('description', description);
          form.set('access_token', pageTokenData.access_token);

          const fbResp = await fetch(`${GRAPH_API}/${token.fb_page_id}/videos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
          });

          const rawBody = await fbResp.text();
          let fbResult;
          try { fbResult = JSON.parse(rawBody); }
          catch { fbResult = { error: { message: `non-JSON response (HTTP ${fbResp.status}): ${rawBody.slice(0, 300)}` } }; }

          if (fbResult.error) {
            state.fb_error = describeGraphError(fbResult.error);
            state.fb_http_status = fbResp.status;
          } else if (fbResult.id) {
            state.fb_post_id = fbResult.id;
          } else {
            state.fb_error = `unexpected response (HTTP ${fbResp.status}): ${rawBody.slice(0, 300)}`;
          }
        }
      } catch (fbErr) {
        state.fb_error = `exception: ${fbErr.message}`;
      }
    }
  }

  return state;
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

  console.log(`[PROCESS] Checking video container status for ${pending.filename}`);

  try {
    // Read from the new column, falling back to the old error_log format
    // so any post already mid-flight when you deploy this still completes.
    let state = pending.publish_state;
    if (!state && pending.error_log) {
      try { state = JSON.parse(pending.error_log); } catch { state = {}; }
    }
    state = state || {};

    const fbPostId = pending.fb_post_id || state.fb_post_id || null;
    const fbError = pending.fb_error || state.fb_error || null;

    if (!state.ig_container_id) {
      // Facebook only, or Instagram was skipped. Close it out.
      await supabase.from('cf_content_uploads').update({
        status: fbPostId ? 'posted' : 'failed',
        platform_post_id: fbPostId,
        fb_post_id: fbPostId,
        fb_error: fbError,
        posted_at: fbPostId ? new Date().toISOString() : null,
        error_log: fbPostId ? null : (fbError || 'no instagram container and no facebook post'),
        updated_at: new Date().toISOString(),
      }).eq('id', pending.id);

      await notifyPostPublished(pending.cf_businesses?.name || 'Unknown', pending.instagram_caption, fbPostId, fbError);
      return { processed: true, id: pending.id, status: fbPostId ? 'posted' : 'failed', facebook: fbPostId || fbError };
    }

    // Token is re-read, never taken from the database row.
    const igToken = await getToken(pending.business_id, 'instagram');
    if (!igToken) throw new Error('no active instagram token row while polling container');

    const checkResp = await fetch(
      `${GRAPH_API}/${state.ig_container_id}?fields=status_code,status&access_token=${encodeURIComponent(igToken.access_token)}`
    );
    const check = await checkResp.json();
    if (check.error) throw new Error(`container status check failed: ${describeGraphError(check.error)}`);
    const status = check.status_code;

    console.log(`[PROCESS] IG container ${state.ig_container_id} status: ${status}`);

    if (status === 'FINISHED') {
      const publishResp = await fetch(`${GRAPH_API}/${state.ig_user_id}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: state.ig_container_id,
          access_token: igToken.access_token,
        }),
      });
      const published = await publishResp.json();
      if (published.error) throw new Error(`IG publish failed: ${describeGraphError(published.error)}`);

      const platformPostId = published.id;

      // THE FIX. Instagram succeeding no longer erases what Facebook said.
      await supabase.from('cf_content_uploads').update({
        status: 'posted',
        platform_post_id: platformPostId,
        fb_post_id: fbPostId,
        fb_error: fbError,
        posted_at: new Date().toISOString(),
        publish_state: null,
        error_log: fbError ? `facebook: ${fbError}` : null,
        updated_at: new Date().toISOString(),
      }).eq('id', pending.id);

      console.log(`[PROCESS] Video published to IG: ${platformPostId}${fbError ? ` (FACEBOOK FAILED: ${fbError})` : ''}`);
      await notifyPostPublished(pending.cf_businesses?.name || 'Unknown', pending.instagram_caption, platformPostId, fbError);
      return { processed: true, id: pending.id, status: 'posted', platform_post_id: platformPostId, facebook: fbPostId || fbError || 'not attempted' };
    }

    if (status === 'ERROR' || status === 'EXPIRED') {
      await supabase.from('cf_content_uploads').update({
        status: 'failed',
        publish_state: null,
        fb_post_id: fbPostId,
        fb_error: fbError,
        error_log: `IG container ${status}${check.status ? ` (${check.status})` : ''}${fbError ? ` | facebook: ${fbError}` : ''}`,
        updated_at: new Date().toISOString(),
      }).eq('id', pending.id);

      return { processed: true, id: pending.id, status: 'failed', error: `IG container ${status}` };
    }

    console.log(`[PROCESS] Video still processing (${status}), will check again`);
    return { processed: false, reason: 'video_still_processing', status };

  } catch (err) {
    console.error(`[PROCESS] Video container check failed: ${err.message}`);
    await supabase.from('cf_content_uploads').update({
      status: 'failed',
      publish_state: null,
      error_log: err.message,
      updated_at: new Date().toISOString(),
    }).eq('id', pending.id);

    return { processed: true, id: pending.id, status: 'failed', error: err.message };
  }
}