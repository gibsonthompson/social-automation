/**
 * Content Farm — Prompt System for CallBird AI
 * 
 * Three stages:
 *   1. buildBatchPlan()     — Decides WHAT to create (categories + templates)
 *   2. buildResearchPrompt() — Creates the research query (Haiku + web search)
 *   3. buildGenerationPrompt() — Builds the full content generation prompt (Sonnet)
 *   4. extractContentAttributes() — Extracts structured WHY metadata from generated content
 * 
 * Multi-tenant: all functions take a business object, making them reusable
 * across CallBird, VoiceAI Connect, RSA, GTC, etc.
 */

// ═══════════════════════════════════════════════════════════════════
// SEASON + DATE HELPERS
// ═══════════════════════════════════════════════════════════════════

function getSeasonContext() {
  const now = new Date();
  const month = now.getMonth();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  
  let season;
  if (month >= 2 && month <= 4) season = 'spring';
  else if (month >= 5 && month <= 7) season = 'summer';
  else if (month >= 8 && month <= 10) season = 'fall';
  else season = 'winter';

  return {
    monthName: monthNames[month],
    dayName: dayNames[now.getDay()],
    day: now.getDate(),
    year: now.getFullYear(),
    season,
    dateString: `${monthNames[month]} ${now.getDate()}, ${now.getFullYear()}`,
  };
}


// ═══════════════════════════════════════════════════════════════════
// CONTENT CATEGORIES PER INDUSTRY
// ═══════════════════════════════════════════════════════════════════

const CONTENT_CATEGORIES = {
  saas_smb: [
    'missed_call_pain',      // Make the problem visceral
    'stat_shock',            // Big numbers that stop scrolling
    'simplicity_hook',       // "It's this easy" messaging
    'industry_specific',     // Plumber/dentist/HVAC specific scenario
    'comparison',            // $99/mo vs $3,000/mo
    'testimonial_style',     // Social proof
    'quick_tip',             // Educational value
    'weekend_angle',         // After-hours/weekend relevance
    'objection_handler',     // "But what if AI says something wrong?"
    'cost_of_inaction',      // What NOT acting costs
  ],
  // Other industries will be added as businesses are onboarded
  home_service: [
    'seasonal_awareness', 'problem_awareness', 'before_after', 'myth_bust',
    'homeowner_tip', 'social_proof', 'urgency_stat', 'process_education',
  ],
  saas_tech: [
    'diy_trap', 'revenue_ceiling', 'funnel_gap', 'differentiation',
    'speed_advantage', 'white_label', 'missed_call_pain', 'project_trap',
    'competitor_fomo', 'audience_filter',
  ],
  logistics_advisory: [
    'cost_savings', 'carrier_pain', 'insurance_insight', 'fuel_strategy',
    'lane_optimization', 'broker_vs_direct', 'fleet_scaling', 'industry_data',
  ],
};

// Categories where stats are the hero
const STAT_FRIENDLY = [
  'missed_call_pain', 'stat_shock', 'comparison', 'cost_of_inaction',
  'urgency_stat', 'industry_data', 'cost_savings',
];

// Categories that are educational/value (no brand pitch)
const VALUE_CATEGORIES = [
  'missed_call_pain', 'stat_shock', 'industry_specific', 'quick_tip',
  'weekend_angle', 'objection_handler', 'cost_of_inaction',
];

// Categories where brand mention is OK
const ASK_CATEGORIES = [
  'simplicity_hook', 'comparison', 'testimonial_style',
];


// ═══════════════════════════════════════════════════════════════════
// TEMPLATE COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════

const TEMPLATE_CATEGORY_MAP = {
  stat_callout:    ['missed_call_pain', 'stat_shock', 'comparison', 'cost_of_inaction'],
  checklist:       ['quick_tip', 'simplicity_hook', 'industry_specific', 'weekend_angle'],
  full_graphic:    ['missed_call_pain', 'comparison', 'simplicity_hook', 'cost_of_inaction', 'objection_handler'],
  process_steps:   ['simplicity_hook', 'quick_tip', 'industry_specific'],
  faq_card:        ['objection_handler', 'quick_tip', 'simplicity_hook'],
  cta_card:        ['missed_call_pain', 'comparison', 'stat_shock', 'cost_of_inaction'],
  review_showcase: ['testimonial_style'],
};

