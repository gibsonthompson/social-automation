/**
 * Content Farm — Meta API Publisher
 * Handles Instagram and Facebook posting via Graph API
 * 
 * Path: src/lib/content-farm/poster.js
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GRAPH_API = 'https://graph.facebook.com/v21.0';

// ── Token Management ────────────────────────────────────────────

async function getToken(businessId, platform) {
  const { data, error } = await supabase
    .from('cf_platform_tokens')
    .select('*')
    .eq('business_id', businessId)
    .eq('platform', platform)
    .eq('status', 'active')
    .single();

  if (error || !data) throw new Error(`No active ${platform} token for business ${businessId}`);
  return data;
}

export async function refreshExpiredTokens() {
  const { data: tokens } = await supabase
    .from('cf_platform_tokens')
    .select('*')
    .eq('status', 'active')
    .lt('token_expires_at', new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString());

  if (!tokens?.length) return { refreshed: 0 };

  let refreshed = 0;
  for (const token of tokens) {
    try {
      const response = await fetch(
        `${GRAPH_API}/oauth/access_token?` +
        `grant_type=fb_exchange_token&` +
        `client_id=${process.env.META_APP_ID}&` +
        `client_secret=${process.env.META_APP_SECRET}&` +
        `fb_exchange_token=${token.access_token}`
      );
      const data = await response.json();

      if (data.access_token) {
        await supabase.from('cf_platform_tokens').update({
          access_token: data.access_token,
          token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
          last_refreshed_at: new Date().toISOString(),
        }).eq('id', token.id);
        refreshed++;
      }
    } catch (e) {
      console.error(`Token refresh failed for ${token.id}:`, e.message);
    }
  }

  return { refreshed, total: tokens.length };
}


// ── Instagram Publishing ────────────────────────────────────────

export async function postToInstagram(post) {
  const token = await getToken(post.business_id, 'instagram');
  const isVideo = post.render_output_type === 'video/mp4';

  // Step 1: Create media container
  const containerBody = {
    caption: `${post.caption || ''}\n\n${(post.hashtags || []).map(h => '#' + h).join(' ')}`,
    access_token: token.access_token,
  };

  if (isVideo) {
    containerBody.video_url = post.render_output_url;
    containerBody.media_type = 'REELS';
  } else {
    containerBody.image_url = post.render_output_url;
  }

  const containerResp = await fetch(`${GRAPH_API}/${token.ig_user_id}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(containerBody),
  });
  const container = await containerResp.json();

  if (container.error) throw new Error(`IG container failed: ${container.error.message}`);

  // Step 2: Wait for container to be ready (images AND videos need this)
  let status = 'IN_PROGRESS';
  let attempts = 0;
  const maxAttempts = isVideo ? 30 : 10;
  const pollInterval = isVideo ? 5000 : 2000;
  
  while (status !== 'FINISHED' && attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, pollInterval));
    const checkResp = await fetch(
      `${GRAPH_API}/${container.id}?fields=status_code&access_token=${token.access_token}`
    );
    const check = await checkResp.json();
    status = check.status_code;
    attempts++;
    
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(`IG container processing failed: ${status}`);
    }
  }
  
  if (status !== 'FINISHED') {
    throw new Error(`IG container not ready after ${attempts} attempts: ${status}`);
  }

  // Step 3: Publish
  const publishResp = await fetch(`${GRAPH_API}/${token.ig_user_id}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: container.id,
      access_token: token.access_token,
    }),
  });
  const published = await publishResp.json();

  if (published.error) throw new Error(`IG publish failed: ${published.error.message}`);
  return published.id;
}


// ── Facebook Publishing ─────────────────────────────────────────

async function getPageAccessToken(pageId, systemUserToken) {
  // System user tokens need to be exchanged for a Page Access Token
  const resp = await fetch(
    `${GRAPH_API}/${pageId}?fields=access_token&access_token=${systemUserToken}`
  );
  const data = await resp.json();
  if (data.error) throw new Error(`Failed to get page token: ${data.error.message}`);
  return data.access_token;
}

export async function postToFacebook(post) {
  const token = await getToken(post.business_id, 'facebook');
  const isVideo = post.render_output_type === 'video/mp4';
  
  // Use facebook-specific caption if available, otherwise fall back to instagram caption
  const fbCaption = post.facebook_caption || post.caption || '';
  const caption = `${fbCaption}\n\n${(post.hashtags || []).map(h => '#' + h).join(' ')}`;

  // Get the actual Page Access Token (not the system user token)
  const pageToken = await getPageAccessToken(token.fb_page_id, token.access_token);

  let result;

  if (isVideo) {
    const resp = await fetch(`${GRAPH_API}/${token.fb_page_id}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_url: post.render_output_url,
        description: caption,
        access_token: pageToken,
      }),
    });
    result = await resp.json();
  } else {
    const resp = await fetch(`${GRAPH_API}/${token.fb_page_id}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: post.render_output_url,
        message: caption,
        access_token: pageToken,
      }),
    });
    result = await resp.json();
  }

  if (result.error) throw new Error(`FB post failed: ${result.error.message}`);
  return result.id || result.post_id;
}


// ── Unified Post Function ───────────────────────────────────────

export async function publishPost(post) {
  const results = {};

  if (post.platform === 'instagram' || post.platform === 'both') {
    try {
      results.instagram = await postToInstagram(post);
    } catch (e) {
      results.instagram_error = e.message;
      console.error(`[PUBLISH] Instagram failed: ${e.message}`);
    }
  }

  if (post.platform === 'facebook' || post.platform === 'both') {
    try {
      results.facebook = await postToFacebook(post);
    } catch (e) {
      results.facebook_error = e.message;
      console.error(`[PUBLISH] Facebook failed: ${e.message}`);
    }
  }

  const platform_post_id = results.instagram || results.facebook || null;

  // If ALL platforms failed, throw so the caller knows
  if (!platform_post_id) {
    const errors = [results.instagram_error, results.facebook_error].filter(Boolean).join('; ');
    throw new Error(`All platforms failed: ${errors || 'No platforms configured'}`);
  }

  return {
    platform_post_id,
    details: results,
  };
}