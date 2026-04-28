/**
 * Queue Management API
 * Path: src/app/api/queue/route.js
 * 
 * GET  /api/queue?status=review&business_id=...&limit=20
 * POST /api/queue  { id, action: 'approve'|'reject', notes }
 */
import { NextResponse } from 'next/server';
import { supabase, approveAndPublish, rejectPost } from '@/lib/content-farm/pipeline';

export const maxDuration = 60;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const businessId = searchParams.get('business_id');
  const limit = parseInt(searchParams.get('limit') || '50');

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

export async function POST(request) {
  const { id, action, notes } = await request.json();

  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'id and action (approve|reject) required' }, { status: 400 });
  }

  try {
    if (action === 'approve') {
      const result = await approveAndPublish(id);
      return NextResponse.json(result);
    } else {
      const result = await rejectPost(id, notes);
      return NextResponse.json(result);
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}