function getBestTemplate(category, availableTemplates) {
  // Find templates that are compatible with this category
  for (const [tpl, cats] of Object.entries(TEMPLATE_CATEGORY_MAP)) {
    if (cats.includes(category) && availableTemplates.includes(tpl)) {
      return tpl;
    }
  }
  // Fallback to full_graphic
  return 'full_graphic';
}


// ═══════════════════════════════════════════════════════════════════
// NODE 1: BATCH PLAN
// ═══════════════════════════════════════════════════════════════════

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a plan for N posts.
 * Returns array of { index, category, template, value_vs_ask }
 */
function buildBatchPlan(business, count = 3) {
  const industry = business.industry || 'saas_smb';
  const cats = CONTENT_CATEGORIES[industry] || CONTENT_CATEGORIES.saas_smb;
  
  // Get enabled templates for this business
  const enabledTemplates = (business.design_system?.post_types || [])
    .filter(t => t.enabled)
    .map(t => t.id);
  
  // Build category pool (shuffle for variety)
  const shuffledCats = shuffle(cats);
  const selectedCats = shuffledCats.slice(0, count);
  
  // Ensure at least 1 stat_callout if we have stat-friendly categories
  const plan = selectedCats.map((category, idx) => {
    let template = getBestTemplate(category, enabledTemplates);
    
    // Force stat_callout for first stat-friendly category if none assigned
    if (idx === 0 && STAT_FRIENDLY.includes(category) && enabledTemplates.includes('stat_callout')) {
      template = 'stat_callout';
    }
    
    // Determine value vs ask
    const isAsk = ASK_CATEGORIES.includes(category);
    
    return {
      index: idx,
      category,
      template,
      value_vs_ask: isAsk ? 'ask' : 'value',
    };
  });
  
  // Ensure template variety (no more than 2 of same template)
  const templateCounts = {};
  plan.forEach((p, i) => {
    templateCounts[p.template] = (templateCounts[p.template] || 0) + 1;
    if (templateCounts[p.template] > 2) {
      // Swap to a different template
      const alt = enabledTemplates.find(t => !templateCounts[t] || templateCounts[t] < 2);
      if (alt) {
        plan[i].template = alt;
        templateCounts[alt] = (templateCounts[alt] || 0) + 1;
      }
    }
  });
  
  return plan;
}


// ═══════════════════════════════════════════════════════════════════
// NODE 2: RESEARCH PROMPT
// ═══════════════════════════════════════════════════════════════════

function buildResearchPrompt(business) {
  const season = getSeasonContext();
  
  return `You are a social media content researcher for ${business.name} (${business.industry_label}).
Target audience: ${business.icp}
Today is ${season.dateString}. Season: ${season.season}.

Research the following using web search:
1. What are small business owners talking about on social media this week?
2. Any trending topics related to AI, business automation, or missed calls?
3. Industry-specific pain points being discussed (plumbing, HVAC, dental, legal)?
4. Seasonal business trends for ${season.monthName}
5. Any viral business content formats on Instagram right now?

Provide 3-5 specific, timely content angles. Each should include:
- A hook (the attention-grabbing opening)
- Why it's timely (what makes it relevant RIGHT NOW)
- Which audience segment it speaks to (plumber, dentist, HVAC, etc.)

Keep it concise and actionable. No generic advice.`;
}


// ═══════════════════════════════════════════════════════════════════
// NODE 3: GENERATION PROMPT
// ═══════════════════════════════════════════════════════════════════

