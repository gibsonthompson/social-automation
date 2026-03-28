/**
 * Content Farm — Prompt System
 *
 * NODE 1: Strategy (buildBatchPlan) — decides WHAT to create
 * NODE 2: Prompt Assembly (buildPrompt) — builds the AI prompt
 *
 * Now includes:
 * - Photo manifest injection (AI selects photos by index)
 * - Design system context (AI writes content that fits the visual system)
 * - Feedback learning injection
 */

// ═══════════════════════════════════════════════════════════════════
// NODE 1: CONTENT STRATEGY
// ═══════════════════════════════════════════════════════════════════

const CONTENT_CATEGORIES = {
  home_service: [
    'seasonal_warning', 'problem_awareness', 'before_after', 'myth_bust',
    'homeowner_tip', 'social_proof', 'urgency_stat', 'process_education',
  ],
  saas_tech: [
    'revenue_hook', 'competitor_gap', 'case_study', 'feature_spotlight',
    'industry_trend', 'objection_killer', 'founder_insight', 'roi_math',
  ],
  saas_smb: [
    'missed_call_pain', 'simplicity_hook', 'industry_specific', 'comparison',
    'testimonial_style', 'quick_tip', 'weekend_angle', 'stat_shock',
  ],
  agency_dev: [
    'build_showcase', 'tech_opinion', 'speed_proof', 'client_win',
    'dev_tip', 'why_us', 'problem_reframe', 'behind_build',
  ],
  consulting: [
    'growth_framework', 'bottleneck_diagnosis', 'systems_thinking', 'leadership_insight',
    'case_pattern', 'metric_spotlight', 'contrarian_take', 'action_step',
  ],
  logistics_advisory: [
    'cost_savings', 'carrier_pain', 'insurance_insight', 'fuel_strategy',
    'lane_optimization', 'broker_vs_direct', 'fleet_scaling', 'industry_data',
  ],
};

const TEMPLATE_DISTRIBUTION = [
  'photo_hero', 'photo_hero', 'photo_hero',
  'full_graphic', 'full_graphic',
  'checklist', 'checklist',
  'stat_callout', 'stat_callout',
  'process_steps',
  'review_showcase',
  'full_graphic',
];

