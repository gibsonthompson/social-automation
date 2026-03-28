import Anthropic from '@anthropic-ai/sdk';
import { buildPrompt, buildBatchPlan } from '@/lib/prompts';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * NODE 3: AI Generation
 * Calls Claude with assembled prompt, parses response, handles retries.
 */
async function generateOne(business, planItem, feedbackItems = [], retryCount = 0) {
  try {
    const prompt = buildPrompt(business, planItem.category, planItem.template, feedbackItems);

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Enforce assigned template and category (AI sometimes ignores)
    parsed.template = planItem.template;
    parsed.content_type = planItem.category;

    return { success: true, result: parsed, planItem };
  } catch (error) {
    // Retry once on JSON parse failures
    if (error instanceof SyntaxError && retryCount < 1) {
      console.warn(`Retry ${planItem.index} (${planItem.category}) — JSON parse failed`);
      return generateOne(business, planItem, feedbackItems, retryCount + 1);
    }

    console.error(`Failed ${planItem.index} (${planItem.category}):`, error.message);
    return {
      success: false,
      error: error.message || 'Generation failed',
      planItem,
    };
  }
}

export async function POST(request) {
  try {
    const { business, mode, feedback } = await request.json();

    if (!business || !business.name) {
      return Response.json({ error: 'Business data is required' }, { status: 400 });
    }

    const feedbackItems = feedback || [];

    // Single mode — one post for quick testing
    if (mode === 'single') {
      const plan = buildBatchPlan(business);
      const result = await generateOne(business, plan[0], feedbackItems);
      if (result.success) {
        return Response.json({
          results: [result],
          summary: { total: 1, success: 1, failed: 0 },
        });
      }
      return Response.json({ error: result.error }, { status: 500 });
    }

    // Batch mode — 12 parallel calls
    const plan = buildBatchPlan(business);
    const promises = plan.map((item) => generateOne(business, item, feedbackItems));
    const outcomes = await Promise.allSettled(promises);

    const results = outcomes.map((outcome, idx) => {
      if (outcome.status === 'fulfilled') {
        return outcome.value;
      }
      return {
        success: false,
        error: outcome.reason?.message || 'Request failed',
        planItem: plan[idx],
      };
    });

    const successCount = results.filter((r) => r.success).length;

    return Response.json({
      results,
      summary: {
        total: 12,
        success: successCount,
        failed: 12 - successCount,
      },
    });
  } catch (error) {
    console.error('Batch generate error:', error);
    return Response.json(
      { error: error.message || 'Batch generation failed' },
      { status: 500 }
    );
  }
}