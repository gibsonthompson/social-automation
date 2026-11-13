/**
 * History API
 *
 * GET /api/history
 *   ?business_id=<uuid>|all      default all
 *   &status=posted|failed|all    default posted
 *   &q=<text>                    searches caption, filename, description
 *   &type=video|image|all
 *   &sort=newest|oldest|top      top = best composite score
 *   &page=1&limit=36             limit max 100
 *
 * Every past post with its thumbnail, captions, hashtags, where it went
 * (Instagram permalink, Facebook link, errors) and its latest metrics
 * (30d, else 7d, else 48h, else 24h).
 *
 * Instagram permalinks are backfilled lazily: when a page of results has
 * posted rows without one, they are looked up from the Graph API in a single
 * batched call per business and saved, so each row is only looked up once.
 *
 * Path: src/app/api/history/route.js
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 30;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GRAPH_API = 'https://graph.facebook.com/v22.0';
const WINDOW_RANK = { '30d': 4, '7d': 3, '48h': 2, '24h': 1 };

const COLUMNS = [
  'id', 'business_id', 'batch_id', 'filename', 'media_type', 'media_url', 'backup_url',
  'thumbnail_url', 'content_description', 'content_pillar', 'content_type', 'visual_mode',
  'mood', 'hook_strength', 'instagram_caption', 'facebook_caption', 'hashtags',
  'caption_edited', 'scheduled_for', 'status', 'error_log', 'platform_post_id',
  'ig_permalink', 'fb_post_id', 'fb_error', 'posted_at', 'created_at', 'updated_at',
].join(', ');

function cleanSearch(q) {
  // PostgREST or() syntax uses commas and parentheses as separators.
  return String(q || '').replace(/[,()*%\\]/g, ' ').trim().slice(0, 80);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get('business_id') || 'all';
  const status = searchParams.get('status') || 'posted';
  const type = searchParams.get('type') || 'all';
  const sort = searchParams.get('sort') || 'newest';
  const q = cleanSearch(searchParams.get('q'));
  const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '36', 10) || 36, 1), 100);

  const { data: businesses } = await supabase
    .from('cf_businesses').select('id, name, slug, primary_color, publish_to');
  const bizById = Object.fromEntries((businesses || []).map(b => [b.id, b]));

  // "top" sorts by score, which lives in another table. Rank ids first.
  let topIds = null;
  if (sort === 'top') {
    let perf = supabase.from('cf_content_performance')
      .select('upload_id, composite_score, metric_window')
      .not('upload_id', 'is', null)
      .order('composite_score', { ascending: false, nullsFirst: false })
      .limit(2000);
    if (businessId !== 'all') perf = perf.eq('business_id', businessId);
    const { data: perfRows } = await perf;
    const best = new Map();
    for (const r of perfRows || []) {
      const prev = best.get(r.upload_id);
      if (prev === undefined || (r.composite_score ?? -1) > prev) best.set(r.upload_id, r.composite_score ?? -1);
    }
    topIds = [...best.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }

  let query = supabase.from('cf_content_uploads').select(COLUMNS, { count: 'exact' });
  if (businessId !== 'all') query = query.eq('business_id', businessId);
  if (status === 'posted') query = query.eq('status', 'posted');
  else if (status === 'failed') query = query.eq('status', 'failed');
  else query = query.in('status', ['posted', 'failed']);
  if (type === 'video') query = query.ilike('media_type', '%video%');
  if (type === 'image') query = query.ilike('media_type', '%image%');
  if (q) query = query.or(`instagram_caption.ilike.*${q}*,facebook_caption.ilike.*${q}*,filename.ilike.*${q}*,content_description.ilike.*${q}*`);

  const from = (page - 1) * limit;
  let rows, count, error;

  if (topIds) {
    // Fetch the matching ranked slice, keep score order, then append unscored rows.
    const res = await query.in('id', topIds.slice(0, 1000)).limit(1000);
    error = res.error;
    const order = new Map(topIds.map((id, i) => [id, i]));
    const ranked = (res.data || []).sort((a, b) => order.get(a.id) - order.get(b.id));
    count = ranked.length;
    rows = ranked.slice(from, from + limit);
  } else {
    const res = await query
      .order(status === 'failed' ? 'updated_at' : 'posted_at', { ascending: sort === 'oldest', nullsFirst: false })
      .order('created_at', { ascending: sort === 'oldest' })
      .range(from, from + limit - 1);
    rows = res.data; count = res.count; error = res.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  rows = rows || [];

  // ── Latest metrics per post ──
  const ids = rows.map(r => r.id);
  const metrics = {};
  if (ids.length) {
    const { data: perf } = await supabase
      .from('cf_content_performance')
      .select('upload_id, metric_window, views, plays, reach, likes, comments, saves, shares, shares_sends, total_interactions, engagement_rate, composite_score, avg_watch_time_ms, pulled_at')
      .in('upload_id', ids);
    for (const p of perf || []) {
      const cur = metrics[p.upload_id];
      if (!cur || (WINDOW_RANK[p.metric_window] || 0) > (WINDOW_RANK[cur.metric_window] || 0)) metrics[p.upload_id] = p;
    }
  }

  // ── Backfill missing Instagram permalinks for this page ──
  await backfillPermalinks(rows, bizById);

  const posts = rows.map(r => {
    const b = bizById[r.business_id] || {};
    const m = metrics[r.id] || null;
    return {
      ...r,
      business: { id: b.id, name: b.name, slug: b.slug, color: b.primary_color || null },
      links: {
        instagram: r.ig_permalink || null,
        facebook: r.fb_post_id ? `https://www.facebook.com/${r.fb_post_id}` : null,
      },
      metrics: m ? {
        window: m.metric_window,
        views: m.views ?? m.plays ?? null,
        reach: m.reach ?? null,
        likes: m.likes ?? null,
        comments: m.comments ?? null,
        saves: m.saves ?? null,
        shares: m.shares ?? m.shares_sends ?? null,
        interactions: m.total_interactions ?? null,
        engagement_rate: m.engagement_rate ?? null,
        score: m.composite_score ?? null,
        avg_watch_ms: m.avg_watch_time_ms ?? null,
        pulled_at: m.pulled_at,
      } : null,
    };
  });

  return NextResponse.json(
    { posts, total: count || 0, page, limit, pages: Math.max(1, Math.ceil((count || 0) / limit)) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

async function backfillPermalinks(rows, bizById) {
  const missing = rows.filter(r => r.status === 'posted' && !r.ig_permalink && r.platform_post_id && r.platform_post_id !== r.fb_post_id);
  if (!missing.length) return;

  const byBiz = {};
  for (const r of missing) (byBiz[r.business_id] ||= []).push(r);

  await Promise.all(Object.entries(byBiz).map(async ([businessId, list]) => {
    const { data: token } = await supabase
      .from('cf_platform_tokens').select('access_token')
      .eq('business_id', businessId).eq('platform', 'instagram').eq('status', 'active')
      .maybeSingle();
    if (!token?.access_token) return;

    const lookup = async (idsChunk) => {
      const url = `${GRAPH_API}/?ids=${idsChunk.join(',')}&fields=permalink&access_token=${encodeURIComponent(token.access_token)}`;
      const r = await fetch(url, { cache: 'no-store' });
      return r.json();
    };

    const found = {};
    for (let i = 0; i < list.length; i += 50) {
      const chunk = list.slice(i, i + 50).map(r => r.platform_post_id);
      try {
        const j = await lookup(chunk);
        if (j && !j.error) {
          for (const [id, v] of Object.entries(j)) if (v?.permalink) found[id] = v.permalink;
        } else {
          // One bad id fails the whole batch call. Fall back to one by one.
          for (const id of chunk.slice(0, 12)) {
            try { const one = await lookup([id]); if (one?.[id]?.permalink) found[id] = one[id].permalink; } catch { /* skip */ }
          }
        }
      } catch { /* network: try again next page load */ }
    }

    await Promise.all(list.map(async r => {
      const link = found[r.platform_post_id];
      if (!link) return;
      r.ig_permalink = link;
      await supabase.from('cf_content_uploads').update({ ig_permalink: link }).eq('id', r.id);
    }));
  }));
}
