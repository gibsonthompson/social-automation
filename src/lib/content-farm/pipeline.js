/**
 * Content Farm — Pipeline Library
 * 
 * Core functions called by Vercel cron API routes.
 * Each step is a standalone async function.
 * 
 * Path: src/lib/content-farm/pipeline.js
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import {
  getSeasonContext,
  buildBatchPlan,
  buildResearchPrompt,
  buildGenerationPrompt,
  extractContentAttributes,
} from './prompts';

// ── Clients ─────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Logging ─────────────────────────────────────────────────────

export async function logCron(cronName, businessId, status, itemsProcessed = 0, errorMessage = null, durationMs = null, metadata = null) {
  try {
    await supabase.from('cf_cron_logs').insert({
      cron_name: cronName,
      business_id: businessId,
      status,
      items_processed: itemsProcessed,
      error_message: errorMessage,
      duration_ms: durationMs,
      metadata,
    });
  } catch (e) {
    console.error('Failed to write cron log:', e.message);
  }
}


// ═══════════════════════════════════════════════════════════════════
// STEP 1: PLAN
// ═══════════════════════════════════════════════════════════════════

export function planContent(business) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = days[new Date().getDay()];
  const schedule = business.posting_schedule?.[today];

  if (!schedule || !schedule.types || schedule.types.length === 0) {
    return [];
  }

  const postCount = schedule.types.length;
  const postTimes = schedule.times || ['07:00', '12:00', '18:00'];
  const plan = buildBatchPlan(business, postCount);

  const todayDate = new Date();
  return plan.map((item, idx) => {
    const [hours, minutes] = (postTimes[idx] || postTimes[0]).split(':').map(Number);
    const scheduledFor = new Date(todayDate);
    scheduledFor.setHours(hours, minutes, 0, 0);

    return {
      ...item,
      type: schedule.types[idx] || 'static_image',
      scheduled_for: scheduledFor.toISOString(),
    };
  });
}


// ═══════════════════════════════════════════════════════════════════
// STEP 2: RESEARCH
// ═══════════════════════════════════════════════════════════════════

export async function researchTrends(business) {
  try {
    const prompt = buildResearchPrompt(business);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    });

    return response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
  } catch (e) {
    console.error(`[RESEARCH] Failed: ${e.message}`);
    return null; // Non-fatal
  }
}


// ═══════════════════════════════════════════════════════════════════
// STEP 3: GENERATE
// ═══════════════════════════════════════════════════════════════════

export async function generateContent(business, planItem, researchContext, performanceContext, recentPosts, feedbackItems) {
  const prompt = buildGenerationPrompt(
    business, planItem, researchContext, performanceContext, recentPosts, feedbackItems
  );

  let retries = 0;
  while (retries <= 2) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        temperature: 0.9,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');

      const clean = text.replace(/```json|```/g, '').trim();
      const content = JSON.parse(clean);

      content.template = planItem.template;
      content.content_type = planItem.category;

      const season = getSeasonContext();
      const attributes = extractContentAttributes(content, planItem, season);

      return { content, attributes };
    } catch (e) {
      retries++;
      if (retries > 2) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}


// ═══════════════════════════════════════════════════════════════════
// STEP 4: RENDER
// Calls this same Vercel project's /api/render endpoint
// ═══════════════════════════════════════════════════════════════════

export async function renderContent(content, business, templateId) {
  // Call our own render endpoint internally
  // In Vercel, we can call the route directly or use the public URL
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  const start = Date.now();

  const response = await fetch(`${baseUrl}/api/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, business, templateId }),
  });

  const data = await response.json();
  if (!data.image) throw new Error(data.error || 'No image returned');

  return {
    imageBase64: data.image,
    durationMs: Date.now() - start,
  };
}

/**
 * Upload rendered image to Supabase Storage.
 * Returns public URL for Meta API publishing.
 */
export async function uploadRenderedAsset(base64Data, businessSlug, queueId, type = 'png') {
  const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  const path = `content-farm/${businessSlug}/${queueId}.${type}`;

  const { error } = await supabase.storage
    .from('content-renders')
    .upload(path, buffer, {
      contentType: type === 'png' ? 'image/png' : 'video/mp4',
      cacheControl: '31536000',
      upsert: true,
    });

  if (error) {
    console.error(`[UPLOAD] Failed: ${error.message}`);
    return null;
  }

  const { data: urlData } = supabase.storage.from('content-renders').getPublicUrl(path);
  return urlData?.publicUrl || null;
}


// ═══════════════════════════════════════════════════════════════════
// STEP 5: REVIEW (QC)
// ═══════════════════════════════════════════════════════════════════

export function validateContent(content) {
  const issues = [];

  if (!content.headline || content.headline.length < 2) issues.push('Missing headline');
  if (!content.subtext || content.subtext.length < 5) issues.push('Missing subtext');
  if (!content.caption || content.caption.length < 30) issues.push('Caption too short');
  if (!content.hashtags || content.hashtags.length < 3) issues.push('Too few hashtags');

  const banned = ['revolutionary', 'cutting-edge', 'game-changer', 'sign up', 'get started'];
  const lower = (content.caption || '').toLowerCase();
  banned.forEach(w => { if (lower.includes(w)) issues.push(`Banned: "${w}"`); });

  const generic = ['never miss a call', 'ai receptionist', 'quality service', 'transform your business'];
  const lh = (content.headline || '').toLowerCase();
  generic.forEach(g => { if (lh === g) issues.push(`Generic headline: "${g}"`); });

  return { valid: issues.length === 0, issues };
}


