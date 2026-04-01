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
  'diy_trap':         'stat_callout',      // Cost/failure stat
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

  // LinkedIn: 10 posts, saas_tech: exactly 10 (one per pain point), others: 12
  const isSaasTech = industry === 'saas_tech';
  const postCount = (isLinkedIn || isSaasTech) ? 10 : 12;

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
- NEVER fabricate statistics. Do not invent percentages, dollar amounts, or data points. Use honest ranges ("most", "$50K-$300K", "6-12 months") instead of fake precision ("80.7%", "$147K average"). If you don't know the exact number, say "most" or give a range.
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
  // Random scenario pool per category — different scenario each run
  const scenarios = {
    diy_trap: ['a dev agency that spent 8 months on a custom voice AI', 'a marketing agency owner who hired a freelance AI developer', 'a friend who sank his savings into building an AI tool from scratch', 'an agency that went through 3 developers before giving up'],
    revenue_ceiling: ['an agency doing $25K/mo who couldn\'t take on more clients', 'a solo operator who hit $15K/mo and plateaued for a year', 'a 3-person agency that was turning away business', 'an agency owner working 70-hour weeks at $20K/mo'],
    funnel_gap: ['a roofing company spending $4K/mo on ads but missing half the calls', 'a plumber whose Google Ads were working but calls went to voicemail after 5pm', 'a dentist getting 30 calls/week from ads but only answering 18', 'an HVAC company whose best leads called on weekends when nobody was there'],
    differentiation: ['switching between 6 different dashboards before lunch', 'paying for a CRM with 200 features and using 3', 'an agency that onboarded GoHighLevel and their clients never logged in', 'the moment you realize your clients don\'t need another tool'],
    speed_advantage: ['waiting 2 weeks for A2P registration on every new client', 'spending an hour configuring each new client manually', 'a client who signed up Monday and wasn\'t live until the following week', 'the onboarding call that could have been automated'],
    white_label: ['a client asking why your dashboard says another company\'s name', 'the moment you realize resellers and product owners get paid differently', 'an agency that rebranded from reseller to tech company overnight', 'clients who think you built the technology yourself'],
    missed_call_pain: ['a pipe burst in Marietta at 7 PM on a Tuesday', 'an AC unit dying in July at 9 PM in Atlanta', 'a basement flooding during a Saturday thunderstorm', 'a restaurant getting 4 reservation calls while the owner was cooking'],
    project_trap: ['calculating your effective hourly rate and not liking the number', 'finishing a $5K website project and immediately needing the next one', 'comparing your SEO retainer hours to what you actually earn per hour', 'the realization that you\'re trading time for money at every level'],
    competitor_fomo: ['finding out a competing agency just signed 3 of your prospect\'s competitors', 'a client asking why their competitor\'s phone gets answered at 6 AM', 'seeing another agency post about their AI receptionist offering on LinkedIn', 'losing a pitch because the other agency included AI answering in their package'],
    audience_filter: ['a Google Ads agency that drives 200 calls/week for clients', 'a home service marketer managing 15 plumbing and HVAC accounts', 'a lead gen company that sells leads but can\'t control the conversion', 'a solo agency owner looking for their first zero-fulfillment product'],
  };

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const scenario = scenarios[category] ? pick(scenarios[category]) : '';

  const guides = {
    diy_trap: `THIS POST: Why building your own AI voice tool is almost always the wrong move
TARGET: Agency owner thinking about hiring developers to build custom AI
HEADLINE TYPE: A cost, a timeframe, or a failure framing. Be honest — don't invent stats. Use ranges like "$50K-$300K" or "6-12 Months" or "Most Never Ship." Don't cite specific percentages unless you can verify them.

HEADLINE MAX: 3 WORDS. Renders at 200px. Short only.
SUBTEXT: One sentence about why most custom builds fail — scope creep, maintenance, or never reaching production.
CAPTION MUST OPEN WITH A STORY: "${scenario}" — build the caption around this scenario. Tell what happened, what it cost (time or money), and the lesson. NO fabricated statistics. Only use numbers you can honestly stand behind.
CAPTION STRUCTURE: Story → the real cost (be honest about ranges, not fake precision) → the alternative → value lesson, no pitch.
ITEMS: 3-4 honest comparison points. Use ranges: ["$50K-$300K+ to build", "6-12 months minimum", "Ongoing dev costs forever", "Most custom builds never ship"]
NEVER invent a precise statistic. "Most" is fine. "80.7%" is not unless you have the source.`,

    revenue_ceiling: `THIS POST: The math on agency delivery hours — the bottleneck nobody talks about
TARGET: Solo or small agency owner who's maxed on capacity
HEADLINE TYPE: A comparison or contrast about time. "Hours In. Revenue Out." or "Your Ceiling Isn't Clients. It's Your Calendar."

HEADLINE MAX: 6 WORDS. Renders at 56px.
SUBTEXT: One line about delivery hours being the bottleneck.
CAPTION MUST OPEN WITH A SCENARIO: "${scenario}" — use this as the hook. Calculate the effective hourly rate. Show the math honestly.
CAPTION STRUCTURE: Scenario → break down actual hours per service type → reveal the one service that costs 0 hours → let the reader do the math.
ITEMS: 3-4 real service comparisons with honest numbers: [{"title":"SEO Client","subtitle":"$1,500/mo — 10-15 hrs/mo delivery"}, {"title":"Ads Client","subtitle":"$2,000/mo — 15-20 hrs/mo management"}, {"title":"AI Receptionist Client","subtitle":"$200-400/mo — 0 hrs/mo delivery"}]
This is education. No pitch. No brand mention.`,

    funnel_gap: `THIS POST: The step in the lead funnel that agencies ignore
TARGET: Google Ads agency owner who drives phone calls for clients
HEADLINE TYPE: References "Step 2" or "the phone call" or "the gap." Something that names the missing piece.

HEADLINE MAX: 6 WORDS. Renders at 52px centered.
SUBTEXT: Must describe the 3-step funnel: Ad → Call → Booking.
CAPTION MUST OPEN WITH A CLIENT SCENARIO: "${scenario}" — describe what happens when the phone rings and nobody answers. Be specific to the industry.
CAPTION STRUCTURE: Client scenario → the 3 steps → identify the gap (the unanswered call) → quantify what's wasted → reframe the opportunity.
ITEMS: Exactly 3 funnel steps: [{"title":"Ad Click","subtitle":"The ad worked. Someone searched, someone clicked."}, {"title":"Phone Rings","subtitle":"This is where revenue is made or lost."}, {"title":"Booked Job","subtitle":"Call answered, appointment set, job confirmed."}]
No pitch. Pure funnel education.`,

    differentiation: `THIS POST: What this is NOT — positioning against tool fatigue
TARGET: Agency owner overwhelmed by SaaS tools
HEADLINE TYPE: Must contain "Not" — something definitive like "Not Another CRM." or "Not Another Dashboard."

HEADLINE MAX: 3 WORDS. Renders at 88px. Do not exceed 4 words.
SUBTEXT: "Purpose-Built AI Call Layer" or similar — names what it IS after saying what it's NOT.
CAPTION MUST OPEN WITH A FRUSTRATION: "${scenario}" — channel the real frustration of too many tools.
CAPTION STRUCTURE: Name the problem (tool overload) → list what this isn't → explain the one thing it does → no hard sell, just positioning clarity.
ITEMS: 3-4 "not" statements: ["Not a CRM replacement", "Not a marketing suite", "Not another tool to learn", "Not a chatbot"]`,

    speed_advantage: `THIS POST: Speed comparison — automated vs. manual client setup
TARGET: Agency owner tired of technical overhead per new client
HEADLINE TYPE: A time contrast — "60 Seconds vs. 2 Weeks" or "Automated vs. Manual" or "Client Live in Under a Minute."

HEADLINE MAX: 5 WORDS. Renders at 56px.
SUBTEXT: One punchy line about the difference.
CAPTION MUST OPEN WITH A PAIN POINT: "${scenario}" — describe the old slow process.
CAPTION STRUCTURE: The old painful way → what each step cost in time → the automated alternative → why this matters at scale (client 30 = same as client 1).
ITEMS: Comparison pairs — problems then solutions: [{"title":"A2P registration","subtitle":"Days to weeks per client"}, {"title":"Manual configuration","subtitle":"30-60 minutes per client"}, {"title":"Automated provisioning","subtitle":"Under 60 seconds"}, {"title":"Self-serve dashboard","subtitle":"Client manages themselves"}]`,

    white_label: `THIS POST: Owning the product vs. reselling it — brand perception and pricing power
TARGET: Entrepreneur who wants to look like a tech company
HEADLINE TYPE: Must reference ownership — "Your Brand" or "Stop Reselling" or "They See Your Company."

HEADLINE MAX: 5 WORDS. Renders at 72px.
SUBTEXT: One line about what clients see when they log in.
CAPTION MUST OPEN WITH A REALIZATION: "${scenario}" — the moment you understand the difference between reselling and owning.
CAPTION STRUCTURE: The perception gap → what white-label actually means → how it changes pricing power → mention VoiceAI Connect (this is an ASK post).
ITEMS: 4 ownership features: [{"title":"Your Custom Domain","subtitle":"clients.youragency.com"}, {"title":"Your Logo Everywhere","subtitle":"Dashboard, emails, client portal"}, {"title":"Your Pricing","subtitle":"Set margins like a tech company"}, {"title":"Your Relationship","subtitle":"Clients see you, not us"}]`,

    missed_call_pain: `THIS POST: Make the missed call problem visceral and real
TARGET: Home service marketer with plumber/HVAC/roofer clients
HEADLINE TYPE: Timestamps or "Missed" repeated — make it look like a call log. "7:02 PM. 7:14 PM. 7:31 PM." or "Missed. Missed. Missed."

HEADLINE MAX: 5 WORDS. Renders at 56px on emerald background.
SUBTEXT: "This happened to your clients last night." — direct and personal.
CAPTION MUST OPEN WITH A SPECIFIC SCENARIO: "${scenario}" — paint the picture. One real emergency, one real business, one real missed opportunity.
CAPTION STRUCTURE: The scenario → how many calls were missed → where those callers went (competitor) → the cost of each missed call → no pitch, just the reality.
ITEMS: Mock call log entries: ["Missed Call — 7:02 PM", "Missed Call — 7:14 PM", "Missed Call — 7:31 PM", "Voicemail (empty) — 8:45 PM"]
NEVER fabricate statistics about call answer rates. Just tell the story.`,

    project_trap: `THIS POST: The economics of project work vs. recurring revenue
TARGET: Agency owner selling websites/SEO who wants to escape feast-famine
HEADLINE TYPE: References hourly rate or the comparison — "Your Real Hourly Rate" or "Which Service Scales?" 

HEADLINE MAX: 6 WORDS. Renders at 52px.
SUBTEXT: One question about which model actually works.
CAPTION MUST OPEN WITH A REALIZATION: "${scenario}" — the moment the math doesn't add up.
CAPTION STRUCTURE: The realization → honest breakdown of hours per service → the one service that costs 0 hours → framing the shift from services to products.
ITEMS: Service comparisons with honest numbers: [{"title":"Website Project","subtitle":"$3-5K one-time — 30-50 hours — then nothing"}, {"title":"SEO Retainer","subtitle":"$1-2K/mo — 10-15 hrs/mo delivery"}, {"title":"Ads Management","subtitle":"$1.5-3K/mo — 15-25 hrs/mo"}, {"title":"AI Receptionist","subtitle":"$200-400/mo — 0 hrs delivery"}]`,

    competitor_fomo: `THIS POST: Other agencies are already offering AI — competitive urgency
TARGET: Agency owner who's been watching but hasn't acted
HEADLINE TYPE: References competitors or timing — "They Already Have One" or "While You Wait" or "The Window."

HEADLINE MAX: 5 WORDS. Renders at 68px centered.
SUBTEXT: "How long before your clients notice?" — one urgent question.
CAPTION MUST OPEN WITH AN OBSERVATION: "${scenario}" — something you saw or heard that triggered this post.
CAPTION STRUCTURE: What you observed → what the fast-moving agency did → what their clients got → what the slow agency's clients are still dealing with → ask a question. Mention VoiceAI Connect at the very end (ASK post).
ITEMS: Before/after: [{"title":"Without AI","subtitle":"Missed calls, voicemail, lost jobs"}, {"title":"Without AI","subtitle":"Clients wonder why competitors respond faster"}, {"title":"With AI","subtitle":"Every call answered, every lead captured"}, {"title":"With AI","subtitle":"Clients think you hired them a receptionist"}]`,

    audience_filter: `THIS POST: Who this is specifically built for — qualify the audience
TARGET: All ICP segments — this post is a filter
HEADLINE TYPE: Must start with "Built For" — the headline is "Built For:" and the list is in the items.

HEADLINE MAX: 2 WORDS. Just 'Built For:' — list is in items.
SUBTEXT: "If this sounds like your agency, keep reading."
CAPTION MUST OPEN WITH A FILTER: "This isn't for everyone." or "If your clients don't get phone calls, this isn't for you." — start by disqualifying.
USE THIS SCENARIO FOR COLOR: "${scenario}"
CAPTION STRUCTURE: Who it's NOT for → who it IS for (4 types) → why phone-based businesses specifically → end with "If your clients depend on the phone to make money, this is the easiest upsell you'll ever close." Mention VoiceAI Connect by name (ASK post).
ITEMS: 4 audience segments: [{"title":"Google Ads Agencies","subtitle":"You drive calls. Your clients miss half of them."}, {"title":"Home Service Marketers","subtitle":"HVAC, plumbing, roofing — call-heavy, after-hours demand."}, {"title":"Local Lead Gen Companies","subtitle":"You sell leads. Now sell what happens after the phone rings."}, {"title":"Call-Heavy Accounts","subtitle":"Any client where phone calls equal revenue."}]`,
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