const STAT_FRIENDLY = [
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

export function buildBatchPlan(business) {
  const industry = business.industry || 'consulting';
  const cats = CONTENT_CATEGORIES[industry] || CONTENT_CATEGORIES.consulting;

  const plan = [...cats];
  for (let i = 0; plan.length < 12; i++) plan.push(cats[i % cats.length]);

  const shuffledPlan = shuffle(plan);
  const shuffledTpls = shuffle(TEMPLATE_DISTRIBUTION);

  return shuffledPlan.map((category, idx) => {
    let template = shuffledTpls[idx];
    if (template === 'stat_callout' && !STAT_FRIENDLY.includes(category)) template = 'bold_statement';
    if (STAT_FRIENDLY.includes(category) && template !== 'stat_callout') {
      const used = shuffledPlan.slice(0, idx).filter((_, i) => shuffledTpls[i] === 'stat_callout').length;
      if (used < 2) template = 'stat_callout';
    }
    return { index: idx, category, template };
  });
}


// ═══════════════════════════════════════════════════════════════════
// NODE 2: PROMPT ASSEMBLY
// ═══════════════════════════════════════════════════════════════════

/**
 * @param {Object} business - Business profile with design_system
 * @param {string} category - Assigned content category
 * @param {string} template - Assigned template
 * @param {Array} feedbackItems - Past feedback for learning
 * @param {Array} photoManifest - Photo metadata array for intelligent selection
 */
export function buildPrompt(business, category, template, feedbackItems = [], photoManifest = []) {
  const industry = business.industry || 'consulting';
  const systemPrompt = INDUSTRY_PROMPTS[industry] || INDUSTRY_PROMPTS.consulting;

  const sections = [];

  // 1. Industry role
  sections.push(systemPrompt);

  // 2. Business context
  sections.push(buildBusinessContext(business));

  // 3. Design system context
  sections.push(buildDesignSystemContext(business));

  // 4. Photo manifest (if photos exist)
  if (photoManifest.length > 0) {
    sections.push(buildPhotoManifestContext(photoManifest, template));
  }

  // 5. Assignment
  sections.push(`CONTENT CATEGORY: ${category}\nASSIGNED TEMPLATE: ${template}`);

  // 6. Content rules
  sections.push(buildRulesBlock(category, template));

  // 7. Feedback learning
  const fb = buildFeedbackBlock(feedbackItems);
  if (fb) sections.push(fb);

  // 8. Output format
  const photoField = photoManifest.length > 0 ? ',"photo_index":-1' : '';

  // Template-specific fields hint
  const templateFields = {
    photo_hero: ',"stats":[{"value":"...","label":"..."}],"items":[]',
    full_graphic: ',"items":["service1","service2"]',
    checklist: ',"items":["check item 1","check item 2"]',
    review_showcase: ',"reviews":[{"text":"...","author":"Homeowner"}]',
    process_steps: ',"items":[{"title":"Step Name","subtitle":"Description"}]',
    stat_callout: ',"items":["context pill 1"]',
  };
  const extraFields = templateFields[template] || '';

  sections.push(
    `Respond with ONLY valid JSON. No markdown. No backticks. No explanation.\n{"headline":"...","subtext":"...","caption":"...","hashtags":["tag1","tag2","tag3","tag4","tag5"],"content_type":"${category}","template":"${template}","highlight_words":["word1"],"cta_line1":"...","cta_line2":"...","badge_label":"","eyebrow":""${extraFields}${photoField}}`
  );

  return sections.filter(Boolean).join('\n\n');
}

function buildBusinessContext(biz) {
  return `BUSINESS PROFILE:
Name: ${biz.name}
Industry: ${biz.industry_label || biz.industry}
Tagline: ${biz.tagline || 'N/A'}
Services: ${biz.services || 'N/A'}
Target Customer (ICP): ${biz.icp || 'N/A'}
Tone of Voice: ${biz.tone || 'Professional and direct'}
Service Areas: ${biz.service_areas || 'N/A'}
Website: ${biz.website || 'N/A'}
Preferred CTAs: ${biz.cta_phrases || 'N/A'}
Key Facts: ${biz.fact_sheet || 'N/A'}
Certifications: ${biz.certifications || 'N/A'}
Banned Words: ${biz.banned_words || 'N/A'}`;
}

function buildDesignSystemContext(biz) {
  const ds = biz.design_system;
  if (!ds) return '';

  let block = 'DESIGN SYSTEM (write content that fits this visual identity):';

  if (ds.style_notes) {
    block += `\nStyle: ${ds.style_notes}`;
  }

  if (ds.cta_bar?.enabled && ds.cta_bar?.cta_variations?.length > 0) {
    block += `\nCTA Bar Variations (use one of these as the CTA): ${ds.cta_bar.cta_variations.join(' | ')}`;
  }

  if (ds.trust_badges?.length > 0) {
    block += `\nTrust Badges: ${ds.trust_badges.join(', ')}`;
  }

  const enabledTypes = ds.post_types?.filter((t) => t.enabled).map((t) => t.name) || [];
  if (enabledTypes.length > 0) {
    block += `\nEnabled Post Types: ${enabledTypes.join(', ')}`;
  }

  if (ds.cta_bar?.phone) {
    block += `\nPhone Number (include in CTA when relevant): ${ds.cta_bar.phone}`;
  }

  return block;
}

function buildPhotoManifestContext(manifest, template) {
  const needsPhoto = ['photo_hero', 'process_steps'].includes(template);

  let block = 'AVAILABLE PHOTOS (select the best one for this post):';
  manifest.forEach((photo, idx) => {
    block += `\n[${idx}] ${photo.description || photo.filename}`;
    if (photo.service_type) block += ` | Service: ${photo.service_type}`;
    if (photo.best_use) block += ` | Best for: ${photo.best_use}`;
    if (photo.branding) block += ` | Branding: ${photo.branding}`;
    if (photo.phone_visible) block += ' | PHONE # VISIBLE';
  });

  if (needsPhoto) {
    block += `\n\nThis template (${template}) uses a photo. Set "photo_index" to the index number of the best matching photo from the list above. Choose based on relevance to the content category and best_use notes. If the post content is about branding/trust, prefer photos where the phone number is visible.`;
  } else {
    block += '\n\nThis template does not require a photo. Set "photo_index" to -1 unless a photo would genuinely enhance the post.';
  }

  return block;
}

function buildRulesBlock(category, template) {
  return `CONTENT RULES:
- NEVER use emojis anywhere
- headline: punchy, max 10 words. For stat_callout, MUST be a number/stat (like "97%" or "$8K" or "3 in 5"). For review_showcase, use the rating like "5.0"
- subtext: 1-2 sentences, max 25 words
- caption: 2-3 short paragraphs, conversational, ends with CTA. For Instagram/LinkedIn. No hashtags in caption.
- hashtags: 5 relevant (without # symbol)
- highlight_words: 1-3 key words from the headline to visually accent (these will be colored differently)
- cta_line1: small text above the CTA (like "Schedule Your" or "Don't Wait")
- cta_line2: big bold CTA text (like "FREE INSPECTION" or "CALL NOW"). If CTA bar variations are listed above, split on "|" — left side is line1, right side is line2.
- badge_label: optional top badge text (like "SEASONAL ALERT" or "LIMITED TIME OFFER"). Only use when it adds urgency. Set to "" if not needed.
- eyebrow: optional small text above headline (like "HOW WE WORK" or "DID YOU KNOW"). Set to "" if not needed.
- template: MUST be "${template}"

TEMPLATE-SPECIFIC FIELDS:
For "photo_hero": Include "stats" array with 2-3 items like [{"value":"20+","label":"Years Experience"}] OR include "items" array with 3-4 trust points like [{"title":"IICRC Certified","subtitle":"Every tech trained"}]
For "full_graphic": Include "items" array with 4-6 service/feature pills (short strings like "Foundation Repair")
For "checklist": Include "items" array with 4-6 checklist items (short action strings)
For "review_showcase": Include "reviews" array with 2-3 items like [{"text":"The review text...","author":"Homeowner"}]. Make reviews sound authentic and specific.
For "process_steps": Include "items" array with 3-5 step objects like [{"title":"Free Inspection","subtitle":"We assess your foundation — no charge"}]
For "stat_callout": Include optional "items" array with 2-4 supporting context pills

Be SPECIFIC to this business. Reference actual services, areas, industry.
This is 1 of 12 posts in a batch. Make it UNIQUE.

TEMPLATE DESCRIPTIONS:
- "photo_hero" — photo fills top 55%, headline overlays the bottom of the photo, content zone below with stats or trust items
- "full_graphic" — no photo, gradient background, big centered headline, service pills below
- "checklist" — dark background, headline at top, vertical checklist with checkmark items
- "review_showcase" — dark background, rating number hero, 2-3 review cards with star ratings
- "process_steps" — photo at top (optional), numbered steps below on white background
- "stat_callout" — dark gradient with radial glow, massive stat number as hero, supporting text below`;
}

function buildFeedbackBlock(items) {
  if (!items || items.length === 0) return '';
  const approved = items.filter((i) => i.rating === 'good');
  const rejected = items.filter((i) => i.rating === 'bad');
  let block = 'LEARNING FROM PAST FEEDBACK:';
  if (approved.length > 0) {
    block += '\nApproved (more like these):';
    approved.slice(0, 8).forEach((i) => {
      block += `\n- "${i.headline}" [${i.content_type}]`;
      if (i.reason) block += ` — "${i.reason}"`;
    });
  }
  if (rejected.length > 0) {
    block += '\nRejected (avoid these):';
    rejected.slice(0, 8).forEach((i) => {
      block += `\n- "${i.headline}" [${i.content_type}]`;
      if (i.reason) block += ` — "${i.reason}"`;
    });
  }
  return block;
}


// ═══════════════════════════════════════════════════════════════════
// INDUSTRY PROMPTS
// ═══════════════════════════════════════════════════════════════════

const INDUSTRY_PROMPTS = {
  home_service: `You are a content strategist for a LOCAL HOME SERVICE company. You understand that homeowners don't search for "foundation repair" until they have a problem. Your job is to create content that:
1. Educates homeowners on warning signs they might be ignoring
2. Builds trust through expertise (not sales pressure)
3. Creates seasonal urgency naturally (rain, temperature shifts, etc.)
4. Shows real-world transformation (before/after mentality)
5. Positions the company as the authority in their metro area

Tone: knowledgeable neighbor who is an expert — not a billboard. Calm expertise addressing home anxiety.

HOOKS: Problem identification, seasonal triggers, cost of inaction, process transparency, local specificity.`,

  saas_tech: `You are a content strategist for a B2B SaaS PLATFORM selling to MARKETING AGENCY OWNERS. NOT consumer marketing. Your audience is sophisticated, busy, skeptical of hype. Create content that:
1. Speaks to revenue opportunity (MRR, client retention)
2. Addresses pain of managing AI voice products at scale
3. Positions platform as infrastructure, not a toy
4. Uses concrete numbers and scenarios
5. Sounds founder-to-founder, not marketing department

Tone: direct, confident. No buzzwords. Talk money, time, competitive advantage.

HOOKS: Revenue math, competitive positioning, operational pain, social proof patterns, trend validation.`,

  saas_smb: `You are a content strategist for an AI RECEPTIONIST sold directly to SMALL BUSINESS OWNERS. Audience: plumber, dentist, lawyer, salon owner — busy, not technical, losing money on missed calls. Create content that:
1. Makes missed call pain visceral and real
2. Keeps the solution dead simple
3. Speaks to specific industries with specific scenarios
4. Uses relatable numbers ($500 job lost, 3 missed calls)
5. Positions AI as "employee who never calls in sick"

Tone: friendly, practical. Helpful friend with a solution. Never condescending or technical.

HOOKS: Pain quantification, simplicity proof, industry scenarios, cost comparison, fear of loss.`,

  agency_dev: `You are a content strategist for a WEB DEVELOPMENT AGENCY. Audience: business owners tired of overpromising agencies. Create content that:
1. Demonstrates technical competence without being nerdy
2. Shows speed and reliability as differentiators
3. Shares opinions on web trends
4. Highlights real results and shipped work
5. Sounds like a builder, not a salesperson

Tone: bold, direct. Show don't tell. Confidence backed by capability.

HOOKS: Speed proof, results focus, hot takes, build stories, tech credibility.`,

  consulting: `You are a content strategist for a BUSINESS CONSULTING firm. Audience: owners doing $500K-$5M who feel stuck. Create content that:
1. Diagnoses problems they didn't know they had
2. Teaches frameworks and mental models
3. Challenges hustle culture with systems thinking
4. Uses pattern recognition
5. Positions as someone who's seen the movie before

Tone: authoritative but not arrogant. Mentor energy.

HOOKS: Pattern diagnosis, contrarian insight, framework teaching, metric spotlight, action steps.`,

  logistics_advisory: `You are a content strategist for a LOGISTICS ADVISORY firm serving INDEPENDENT TRUCKING CARRIERS. Audience: fleet owners with 1-50 trucks who are overpaying for insurance, fuel, and maintenance while competing against mega-carriers. Create content that:
1. Quantifies the financial disadvantage and shows the path out
2. Demonstrates deep industry knowledge (insurance, lanes, fuel programs)
3. Uses hard numbers — savings per truck, percentage improvements, ROI timelines
4. Positions firm as former brokerage insiders who switched sides to help carriers
5. Makes the complex simple — fleet owners are operators, not finance people

Tone: authoritative, premium. Gold-on-black energy. Competence and results.

HOOKS: Cost exposure, pooled power, broker contrast, ROI guarantee, operational specifics, industry data, scaling mindset.`,
};