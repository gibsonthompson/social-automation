/**
 * Uploads API
 * 
 * POST /api/uploads  Create upload records after files are on DO
 * POST /api/uploads/process  Trigger AI intake for a batch
 * GET  /api/uploads?batch_id=xxx  List uploads in a batch
 * GET  /api/uploads?business_id=xxx&status=scheduled  List by status
 * GET  /api/uploads?business_id=xxx&statuses=scheduled,approved  Several
 *
 * The old GET sorted by day_number and cut off at 200 rows, so a business
 * with a long history (Reliable Solutions has 200+) never showed its newest
 * posts. It now sorts by schedule time and takes a real limit (max 2000).
 *
 * POST actions: process, schedule, approve, delete, update_caption,
 *               retry (failed post back into the queue), reschedule
 * 
 * Path: src/app/api/uploads/route.js
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processUpload } from '@/lib/content-farm/intake';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── GET: List uploads ───────────────────────────────────────────

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get('batch_id');
  const businessId = searchParams.get('business_id');
  const status = searchParams.get('status');
  const statuses = (searchParams.get('statuses') || '').split(',').map(s => s.trim()).filter(Boolean);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '1000', 10) || 1000, 1), 2000);

  let query = supabase
    .from('cf_content_uploads')
    .select('*')
    .order('scheduled_for', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (batchId) query = query.eq('batch_id', batchId);
  if (businessId) query = query.eq('business_id', businessId);
  if (status) query = query.eq('status', status);
  else if (statuses.length) query = query.in('status', statuses);

  const { data, error } = await query.limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ uploads: data, count: data?.length || 0 }, { headers: { 'Cache-Control': 'no-store' } });
}

// ── POST: Create records or trigger processing ──────────────────

export async function POST(request) {
  const body = await request.json();

  // Route: trigger AI processing for a batch
  if (body.action === 'process') {
    return handleProcess(body);
  }

  // Route: trigger scheduling
  if (body.action === 'schedule') {
    return handleSchedule(body);
  }

  // Route: approve batch or single
  if (body.action === 'approve') {
    return handleApprove(body);
  }

  // Route: delete post
  if (body.action === 'delete') {
    return handleDelete(body);
  }

  // Route: update caption
  if (body.action === 'update_caption') {
    return handleUpdateCaption(body);
  }

  // Route: put a failed post back in the queue
  if (body.action === 'retry') {
    return handleRetry(body);
  }

  // Route: re-flow a business's queue onto its cadence
  if (body.action === 'reschedule') {
    if (!body.business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
    const { rescheduleQueue } = await import('@/lib/content-farm/scheduler');
    return NextResponse.json(await rescheduleQueue(body.business_id));
  }

  // Default: create upload records
  return handleCreate(body);
}

// ── Create upload records ───────────────────────────────────────

async function handleCreate(body) {
  const { business_id, batch_id, files } = body;

  if (!business_id || !batch_id || !files?.length) {
    return NextResponse.json({ error: 'business_id, batch_id, and files[] required' }, { status: 400 });
  }

  const records = files.map(f => ({
    business_id,
    batch_id,
    filename: f.originalName || f.filename,
    media_type: f.mediaType,
    media_url: f.url,
    backup_url: f.backupUrl || null,
    storage_path: f.storagePath,
    file_size_bytes: f.size,
    status: 'uploaded',
  }));

  const { data, error } = await supabase
    .from('cf_content_uploads')
    .insert(records)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ created: data.length, batch_id, uploads: data });
}

// ── Process batch (AI Vision + Caption) ─────────────────────────

async function handleProcess(body) {
  const { upload_id, batch_id } = body;

  // Process single upload
  if (upload_id) {
    try {
      const result = await processUpload(upload_id);
      return NextResponse.json({ processed: 1, result });
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // Process next unprocessed in batch (one at a time for 60s limit)
  if (batch_id) {
    const { data: next } = await supabase
      .from('cf_content_uploads')
      .select('id')
      .eq('batch_id', batch_id)
      .eq('status', 'uploaded')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!next) {
      return NextResponse.json({ processed: 0, reason: 'all_processed' });
    }

    try {
      const result = await processUpload(next.id);
      
      // Check how many remain
      const { count } = await supabase
        .from('cf_content_uploads')
        .select('id', { count: 'exact', head: true })
        .eq('batch_id', batch_id)
        .eq('status', 'uploaded');

      return NextResponse.json({
        processed: 1,
        id: next.id,
        remaining: count || 0,
        result,
      });
    } catch (err) {
      // Single file failed, return 200 so UI continues with next file
      // The record is already marked 'failed' in Supabase by processUpload
      const { count } = await supabase
        .from('cf_content_uploads')
        .select('id', { count: 'exact', head: true })
        .eq('batch_id', batch_id)
        .eq('status', 'uploaded');

      return NextResponse.json({
        processed: 1,
        id: next.id,
        remaining: count || 0,
        error: err.message,
        skipped: true,
      });
    }
  }

  return NextResponse.json({ error: 'upload_id or batch_id required' }, { status: 400 });
}

// ── Schedule batch ──────────────────────────────────────────────

async function handleSchedule(body) {
  const { batch_id, start_date } = body;
  if (!batch_id) return NextResponse.json({ error: 'batch_id required' }, { status: 400 });

  const { scheduleUploads } = await import('@/lib/content-farm/scheduler');
  const result = await scheduleUploads(batch_id, start_date);
  return NextResponse.json(result);
}

// ── Approve ─────────────────────────────────────────────────────

async function handleApprove(body) {
  const { batch_id, upload_id } = body;

  if (batch_id) {
    const { data, error } = await supabase
      .from('cf_content_uploads')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('batch_id', batch_id)
      .eq('status', 'scheduled')
      .select('id');
    
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ approved: data?.length || 0 });
  }

  if (upload_id) {
    const { error } = await supabase
      .from('cf_content_uploads')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', upload_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ approved: 1 });
  }

  return NextResponse.json({ error: 'batch_id or upload_id required' }, { status: 400 });
}

// ── Delete ───────────────────────────────────────────────────────

async function handleDelete(body) {
  const { upload_id } = body;
  if (!upload_id) return NextResponse.json({ error: 'upload_id required' }, { status: 400 });

  // Get the record first
  const { data: upload } = await supabase
    .from('cf_content_uploads')
    .select('storage_path, backup_url, status')
    .eq('id', upload_id)
    .single();

  if (!upload) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Prevent deleting posted content (preserves learning data)
  if (upload.status === 'posted') {
    return NextResponse.json({ error: 'Cannot delete posted content. metrics data would be lost' }, { status: 400 });
  }

  // Prevent deleting while actively publishing
  if (upload.status === 'posting' || upload.status === 'publishing_video') {
    return NextResponse.json({ error: 'Cannot delete while publishing in progress' }, { status: 400 });
  }

  // Delete from Supabase Storage if backup exists
  if (upload.storage_path) {
    try {
      await supabase.storage.from('content-media').remove([upload.storage_path]);
    } catch (e) { /* non-fatal */ }
  }

  // Delete the record
  const { error } = await supabase
    .from('cf_content_uploads')
    .delete()
    .eq('id', upload_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}