// Industry-specific ICP scenarios that the AI rotates through
const CALLBIRD_SCENARIOS = {
  missed_call_pain: [
    'A plumber in Atlanta missed 3 calls during a crawl space job — each was worth $800+',
    'A dentist\'s front desk went to lunch and missed a new patient worth $3,200/year in cleanings',
    'An HVAC tech was on a roof at 2pm when his phone rang 4 times — all from Google Ads leads',
    'A lawyer was in court all morning — 7 intake calls went to voicemail, none called back',
    'A salon owner was coloring a client\'s hair when 2 new booking requests called and hung up',
  ],
  stat_shock: [
    'The average plumber loses $2,400/month to unanswered calls',
    'A dental practice that misses 5 calls/week loses $16,000/year in new patient revenue',
    'HVAC companies miss 34% of inbound calls during peak summer season',
    'Law firms that answer within 3 rings convert 3x more consultations than those that don\'t',
  ],
  simplicity_hook: [
    'Setting up takes less time than making coffee — literally 5 minutes',
    'No app to download, no hardware to install, no IT person needed',
    'Your AI receptionist learns your business in one conversation',
  ],
  industry_specific: [
    'Plumber: pipe burst at 7pm, homeowner panicking, your phone goes to voicemail',
    'Dentist: new patient calls 3 offices, books with the first one that answers',
    'HVAC: AC dies in July, homeowner calls 5 companies — you answered 4th',
    'Lawyer: accident victim calls from the hospital at 9pm — who picks up?',
    'Salon: bride-to-be trying to book wedding party — calls twice, no answer, books elsewhere',
    'Contractor: homeowner got 3 quotes, yours never came because you missed the call',
  ],
  comparison: [
    'Human receptionist: $3,000/mo, calls in sick, takes vacations, goes home at 5pm',
    '$99/mo for 24/7 coverage vs $36,000/year for a person who works 40 hours',
    'Voicemail: 62% hang up. AI: 98% of calls answered and summarized',
  ],
  objection_handler: [
    '"My customers want a real person" — they want their call ANSWERED. Period.',
    '"What if the AI says something wrong?" — it has guardrails. And it\'s better than no answer.',
    '"I can\'t afford another tool" — you can\'t afford to keep losing $500+ per missed call.',
    '"AI sounds robotic" — call our demo number and decide for yourself: (505) 594-5806',
  ],
  cost_of_inaction: [
    '5 missed calls/week × $500 average job = $130,000/year walking to competitors',
    'Every voicemail costs you $300-$1,000 depending on your industry',
    'Your Google Ads are working — but who answers when the lead calls at 6pm?',
  ],
};

