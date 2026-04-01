import Anthropic from '@anthropic-ai/sdk';
import { buildPrompt, buildBatchPlan } from '@/lib/prompts';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function generateOne(business, planItem, feedbackItems = [], photoManifest = [], platform = 'instagram', retryCount = 0) {
  try {
    const prompt = buildPrompt(business, planItem.category, planItem.template, feedbackItems, photoManifest, platform);

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      temperature: 0.9,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Enforce assigned template and category
    parsed.template = planItem.template;
    parsed.content_type = planItem.category;

    // Validate photo_index if photos exist
    if (photoManifest.length > 0 && parsed.photo_index !== undefined) {
      const idx = parseInt(parsed.photo_index);
      if (isNaN(idx) || idx < -1 || idx >= photoManifest.length) {
        parsed.photo_index = -1;
      } else {
        parsed.photo_index = idx;
      }
    }

    return { success: true, result: parsed, planItem };
  } catch (error) {
    if (error instanceof SyntaxError && retryCount < 1) {
      return generateOne(business, planItem, feedbackItems, photoManifest, platform, retryCount + 1);
    }
    console.error(`Failed ${planItem.index} (${planItem.category}):`, error.message);
    return { success: false, error: error.message || 'Generation failed', planItem };
  }
}

export async function POST(request) {
  try {
    const { business, mode, feedback, photoManifest, platform } = await request.json();

    if (!business || !business.name) {
      return Response.json({ error: 'Business data is required' }, { status: 400 });
    }

    const feedbackItems = feedback || [];
    const photos = photoManifest || [];
    const plat = platform || 'instagram';

    if (mode === 'single') {
      const plan = buildBatchPlan(business, plat);
      const result = await generateOne(business, plan[0], feedbackItems, photos, plat);
      if (result.success) {
        return Response.json({ results: [result], summary: { total: 1, success: 1, failed: 0 } });
      }
      return Response.json({ error: result.error }, { status: 500 });
    }

    // Batch mode
    const plan = buildBatchPlan(business, plat);
    const promises = plan.map((item) => generateOne(business, item, feedbackItems, photos, plat));
    const outcomes = await Promise.allSettled(promises);

    const results = outcomes.map((outcome, idx) => {
      if (outcome.status === 'fulfilled') return outcome.value;
      return { success: false, error: outcome.reason?.message || 'Request failed', planItem: plan[idx] };
    });

    const successCount = results.filter((r) => r.success).length;

    return Response.json({
      results,
      summary: { total: plan.length, success: successCount, failed: plan.length - successCount },
    });
  } catch (error) {
    console.error('Batch generate error:', error);
    return Response.json({ error: error.message || 'Batch generation failed' }, { status: 500 });
  }
}