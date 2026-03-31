/**
 * Content Farm — Prompt System v3
 *
 * NODE 1: Strategy (buildBatchPlan) — decides WHAT to create
 * NODE 2: Prompt Assembly (buildPrompt) — builds the AI prompt
 *
 * v3 changes:
 * - Season/date injection (no off-season content)
 * - Real reviews hardcoded per business (no fabrication)
 * - Photo-content matching enforcement
 * - Headline quality guardrails with negative examples
 * - Template-category constraints
 * - Local hashtag instructions
 * - CTA variation enforcement from design system
 */

// ═══════════════════════════════════════════════════════════════════
// SEASON HELPERS
// ═══════════════════════════════════════════════════════════════════

function getSeasonContext() {
  const now = new Date();
  const month = now.getMonth();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthName = monthNames[month];
  const day = now.getDate();
  const year = now.getFullYear();

  let season, weather;
  if (month >= 2 && month <= 4) {
    season = 'spring';
    weather = 'Heavy spring rains, warming temperatures, soil expansion from moisture. Red clay absorbs water and swells.';
  } else if (month >= 5 && month <= 7) {
    season = 'summer';
    weather = 'Hot and humid, afternoon thunderstorms, soil contracts in dry spells then floods in storms. Peak humidity causes condensation in crawl spaces.';
  } else if (month >= 8 && month <= 10) {
    season = 'fall';
    weather = 'Cooling temperatures, leaf debris clogs drains, soil starts contracting. Ideal time for pre-winter inspections.';
  } else {
    season = 'winter';
    weather = 'Freeze-thaw cycles, cold rain, soil contraction. Foundation cracks can worsen.';
  }

  return { monthName, day, year, season, weather };
}


// ═══════════════════════════════════════════════════════════════════
// REAL REVIEWS (per business — AI must use these, not fabricate)
// ═══════════════════════════════════════════════════════════════════

const REAL_REVIEWS = {
  rsa: [
    { text: "My basement needed waterproofing, and Reliable Solutions Atlanta had the best solution. They were thorough, explained the project from beginning to end, and checked in to ensure all was well even after completion.", author: "Cassandra K., Lawrenceville", source: "BBB" },
    { text: "I had a 17,000 dollar job done by them. I have been in my house for 10 years dealing with a wet lower level. The work was thorough and the problem is finally solved.", author: "Alek S., Atlanta", source: "Yelp" },
    { text: "The work and workers responded well. They were on time and did quality work. Things went smoothly once they got started.", author: "Vincent J., Metro Atlanta", source: "Yelp" },
    { text: "Professional crew, fair pricing, and they actually explained what was causing our foundation issues instead of just quoting a number. Warranty is solid too.", author: "Marcus T., Marietta", source: "Google" },
    { text: "Called them after noticing cracks in our basement wall. They came out the same week, did a full inspection for free, and had the repair done within days.", author: "Linda R., Decatur", source: "Google" },
    { text: "We had water coming in every time it rained hard. They installed a French drain system and waterproofed the entire basement. Bone dry ever since.", author: "David P., Roswell", source: "Google" },
  ],
  vac: [],
  cb: [],
  rs: [],
  gtc: [],
};


// ═══════════════════════════════════════════════════════════════════
// TEMPLATE-CATEGORY CONSTRAINTS
// ═══════════════════════════════════════════════════════════════════

const PHOTO_REQUIRED_TEMPLATES = ['photo_hero', 'process_steps', 'split_feature', 'did_you_know'];
const VISUAL_CATEGORIES = ['before_after', 'process_education', 'build_showcase', 'client_win'];
const NO_PHOTO_CATEGORIES = ['myth_bust', 'urgency_stat', 'stat_shock', 'roi_math', 'metric_spotlight', 'contrarian_take', 'diy_trap', 'missed_call_pain', 'differentiation', 'project_trap'];
const REVIEW_ONLY_CATEGORIES = ['social_proof', 'testimonial_style'];

// VoiceAI Connect: each pain point maps to a specific template for visual variety
const SAAS_TECH_TEMPLATE_MAP = {
  'diy_trap':         'stat_callout',      // Big red 80% fail stat
  'revenue_ceiling':  'did_you_know',      // Comparison rows (hrs → 0)
  'funnel_gap':       'process_steps',     // Step 2 highlighted
  'differentiation':  'full_graphic',      // "Not Another CRM" editorial
  'speed_advantage':  'warning_signs',     // 60s vs 2 weeks comparison cards
  'white_label':      'split_feature',     // Dashboard mock + "Start owning"
  'missed_call_pain': 'checklist',         // Mock call log items
  'project_trap':     'service_highlight', // Revenue comparison grid
  'competitor_fomo':  'brand_intro',       // Before/after centered
  'audience_filter':  'split_feature',     // Numbered "Built For" cards
};


// ═══════════════════════════════════════════════════════════════════
// NODE 1: CONTENT STRATEGY
// ═══════════════════════════════════════════════════════════════════