function buildGenerationPrompt(business, planItem, researchContext, performanceContext, recentPosts, feedbackItems) {
  const season = getSeasonContext();
  const category = planItem.category;
  const template = planItem.template;
  const scenarios = CALLBIRD_SCENARIOS[category] || CALLBIRD_SCENARIOS.missed_call_pain;
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];

  // Variation seed for uniqueness
  const angles = [
    'Lead with a specific dollar amount.',
    'Start with a timestamp — make the reader picture a specific moment.',
    'Open with a question their inner voice is already asking.',
    'Use a short, punchy first line. Under 6 words.',
    'Start with a number that surprises.',
    'Open with what most business owners get wrong about this.',
    'Lead with the competitor angle — someone else answered.',
    'Start with a single industry (plumber, dentist, etc.) and make it hyper-specific.',
  ];
  const tones = [
    'Keep this one tight. Every word earns its place.',
    'Be conversational — like texting a friend who owns a business.',
    'Authoritative. Confident. Data-backed.',
    'Write with urgency. Money is being lost right now.',
    'Educational. Teach something useful even if they never buy.',
    'Empathetic. Acknowledge the struggle before offering the solution.',
  ];
  const angle = angles[Math.floor(Math.random() * angles.length)];
  const tone = tones[Math.floor(Math.random() * tones.length)];

  // Template-specific JSON schema
  const templateSchemas = {
    stat_callout: '"eyebrow":"optional label","items":["context pill 1","context pill 2"]',
    checklist: '"items":["check item 1","check item 2","check item 3","check item 4"],"badge_label":"optional"',
    full_graphic: '"items":["feature 1","feature 2","feature 3"],"badge_label":"optional"',
    process_steps: '"eyebrow":"How It Works","items":[{"title":"Step Name","subtitle":"Description"}]',
    faq_card: '"eyebrow":"FAQ"',
    cta_card: '"items":["benefit 1","benefit 2","benefit 3"]',
    review_showcase: '"reviews":[{"text":"review text","author":"Name, City"}]',
  };
  const schemaFields = templateSchemas[template] || '';

  const sections = [];

  // System prompt
  sections.push(`You are creating a single Instagram post for ${business.name} — an AI phone receptionist for small businesses.

BUSINESS CONTEXT:
${business.name} | ${business.industry_label} | ${business.website}
Services: ${business.services}
ICP: ${business.icp}
Tone: ${business.tone}
Key Facts: ${business.fact_sheet}
StoryBrand: Customer is the hero (busy business owner). ${business.name} is the guide.

TODAY: ${season.dateString} (${season.season})
CONTENT CATEGORY: ${category}
TEMPLATE: ${template}
POST TYPE: ${planItem.value_vs_ask === 'ask' ? 'ASK — brand mention OK, include CTA' : 'VALUE — pure education, no brand pitch. The reader should learn something even if they never visit the site.'}

SCENARIO TO BUILD FROM:
${scenario}

WRITING APPROACH: ${angle}
TONE: ${tone}`);

  // Research context
  if (researchContext) {
    sections.push(`CURRENT TRENDS (from today's research — use if relevant):
${researchContext}`);
  }

  // Performance intelligence
  if (performanceContext) {
    sections.push(`PERFORMANCE INTELLIGENCE (what's working based on data):
${performanceContext}`);
  }

  // Deduplication
  if (recentPosts && recentPosts.length > 0) {
    sections.push(`RECENT POSTS (do NOT repeat these topics or hooks):
${recentPosts.map(p => `- "${p.hook_text || p.headline}" (${p.template_name})`).join('\n')}
Generate something DIFFERENT. New angle, new hook, new industry if possible.`);
  }

  // Feedback
  if (feedbackItems && feedbackItems.length > 0) {
    const good = feedbackItems.filter(f => f.rating === 'good');
    const bad = feedbackItems.filter(f => f.rating === 'bad');
    let fb = 'PAST FEEDBACK:';
    if (good.length) {
      fb += '\nApproved (more like these):';
      good.slice(0, 5).forEach(f => { fb += `\n- "${f.headline}" [${f.content_type}]${f.reason ? ` — "${f.reason}"` : ''}`; });
    }
    if (bad.length) {
      fb += '\nRejected (NEVER do these):';
      bad.slice(0, 5).forEach(f => { fb += `\n- "${f.headline}" [${f.content_type}]${f.reason ? ` — "${f.reason}"` : ''}`; });
    }
    sections.push(fb);
  }

  // Content rules
  sections.push(`CONTENT RULES:
- NEVER use emojis
- NEVER fabricate statistics — use honest ranges ("most", "$500-$1,000") instead of fake precision
- headline: ${template === 'stat_callout' ? 'MUST be a number/stat (e.g., "62%", "$3,500", "24/7"). Max 3 words.' : 'Punchy, max 10 words. Must be SPECIFIC (industry, stat, pain point, or scenario).'}
- subtext: 1-2 sentences, max 25 words
- caption: 2-3 short paragraphs. Conversational. Ends with soft CTA or question. No hashtags in body. Must sound like a real founder wrote it — not a marketing department.
- hashtags: exactly 5. Mix of broad (#SmallBusiness, #AIReceptionist) and niche (#PlumberLife, #DentalPractice)
- highlight_words: 1-3 key words from headline to accent-color
- cta_line1 / cta_line2: Pick from these CTA variations (split on "|"):
  ${(business.design_system?.cta_bar?.cta_variations || []).join('\n  ')}

HEADLINE QUALITY:
GOOD: "It's 9PM. A $3,000 Job Just Called." | "62% Won't Leave A Voicemail" | "Your Receptionist Costs $3,000/mo"
BAD (REJECTED): "Never Miss A Call" | "Quality AI Service" | "Transform Your Business" | "The Future Of Answering"
Good = SPECIFIC (stat, dollar amount, scenario, industry). Bad = GENERIC (could be any company).

TEMPLATE FIELDS FOR "${template}":
${schemaFields}
${template === 'review_showcase' ? '\nIMPORTANT: Since CallBird is newer, generate plausible but clearly example reviews from small business owners. Make them sound real and specific to an industry (plumber, dentist, etc.).' : ''}

Respond with ONLY valid JSON. No markdown. No backticks. No explanation.
{"headline":"...","subtext":"...","caption":"...","hashtags":["tag1","tag2","tag3","tag4","tag5"],"content_type":"${category}","template":"${template}","highlight_words":["word1"],"cta_line1":"...","cta_line2":"...",${schemaFields}}`);

  return sections.join('\n\n');
}


// ═══════════════════════════════════════════════════════════════════
// NODE 3B: CONTENT ATTRIBUTE EXTRACTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Extract structured content_attributes from generated content.
 * This runs deterministically (no AI call needed) based on the
 * content JSON and plan metadata.
 */
