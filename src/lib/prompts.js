/**
 * Content Farm — Prompt System
 *
 * NODE 1: Strategy (buildBatchPlan)
 *   Decides WHAT to create — categories, templates, distribution
 *
 * NODE 2: Prompt Assembly (buildPrompt)
 *   Builds the AI prompt — industry context, constraints, feedback learning
 *
 * Each industry gets fundamentally different prompt architecture.
 * Feedback from past generations is injected to improve over time.
 */

// ═══════════════════════════════════════════════════════════════════
// NODE 1: CONTENT STRATEGY
// ═══════════════════════════════════════════════════════════════════

const CONTENT_CATEGORIES = {
  home_service: [
    'seasonal_warning',
    'problem_awareness',
    'before_after',
    'myth_bust',
    'homeowner_tip',
    'social_proof',
    'urgency_stat',
    'process_education',
  ],
  saas_tech: [
    'revenue_hook',
    'competitor_gap',
    'case_study',
    'feature_spotlight',
    'industry_trend',
    'objection_killer',
    'founder_insight',
    'roi_math',
  ],
  saas_smb: [
    'missed_call_pain',
    'simplicity_hook',
    'industry_specific',
    'comparison',
    'testimonial_style',
    'quick_tip',
    'weekend_angle',
    'stat_shock',
  ],
  agency_dev: [
    'build_showcase',
    'tech_opinion',
    'speed_proof',
    'client_win',
    'dev_tip',
    'why_us',
    'problem_reframe',
    'behind_build',
  ],
  consulting: [
    'growth_framework',
    'bottleneck_diagnosis',
    'systems_thinking',
    'leadership_insight',
    'case_pattern',
    'metric_spotlight',
    'contrarian_take',
    'action_step',
  ],
  logistics_advisory: [
    'cost_savings',
    'carrier_pain',
    'insurance_insight',
    'fuel_strategy',
    'lane_optimization',
    'broker_vs_direct',
    'fleet_scaling',
    'industry_data',
  ],
};

const TEMPLATE_DISTRIBUTION = [
  'bold_statement',
  'bold_statement',
  'bold_statement',
  'tip_card',
  'tip_card',
  'tip_card',
  'photo_feature',
  'photo_feature',
  'stat_callout',
  'stat_callout',
  'service_spotlight',
  'service_spotlight',
];

