/**
 * Content Farm Prompt System
 *
 * Each industry type gets a fundamentally different prompt strategy.
 * This isn't just tone swapping — the content angles, hooks, proof structures,
 * and CTA psychology are all different per business type.
 */

const CONTENT_CATEGORIES = {
  home_service: [
    'seasonal_warning',    // "Spring rain is coming — is your basement ready?"
    'problem_awareness',   // "3 signs your foundation is settling"
    'before_after',        // Transformation showcase
    'myth_bust',           // "You DON'T need to waterproof from the outside"
    'homeowner_tip',       // Actionable advice that builds trust
    'social_proof',        // Project story / customer win
    'urgency_stat',        // "67% of Atlanta homes have some foundation movement"
    'process_education',   // "Here's what happens during a crawl space encapsulation"
  ],
  saas_tech: [
    'revenue_hook',        // "Your agencies are leaving $3K/mo on the table"
    'competitor_gap',      // "What your clients get that GoHighLevel can't do"
    'case_study',          // Agency success story
    'feature_spotlight',   // Specific platform capability
    'industry_trend',      // AI/voice/automation trend that validates the product
    'objection_killer',    // "But my clients already have a receptionist..."
    'founder_insight',     // Behind-the-scenes on building the platform
    'roi_math',            // Hard numbers on what agencies earn
  ],
  saas_smb: [
    'missed_call_pain',    // "That call you missed at 5:02 PM was worth $800"
    'simplicity_hook',     // "Set up in 10 minutes. Never miss a call again."
    'industry_specific',   // Content for a specific vertical (plumber, dentist, etc.)
    'comparison',          // "Hiring vs. AI receptionist — the real cost breakdown"
    'testimonial_style',   // Written as if sharing a customer story
    'quick_tip',           // "3 things to do before you leave the office today"
    'weekend_angle',       // "Your phone rings on Saturday. Who answers?"
    'stat_shock',          // "78% of customers call the next business if you don't pick up"
  ],
  agency_dev: [
    'build_showcase',      // Recent project or capability flex
    'tech_opinion',        // Hot take on a web trend
    'speed_proof',         // "We shipped this in 2 weeks"
    'client_win',          // Results from a real engagement
    'dev_tip',             // Useful insight that shows expertise
    'why_us',              // Direct pitch on what makes you different
    'problem_reframe',     // "You don't need a redesign. You need a strategy."
    'behind_build',        // Technical decision-making stories
  ],
  consulting: [
    'growth_framework',    // Teach a mental model
    'bottleneck_diagnosis',// "Why you're stuck at $1M"
    'systems_thinking',    // Process > hustle messaging
    'leadership_insight',  // Operational wisdom
    'case_pattern',        // "Every business I've seen plateau does this one thing"
    'metric_spotlight',    // Key number business owners should track
    'contrarian_take',     // Challenge conventional small biz advice
    'action_step',         // One concrete thing to implement today
  ],
};

/**
 * Build a unique prompt for a given business.
 * The prompt structure, angles, and constraints differ by industry.
 */
export function buildPrompt(business) {
  const industry = business.industry || 'consulting';
  const categories = CONTENT_CATEGORIES[industry] || CONTENT_CATEGORIES.consulting;

  // Pick a random content category for variety
  const category = categories[Math.floor(Math.random() * categories.length)];

  const baseContext = `
BUSINESS PROFILE:
Name: ${business.name}
Industry: ${business.industry_label || business.industry}
Services: ${business.services || 'N/A'}
Target Customer (ICP): ${business.icp || 'N/A'}
Tone of Voice: ${business.tone || 'Professional and direct'}
Service Areas: ${business.service_areas || 'N/A'}
Website: ${business.website || 'N/A'}
Preferred CTAs: ${business.cta_phrases || 'N/A'}
Key Facts: ${business.fact_sheet || 'N/A'}
Certifications: ${business.certifications || 'N/A'}
Banned Words/Phrases: ${business.banned_words || 'N/A'}
`.trim();

  const industryPrompt = INDUSTRY_PROMPTS[industry] || INDUSTRY_PROMPTS.consulting;

  return `${industryPrompt}

${baseContext}

CONTENT CATEGORY FOR THIS POST: ${category}

UNIVERSAL RULES:
- NEVER use emojis anywhere in any field
- headline: punchy, max 10 words. For stat_callout template, headline MUST be a compelling number (like "97%" or "2,400+" or "$15K" or "3 in 5")
- subtext: 1-2 sentences supporting the headline, max 25 words
- caption: 2-3 short paragraphs, conversational, ends with a clear CTA. Written for social media (Instagram/LinkedIn). No hashtags in the caption itself.
- hashtags: 5 relevant hashtags (without the # symbol)
- cta: short call to action text (max 6 words) for the image overlay
- Be SPECIFIC to this exact business. Reference their actual services, areas, and industry. Never be generic.
- Content must feel like it was written by someone who works at this company, not by an AI content mill.

TEMPLATE SELECTION:
- "bold_statement" — strong opinion or declaration, no photo needed
- "photo_feature" — works best when paired with a photo, headline overlays image
- "tip_card" — educational content, clean card layout on dark background
- "stat_callout" — big number/stat as the hero, headline MUST be a number/stat
- "service_spotlight" — highlights a specific service offering

Respond with ONLY valid JSON. No markdown. No backticks. No explanation.
{"headline":"...","subtext":"...","caption":"...","hashtags":["tag1","tag2","tag3","tag4","tag5"],"content_type":"${category}","template":"bold_statement|photo_feature|tip_card|stat_callout|service_spotlight","cta":"..."}`;
}

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
};