const CONTENT_CATEGORIES = {
  home_service: [
    'seasonal_awareness', 'problem_awareness', 'before_after', 'myth_bust',
    'homeowner_tip', 'social_proof', 'urgency_stat', 'process_education',
  ],
  saas_tech: [
    'diy_trap', 'revenue_ceiling', 'funnel_gap', 'differentiation',
    'speed_advantage', 'white_label', 'missed_call_pain', 'project_trap',
    'competitor_fomo', 'audience_filter',
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
  'photo_hero', 'full_graphic', 'checklist', 'stat_callout',
  'process_steps', 'review_showcase', 'service_highlight', 'offer_coupon',
  'warning_signs', 'did_you_know', 'brand_intro', 'split_feature',
];

const STAT_FRIENDLY = [
  'urgency_stat', 'stat_shock', 'roi_math', 'metric_spotlight',
  'revenue_hook', 'cost_savings', 'industry_data', 'fuel_strategy',
  'diy_trap', 'missed_call_pain',
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildBatchPlan(business, platform = 'instagram') {
  const industry = business.industry || 'consulting';
  const cats = CONTENT_CATEGORIES[industry] || CONTENT_CATEGORIES.consulting;
  const isLinkedIn = platform === 'linkedin';

  // LinkedIn: 10 posts, Instagram: 12
  const postCount = isLinkedIn ? 10 : 12;

  // Filter templates to only enabled post types for this business
  const enabledTypes = business.design_system?.post_types?.filter(t => t.enabled).map(t => t.id) || [];
  const availableTemplates = enabledTypes.length > 0
    ? TEMPLATE_DISTRIBUTION.filter(t => enabledTypes.includes(t))
    : TEMPLATE_DISTRIBUTION;

  // Pad to postCount if fewer templates than posts
  const tplPool = [];
  while (tplPool.length < postCount) {
    tplPool.push(...availableTemplates);
  }

  const plan = [...cats];
  for (let i = 0; plan.length < postCount; i++) plan.push(cats[i % cats.length]);

  const shuffledPlan = shuffle(plan).slice(0, postCount);
  const shuffledTpls = shuffle(tplPool.slice(0, postCount));

  return shuffledPlan.map((category, idx) => {
    let template = shuffledTpls[idx];

    // saas_tech: use forced template mapping for visual variety per pain point
    // LinkedIn: all posts use full_graphic (simple graphic, caption is the content)
    if (industry === 'saas_tech' && SAAS_TECH_TEMPLATE_MAP[category]) {
      template = isLinkedIn ? 'full_graphic' : SAAS_TECH_TEMPLATE_MAP[category];
      return { index: idx, category, template };
    }

    // stat_callout only for stat-friendly categories
    if (template === 'stat_callout' && !STAT_FRIENDLY.includes(category)) template = 'full_graphic';
    if (STAT_FRIENDLY.includes(category) && template !== 'stat_callout') {
      const used = shuffledPlan.slice(0, idx).filter((_, i) => shuffledTpls[i] === 'stat_callout').length;
      if (used < 1) template = 'stat_callout';
    }

    // review_showcase only for social proof / testimonial categories
    if (template === 'review_showcase' && !REVIEW_ONLY_CATEGORIES.includes(category)) template = 'checklist';
    if (REVIEW_ONLY_CATEGORIES.includes(category)) template = 'review_showcase';

    // Don't give photo templates to conceptual categories
    if (PHOTO_REQUIRED_TEMPLATES.includes(template) && NO_PHOTO_CATEGORIES.includes(category)) template = 'full_graphic';

    // Visual categories should prefer photo templates
    if (VISUAL_CATEGORIES.includes(category) && !PHOTO_REQUIRED_TEMPLATES.includes(template)) template = 'photo_hero';

    return { index: idx, category, template };
  });
}


// ═══════════════════════════════════════════════════════════════════
// NODE 2: PROMPT ASSEMBLY
// ═══════════════════════════════════════════════════════════════════

export function buildPrompt(business, category, template, feedbackItems = [], photoManifest = [], platform = 'instagram') {
  const industry = business.industry || 'consulting';
  const systemPrompt = INDUSTRY_PROMPTS[industry] || INDUSTRY_PROMPTS.consulting;
  const seasonCtx = getSeasonContext();
  const isLinkedIn = platform === 'linkedin';
  const sections = [];

  sections.push(systemPrompt);
  sections.push(buildSeasonBlock(seasonCtx, business));
  sections.push(buildBusinessContext(business));
  sections.push(buildDesignSystemContext(business));

  if (template === 'review_showcase') {
    sections.push(buildRealReviewsBlock(business));
  }

  if (photoManifest.length > 0) {
    sections.push(buildPhotoManifestContext(photoManifest, template, category));
  }

  sections.push(`CONTENT CATEGORY: ${category}\nASSIGNED TEMPLATE: ${template}`);

  // saas_tech: inject specific pain point direction per category
  if (industry === 'saas_tech') {
    sections.push(buildSaasTechCategoryGuide(category, template));
  }

  sections.push(buildRulesBlock(category, template, business, isLinkedIn));

  // Inject variation seed so consecutive runs produce different content
  sections.push(buildVariationSeed(category));

  const fb = buildFeedbackBlock(feedbackItems);
  if (fb) sections.push(fb);

  const photoField = photoManifest.length > 0 ? ',"photo_index":-1' : '';
  const templateFields = {
    photo_hero: ',"stats":[{"value":"...","label":"..."}],"items":[]',
    full_graphic: ',"items":["service1","service2"]',
    checklist: ',"items":["check item 1","check item 2"]',
    review_showcase: ',"reviews":[{"text":"...","author":"Name, City"}]',
    process_steps: ',"items":[{"title":"Step Name","subtitle":"Description"}]',
    stat_callout: ',"items":["context pill 1"]',
    service_highlight: ',"items":["feature 1","feature 2"]',
    offer_coupon: ',"items":["service1","service2"]',
    warning_signs: ',"items":[{"title":"Warning sign","subtitle":"Why it matters"}]',
    did_you_know: ',"items":["related service 1"]',
    brand_intro: ',"items":["service1","service2"],"stats":[{"value":"20+","label":"Years"}]',
    split_feature: ',"items":[{"title":"Feature","subtitle":"Description"}]',
  };
  const extraFields = templateFields[template] || '';

  sections.push(
    `Respond with ONLY valid JSON. No markdown. No backticks. No explanation.\n{"headline":"...","subtext":"...","caption":"...","hashtags":["tag1","tag2","tag3","tag4","tag5"],"content_type":"${category}","template":"${template}","highlight_words":["word1"],"cta_line1":"...","cta_line2":"...","badge_label":"","eyebrow":""${extraFields}${photoField}}`
  );

  return sections.filter(Boolean).join('\n\n');
}


// ═══════════════════════════════════════════════════════════════════
// PROMPT SECTION BUILDERS
// ═══════════════════════════════════════════════════════════════════

function buildSeasonBlock(ctx, biz) {
  return `CURRENT DATE & SEASON:
Today is ${ctx.monthName} ${ctx.day}, ${ctx.year}. Season: ${ctx.season}.
${biz.industry === 'home_service' ? `Local weather: ${ctx.weather}` : ''}
CRITICAL: All content must be appropriate for ${ctx.monthName} / ${ctx.season}. Do NOT reference other seasons.`;
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
  let block = 'DESIGN SYSTEM:';
  if (ds.style_notes) block += `\nStyle: ${ds.style_notes}`;
  if (ds.cta_bar?.enabled && ds.cta_bar?.cta_variations?.length > 0) {
    block += `\nCTA VARIATIONS — MUST USE ONE (split on "|", left=cta_line1, right=cta_line2): ${ds.cta_bar.cta_variations.join(' | ')}`;
  }
  if (ds.trust_badges?.length > 0) block += `\nTrust Badges: ${ds.trust_badges.join(', ')}`;
  if (ds.cta_bar?.phone) block += `\nPhone: ${ds.cta_bar.phone}`;
  return block;
}

function buildRealReviewsBlock(biz) {
  const reviews = REAL_REVIEWS[biz.id] || [];
  if (!reviews.length) return 'No real reviews available for this business. Generate plausible but clearly fictional reviews.';
  let block = `REAL CUSTOMER REVIEWS — USE ONLY THESE. DO NOT FABRICATE REVIEWS.\nSelect 2-3 from this list. Copy text exactly (may slightly shorten). Use the real author name and city.`;
  reviews.forEach((r, i) => {
    block += `\n[${i}] "${r.text}" — ${r.author} (${r.source})`;
  });
  block += `\nIMPORTANT: Every review in your output MUST come from this list.`;
  return block;
}

function buildPhotoManifestContext(manifest, template, category) {
  const needsPhoto = ['photo_hero', 'process_steps', 'split_feature', 'did_you_know'].includes(template);
  let block = 'AVAILABLE PHOTOS:';
  manifest.forEach((photo, idx) => {
    block += `\n[${idx}] ${photo.description || photo.filename}`;
    if (photo.service_type) block += ` | Service: ${photo.service_type}`;
    if (photo.best_use) block += ` | Best for: ${photo.best_use}`;
    if (photo.branding) block += ` | Branding: ${photo.branding}`;
    if (photo.phone_visible) block += ' | PHONE VISIBLE';
  });
  if (needsPhoto) {
    block += `\n\nThis template uses a photo. Set "photo_index" to the best match.`;
    block += `\nPHOTO-CONTENT RULE: Photo service_type MUST match your content topic. "foundation repair" content needs a "foundation-repair" photo, NOT "crawl-space." If no photo matches, set photo_index to -1.`;
  } else {
    block += '\n\nThis template does not use a photo. Set "photo_index" to -1.';
  }
  return block;
}

function buildRulesBlock(category, template, biz, isLinkedIn = false) {
  const ctx = getSeasonContext();
  const areas = (biz.service_areas || 'Atlanta').split(',').map(s => s.trim()).filter(Boolean);
  const city1 = areas[0] || 'Atlanta';

  const captionRule = isLinkedIn
    ? `- caption: THIS IS THE MAIN CONTENT — the graphic is secondary. Write 5-8 short paragraphs, 1-2 sentences each. Put a BLANK LINE between EVERY paragraph (this is critical for LinkedIn readability). First line MUST be a scroll-stopping hook — this is what shows before "...see more" so it needs to earn the click. Write like you're talking to a friend who runs an agency. Conversational, direct, no corporate speak. End with a question or soft CTA that invites a comment. No hashtags in the caption body. No emojis. No exclamation marks. NEVER use these AI-sounding phrases: "here's the thing", "let me be honest", "let that sink in", "read that again", "I'll say it louder", "hot take", "unpopular opinion". Just say the thing directly. The caption should work as a standalone LinkedIn post even without the image.`
    : `- caption: 2-3 paragraphs, conversational, ends with CTA. No hashtags in body. Must sound like a real person at this company wrote it.`;

  const hashtagRule = isLinkedIn
    ? `- hashtags: 3-5 total. Place AFTER the caption, separated by a blank line. Mix of industry + audience: #AIReceptionist, #AgencyGrowth, #RecurringRevenue, #WhiteLabel, #MarketingAgency, #SaaS, #LeadGen. Pick the 3-5 most relevant.`
    : `- hashtags: 5 total. ${biz.industry === 'home_service' ? `Include 2+ local: ${areas.slice(0, 4).map(c => '#' + c.replace(/\s/g, '')).join(', ')}, #MetroAtlanta, #ATLHomeRepair` : 'Mix industry + local hashtags.'}`;

  return `CONTENT RULES:
- NEVER use emojis
- headline: punchy, max 10 words, MUST be specific (city, service, pain point, or stat).${isLinkedIn ? ' This appears on the GRAPHIC IMAGE only — keep it short and bold.' : ''} For stat_callout: headline MUST be a number. For review_showcase: use rating like "5.0 STARS FROM ${city1.toUpperCase()} HOMEOWNERS"
- subtext: 1-2 sentences, max 25 words.${isLinkedIn ? ' This is the secondary line on the graphic below the headline.' : ''}
${captionRule}
${hashtagRule}
- highlight_words: 1-3 key words from headline to accent-color
- cta_line1/cta_line2: ${biz.design_system?.cta_bar?.cta_variations?.length ? 'MUST pick from the CTA VARIATIONS list above. Split on "|".' : 'Write a 2-4 word CTA.'}
- badge_label: urgency badge or "". Only for seasonal/offer/warning posts.
- eyebrow: small label or "". Only when it adds context.
- template: MUST be "${template}"
${isLinkedIn ? `
LINKEDIN CAPTION QUALITY:
GOOD first lines: "I spent 6 months building an AI receptionist from scratch. If I could go back, I'd do it in a weekend." | "A plumber in Atlanta told me he missed 11 calls last Tuesday." | "Most agencies sell time. The smart ones sell infrastructure."
BAD first lines (REJECTED): "Excited to announce..." | "In today's fast-paced world..." | "AI is changing everything..." | "Let me share something with you..."
Good = SPECIFIC, story-driven, creates curiosity. Bad = GENERIC corporate or AI-sounding openers.
The caption must read like a real founder wrote it on their phone between meetings. Short sentences. Direct. No filler words.` : `
HEADLINE QUALITY:
GOOD: "${city1}'s Red Clay Is Eating Your Foundation" | "${ctx.monthName} Storms Test Every Basement" | "83% Of Cracks Start Small" | "$500 Off This ${ctx.monthName}"
BAD (REJECTED): "Protect Your Home Today" | "Quality Service You Can Trust" | "We're Here For You" | "Expert Solutions" | "Don't Wait To Call"
Good = SPECIFIC (city, stat, service, pain). Bad = GENERIC (could be any company).`}

TEMPLATE-SPECIFIC FIELDS:
For "photo_hero": "stats" array [{"value":"20+","label":"Years"}] OR "items" array [{"title":"IICRC Certified","subtitle":"Every tech trained"}]
For "full_graphic": "items" array with 4-6 service pills
For "checklist": "items" array with 4-6 checklist strings. "badge_label" if seasonal.
For "review_showcase": "reviews" array with 2-3 items FROM THE REAL REVIEWS LIST ABOVE ONLY.
For "process_steps": "items" array with 3-5 step objects [{"title":"...","subtitle":"..."}]
For "stat_callout": optional "items" array with 2-4 context pills. Stat must be verifiable.
For "service_highlight": "items" array with 4-6 features. "eyebrow" = category label.
For "offer_coupon": "items" pills. "badge_label" = "LIMITED TIME OFFER". Headline = the offer.
For "warning_signs": "items" array [{"title":"...","subtitle":"why it matters"}]. Auto-numbered.
For "did_you_know": "items" pills. Headline = surprising fact. Subtext = explanation.
For "brand_intro": "items" services + "stats" [{"value":"20+","label":"Years"}]
For "split_feature": "items" [{"title":"...","subtitle":"..."}]

SEASON: ${ctx.season} (${ctx.monthName} ${ctx.year}). All content must match current season.
Be SPECIFIC to this business. This is 1 of ${isLinkedIn ? '10' : '12'} — make it UNIQUE.`;
}

function buildVariationSeed(category) {
  const batchId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const angles = [
    'Lead with a bold claim, then back it up.',
    'Start with a specific scenario — make the reader picture it.',
    'Open with a question that makes them pause.',
    'Use a short, punchy first sentence. Under 8 words.',
    'Start with a number or stat that surprises.',
    'Begin with "I" — make it personal and founder-voiced.',
    'Open with what most people get wrong about this topic.',
    'Lead with the outcome, then explain how.',
    'Start with something counterintuitive.',
    'Open with a real-world observation, not a claim.',
    'Begin with a comparison — X vs Y.',
    'Start with a single word or phrase. Then expand.',
  ];

  const tones = [
    'Write this one shorter than usual. Tight. Every word earns its place.',
    'Be conversational here — like texting a friend who runs an agency.',
    'This one should feel authoritative. Confident founder energy.',
    'Write with urgency. The window is closing.',
    'Be educational here. Teach something genuinely useful.',
    'Use dry humor. Understated, not forced.',
    'Be direct and blunt. No warm-up. Just the point.',
    'Write this like a case study. Third person, observational.',
  ];

  const angle = angles[Math.floor(Math.random() * angles.length)];
  const tone = tones[Math.floor(Math.random() * tones.length)];

  return `VARIATION SEED (batch ${batchId}):
Writing approach for this post: ${angle}
Tone modifier: ${tone}
IMPORTANT: This content must be FRESH and DIFFERENT from any previous version. Use a unique angle, different phrasing, and a new opening. Do not recycle headlines or captions from prior batches.`;
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
    block += '\nRejected (NEVER do anything like these):';
    rejected.slice(0, 8).forEach((i) => {
      block += `\n- "${i.headline}" [${i.content_type}]`;
      if (i.reason) block += ` — "${i.reason}"`;
    });
  }
  return block;
}


// ═══════════════════════════════════════════════════════════════════
// SAAS_TECH PAIN POINT CONTENT DIRECTION
// Each category is a specific pain point with exact content guidance
// ═══════════════════════════════════════════════════════════════════

function buildSaasTechCategoryGuide(category, template) {
  const guides = {
    diy_trap: `THIS POST: The DIY Warning — why building your own AI tool is a trap
TARGET: The agency owner who's been thinking about hiring a dev team to build AI
HEADLINE: Must be a NUMBER or COST. Use one of: "80%" or "$150K" or "6 Months" — the headline IS the stat. Nothing else.
SUBTEXT: One sentence explaining the stat. Example: "of AI projects never make it to production"
CAPTION MUST START WITH: A story about someone who tried to build their own. First line examples: "I watched an agency owner spend $80K on a custom AI phone system." or "A friend of mine hired three developers last year."
CAPTION STRUCTURE: Story of failure → the cost → the alternative → no pitch, just the lesson learned.
ITEMS: 3-4 cost/timeline comparison pills. Example: ["$50K-$300K build cost", "6-12 month timeline", "80% failure rate", "Ongoing maintenance"]
DO NOT mention VoiceAI Connect in the caption. This is a VALUE post — teach the lesson.`,

    revenue_ceiling: `THIS POST: The math on agency service delivery — hours are the bottleneck
TARGET: The solo agency owner doing $15K-$30K/mo who's maxed on time
HEADLINE: Must contain a COMPARISON with an arrow or "vs." Use: "2hrs → 0" or "$125/hr vs. Infinite" — show the contrast.
SUBTEXT: "The service that doesn't cost you time" or similar. One line.
CAPTION MUST START WITH: A question about hourly rate. First line examples: "What's your effective hourly rate on your best client?" or "Most agency owners have never calculated this number."
CAPTION STRUCTURE: Ask the question → break down SEO/Ads/Web hourly math → reveal AI receptionist = 0 hours → let the math speak.
ITEMS: 3-4 service rows with price + hours. Example: [{"title":"SEO Client","subtitle":"$1,500/mo — 12 hrs/mo = $125/hr"}, {"title":"Ads Client","subtitle":"$2,000/mo — 20 hrs/mo = $100/hr"}, {"title":"AI Receptionist Client","subtitle":"$297/mo — 0 hrs/mo"}]
DO NOT mention VoiceAI Connect. Pure education about business model math.`,

    funnel_gap: `THIS POST: The funnel step agencies ignore — the phone call between the ad and the booking
TARGET: Google Ads agency owners who drive calls for clients
HEADLINE: Must be "Step 2" or reference the gap. Use: "Step 2 Is Where They Lose" or "The Gap Nobody Owns"
SUBTEXT: "Ad Click → Phone Rings → Booked Job. Which step is yours?" — must reference the 3-step funnel.
CAPTION MUST START WITH: A direct statement about ads and calls. First line examples: "You're running great ads. Your client's phone is ringing." or "Google Ads is doing its job. The phone rings. Then what?"
CAPTION STRUCTURE: Set up the funnel → identify the gap (the unanswered call) → quantify the waste → reframe the opportunity.
ITEMS: Exactly 3 steps: [{"title":"Ad Click","subtitle":"Your ads are working. Someone searched, someone clicked."}, {"title":"Phone Rings","subtitle":"This is where the money is made or lost. Right here."}, {"title":"Booked Job","subtitle":"Call answered, lead captured, appointment set, client paid."}]
Step 2 MUST be the highlighted one. This post is about REFRAMING — no product pitch.`,

    differentiation: `THIS POST: Positioning statement — what VoiceAI Connect is NOT
TARGET: The agency owner who's been burned by too many SaaS tools promising everything
HEADLINE: Must contain "Not" — Use: "Not Another CRM." (with the period). Nothing else. Short and definitive.
SUBTEXT: Must be "Purpose-Built AI Call Layer" — those exact words or close to them.
CAPTION MUST START WITH: A frustrated observation. First line examples: "How many dashboards do you log into every day?" or "Your clients don't need another tool they'll never open."
CAPTION STRUCTURE: Name the problem (tool fatigue) → list what this ISN'T → explain what it IS (one job, done well) → no CTA, just clarity.
ITEMS: 3-4 "not" statements as simple strings. Example: ["Not a GoHighLevel replacement", "Not a marketing suite", "Not another tool to learn", "Not a chatbot"]
This is a POSITIONING post. The tone is definitive, calm, confident. No selling.`,

    speed_advantage: `THIS POST: Speed comparison — 60 seconds vs. 2 weeks to get a client live
TARGET: The agency owner frustrated with technical setup overhead per client
HEADLINE: Must contain a TIME contrast. Use: "60 Seconds vs. 2 Weeks" — the speed gap IS the headline.
SUBTEXT: "Same result. Different century." or "One of these is automated." — one punchy line.
CAPTION MUST START WITH: A frustration about onboarding. First line examples: "Every new client used to take me two hours to set up." or "A2P registration. If you know, you know."
CAPTION STRUCTURE: Describe the old painful process → contrast with automated → explain why this matters at scale (client 30 = same effort as client 1).
ITEMS: Must be comparison pairs. Problems first, then solutions. Example: [{"title":"A2P registration","subtitle":"2-week wait per client"}, {"title":"Manual config","subtitle":"Hour per client minimum"}, {"title":"Automated provisioning","subtitle":"60 seconds. Done."}, {"title":"Self-serve dashboard","subtitle":"Client manages themselves."}]
First 2 items = problems. Last 2 = solutions. Red/green visual.`,

    white_label: `THIS POST: Ownership — your brand on every screen, not ours
TARGET: The entrepreneur who wants to look like a tech company, not a reseller
HEADLINE: Must contain "Your" or "Own" — Use: "Your Brand. Every Screen." or "Stop Reselling. Start Owning."
SUBTEXT: "Clients see your company — not ours." — one line about perception.
CAPTION MUST START WITH: A statement about brand perception. First line examples: "There's a difference between reselling a product and owning a product." or "Your clients should never know we exist."
CAPTION STRUCTURE: Explain the perception gap between reseller and owner → list what's white-labeled → explain how this changes pricing power → soft mention of the platform at the end only.
ITEMS: 4 ownership features as numbered cards. Example: [{"title":"Your Custom Domain","subtitle":"clients.youragency.com"}, {"title":"Your Logo Everywhere","subtitle":"Dashboard, emails, onboarding"}, {"title":"Your Pricing Structure","subtitle":"Set margins that match a tech provider"}, {"title":"Your Client Portal","subtitle":"They log in and see your company"}]
This is an ASK post — okay to mention VoiceAI Connect at the end of the caption.`,

    missed_call_pain: `THIS POST: The visceral missed call problem — make it feel real
TARGET: Home service marketers whose clients are plumbers, HVAC, roofers
HEADLINE: Must be a TIMESTAMP pattern. Use: "7:02 PM. 7:14 PM. 7:31 PM." or "Missed. Missed. Missed." — raw and urgent.
SUBTEXT: "This happened to three of your clients last night." — accusatory, personal.
CAPTION MUST START WITH: A specific scenario. First line examples: "A pipe burst in Marietta at 7 PM last Tuesday." or "Last Saturday at 6 AM, a homeowner's AC died."
CAPTION STRUCTURE: Tell ONE specific missed-call scenario → quantify the loss → explain that 85% won't leave voicemail → the call goes to the competitor → no pitch, just the reality.
ITEMS: 4-6 mock call log entries as checklist strings. Example: ["Missed Call — 7:02 PM", "Missed Call — 7:14 PM", "Missed Call — 7:31 PM", "Missed Call — 8:45 PM", "Voicemail (empty) — 9:12 PM"]
DO NOT pitch. This is pure pain-point education. Value post.`,

    project_trap: `THIS POST: The economics of project-based vs. recurring — show the hourly rate trap
TARGET: The agency owner selling websites and SEO who wants to break the feast/famine cycle
HEADLINE: Must contain "$" and "/hr" — Use: "$125/hr → Infinite" or "Run Your Numbers" — it's about the math.
SUBTEXT: "Which service actually scales?" — one question.
CAPTION MUST START WITH: A confession or realization. First line examples: "I used to think my agency was profitable. Then I calculated my actual hourly rate." or "Website project: $5K. Time spent: 60 hours. Effective rate: $83/hr."
CAPTION STRUCTURE: Confess the hourly rate reality → break down each service type → reveal AI receptionist as infinite ROI → frame the strategic shift from services to products.
ITEMS: 4 service comparison cards. Example: [{"title":"Website Client","subtitle":"$3K one-time — 40 hrs — then nothing"}, {"title":"SEO Client","subtitle":"$1,500/mo — 12 hrs/mo — $125/hr effective"}, {"title":"Ads Client","subtitle":"$2,000/mo — 20 hrs/mo — $100/hr effective"}, {"title":"AI Receptionist Client","subtitle":"$297/mo — 0 hrs/mo — infinite"}]
DO NOT pitch. This is a founder sharing a business insight.`,

    competitor_fomo: `THIS POST: Competitive pressure — other agencies are already offering this
TARGET: The agency owner who's heard about AI but hasn't acted yet
HEADLINE: Must reference "competitor" or "already" — Use: "Their Competitor Already Has One" or "While You Wait, They Ship"
SUBTEXT: "How long before your clients notice?" — one line of urgency.
CAPTION MUST START WITH: A third-person observation. First line examples: "I talked to an agency owner last week who just lost a client." or "Saw a post in a marketing group yesterday that made me think."
CAPTION STRUCTURE: Tell the story of an agency that moved first → what their clients got → what the slow agency's clients are still dealing with → the window is closing → ask a question at the end.
ITEMS: Before/after comparison. Example: [{"title":"Without AI: Missed calls, voicemail, lost revenue","subtitle":""}, {"title":"Without AI: Client complaints about response time","subtitle":""}, {"title":"With AI: Every call answered, every job booked","subtitle":""}, {"title":"With AI: Clients think they hired a receptionist","subtitle":""}]
This is an ASK post — can mention the platform at the very end.`,

    audience_filter: `THIS POST: Audience qualifier — who this is specifically for
TARGET: All ICP segments at once — this post filters the right people in
HEADLINE: Must start with "Built For" — Use: "Built For:" with a colon. Nothing after it in the headline. The list is in the items.
SUBTEXT: "If this sounds like your agency, keep reading." — invitational, not salesy.
CAPTION MUST START WITH: A direct filter statement. First line examples: "This isn't for everyone. And that's the point." or "If your clients don't get phone calls, this isn't for you."
CAPTION STRUCTURE: Say who it's NOT for first → then who it IS for (4 types) → explain why phone-based businesses specifically → end with "If your clients depend on the phone to make money, this is the easiest upsell you'll ever close."
ITEMS: Exactly 4 audience segments with descriptions. Example: [{"title":"Google Ads Agencies","subtitle":"You drive calls. Your clients don't answer them all."}, {"title":"Home Service Marketers","subtitle":"HVAC, plumbing, roofing — call-heavy, after-hours demand."}, {"title":"Local Lead Gen Companies","subtitle":"You sell leads. Now sell what happens when the phone rings."}, {"title":"Call-Heavy Accounts","subtitle":"Any client where inbound calls = revenue and missed calls = lost money."}]
This is an ASK post — mention VoiceAI Connect by name at the end.`,
  };

  return guides[category] || '';
}


// ═══════════════════════════════════════════════════════════════════
// INDUSTRY PROMPTS
// ═══════════════════════════════════════════════════════════════════

const INDUSTRY_PROMPTS = {
  home_service: `You are a content strategist for a LOCAL HOME SERVICE company specializing in waterproofing and foundation repair in Metro Atlanta, Georgia. You understand:
1. Atlanta's red clay soil expands when wet and contracts when dry — this causes foundation movement
2. Homeowners don't search for "foundation repair" until they see cracks, water, or smell mold
3. Your audience is scared about their biggest investment — speak with calm authority, not sales pressure
4. Every post must feel LOCAL — reference specific cities (Marietta, Decatur, Roswell), Georgia weather, red clay
5. Trust signals matter: BBB A+, IICRC Certified, Google 5.0 Stars, 20+ years experience

Tone: knowledgeable neighbor who is an expert. Not salesy, not desperate. Professional-contractor-meets-direct-response.

HOOKS: Problem identification, seasonal triggers (CURRENT season only), cost of inaction, process transparency, local specificity, social proof with real details.
NEVER: Generic headlines, vague promises, stock-photo energy, references to wrong season.`,

  saas_tech: `You are a content strategist for a B2B SaaS PLATFORM that lets marketing agencies white-label and resell AI phone receptionists under their own brand. This is NOT consumer marketing. Your audience is agency owners who already have clients and want to add recurring revenue.

THE BUSINESS MODEL (understand this deeply):
- Agency signs up on the platform, gets their own branded dashboard
- Agency sells AI receptionist service to their local business clients (plumbers, dentists, lawyers, etc.) at $200-$500/mo
- The platform handles everything: AI config, phone provisioning, onboarding, call handling
- Agency's ONLY job is to sell. Zero fulfillment. Zero technical work.
- Stripe Connect splits payments automatically
- Result: agencies add $3K-$7K/mo in pure MRR from existing client base

THE PROBLEM YOU'RE SOLVING:
- 34% of calls to local businesses go unanswered
- 85% of callers won't leave voicemail
- ~$106B lost annually from missed calls
- A human receptionist costs $3K+/mo
- Agencies currently sell websites, SEO, ads — all project-based or low-margin. They need recurring revenue.

DIFFERENTIATION:
- NOT another CRM (GoHighLevel already exists)
- Purpose-built AI call layer — does one thing and does it well
- 60-second automated client onboarding (no manual setup per client)
- No A2P SMS registration per client (a massive pain point with other platforms)

Create content that:
1. Shows the REVENUE MATH — concrete numbers, not vague "grow your business" talk
2. Addresses OPERATIONAL reality — "you already have the clients, you just need the product"
3. Positions as INFRASTRUCTURE, not a toy or experiment
4. Sounds like a founder showing another founder his P&L, not a marketing department writing copy
5. Creates FOMO through competitive positioning — "while you sell websites, other agencies sell AI"

Tone: operator energy. Strategic. Revenue-focused. Like explaining over drinks why this is the easiest MRR an agency will ever add. NOT "AI guru" energy. NOT course-launch energy. NOT hype.

HOOKS THAT WORK:
- Revenue math: "10 clients at $297/mo = $2,970/mo. You keep the margin."
- Competitive positioning: "While other agencies sell websites, you sell AI."
- Operational pain flip: "You already have the clients. You just need the product."
- Zero fulfillment: "Your only job is to close. We handle everything else."
- The missed call problem: "Your clients are losing $2,000/mo in missed calls and they don't even know it."
- Not another CRM: "Purpose-built AI call layer. Not another dashboard they'll never log into."
- The funnel gap: "Google Ads drives the call. Who answers it?"

CONTENT STRUCTURE — VALUE FIRST:
80% of posts should GIVE VALUE with no ask. Educate, reframe, reveal a problem, teach something useful. Only 20% should have a direct CTA or mention VoiceAI Connect by name.
- VALUE posts: Teach something about the missed call problem, the agency business model, AI adoption, recurring revenue strategy, client retention, or the economics of service vs. product businesses. The reader should walk away smarter even if they never visit the site.
- ASK posts: These are the brand_intro and audience_filter categories ONLY. Everything else should educate first.
- NEVER pitch in every post. If the post doesn't teach, challenge, or reframe something, it's not good enough.

ICP ROTATION — VARY THE ANGLE:
Don't write every post to the same person. Rotate between these ICP angles across the batch:
- The Google Ads agency owner who drives calls but can't control what happens when the phone rings
- The home service marketer (HVAC, plumbing, roofing) whose clients are call-heavy and after-hours dependent
- The solo agency owner doing $10K-$30K/mo who wants to break through without hiring
- The lead gen company that sells leads but doesn't own the conversion step
- The agency owner who tried building their own AI tool and burned $50K+
Each post should speak to ONE of these people specifically, not all of them at once.

DEDUP RULES:
Every post in this batch must have a DIFFERENT headline structure, a DIFFERENT opening angle, and target a DIFFERENT ICP segment. Do NOT repeat the same stat, the same hook formula, or the same sentence structure across posts. If post 1 leads with a number, post 2 should lead with a question, post 3 with a scenario, post 4 with a contrarian statement, etc.

NEVER: Generic SaaS marketing speak. "Scale your business." Stock photo energy. Bright colors. Buzzwords. Anything that sounds like a course launch or biz-op pitch. NEVER repeat the same headline structure twice in a batch.`,

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

  logistics_advisory: `You are a content strategist for a LOGISTICS ADVISORY firm serving INDEPENDENT TRUCKING CARRIERS. Audience: fleet owners with 1-50 trucks overpaying for insurance, fuel, maintenance while competing against mega-carriers. Create content that:
1. Quantifies the financial disadvantage and shows the path out
2. Demonstrates deep industry knowledge (insurance, lanes, fuel programs)
3. Uses hard numbers — savings per truck, percentage improvements, ROI timelines
4. Positions firm as former brokerage insiders who switched sides to help carriers
5. Makes the complex simple — fleet owners are operators, not finance people

Tone: authoritative, premium. Gold-on-black energy. Competence and results.
HOOKS: Cost exposure, pooled power, broker contrast, ROI guarantee, operational specifics, industry data, scaling mindset.`,
};