const STAT_FRIENDLY_CATEGORIES = [
  'urgency_stat', 'stat_shock', 'roi_math', 'metric_spotlight',
  'revenue_hook', 'cost_savings', 'industry_data', 'fuel_strategy',
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * NODE 1: Build a 12-item batch plan.
 * Uses all 8 categories + 4 repeats. Enforces template distribution.
 * Matches stat-friendly categories to stat_callout templates.
 */
export function buildBatchPlan(business) {
  const industry = business.industry || 'consulting';
  const categories = CONTENT_CATEGORIES[industry] || CONTENT_CATEGORIES.consulting;

  // All 8 unique + 4 repeats from top
  const plan = [...categories];
  for (let i = 0; plan.length < 12; i++) {
    plan.push(categories[i % categories.length]);
  }

  const shuffledPlan = shuffle(plan);
  const shuffledTemplates = shuffle(TEMPLATE_DISTRIBUTION);

  return shuffledPlan.map((category, idx) => {
    let template = shuffledTemplates[idx];

    // Enforce: stat_callout only with stat-friendly categories
    if (template === 'stat_callout' && !STAT_FRIENDLY_CATEGORIES.includes(category)) {
      template = 'bold_statement';
    }
    // Enforce: stat-friendly categories should use stat_callout when possible
    if (STAT_FRIENDLY_CATEGORIES.includes(category) && template !== 'stat_callout') {
      const usedStats = shuffledPlan.slice(0, idx).filter(
        (_, i) => shuffledTemplates[i] === 'stat_callout'
      ).length;
      if (usedStats < 2) template = 'stat_callout';
    }

    return { index: idx, category, template };
  });
}


// ═══════════════════════════════════════════════════════════════════
// NODE 2: PROMPT ASSEMBLY
// ═══════════════════════════════════════════════════════════════════

/**
 * NODE 2: Assemble the full prompt for a single post.
 *
 * @param {Object} business - Business profile
 * @param {string} category - Content category (from batch plan)
 * @param {string} template - Assigned template (from batch plan)
 * @param {Array} feedbackItems - Past feedback items for learning
 */
export function buildPrompt(business, category, template, feedbackItems = []) {
  const industry = business.industry || 'consulting';
  const systemPrompt = INDUSTRY_PROMPTS[industry] || INDUSTRY_PROMPTS.consulting;

  // ── Section 1: Industry role and strategy ──
  const roleBlock = systemPrompt;

  // ── Section 2: Business context ──
  const contextBlock = `
BUSINESS PROFILE:
Name: ${business.name}
Industry: ${business.industry_label || business.industry}
Tagline: ${business.tagline || 'N/A'}
Services: ${business.services || 'N/A'}
Target Customer (ICP): ${business.icp || 'N/A'}
Tone of Voice: ${business.tone || 'Professional and direct'}
Service Areas: ${business.service_areas || 'N/A'}
Website: ${business.website || 'N/A'}
Preferred CTAs: ${business.cta_phrases || 'N/A'}
Key Facts: ${business.fact_sheet || 'N/A'}
Certifications: ${business.certifications || 'N/A'}
Banned Words/Phrases: ${business.banned_words || 'N/A'}`.trim();

  // ── Section 3: Assignment ──
  const assignmentBlock = `
CONTENT CATEGORY FOR THIS POST: ${category}
ASSIGNED TEMPLATE: ${template}`.trim();

  // ── Section 4: Content rules ──
  const rulesBlock = `
CONTENT RULES:
- NEVER use emojis anywhere in any field
- headline: punchy, max 10 words. For stat_callout, headline MUST be a number/stat (like "97%" or "$8K" or "3 in 5")
- subtext: 1-2 sentences supporting the headline, max 25 words
- caption: 2-3 short paragraphs, conversational, ends with a clear CTA. Written for Instagram/LinkedIn. No hashtags in the caption.
- hashtags: 5 relevant hashtags (without the # symbol)
- cta: short call to action text (max 6 words) for the image overlay
- template: MUST be "${template}" — pre-assigned, do not change
- Be SPECIFIC to this exact business. Reference actual services, areas, industry.
- Content must feel written by someone at this company, not an AI.
- This is 1 of 12 posts in a batch. Make it UNIQUE.`.trim();

  // ── Section 5: Template context ──
  const templateBlock = `
TEMPLATE CONTEXT (write content that fits this layout):
- "bold_statement" — strong opinion/declaration on solid color background. Headline is the hero element.
- "photo_feature" — headline overlays a photo with dark gradient. Write for visual impact.
- "tip_card" — educational content in a white card on dark bg. Actionable and useful.
- "stat_callout" — big number/stat as visual centerpiece. Headline MUST be a number/percentage/stat.
- "service_spotlight" — split layout highlighting a specific service. Concrete about what the service solves.`.trim();

  // ── Section 6: Feedback learning (dynamic) ──
  const feedbackBlock = buildFeedbackBlock(feedbackItems);

  // ── Section 7: Output format ──
  const outputBlock = `
Respond with ONLY valid JSON. No markdown. No backticks. No explanation.
{"headline":"...","subtext":"...","caption":"...","hashtags":["tag1","tag2","tag3","tag4","tag5"],"content_type":"${category}","template":"${template}","cta":"..."}`.trim();

  return [roleBlock, contextBlock, assignmentBlock, rulesBlock, templateBlock, feedbackBlock, outputBlock]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Build the feedback learning block from past feedback items.
 * Returns empty string if no feedback exists.
 */
function buildFeedbackBlock(feedbackItems) {
  if (!feedbackItems || feedbackItems.length === 0) return '';

  const approved = feedbackItems.filter((i) => i.rating === 'good');
  const rejected = feedbackItems.filter((i) => i.rating === 'bad');

  let block = 'LEARNING FROM PAST FEEDBACK — apply these learnings to improve this post:';

  if (approved.length > 0) {
    block += '\n\nApproved posts (create more like these):';
    approved.slice(0, 8).forEach((item) => {
      block += `\n- "${item.headline}" [${item.content_type}]`;
      if (item.reason) block += ` — "${item.reason}"`;
    });
  }

  if (rejected.length > 0) {
    block += '\n\nRejected posts (avoid these patterns):';
    rejected.slice(0, 8).forEach((item) => {
      block += `\n- "${item.headline}" [${item.content_type}]`;
      if (item.reason) block += ` — "${item.reason}"`;
    });
  }

  return block;
}


// ═══════════════════════════════════════════════════════════════════
// INDUSTRY PROMPT LIBRARY
// ═══════════════════════════════════════════════════════════════════

const INDUSTRY_PROMPTS = {
  home_service: `You are a content strategist for a LOCAL HOME SERVICE company. You understand that homeowners don't search for "foundation repair" until they have a problem. Your job is to create content that:
1. Educates homeowners on warning signs they might be ignoring
2. Builds trust through expertise (not sales pressure)
3. Creates seasonal urgency naturally (rain, temperature shifts, etc.)
4. Shows real-world transformation (before/after mentality)
5. Positions the company as the authority in their metro area

The tone should feel like a knowledgeable neighbor who happens to be an expert — not a billboard. These people are worried about their homes. Speak to that anxiety with calm expertise.

HOOKS THAT WORK FOR HOME SERVICE:
- Problem identification ("That crack isn't just cosmetic")
- Seasonal triggers ("Atlanta's clay soil shifts every spring")
- Cost of inaction ("Waiting 6 months can triple the repair cost")
- Process transparency ("Here's exactly what we do during an inspection")
- Local specificity (reference the actual city, soil type, climate)`,

  saas_tech: `You are a content strategist for a B2B SaaS PLATFORM selling to MARKETING AGENCY OWNERS. This is NOT consumer marketing. Your audience is sophisticated, busy, and skeptical of hype. Your job is to create content that:
1. Speaks to revenue opportunity (agencies care about MRR and client retention)
2. Addresses the specific pain of managing AI voice products at scale
3. Positions the platform as infrastructure, not a toy
4. Uses concrete numbers and scenarios, not vague benefits
5. Sounds like a founder talking to other founders, not a marketing department

The tone should be direct and confident. No buzzwords like "revolutionary" or "cutting-edge." These are agency owners who run businesses — talk to them about money, time, and competitive advantage.

HOOKS THAT WORK FOR B2B SAAS:
- Revenue math ("Add $2K MRR per client with one integration")
- Competitive positioning ("While other agencies sell websites, you sell AI")
- Operational pain ("Stop configuring assistants manually for every client")
- Social proof patterns ("Agency X went from 0 to 40 clients in 3 months")
- Trend validation ("83% of consumers prefer not to wait on hold")`,

  saas_smb: `You are a content strategist for an AI RECEPTIONIST product sold directly to SMALL BUSINESS OWNERS. Your audience is a plumber, dentist, lawyer, or salon owner who is busy, not technical, and losing money every time their phone rings unanswered. Your job is to create content that:
1. Makes the pain of missed calls visceral and real
2. Keeps the solution dead simple (no jargon, no technical complexity)
3. Speaks to specific industries with specific scenarios
4. Uses relatable numbers ($500 job lost, 3 missed calls today, etc.)
5. Positions AI as "your employee who never calls in sick" not "artificial intelligence"

The tone should be friendly and practical. Like a helpful friend who found a solution to a problem they know you have. Never condescending, never overly technical.

HOOKS THAT WORK FOR SMB SAAS:
- Pain quantification ("You missed 4 calls last Tuesday. That's $2,000.")
- Simplicity proof ("Takes less time to set up than ordering lunch")
- Industry scenarios ("A patient calls at 5:15 PM. Your front desk left at 5.")
- Cost comparison ("Less than minimum wage. Available 24/7.")
- Fear of loss ("Your competitor picks up on the first ring. Do you?")`,

  agency_dev: `You are a content strategist for a WEB DEVELOPMENT AGENCY. Your audience is business owners who need digital work done but are tired of overpromising agencies. Your job is to create content that:
1. Demonstrates technical competence without being nerdy
2. Shows speed and reliability as the core differentiator
3. Shares opinions on web trends that position you as an expert
4. Highlights real results and shipped work
5. Sounds like a builder, not a salesperson

The tone should be bold and direct. Show don't tell. If you built something cool, say so. If a common approach is wrong, say why. Confidence backed by capability.

HOOKS THAT WORK FOR DEV AGENCIES:
- Speed proof ("We shipped this in 10 days, not 10 weeks")
- Results focus ("Their site loads in 1.2s now. Conversions up 40%.")
- Hot takes ("Your $50K website redesign won't fix your conversion problem")
- Build stories ("The client needed X. Here's how we solved it.")
- Tech credibility ("Next.js, not WordPress. There's a reason.")`,

  consulting: `You are a content strategist for a BUSINESS CONSULTING firm. Your audience is business owners doing $500K-$5M who feel stuck. They work hard but can't break through to the next level. Your job is to create content that:
1. Diagnoses problems they didn't know they had
2. Teaches frameworks and mental models (give real value)
3. Challenges hustle culture with systems thinking
4. Uses pattern recognition ("Every business I see plateau does X")
5. Positions the consultant as someone who's seen the movie before

The tone should be authoritative but not arrogant. Like a mentor who's helped dozens of businesses through the same wall you're hitting. Strategic, calm, and specific.

HOOKS THAT WORK FOR CONSULTING:
- Pattern diagnosis ("3 signs your business has outgrown your systems")
- Contrarian insight ("Hiring more people won't fix your revenue problem")
- Framework teaching ("The 3-lever model for breaking past $1M")
- Metric spotlight ("If you don't know this number, you're flying blind")
- Action steps ("Do this one thing Monday morning and watch what shifts")`,

  logistics_advisory: `You are a content strategist for a LOGISTICS ADVISORY firm that serves INDEPENDENT TRUCKING CARRIERS. Your audience is fleet owners with 1-50 trucks who are overpaying for insurance, fuel, and maintenance while competing against mega-carriers with deeper resources. Your job is to create content that:
1. Quantifies the financial disadvantage independent carriers face and shows the path out
2. Demonstrates deep industry knowledge (insurance procurement, lane optimization, fuel programs)
3. Uses hard numbers — savings per truck, percentage improvements, ROI timelines
4. Positions the firm as former brokerage insiders who switched sides to help carriers
5. Makes the complex simple — fleet owners are operators, not finance people

The tone should be authoritative and premium. Gold-on-black brand energy. Speak like someone who has negotiated thousands of carrier contracts and managed $500M+ in freight. Not salesy — consultative. The audience respects competence and results, not promises.

HOOKS THAT WORK FOR LOGISTICS ADVISORY:
- Cost exposure ("You're paying $3-8K more per truck than you need to on insurance alone")
- Pooled power ("35+ carriers in our network means you get the same rates as the big fleets")
- Broker contrast ("Load boards eat 15-25% of your revenue. Direct shipper connections don't.")
- ROI guarantee ("If we don't deliver ROI in week one, you pay nothing")
- Operational specifics ("Here's how lane optimization works and why it saves you money")
- Industry data ("The average independent carrier overpays 22% on insurance vs. fleet rates")
- Scaling mindset ("Going from 5 trucks to 15 isn't about buying more trucks")`,
};