// ═══════════════════════════════════════════════════════════════════
// FULL PIPELINE — Runs all steps for one business
// ═══════════════════════════════════════════════════════════════════

export async function runPipelineForBusiness(business) {
  const startTime = Date.now();
  console.log(`[PIPELINE] Starting for ${business.name}`);
  await logCron('daily_generation', business.id, 'started');

  let itemsProcessed = 0;

  try {
    // Step 1: Plan
    const queue = planContent(business);
    if (queue.length === 0) {
      await logCron('daily_generation', business.id, 'completed', 0, null, Date.now() - startTime, { reason: 'no_posts_scheduled' });
      return { business: business.name, processed: 0, reason: 'no_posts_scheduled' };
    }

    // Step 2: Research (once per business)
    const researchContext = await researchTrends(business);

    // Get performance context
    const { data: latestAnalysis } = await supabase
      .from('cf_content_analysis')
      .select('analysis_text, recommendations, best_hooks')
      .eq('business_id', business.id)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const performanceContext = latestAnalysis
      ? `Top hooks: ${JSON.stringify(latestAnalysis.best_hooks || [])}\nRecommendations: ${JSON.stringify(latestAnalysis.recommendations || [])}`
      : null;

    // Get recent posts for dedup
    const { data: recentPosts } = await supabase
      .from('cf_content_history')
      .select('hook_text, headline, template_name, content_type')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Get feedback
    const { data: feedbackItems } = await supabase
      .from('cf_content_feedback')
      .select('headline, content_type, template_name, rating, reason')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(15);

    const batchId = crypto.randomUUID();
    const results = [];

    // Steps 3-5 for each post
    for (const entry of queue) {
      try {
        // Insert queue entry
        const { data: queueRow, error: insertErr } = await supabase
          .from('cf_content_queue')
          .insert({
            business_id: business.id,
            type: entry.type,
            status: 'generating',
            platform: 'instagram',
            scheduled_for: entry.scheduled_for,
            batch_id: batchId,
          })
          .select()
          .single();

        if (insertErr) { console.error(`[QUEUE] Insert failed:`, insertErr.message); continue; }

        // Step 3: Generate
        const { content, attributes } = await generateContent(
          business, entry, researchContext, performanceContext, recentPosts || [], feedbackItems || []
        );

        await supabase.from('cf_content_queue').update({
          status: 'rendering',
          ai_content: content,
          content_attributes: attributes,
          research_context: researchContext,
          caption: content.caption,
          hashtags: content.hashtags,
        }).eq('id', queueRow.id);

        // Step 4: Render
        let renderUrl = null;
        let renderDuration = null;

        if (entry.type === 'static_image') {
          try {
            const renderResult = await renderContent(content, business, entry.template);
            renderUrl = await uploadRenderedAsset(renderResult.imageBase64, business.slug, queueRow.id);
            renderDuration = renderResult.durationMs;
          } catch (renderErr) {
            await supabase.from('cf_content_queue').update({
              status: 'failed',
              error_log: `Render failed: ${renderErr.message}`,
            }).eq('id', queueRow.id);
            continue;
          }
        }

        // Step 5: QC
        const validation = validateContent(content);
        const finalStatus = (validation.valid && business.auto_post) ? 'approved' : 'review';

        await supabase.from('cf_content_queue').update({
          status: finalStatus,
          render_output_url: renderUrl,
          render_output_type: 'image/png',
          render_duration_ms: renderDuration,
          reviewer_notes: validation.valid ? null : `QC: ${validation.issues.join('; ')}`,
        }).eq('id', queueRow.id);

        // Add to history for dedup
        await supabase.from('cf_content_history').insert({
          business_id: business.id,
          queue_id: queueRow.id,
          topic_tags: [entry.category, attributes.industry_target, attributes.hook_type],
          hook_text: content.headline,
          headline: content.headline,
          template_name: entry.template,
          content_type: entry.category,
          content_attributes: attributes,
        });

        itemsProcessed++;
        results.push({ headline: content.headline, template: entry.template, status: finalStatus });

      } catch (postErr) {
        console.error(`[ERROR] Post ${entry.index}: ${postErr.message}`);
        results.push({ error: postErr.message, template: entry.template });
      }
    }

    const duration = Date.now() - startTime;
    await logCron('daily_generation', business.id, 'completed', itemsProcessed, null, duration);
    return { business: business.name, processed: itemsProcessed, total: queue.length, results, durationMs: duration };

  } catch (e) {
    await logCron('daily_generation', business.id, 'failed', itemsProcessed, e.message, Date.now() - startTime);
    throw e;
  }
}


// ═══════════════════════════════════════════════════════════════════
// RUN FOR ALL ACTIVE BUSINESSES
// ═══════════════════════════════════════════════════════════════════

export async function runDailyPipeline() {
  const { data: businesses, error } = await supabase
    .from('cf_businesses')
    .select('*')
    .eq('active', true)
    .order('name');

  if (error) throw new Error(`Failed to fetch businesses: ${error.message}`);
  if (!businesses?.length) return { message: 'No active businesses', results: [] };

  const results = [];
  for (const business of businesses) {
    try {
      const result = await runPipelineForBusiness(business);
      results.push(result);
    } catch (e) {
      results.push({ business: business.name, error: e.message });
    }
  }

  return { timestamp: new Date().toISOString(), businesses: businesses.length, results };
}