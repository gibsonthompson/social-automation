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