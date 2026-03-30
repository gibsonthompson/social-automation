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
    diy_trap: `PAIN POINT: "Don't Build Your Own AI Tool"
ANGLE: 80%+ of AI projects fail to deploy (RAND Corporation). Building costs $50K-$300K and takes 6-12 months. VoiceAI Connect is production-ready today.
HEADLINE DIRECTION: Lead with the failure stat or cost. Example: "80% of AI Projects Fail Before Launch" or "$150K Later, Still No Product"
ITEMS: Include 3-4 comparison points: build cost, timeline, failure rate, maintenance burden
Use red/negative framing for the problem. The solution is: just use the platform.`,

    revenue_ceiling: `PAIN POINT: "Your Agency Has a Revenue Ceiling — It's Your Calendar"
ANGLE: Every service agencies sell (SEO, ads, web design) costs hours to deliver. At 15-20 clients, you're maxed. AI receptionist costs 0 delivery hours. Client 30 takes the same time as client 1.
HEADLINE DIRECTION: "Your Agency Has a Ceiling" or "2hrs Per Client Setup. Now Zero." or "Same Revenue. No Delivery."
ITEMS: Comparison rows — SEO client: $1,500/mo, 12 hrs. Ads client: $2,000/mo, 20 hrs. AI receptionist client: $297/mo, 0 hrs.
Show the math. Make it undeniable.`,

    funnel_gap: `PAIN POINT: "The Funnel Step Nobody Talks About"
ANGLE: Ad Click → Phone Rings → Booked Job. Step 2 is where clients bleed money. Agencies optimize Step 1 (ads) and Step 3 (CRM), but nobody owns the phone call.
HEADLINE DIRECTION: "Step 2 Is Where Your Clients Bleed Money" or "The Funnel Nobody Talks About"
ITEMS: 3 steps — Ad Click, Phone Rings (HIGHLIGHTED as the gap), Booked Job. Step 2 must stand out visually.
This post reframes what VoiceAI Connect does — it owns the gap in the funnel.`,

    differentiation: `PAIN POINT: "Not Another CRM — Purpose-Built AI Call Layer"
ANGLE: GoHighLevel already exists. Agencies don't need another CRM/marketing suite. VoiceAI Connect does ONE thing: answers your client's phone and captures the lead. Not a dialer. Not a chatbot. Not a replacement for anything.
HEADLINE DIRECTION: "Not Another CRM." (bold, period included) with subtext "Purpose-Built AI Call Layer"
ITEMS: 3-4 "not" statements — Not a GoHighLevel replacement, Not a marketing suite, Not another tool to learn, Not a chatbot
This is a POSITIONING post. Clean, definitive, no fluff.`,

    speed_advantage: `PAIN POINT: "60 Seconds vs. 2 Weeks"
ANGLE: Competing platforms require A2P SMS registration (2-week wait), manual configuration per client, onboarding calls. VoiceAI Connect: client is live in 60 seconds, automated, no A2P, no setup calls.
HEADLINE DIRECTION: "60 Seconds vs. 2 Weeks" or "Your Client Is Live Before You Finish Reading This"
ITEMS: Comparison pairs — problem (red/X): A2P registration 2 weeks, Manual config per client, Onboarding Zoom call. Solution (green/check): Automated provisioning, 60-second onboarding, Self-serve dashboard.
Before/after comparison cards.`,

    white_label: `PAIN POINT: "Stop Reselling. Start Owning."
ANGLE: Your brand on every screen. Your domain. Your pricing. Clients log in and see your company — not ours. White-label means you charge what a tech company charges, not what a reseller charges.
HEADLINE DIRECTION: "Stop Reselling. Start Owning." or "Your Brand. Every Screen."
ITEMS: Feature list — Your domain, Your logo, Your pricing, Your client portal. Consider mock dashboard reference.
This post is about ownership and perceived value.`,

    missed_call_pain: `PAIN POINT: "The 7 PM Problem — Your Clients' Phones Are Going to Voicemail"
ANGLE: After-hours is when emergencies happen. Pipe bursts, HVAC failures, roof leaks. 3 calls come in, all go to voicemail. 85% of callers won't leave a message. AI doesn't clock out.
HEADLINE DIRECTION: "This Happened to 3 of Your Clients Last Night" or "Missed Call. Missed Call. Missed Call."
ITEMS: Mock call log entries — "Missed Call — 7:02 PM", "Missed Call — 7:14 PM", "Missed Call — 7:31 PM", "Missed Call — 8:45 PM"
Make it visceral. These are real scenarios agency clients face every day.`,

    project_trap: `PAIN POINT: "The Project-Based Trap — Run the Numbers on Your Hourly Rate"
ANGLE: Website: $3K one-time, then hunt for the next client. SEO: $1,500/mo, 12 hrs of work. Ads: $2K/mo, 20 hrs of campaigns. AI receptionist: $297/mo, 0 hours. Which service actually scales?
HEADLINE DIRECTION: "Run the Numbers on Your Actual Hourly Rate" or "The Service That Scales to Infinity"
ITEMS: 3-4 service comparison rows showing price, hours, and effective hourly rate. Highlight AI receptionist as infinity/hr.
This post makes the economics impossible to ignore.`,

    competitor_fomo: `PAIN POINT: "Your Clients' Competitors Already Have AI Receptionists"
ANGLE: While your client sends calls to voicemail at 7 PM, their competitor's AI is booking the job. How long before your clients notice? Give them the edge before their competitors do.
HEADLINE DIRECTION: "Your Client's Competitors Are Already Using This" or "Their Competitor Books Jobs at 6 AM Saturday"
ITEMS: Comparison — Without AI (missed calls, voicemail, lost revenue) vs. With AI (every call answered, every job booked). Use X/check pattern.
This is a FOMO post. Urgency through competitive pressure.`,

    audience_filter: `PAIN POINT: "Built For Specific Agency Types"
ANGLE: This isn't for everyone. It's for Google Ads agencies, home service marketers, local lead gen companies, and anyone managing call-heavy accounts. If your clients depend on phone calls to make money, this is the easiest upsell you'll ever close.
HEADLINE DIRECTION: "Built For:" with numbered list below
ITEMS: 4 audience segments with descriptions — Google Ads Agencies (You drive calls), Home Service Marketers (HVAC, plumbing, roofing — call-heavy), Local Lead Gen Companies (Now sell what happens when the phone rings), Call-Heavy Accounts (Inbound calls = revenue)
This is an AUDIENCE FILTER post. It qualifies the viewer.`,
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

NEVER: Generic SaaS marketing speak. "Scale your business." Stock photo energy. Bright colors. Buzzwords. Anything that sounds like a course launch or biz-op pitch.`,

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