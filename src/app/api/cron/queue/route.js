/**
 * Content Farm — Queue Management API
 * Path: src/app/api/content-farm/queue/route.js
 *
 * GET  /api/content-farm/queue?status=review&business_id=...&limit=20
 * POST /api/content-farm/queue  { id, action: 'approve'|'reject', notes }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GET — List queue items
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const businessId = searchParams.get('business_id');
  const limit = parseInt(searchParams.get('limit') || '20');

  let query = supabase
    .from('cf_content_queue')
    .select('*, cf_businesses(name, slug)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  if (businessId) query = query.eq('business_id', businessId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data, count: data?.length || 0 });
}

// POST — Approve or reject a post
export async function POST(request) {
  const { id, action, notes } = await request.json();

  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'id and action (approve|reject) required' }, { status: 400 });
  }

  const status = action === 'approve' ? 'approved' : 'rejected';

  const { error } = await supabase
    .from('cf_content_queue')
    .update({ status, reviewer_notes: notes || null })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If rejecting, save feedback for AI learning
  if (action === 'reject') {
    const { data: post } = await supabase
      .from('cf_content_queue')
      .select('business_id, ai_content, content_attributes')
      .eq('id', id)
      .single();

    if (post) {
      await supabase.from('cf_content_feedback').insert({
        business_id: post.business_id,
        queue_id: id,
        headline: post.ai_content?.headline,
        content_type: post.content_attributes?.topic_category,
        template_name: post.ai_content?.template,
        rating: 'bad',
        reason: notes || 'Manually rejected',
      });
    }
  }

  return NextResponse.json({ id, status });
}