function extractContentAttributes(content, planItem, season) {
  const headline = (content.headline || '').toLowerCase();
  const caption = (content.caption || '').toLowerCase();
  
  // Hook type detection
  let hookType = 'pain_point';
  if (/^\d|^\$|%/.test(content.headline || '')) hookType = 'stat';
  else if (caption.startsWith('what if') || caption.includes('?')) hookType = 'question';
  else if (caption.length > 300 && (caption.includes('was') || caption.includes('called'))) hookType = 'story';
  else if (headline.includes('vs') || headline.includes('compare')) hookType = 'contrarian';
  else if (headline.includes('missed') || headline.includes('lost')) hookType = 'fear';

  // Content angle
  let contentAngle = 'educational';
  if (planItem.category === 'missed_call_pain' || planItem.category === 'cost_of_inaction') contentAngle = 'cost_of_inaction';
  else if (planItem.category === 'comparison') contentAngle = 'before_after';
  else if (planItem.category === 'testimonial_style') contentAngle = 'social_proof';
  else if (planItem.category === 'simplicity_hook') contentAngle = 'how_it_works';
  else if (planItem.category === 'objection_handler') contentAngle = 'objection_handling';
  else if (planItem.category === 'industry_specific') contentAngle = 'industry_specific';

  // Statistic detection
  const hasStatistic = /\d/.test(content.headline || '');
  let statisticType = null;
  if (hasStatistic) {
    if (headline.includes('$')) statisticType = 'dollar_amount';
    else if (headline.includes('%')) statisticType = 'percentage';
    else if (headline.includes(':') || headline.includes('am') || headline.includes('pm')) statisticType = 'time';
    else statisticType = 'count';
  }

  // Emotional trigger
  let emotionalTrigger = 'curiosity';
  if (headline.includes('miss') || headline.includes('lost') || headline.includes('gone')) emotionalTrigger = 'fear_of_loss';
  else if (headline.includes('save') || headline.includes('free')) emotionalTrigger = 'relief';
  else if (headline.includes('$') && !headline.includes('save')) emotionalTrigger = 'urgency';
  else if (planItem.category === 'simplicity_hook') emotionalTrigger = 'aspiration';

  // Storytelling level
  let storytellingLevel = 'none';
  if (caption.length > 400) storytellingLevel = 'narrative';
  else if (caption.length > 200) storytellingLevel = 'light';

  // Caption analysis
  const captionLength = (content.caption || '').length < 120 ? 'short' : (content.caption || '').length < 300 ? 'medium' : 'long';
  const captionHasQuestion = (content.caption || '').includes('?');

  // Industry target detection
  let industryTarget = 'general';
  const text = `${headline} ${caption}`;
  if (text.includes('plumb')) industryTarget = 'plumber';
  else if (text.includes('hvac') || text.includes('air condition')) industryTarget = 'hvac';
  else if (text.includes('dent')) industryTarget = 'dentist';
  else if (text.includes('law') || text.includes('attorney')) industryTarget = 'lawyer';
  else if (text.includes('salon') || text.includes('hair')) industryTarget = 'salon';
  else if (text.includes('contractor') || text.includes('roof')) industryTarget = 'contractor';

  // Text density
  const itemCount = (content.items || []).length + (content.reviews || []).length + (content.stats || []).length;
  const textDensity = itemCount > 5 ? 'heavy' : itemCount > 2 ? 'moderate' : 'minimal';

  return {
    hook_type: hookType,
    content_angle: contentAngle,
    storytelling_level: storytellingLevel,
    has_statistic: hasStatistic,
    statistic_type: statisticType,
    has_social_proof: planItem.category === 'testimonial_style',
    emotional_trigger: emotionalTrigger,
    cta_type: content.cta_line2?.toLowerCase().includes('trial') ? 'free_trial' 
            : content.cta_line2?.toLowerCase().includes('demo') ? 'demo_call'
            : content.cta_line2?.toLowerCase().includes('call') ? 'demo_call'
            : 'learn_more',
    value_vs_ask: planItem.value_vs_ask,
    topic_category: planItem.category,
    industry_target: industryTarget,
    template_type: planItem.template,
    content_format: 'static_image', // Will be overridden for reels
    has_photo: false,
    text_density: textDensity,
    caption_length: captionLength,
    caption_has_question: captionHasQuestion,
    caption_structure: captionHasQuestion ? 'hook_body_cta' : storytellingLevel === 'narrative' ? 'story' : 'hook_body_cta',
    hashtag_count: (content.hashtags || []).length,
    animation_style: 'none', // Will be overridden for reels
    dominant_color_mood: 'blue_professional',
    posted_day_of_week: season.dayName.toLowerCase(),
    is_trending_topic: false, // Set by researcher if applicable
    is_seasonal: false,
  };
}


// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

export {
  getSeasonContext,
  buildBatchPlan,
  buildResearchPrompt,
  buildGenerationPrompt,
  extractContentAttributes,
  CONTENT_CATEGORIES,
  CALLBIRD_SCENARIOS,
};