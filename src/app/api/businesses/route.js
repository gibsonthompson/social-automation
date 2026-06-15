import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  const { data, error } = await supabase.rpc('get_all_businesses');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ businesses: data || [] });
}

export async function POST(request) {
  const body = await request.json();
  const { business_id, posts_per_day, posting_times, auto_post, active_days } = body;

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const update = {};
  if (posts_per_day !== undefined) update.posts_per_day = posts_per_day;
  if (posting_times !== undefined) update.posting_times = posting_times;
  if (auto_post !== undefined) update.auto_post = auto_post;
  if (active_days !== undefined) update.active_days = active_days;
  update.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('cf_businesses')
    .update(update)
    .eq('id', business_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, updated: update });
}