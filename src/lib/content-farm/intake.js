/**
 * Content Intake Processor
 * 
 * 1. Fetches uploaded image/video thumbnail from DO URL
 * 2. Sends to Claude Vision (Haiku) for classification
 * 3. Sends to Claude (Sonnet) for caption generation
 * 
 * Path: src/lib/content-farm/intake.js
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Vision Analysis (Haiku — fast + cheap) ──────────────────────

export async function analyzeContent(uploadRecord, business) {
  const { media_url, media_type, storage_path } = uploadRecord;
  const isVideo = media_type?.includes('video');

  let base64;
  let imageMediaType = 'image/jpeg';

  if (isVideo) {
    // Extract thumbnail from video via DO backend
    const doUrl = process.env.RENDER_SERVICE_URL || 'https://urchin-app-bqb4i.ondigitalocean.app';
    const thumbResp = await fetch(`${doUrl.replace('/api/content-render', '')}/api/media/thumbnail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_path: storage_path, timestamp: '1' }),
    });
    const thumbData = await thumbResp.json();

    if (thumbData.error) throw new Error(`Thumbnail extraction failed: ${thumbData.error}`);

    // Extract base64 from data URL
    base64 = thumbData.base64.replace(/^data:image\/\w+;base64,/, '');
    imageMediaType = 'image/jpeg';
  } else {
    // Fetch image directly
    const imageResp = await fetch(media_url);
    const imageBuffer = await imageResp.arrayBuffer();
    base64 = Buffer.from(imageBuffer).toString('base64');
    imageMediaType = (media_type || 'image/png').replace('jpg', 'jpeg');
  }

  const prompt = `You are analyzing a social media post for ${business.name}.

Business context:
- Industry: ${business.industry_label || business.industry || 'general'}
- Services: ${business.services || ''}
- Target audience: ${business.icp || ''}

Analyze this image and return ONLY valid JSON (no markdown, no backticks):
{
  "content_description": "Brief description of what the image shows",
  "text_in_image": "Any text, headlines, stats visible in the image. Empty string if none.",
  "content_pillar": "educate|engage|inspire|promote",
  "content_type": "stat|checklist|comparison|testimonial|scenario|cta|feature|process|faq|result|behind_the_scenes|tip",
  "visual_mode": "dark|light|mixed",
  "mood": "urgent|professional|casual|inspirational|data_driven|humorous|authoritative",
  "industry_target": "general|plumber|hvac|dentist|lawyer|contractor|agency|carrier",
  "has_statistic": true or false,
  "estimated_hook_strength": number 1-10,
  "suggested_posting_time": "morning|afternoon|evening"
}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageMediaType,
            data: base64,
          },
        },
        { type: 'text', text: prompt },
      ],
    }],
  });

  const text = response.content[0]?.text || '{}';
  
  // Parse JSON — handle potential markdown wrapping
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const analysis = JSON.parse(cleaned);

  return analysis;
}

// ── Caption Generation (Sonnet — quality matters) ───────────────

export async function generateCaption(uploadRecord, business, analysis, weeklyAnalysis = null) {
  const performanceContext = weeklyAnalysis
    ? `\nPERFORMANCE INSIGHTS (use these to write better captions):\n${JSON.stringify(weeklyAnalysis.recommendations || [])}\nTop performing hooks: ${JSON.stringify(weeklyAnalysis.best_hooks || [])}`
    : '';

  const prompt = `You are the social media voice for ${business.name}.

BUSINESS IDENTITY:
- Name: ${business.name}
- Industry: ${business.industry_label || business.industry || ''}
- Services: ${business.services || ''}
- Target customer: ${business.icp || ''}
- Tone: ${business.tone || 'professional and authoritative'}
- Tagline: ${business.tagline || ''}
- Preferred CTAs: ${business.cta_phrases || ''}
- Phone: ${business.design_system?.cta_bar?.phone || ''}
- Website: ${business.website || ''}
- Banned words/phrases: ${business.banned_words || ''}
${performanceContext}

THIS POST:
- What it shows: ${analysis.content_description || ''}
- Text visible: ${analysis.text_in_image || ''}
- Content type: ${analysis.content_type || ''}
- Industry target: ${analysis.industry_target || ''}
- Mood: ${analysis.mood || ''}

Write an Instagram caption for this post.
Rules:
1. HOOK (first line): Must stop the scroll. Be specific. Use a number, question, or bold statement. This is the ONLY line most people see before "...more".
2. BODY (3-6 sentences): Expand on the value. Reference the specific content shown in the image. Include industry-specific language.
3. CTA: Direct call to action. Be specific — call the demo, visit the website, comment below.
4. Total length: 150-300 words.
5. Do NOT describe the image — the caption accompanies it.
6. Match the business tone exactly.

Return ONLY valid JSON (no markdown, no backticks):
{
  "instagram_caption": "full caption text here",
  "facebook_caption": "shorter 2-3 sentence version with CTA",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.text || '{}';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const caption = JSON.parse(cleaned);

  return caption;
}

// ── Process Single Upload ───────────────────────────────────────

export async function processUpload(uploadId) {
  // Get the upload record
  const { data: upload, error } = await supabase
    .from('cf_content_uploads')
    .select('*, cf_businesses(*)')
    .eq('id', uploadId)
    .single();

  if (error || !upload) throw new Error(`Upload not found: ${uploadId}`);

  const business = upload.cf_businesses;

  // Step 1: Mark as analyzing
  await supabase.from('cf_content_uploads')
    .update({ status: 'analyzing', updated_at: new Date().toISOString() })
    .eq('id', uploadId);

  try {
    // Step 2: Vision analysis
    const analysis = await analyzeContent(upload, business);

    // Step 3: Get latest weekly analysis for caption context
    const { data: latestAnalysis } = await supabase
      .from('cf_content_analysis')
      .select('best_hooks, recommendations')
      .eq('business_id', business.id)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Step 4: Generate caption
    const caption = await generateCaption(upload, business, analysis, latestAnalysis);

    // Step 5: Update record
    await supabase.from('cf_content_uploads').update({
      status: 'captioned',
      ai_analysis: analysis,
      content_description: analysis.content_description,
      text_in_image: analysis.text_in_image,
      content_pillar: analysis.content_pillar,
      content_type: analysis.content_type,
      visual_mode: analysis.visual_mode,
      mood: analysis.mood,
      industry_target: analysis.industry_target,
      has_statistic: analysis.has_statistic,
      hook_strength: analysis.estimated_hook_strength,
      instagram_caption: caption.instagram_caption,
      facebook_caption: caption.facebook_caption,
      hashtags: caption.hashtags,
      updated_at: new Date().toISOString(),
    }).eq('id', uploadId);

    return { success: true, analysis, caption };
  } catch (err) {
    await supabase.from('cf_content_uploads').update({
      status: 'failed',
      error_log: err.message,
      updated_at: new Date().toISOString(),
    }).eq('id', uploadId);

    throw err;
  }
}

// ── Process Entire Batch ────────────────────────────────────────

export async function processBatch(batchId) {
  const { data: uploads, error } = await supabase
    .from('cf_content_uploads')
    .select('id')
    .eq('batch_id', batchId)
    .eq('status', 'uploaded')
    .order('created_at', { ascending: true });

  if (error || !uploads?.length) return { processed: 0, errors: 0 };

  let processed = 0;
  let errors = 0;

  for (const upload of uploads) {
    try {
      await processUpload(upload.id);
      processed++;
    } catch (err) {
      console.error(`[INTAKE] Failed ${upload.id}: ${err.message}`);
      errors++;
    }
  }

  return { processed, errors, total: uploads.length };
}