// ── Update caption ──────────────────────────────────────────────

async function handleUpdateCaption(body) {
  const { upload_id, instagram_caption, facebook_caption, hashtags } = body;
  if (!upload_id) return NextResponse.json({ error: 'upload_id required' }, { status: 400 });

  const update = { caption_edited: true, updated_at: new Date().toISOString() };
  if (instagram_caption !== undefined) update.instagram_caption = instagram_caption;
  if (facebook_caption !== undefined) update.facebook_caption = facebook_caption;
  if (hashtags !== undefined) update.hashtags = hashtags;

  const { error } = await supabase
    .from('cf_content_uploads')
    .update(update)
    .eq('id', upload_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: true });
}
// ── Retry a failed post ─────────────────────────────────────────

async function handleRetry(body) {
  const { upload_id } = body;
  if (!upload_id) return NextResponse.json({ error: 'upload_id required' }, { status: 400 });

  const { data: row } = await supabase
    .from('cf_content_uploads').select('id, business_id, status, instagram_caption')
    .eq('id', upload_id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.status !== 'failed') return NextResponse.json({ error: `Only failed posts can be retried (this one is ${row.status})` }, { status: 400 });
  if (!row.instagram_caption) return NextResponse.json({ error: 'This post never got a caption. Delete it and upload the file again.' }, { status: 400 });

  // Far-future placeholder so the re-flow puts it at the END of the queue.
  const { error } = await supabase.from('cf_content_uploads').update({
    status: 'approved',
    scheduled_for: '2999-01-01T00:00:00Z',
    error_log: null,
    publish_state: null,
    updated_at: new Date().toISOString(),
  }).eq('id', upload_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { rescheduleQueue } = await import('@/lib/content-farm/scheduler');
  const flow = await rescheduleQueue(row.business_id);
  return NextResponse.json({ retried: true, reschedule: flow });
}
