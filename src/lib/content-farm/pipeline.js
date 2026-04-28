/**
 * Content Farm — Pipeline Library
 * 
 * Clean split for Vercel Hobby + external cron:
 *   planDailyContent()   — Creates queue entries only (Vercel daily cron)
 *   processNextPost()    — Full pipeline for ONE post (external cron, every 5 min)
 *   approveAndPublish()  — Approve + immediately publish (queue API)
 *   rejectPost()         — Reject + save feedback (queue API)
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
import { publishPost } from './poster';

// ── Clients ─────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export { supabase };


// ── Logging ─────────────────────────────────────────────────────

export async function logCron(name, bizId, status, items = 0, err = null, ms = null, meta = null) {
  try {
    await supabase.from('cf_cron_logs').insert({
      cron_name: name,
      business_id: bizId,
      status,
      items_processed: items,
      error_message: err,
      duration_ms: ms,
      metadata: meta,
    });
  } catch (e) {
    console.error('Log failed:', e.message);
  }
}


// ═══════════════════════════════════════════════════════════════════
// PLAN — Creates queue entries for today
// Called by Vercel daily cron at 6am EST
// Fast: just Supabase reads + inserts, no AI, no rendering
// ═══════════════════════════════════════════════════════════════════

export async function planDailyContent() {
  const startTime = Date.now();

  const { data: businesses, error } = await supabase
    .from('cf_businesses')
    .select('*')
    .eq('active', true)
    .order('name');

  if (error) throw new Error(`Failed to fetch businesses: ${error.message}`);
  if (!businesses?.length) return { message: 'No active businesses', results: [] };

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = days[new Date().getDay()];
  const results = [];

  for (const business of businesses) {
    const schedule = business.posting_schedule?.[today];
    if (!schedule?.types?.length) {
      results.push({ business: business.name, planned: 0, reason: 'no_schedule_today' });
      continue;
    }

    const postCount = schedule.types.length;
    const postTimes = schedule.times || ['07:00', '12:00', '18:00'];

    // Build the batch plan (selects categories + templates with variety)
    const plan = buildBatchPlan(business, postCount);
    const batchId = crypto.randomUUID();
    const todayDate = new Date();

    let planned = 0;

    for (let i = 0; i < plan.length; i++) {
      const entry = plan[i];

      // Calculate scheduled posting time
      const [hours, minutes] = (postTimes[i] || postTimes[0]).split(':').map(Number);
      const scheduledFor = new Date(todayDate);
      scheduledFor.setHours(hours, minutes, 0, 0);

      // Insert queue entry with plan metadata
      // processNextPost() reads _plan to know what to generate
      const { error: insertErr } = await supabase
        .from('cf_content_queue')
        .insert({
          business_id: business.id,
          type: schedule.types[i] || 'static_image',
          status: 'planned',
          platform: 'instagram',
          scheduled_for: scheduledFor.toISOString(),
          batch_id: batchId,
          ai_content: {
            _plan: {
              category: entry.category,
              template: entry.template,
              value_vs_ask: entry.value_vs_ask,
              index: entry.index,
            },
          },
        });

      if (!insertErr) planned++;
      else console.error(`[PLAN] Insert failed for ${business.name}:`, insertErr.message);
    }

    results.push({
      business: business.name,
      planned,
      day: today,
      templates: plan.map(p => p.template),
      categories: plan.map(p => p.category),
    });

    await logCron('daily_plan', business.id, 'completed', planned, null, Date.now() - startTime);
  }

  return {
    timestamp: new Date().toISOString(),
    day: today,
    durationMs: Date.now() - startTime,
    results,
  };
}


// ═══════════════════════════════════════════════════════════════════
// RESEARCH — Cached per business per day
// Only makes an API call once; subsequent calls return cache
// ═══════════════════════════════════════════════════════════════════

async function getOrCreateResearch(business) {
  const todayKey = new Date().toISOString().split('T')[0];

  // Check cache
  const { data: cached } = await supabase
    .from('cf_cron_logs')
    .select('metadata')
    .eq('cron_name', 'research_cache')
    .eq('business_id', business.id)
    .gte('created_at', todayKey + 'T00:00:00Z')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached?.metadata?.research) {
    console.log(`[RESEARCH] Cache hit for ${business.name}`);
    return cached.metadata.research;
  }

  // No cache — call Haiku with web search
  try {
    console.log(`[RESEARCH] Running for ${business.name}...`);
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: buildResearchPrompt(business) }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    // Cache for the rest of the day
    await supabase.from('cf_cron_logs').insert({
      cron_name: 'research_cache',
      business_id: business.id,
      status: 'completed',
      metadata: { research: text, date: todayKey },
    });

    return text;
  } catch (e) {
    console.error(`[RESEARCH] Failed for ${business.name}: ${e.message}`);
    return null; // Non-fatal — generation works without research
  }
}


// ═══════════════════════════════════════════════════════════════════
// PROCESS NEXT POST — Full pipeline for ONE post
// Called by external cron (cron-job.org) every 5 minutes
// Each call: ~30-40 seconds
// ═══════════════════════════════════════════════════════════════════

export async function processNextPost() {
  const startTime = Date.now();

  // ── 1. Find oldest planned post ──
  const { data: nextPost, error: fetchErr } = await supabase
    .from('cf_content_queue')
    .select('*, cf_businesses(*)')
    .eq('status', 'planned')
    .order('scheduled_for', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fetchErr) throw new Error(`Queue fetch failed: ${fetchErr.message}`);
  if (!nextPost) return { processed: false, reason: 'no_planned_posts' };

  const business = nextPost.cf_businesses;
  const planData = nextPost.ai_content?._plan;

  if (!business || !planData) {
    await supabase.from('cf_content_queue')
      .update({ status: 'failed', error_log: 'Missing business or plan data' })
      .eq('id', nextPost.id);
    return { processed: false, reason: 'missing_data', id: nextPost.id };
  }

  // ── 2. Claim this post (atomic — prevents double-processing) ──
  const { data: claimed, error: claimErr } = await supabase
    .from('cf_content_queue')
    .update({ status: 'generating' })
    .eq('id', nextPost.id)
    .eq('status', 'planned')  // Only if still planned
    .select()
    .maybeSingle();

  if (claimErr || !claimed) {
    return { processed: false, reason: 'already_claimed', id: nextPost.id };
  }

  console.log(`[PROCESS] Starting: ${business.name} / ${planData.template} / ${planData.category}`);

  try {
    // ── 3. Research (cached per business per day) ──
    const researchContext = await getOrCreateResearch(business);

    // ── 4. Gather context for generation ──
    const { data: latestAnalysis } = await supabase
      .from('cf_content_analysis')
      .select('best_hooks, recommendations')
      .eq('business_id', business.id)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const performanceContext = latestAnalysis
      ? `Top hooks: ${JSON.stringify(latestAnalysis.best_hooks || [])}\nRecommendations: ${JSON.stringify(latestAnalysis.recommendations || [])}`
      : null;

    const { data: recentPosts } = await supabase
      .from('cf_content_history')
      .select('hook_text, headline, template_name, content_type')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const { data: feedbackItems } = await supabase
      .from('cf_content_feedback')
      .select('headline, content_type, template_name, rating, reason')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(15);

    // ── 5. Generate content (Claude Sonnet) ──
    console.log(`[PROCESS] Generating content...`);
    const prompt = buildGenerationPrompt(
      business, planData, researchContext, performanceContext,
      recentPosts || [], feedbackItems || []
    );

    let content;
    let retries = 0;
    while (retries <= 1) {
      try {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1200,
          temperature: 0.9,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('');

        content = JSON.parse(text.replace(/```json|```/g, '').trim());
        content.template = planData.template;
        content.content_type = planData.category;
        break;
      } catch (e) {
        retries++;
        if (retries > 1) throw new Error(`Generation failed after retry: ${e.message}`);
        console.warn(`[PROCESS] Retry generation: ${e.message}`);
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Extract content attributes (deterministic, no AI call)
    const season = getSeasonContext();
    const attributes = extractContentAttributes(content, planData, season);

    // Update queue with generated content
    await supabase.from('cf_content_queue').update({
      ai_content: content,
      content_attributes: attributes,
      research_context: researchContext,
      caption: content.caption,
      hashtags: content.hashtags,
      status: 'rendering',
    }).eq('id', nextPost.id);

    console.log(`[PROCESS] Generated: "${content.headline}"`);

    // ── 6. Render (call /api/render on same Vercel project) ──
    let renderUrl = null;
    if (nextPost.type === 'static_image') {
      console.log(`[PROCESS] Rendering ${planData.template}...`);

      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

      const renderResp = await fetch(`${baseUrl}/api/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          business,
          templateId: planData.template,
        }),
      });

      const renderData = await renderResp.json();

      if (renderData.image) {
        // Upload to Supabase Storage
        const buffer = Buffer.from(
          renderData.image.replace(/^data:image\/\w+;base64,/, ''),
          'base64'
        );
        const storagePath = `${business.slug}/${nextPost.id}.png`;

        const { error: uploadErr } = await supabase.storage
          .from('content-renders')
          .upload(storagePath, buffer, {
            contentType: 'image/png',
            cacheControl: '31536000',
            upsert: true,
          });

        if (!uploadErr) {
          const { data: urlData } = supabase.storage
            .from('content-renders')
            .getPublicUrl(storagePath);
          renderUrl = urlData?.publicUrl || null;
          console.log(`[PROCESS] Rendered + uploaded: ${renderUrl}`);
        } else {
          console.error(`[PROCESS] Upload failed: ${uploadErr.message}`);
        }
      } else {
        console.error(`[PROCESS] Render returned no image:`, renderData.error);
      }
    }

    // ── 7. QC validation ──
    const validation = validateContent(content);
    const finalStatus = (validation.valid && business.auto_post) ? 'approved' : 'review';

    if (!validation.valid) {
      console.warn(`[PROCESS] QC issues: ${validation.issues.join(', ')}`);
    }

    // ── 8. Update final status ──
    await supabase.from('cf_content_queue').update({
      status: finalStatus,
      render_output_url: renderUrl,
      render_output_type: 'image/png',
      render_duration_ms: Date.now() - startTime,
      reviewer_notes: validation.valid ? null : `QC: ${validation.issues.join('; ')}`,
    }).eq('id', nextPost.id);

    // ── 9. Add to history for deduplication ──
    await supabase.from('cf_content_history').insert({
      business_id: business.id,
      queue_id: nextPost.id,
      topic_tags: [planData.category, attributes.industry_target, attributes.hook_type],
      hook_text: content.headline,
      headline: content.headline,
      template_name: planData.template,
      content_type: planData.category,
      content_attributes: attributes,
    });

    const duration = Date.now() - startTime;
    console.log(`[PROCESS] Done: "${content.headline}" → ${finalStatus} (${duration}ms)`);

    await logCron('process_post', business.id, 'completed', 1, null, duration, {
      headline: content.headline,
      template: planData.template,
      category: planData.category,
      status: finalStatus,
      has_render: !!renderUrl,
    });

    return {
      processed: true,
      id: nextPost.id,
      business: business.name,
      headline: content.headline,
      template: planData.template,
      category: planData.category,
      status: finalStatus,
      renderUrl,
      durationMs: duration,
    };

  } catch (e) {
    console.error(`[PROCESS] Failed: ${e.message}`);

    await supabase.from('cf_content_queue').update({
      status: 'failed',
      error_log: e.message,
      retry_count: (nextPost.retry_count || 0) + 1,
    }).eq('id', nextPost.id);

    await logCron('process_post', business.id, 'failed', 0, e.message, Date.now() - startTime);

    return {
      processed: false,
      id: nextPost.id,
      business: business.name,
      error: e.message,
      durationMs: Date.now() - startTime,
    };
  }
}


// ═══════════════════════════════════════════════════════════════════
// APPROVE AND PUBLISH
// Called from POST /api/content-farm/queue { action: 'approve' }
// Approves the post then immediately publishes to Instagram/Facebook
// ═══════════════════════════════════════════════════════════════════

export async function approveAndPublish(queueId) {
  const { data: post, error } = await supabase
    .from('cf_content_queue')
    .select('*')
    .eq('id', queueId)
    .single();

  if (error || !post) throw new Error('Post not found');
  if (!post.render_output_url) throw new Error('Post has no rendered image — cannot publish');

  // Mark approved
  await supabase.from('cf_content_queue')
    .update({ status: 'approved' })
    .eq('id', queueId);

  // Publish to platform(s)
  try {
    await supabase.from('cf_content_queue')
      .update({ status: 'posting' })
      .eq('id', queueId);

    const result = await publishPost(post);

    await supabase.from('cf_content_queue').update({
      status: 'posted',
      posted_at: new Date().toISOString(),
      platform_post_id: result.platform_post_id,
    }).eq('id', queueId);

    // Update history
    await supabase.from('cf_content_history')
      .update({ posted_at: new Date().toISOString() })
      .eq('queue_id', queueId);

    // Save positive feedback
    await supabase.from('cf_content_feedback').insert({
      business_id: post.business_id,
      queue_id: queueId,
      headline: post.ai_content?.headline,
      content_type: post.content_attributes?.topic_category,
      template_name: post.ai_content?.template,
      rating: 'good',
      reason: 'Approved and published',
    });

    console.log(`[PUBLISH] Posted: "${post.ai_content?.headline}" → ${result.platform_post_id}`);

    return {
      status: 'posted',
      platform_post_id: result.platform_post_id,
      details: result.details,
    };

  } catch (e) {
    await supabase.from('cf_content_queue').update({
      status: 'failed',
      error_log: `Publish failed: ${e.message}`,
    }).eq('id', queueId);

    throw new Error(`Publishing failed: ${e.message}`);
  }
}


// ═══════════════════════════════════════════════════════════════════
// REJECT POST — Saves feedback for AI learning
// ═══════════════════════════════════════════════════════════════════

export async function rejectPost(queueId, reason) {
  const { data: post } = await supabase
    .from('cf_content_queue')
    .select('business_id, ai_content, content_attributes')
    .eq('id', queueId)
    .single();

  await supabase.from('cf_content_queue')
    .update({ status: 'rejected', reviewer_notes: reason || 'Rejected' })
    .eq('id', queueId);

  // Save negative feedback — AI learns from this
  if (post) {
    await supabase.from('cf_content_feedback').insert({
      business_id: post.business_id,
      queue_id: queueId,
      headline: post.ai_content?.headline,
      content_type: post.content_attributes?.topic_category,
      template_name: post.ai_content?.template,
      rating: 'bad',
      reason: reason || 'Rejected',
    });
  }

  return { status: 'rejected', id: queueId };
}


// ═══════════════════════════════════════════════════════════════════
// QC VALIDATION
// ═══════════════════════════════════════════════════════════════════

function validateContent(content) {
  const issues = [];

  if (!content.headline || content.headline.length < 2) issues.push('Missing headline');
  if (!content.subtext || content.subtext.length < 5) issues.push('Missing subtext');
  if (!content.caption || content.caption.length < 30) issues.push('Caption too short');
  if (!content.hashtags || content.hashtags.length < 3) issues.push('Too few hashtags');
  if (!content.cta_line1 && !content.cta_line2) issues.push('Missing CTA');

  // Check for banned phrases
  const banned = ['revolutionary', 'cutting-edge', 'game-changer', 'sign up', 'get started',
                   'in today\'s fast-paced', 'let that sink in', 'read that again'];
  const lower = (content.caption || '').toLowerCase();
  banned.forEach(w => {
    if (lower.includes(w)) issues.push(`Banned phrase: "${w}"`);
  });

  // Check headline isn't generic
  const genericHeadlines = ['never miss a call', 'ai receptionist', 'quality service',
                             'transform your business', 'the future of'];
  const lh = (content.headline || '').toLowerCase();
  genericHeadlines.forEach(g => {
    if (lh.includes(g)) issues.push(`Generic headline: "${g}"`);
  });

  return { valid: issues.length === 0, issues };
}