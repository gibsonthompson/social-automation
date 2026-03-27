import Anthropic from '@anthropic-ai/sdk';
import { buildPrompt } from '@/lib/prompts';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request) {
  try {
    const { business } = await request.json();

    if (!business || !business.name) {
      return Response.json({ error: 'Business data is required' }, { status: 400 });
    }

    const prompt = buildPrompt(business);

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Parse JSON from response, stripping any markdown fences
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return Response.json({ result: parsed });
  } catch (error) {
    console.error('Generate error:', error);

    if (error instanceof SyntaxError) {
      return Response.json(
        { error: 'AI returned invalid JSON. Try again.' },
        { status: 500 }
      );
    }

    return Response.json(
      { error: error.message || 'Generation failed' },
      { status: 500 }
    );
  }
}
