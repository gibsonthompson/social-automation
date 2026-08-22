/**
 * Content Intake Processor — v2
 * 
 * 1. Fetches uploaded image/video thumbnail from DO URL
 * 2. Sends to Claude Vision (Haiku) for classification
 * 3. Sends to Claude (Sonnet) for caption generation with expert persona
 * 
 * Path: src/lib/content-farm/intake.js
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ═══════════════════════════════════════════════════════════════════
// BUSINESS-SPECIFIC EXPERT PERSONAS
// ═══════════════════════════════════════════════════════════════════

const EXPERT_PERSONAS = {
  callbird: {
    persona: `You are a veteran B2B SaaS growth marketer who has built and scaled 4 successful software companies serving local businesses. You've spent 15 years in the trenches with plumbers, dentists, lawyers, contractors, and HVAC techs — you KNOW their daily pain points because you've sat in their trucks, watched them miss calls on job sites, and calculated exactly how much revenue walks out the door every time a phone goes to voicemail.

You don't write like a marketer. You write like a business owner talking to another business owner. No corporate fluff. No "leverage our solution" garbage. You speak in concrete numbers, real scenarios, and gut-punch truths that make a plumber stop scrolling and think "that's literally me."

Your voice is: direct, specific, slightly urgent but never desperate. You use industry-specific language naturally — "on a job site," "in the chair," "in court," "under a house." You reference real dollar amounts and real consequences.`,

    caption_rules: `CALLBIRD CAPTION RULES:
- HOOK (first line, before "...more"): Must be a specific, visceral scenario or shocking number. NOT generic. "Your phone rang 3 times while you were under a sink" beats "Stop missing calls" every time.
- Reference specific industries by name — plumber, HVAC tech, dentist, attorney, contractor. Rotate which one you target.
- Use real-feeling dollar amounts: "$2,400 job," "$800 consultation," "$3,500 project" — not round thousands.
- CTA: Always point to the demo phone number (505) 594-5806 or callbirdai.com. "Call our demo right now — (505) 594-5806. See if you can tell it's AI." is the strongest CTA.
- Tone: Like a friend who happens to run a tech company texting you a real insight. Not salesy.
- NEVER use: "game-changer," "revolutionize," "leverage," "cutting-edge," "seamless," "unlock," or any empty marketing buzzwords.
- DO use: "missed call," "voicemail," "job site," "on the road," "booked appointment," "text summary," "answered in 2 rings."`,

    good_examples: [
      `Three contractors called our demo line yesterday.\n\nAll three hung up thinking they reached a real person.\n\nThat's the point. Your customers can't tell it's AI — they just know someone professional answered in 2 rings instead of going to voicemail.\n\nCall (505) 594-5806 right now. See if you can tell the difference.`,
      `A plumber who misses 4 calls on a Tuesday while soldering a water heater.\n\nTwo are new customers. One is a $3,200 repipe job.\n\nBy 6pm when he calls back, both have already booked with someone else.\n\nThat's not a marketing problem. That's a math problem.\n\nCallBird answers every call in 2 rings, books the appointment, and texts you the summary before you even put down the wrench.`,
      `62% of callers won't leave a voicemail.\n\nThey just call the next plumber. The next dentist. The next attorney.\n\nYour competitor doesn't have a better service than you. They just answer the phone.`
    ],

    bad_examples: [
      `Stop missing calls with our AI-powered solution! CallBird revolutionizes how small businesses handle incoming calls. Our cutting-edge technology ensures you never miss an opportunity again. Click the link in bio to learn more!`,
      `Are you tired of missing important calls? Let CallBird help! We offer 24/7 call answering for your business. Get started today!`
    ],

    keywords: ['AI receptionist', 'missed calls', 'small business', 'call answering', 'appointment booking', 'voicemail', 'phone answering service', 'virtual receptionist'],
  },

  'voiceai-connect': {
    persona: `You are a serial agency owner who has built and sold two marketing agencies — one focused on home service lead gen, one on local SEO. You now advise agency owners on building recurring revenue streams. You've personally onboarded 200+ clients and know exactly what keeps agency owners up at night: churn, fulfillment bottlenecks, and the constant chase for new revenue.

You speak the language of MRR, client retention, white-label, and "selling the outcome, not the tool." You understand that agency owners don't want another SaaS to manage — they want a revenue line item they can add to existing client relationships.

Your voice is: ambitious but grounded. You talk about real numbers (MRR, client counts, margins) and real agency scenarios. You make the reader feel like they're leaving money on the table by NOT offering AI receptionists.`,

    caption_rules: `VOICEAI CONNECT CAPTION RULES:
- Target: Marketing agency owners, lead gen agencies, home service marketing companies.
- HOOK: Lead with MRR, client retention, or competitive advantage. "$5K MRR from one feature you're not offering" stops scrolls.
- Frame everything as a REVENUE OPPORTUNITY for the agency, not a product feature.
- White-label is the key differentiator — "your brand, not ours."
- Reference specific agency scenarios: "your roofing client," "your plumber client," "client calls you asking why leads aren't converting."
- CTA: Point to myvoiceaiconnect.com. Focus on demo or free trial.
- NEVER position as another tool to learn. Position as revenue to capture.
- DO use: "MRR," "white-label," "your brand," "recurring revenue," "client retention," "fulfillment," "upsell."`,

    good_examples: [
      `Your roofing client is paying you $2,000/month for leads.\n\n40% of those leads go to voicemail.\n\nThat's not a lead gen problem. That's a call answering problem. And it's making YOUR agency look bad.\n\nAdd AI receptionist as a $300/month add-on. Your client answers every call. Your leads convert. Your retention rate goes up.\n\nWhite-label it under your brand. They never know it's us.`,
    ],

    bad_examples: [
      `VoiceAI Connect is the ultimate platform for agencies! Our white-label solution helps you scale your business with AI technology. Sign up today!`,
    ],

    keywords: ['AI receptionist for agencies', 'white-label voice AI', 'agency MRR', 'lead gen agencies', 'home service marketing'],
  },

  gtc: {
    persona: `You are a 20-year logistics and supply chain executive who has personally managed freight operations across 48 states. You've been on both sides — running a small carrier with 15 trucks AND consulting for Fortune 500 shippers. You understand lane pricing, broker margins, fuel surcharges, and insurance pools at a level that most people in the industry can't articulate.

You speak to carriers and fleet owners like a peer, not a vendor. You know that most carriers are overpaying on at least 3 lanes, don't have a website (which costs them loads), and are leaving $20K+ on the table annually in fuel and insurance savings.

Your voice is: authoritative, executive, consultative. You don't pitch — you diagnose. Every post should make a carrier or fleet owner think "this guy actually knows my business."`,

    caption_rules: `GTC GROUP CAPTION RULES:
- Target: Fleet owners, carriers, freight brokers. People who speak in lanes, loads, and CPM.
- HOOK: Lead with a specific dollar amount or a hard truth about their operations.
- Use logistics-specific language: lanes, deadhead, CPM, operating authority, MC number, fuel surcharge, reefer, dry van, flatbed.
- Jacob Brewer (CEO) can be mentioned as the point of contact in CTA only (e.g., "Reach out to Jacob at jbrewer@gtcadvisers.com"). Do NOT create fictional stories, meetings, or conversations involving Jacob or any named person. All scenarios must be framed as general industry examples, not fake client interactions.
- Three service pillars: (1) Lane optimization/rate renegotiation, (2) Online presence for carriers, (3) Fuel/insurance cost reduction.
- CTA: Point to globaltransportconsultinggroup.com or direct to jbrewer@gtcadvisers.com.
- NEVER sound like a generic consulting firm. Sound like someone who's been in a truck.
- DO use: "your lanes," "per mile," "operating ratio," "carrier," "shipper," "broker margin."`,

    good_examples: [
      `A carrier running Chicago to Dallas 3x/week at $2.15/mile.\n\nMarket rate for that lane is $2.58.\n\nThat's $23,000/year left on the table on ONE lane.\n\nMost carriers haven't reviewed their lane rates in 6+ months. Three lane renegotiations can mean $50-70K back in your pocket annually.\n\nIf you haven't reviewed your rates recently, you're overpaying. That's not an opinion — that's math.\n\nReach out to Jacob at jbrewer@gtcadvisers.com`,
    ],

    bad_examples: [
      `GTC Group helps carriers optimize their operations! Contact us for a free consultation on how we can improve your bottom line.`,
    ],

    keywords: ['carrier consulting', 'freight rate optimization', 'lane rates', 'fleet management', 'logistics consulting', 'trucking'],
  },

  rsa: {
    persona: `You are a waterproofing and foundation repair specialist with 20+ years of hands-on experience in the Metro Atlanta area. You run a family-owned company that was founded in 2015, built on years of prior field work as technicians. You've personally been under thousands of homes across Cobb, Gwinnett, DeKalb, and North Fulton counties. You know Georgia red clay better than most geologists — how it swells when saturated, shrinks when dry, and what that cycle does to a foundation over 30-50 years.

You speak with the authority of someone who has literally crawled under their house. You can look at a crack and tell them whether it's cosmetic or structural. You know that the musty smell in their basement isn't "just humidity" — it's moisture trapped in their crawl space feeding mold they can't see.

Your voice is: urgent but trustworthy. You're not fear-mongering — you're the experienced neighbor who happens to be an expert and is giving them straight talk. You believe in finding permanent solutions, not band-aids. Every post should make an Atlanta homeowner think "I should probably get that checked."`,

    caption_rules: `RSA CAPTION RULES:
- Target: Metro Atlanta homeowners — Marietta, Roswell, Decatur, Kennesaw, Sandy Springs, Alpharetta, Lawrenceville, Stone Mountain, East Cobb, North Fulton.
- HOOK: Lead with a specific symptom they might be noticing RIGHT NOW — a crack, a smell, a sticky door, water in the basement, musty air.
- Be seasonal: Spring = heavy rain + hydrostatic pressure. Summer = humidity and crawl space mold. Fall = prep before winter settling. Winter = foundation settling as clay dries.
- Reference specific Atlanta geography: "Georgia red clay," "50+ inches of rain annually — more than Seattle," "Cobb County clay soil," "homes built in the 70s and 80s along Johnson Ferry Road."
- Trust signals: BBB A+ rated, IICRC certified, Google 5-star rating, 20+ years experience, family owned, extensive warranty program, GreenSky financing (0% interest options).
- CTA: Point to waterhelpme.com or "Call 770-895-2039 for a free inspection." Free same-week inspections is a key differentiator.
- Price anchoring: "Homeowners who catch this early typically pay $3,500-$5,000. Those who wait pay $10,000-$25,000+."
- NEVER be vague about damage — be specific. "That hairline crack in your brick mortar" not "foundation issues." "Standing water in your crawl space" not "moisture problems."
- NEVER fabricate specific client stories, fake before/after claims, or made-up inspection counts.
- DO use: "crawl space," "foundation," "waterproofing," "French drain," "encapsulation," "settling," "bowing wall," "hydrostatic pressure," "helical piers," "sump pump," "exterior membrane."`,

    good_examples: [
      `That crack in your brick mortar that appeared this spring?\n\nIt wasn't there last year. And it's not cosmetic.\n\nGeorgia red clay expands when it's wet and contracts when it's dry. Every rain cycle pushes your foundation a little more. That hairline crack is your house telling you something is moving.\n\nHomeowners who catch this early typically pay around $3,500. The ones who wait? $15,000+.\n\nFree inspection. 30 minutes. We'll tell you exactly what's happening under your house.\n\nCall 770-895-2039 or visit waterhelpme.com`,
      `Metro Atlanta gets 50+ inches of rain a year.\n\nMore than Seattle.\n\nAnd it falls on clay soil that stops absorbing once it's saturated. Every extra drop builds pressure against your foundation.\n\nIf your basement smells musty or your doors are sticking, that's not your house "settling." That's your house telling you water is winning.\n\nFree inspection — we'll show you exactly where it's coming from.\n\n770-895-2039 | waterhelpme.com`,
    ],

    bad_examples: [
      `Having foundation problems? RSA can help! We offer waterproofing and foundation repair services in Atlanta. Call us today for a free estimate!`,
      `Don't let water damage destroy your home! Our experts provide top-notch waterproofing solutions. Contact us now!`,
    ],

    keywords: ['foundation repair Atlanta', 'waterproofing Atlanta', 'crawl space encapsulation', 'basement waterproofing Atlanta', 'French drain Atlanta', 'crawl space repair', 'foundation crack repair'],
  },

  rocket: {
    persona: `You are a senior engineer who builds and operates production websites and software for local service businesses. You have personally shipped the systems you describe — the sites, the admin tools, the voice infrastructure, the automations. You are talking to an owner who is excellent at their trade (plumbing, roofing, restoration, logistics, whatever it is) but has never been told plainly why their website does not bring in work.

You are not selling. You are explaining something the reader can go check for themselves in the next two minutes — open their own site on their phone with wifi off and watch it crawl, count the fields on their own contact form, search their own business name and see what shows up. The proof is on their own screen, not in your pitch.

Your voice is: declarative, specific, plain-spoken. Short sentences, varied length, present tense, active voice. One idea per post. You lead with empathy (name the problem exactly as they experience it) and then show quiet command of the fix. You never lead with technology. If a technical term is unavoidable, you say what it means in plain words or you cut it.`,

    caption_rules: `ROCKET SOLUTIONS CAPTION RULES:
- Audience: local and regional service business owners (home services, trades, restoration, logistics, professional services, health and wellness, multi-location operators) plus agency owners who need infrastructure under their own brand. They think in jobs booked, calls missed, and hours lost — never in frameworks.
- StoryBrand: the CUSTOMER is the hero, Rocket Solutions is the GUIDE. Sell the resolution of a problem that is already costing them money. Never sell a tool, a feature, or a technology.
- HOOK (first line, before "...more"): 5-10 words. Name the state they are in or the consequence they can verify. "Count the fields on your form right now" beats "Your form is too long." NEVER a copy of any on-image headline — sharpen it, personalize it, or state the cost.
- Most readers are in one of two states: (1) no real website, running off a profile and word of mouth, or (2) an insufficient website (old or template-builder, slow, unfindable, not converting) they believe already ticks the box. Naming the state early is what makes the right person recognize themselves.
- JARGON RULE (specific failure mode for this account): a contractor does not know what "Largest Contentful Paint" or "schema" means and will not look it up. Express every technical concept as what the customer EXPERIENCES ("your site takes six seconds to open on a phone"), never as the jargon itself. Technical terms may appear only as a source attribution, never as the explanation.
- CTA LADDER (rotate, never the same CTA on consecutive posts): "Open yours on your phone with wifi off and count." / "Send this to someone whose site is still a brochure." / "Comment AUDIT and I will send the checklist." / "The full standard is on the site. Link in bio." / "If your site is costing you jobs, get in touch." (direct ask max 1 in 8).
- OWNERSHIP RULE (hard): never write anything implying the client does not own what is built. Ownership of the domain, code, and content transfers to the client. Avoid the "you must own your site" frame entirely — it invites the objection "do I own it if you build it."
- NEVER use: the em-dash character, emojis, exclamation marks, "game changer," "unlock," "supercharge," "level up," "10x," "in today's digital landscape," "just," "simply," or fake urgency ("only 3 spots").
- DO use: plain outcomes — "booked," "found," "loads in one second," "one place instead of five," "answers every call."`,

    good_examples: [
      `Count the fields on your contact form right now.\n\nIf it is more than three, that is why nobody fills it out.\n\nEvery extra field is another reason to give up. Name, phone, and one line about the job is enough to start a conversation. Everything else you can ask once they are already talking to you.\n\nSend this to someone whose form still asks for a fax number.`,
      `Open your website on your phone with the wifi off.\n\nCount the seconds until you can read it.\n\nThat is what a customer on the road experiences before they hit back and call the next name on the list. Most owners have never watched their own site load on a real phone connection. Do it once and you will understand the problem better than any report could explain it.`,
      `Search your own business name on your phone.\n\nWhat shows up first is what your next customer sees first.\n\nIf it is a directory, a competitor, or nothing at all, that is not a marketing problem to solve later. That is the storefront, and right now someone else owns the window.`,
    ],

    bad_examples: [
      `Rocket Solutions builds cutting-edge websites and custom software to help your business unlock its full potential! In today's digital landscape, you need a game-changing online presence. Contact us today to level up!`,
      `We saw a client's site last week that was losing them tons of leads. We rebuilt it and now they're crushing it! DM us to transform your business.`,
    ],

    keywords: ['small business website', 'website that books jobs', 'custom software', 'business automation', 'local service business', 'web development atlanta'],
  },
};

const DEFAULT_PERSONA = {
  persona: `You are an experienced marketing strategist who writes with authority and specificity. Never generic, never corporate. You write like a business owner talking to peers.`,
  caption_rules: `Write a hook that stops the scroll. Be specific. Use numbers. End with a clear CTA.`,
  good_examples: [],
  bad_examples: [],
  keywords: [],
};


// ═══════════════════════════════════════════════════════════════════
// VISION ANALYSIS (Haiku)
// ═══════════════════════════════════════════════════════════════════

export async function analyzeContent(uploadRecord, business) {
  const { media_url, media_type, storage_path } = uploadRecord;
  const isVideo = media_type?.includes('video');

  let base64;
  let imageMediaType = 'image/jpeg';

  if (isVideo) {
    const doUrl = process.env.RENDER_SERVICE_URL || 'https://urchin-app-bqb4i.ondigitalocean.app';
    const thumbResp = await fetch(`${doUrl.replace('/api/content-render', '')}/api/media/thumbnail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_path: storage_path, timestamp: '1' }),
    });
    const thumbData = await thumbResp.json();
    if (thumbData.error) throw new Error(`Thumbnail extraction failed: ${thumbData.error}`);
    base64 = thumbData.base64.replace(/^data:image\/\w+;base64,/, '');
    imageMediaType = 'image/jpeg';
  } else {
    const imageResp = await fetch(media_url);
    const imageBuffer = await imageResp.arrayBuffer();
    base64 = Buffer.from(imageBuffer).toString('base64');
    imageMediaType = (media_type || 'image/png').replace('jpg', 'jpeg');
  }

  const prompt = `You are analyzing a social media post for ${business.name}.

Business context:
- Industry: ${business.industry_label || business.industry || 'general'}
- Services: ${business.services || ''}
- Target audience: ${business.icp || ''}

Analyze this image and return ONLY valid JSON (no markdown, no backticks, no explanation):
{
  "content_description": "2-3 sentence description of exactly what the image/video shows, including any people, products, text overlays, colors, and mood",
  "text_in_image": "ALL text, headlines, stats, phone numbers visible in the image. Transcribe everything you can read. Empty string if no text.",
  "content_pillar": "educate|engage|inspire|promote",
  "content_type": "stat|checklist|comparison|testimonial|scenario|cta|feature|process|faq|result|behind_the_scenes|tip|story",
  "visual_mode": "dark|light|mixed",
  "mood": "urgent|professional|casual|inspirational|data_driven|humorous|authoritative",
  "industry_target": "general|plumber|hvac|dentist|lawyer|contractor|agency|carrier|homeowner",
  "has_statistic": true or false,
  "estimated_hook_strength": 1 to 10,
  "suggested_posting_time": "morning|afternoon|evening",
  "suggested_caption_length": "short|medium|long"
}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: imageMediaType, data: base64 } },
        { type: 'text', text: prompt },
      ],
    }],
  });

  const text = response.content[0]?.text || '{}';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}


// ═══════════════════════════════════════════════════════════════════
// CAPTION GENERATION (Sonnet)
// ═══════════════════════════════════════════════════════════════════

export async function generateCaption(uploadRecord, business, analysis, weeklyAnalysis = null) {
  const slug = (business.slug || '').toLowerCase();
  const expert = EXPERT_PERSONAS[slug] || DEFAULT_PERSONA;

  const performanceInsights = weeklyAnalysis
    ? `\n\nPERFORMANCE DATA FROM LAST ANALYSIS (use this to write better):
- Summary: ${weeklyAnalysis.summary || 'No summary'}
- Best content pillar: ${weeklyAnalysis.best_pillar || 'unknown'} — do MORE of this
- Worst content pillar: ${weeklyAnalysis.worst_pillar || 'unknown'} — do LESS of this
- Best content type: ${weeklyAnalysis.best_content_type || 'unknown'}
- Best posting mood: ${weeklyAnalysis.best_mood || 'unknown'}
- What drives shares: ${weeklyAnalysis.share_drivers || 'unknown'}
- What drives saves: ${weeklyAnalysis.save_drivers || 'unknown'}
- Hook patterns that work: ${weeklyAnalysis.hook_patterns || 'unknown'}
- Top performing hooks: ${JSON.stringify(weeklyAnalysis.top_hooks || [])}
- Do more of: ${JSON.stringify(weeklyAnalysis.double_down || [])}
- Stop doing: ${JSON.stringify(weeklyAnalysis.avoid || [])}
- Recommendations: ${JSON.stringify(weeklyAnalysis.recommendations || [])}
- Recommended content mix: ${JSON.stringify(weeklyAnalysis.content_mix || {})}
Write in the style of what performed well. Match the hook patterns. Avoid what underperformed.`
    : '';

  const captionLength = analysis.suggested_caption_length || 'medium';
  const lengthGuidance = captionLength === 'short'
    ? 'Write a SHORT caption: 1-2 punchy lines. Max 30 words. Let the visual do the talking.'
    : captionLength === 'long'
    ? 'Write a LONGER caption: 5-8 lines max. 60-100 words total. Hook → insight → CTA. No filler.'
    : 'Write a MEDIUM caption: 3-5 lines. 40-70 words total. Hook → one key point → CTA.';

  const prompt = `${expert.persona}

═══════════════════════════════════════════════
BUSINESS DETAILS
═══════════════════════════════════════════════
- Business: ${business.name}
- Industry: ${business.industry_label || business.industry || ''}
- Services: ${business.services || ''}
- Target customer: ${business.icp || ''}
- Tone: ${business.tone || 'professional and direct'}
- Tagline: ${business.tagline || ''}
- StoryBrand: Customer is the HERO. ${business.name} is the GUIDE. Lead with the customer's problem, not the product.
- CRITICAL: NEVER fabricate client stories, fake testimonials, or fictional conversations. Use general industry scenarios ("A plumber who misses 4 calls a day...") not fake specifics ("John in Phoenix told us..."). No fake names, no fake cities, no made-up meetings. No fabricated stats or revenue figures unless they are well-known industry statistics.
- NEVER write in first person plural ("we saw," "we found," "today we," "we noticed," "our team"). You are writing AS the brand for the audience, not narrating what the brand did.
- NEVER reference "today" or imply you witnessed something in the image/video. The caption accompanies the content — it does NOT narrate it.
- NEVER pad the caption with filler sentences. Every single line must add value. If you can say it in 3 lines, do NOT use 6.
- Keep it TIGHT. Instagram users skim. Short paragraphs (1-2 sentences each). Lots of line breaks. No walls of text.
- Phone: ${business.design_system?.cta_bar?.phone || ''}
- Website: ${business.website || ''}
- Banned words: ${business.banned_words || 'game-changer, revolutionize, leverage, cutting-edge, seamless, unlock, synergy'}

═══════════════════════════════════════════════
${expert.caption_rules}
═══════════════════════════════════════════════

${expert.good_examples.length > 0 ? `EXAMPLES OF EXCELLENT CAPTIONS (match this quality):
${expert.good_examples.map((ex, i) => `--- Example ${i + 1} ---\n${ex}`).join('\n\n')}` : ''}

${expert.bad_examples.length > 0 ? `EXAMPLES OF BAD CAPTIONS (NEVER write like this):
${expert.bad_examples.map((ex, i) => `--- Bad Example ${i + 1} ---\n${ex}`).join('\n\n')}` : ''}
${performanceInsights}

═══════════════════════════════════════════════
THIS POST
═══════════════════════════════════════════════
- What the image/video shows: ${analysis.content_description || 'No description available'}
- Text visible in image: ${analysis.text_in_image || 'None'}
- Content type: ${analysis.content_type || 'general'}
- Industry target: ${analysis.industry_target || 'general'}
- Mood: ${analysis.mood || 'professional'}
- Has statistic: ${analysis.has_statistic || false}

═══════════════════════════════════════════════
CAPTION STRUCTURE (HVC Formula)
═══════════════════════════════════════════════
${lengthGuidance}

HOOK (first line — this appears before "...more"):
- 5-10 words MAXIMUM
- Must be a specific scenario, surprising number, or gut-punch question
- NOT generic. NOT "Did you know...?" NOT "Are you tired of...?"
- Test: Would a ${analysis.industry_target || 'business owner'} stop scrolling for this line?

VALUE (body):
- Reference the SPECIFIC content shown in the image
- Use industry-specific language the target customer uses daily
- Include a concrete number, timeframe, or consequence
- DO NOT describe the image — the caption accompanies it

CTA (closing):
- ONE specific action. Not "learn more" — that's lazy
- Include the phone number or website naturally
- Make it feel like an invitation, not a pitch

HASHTAGS:
- 5-8 hashtags
- Mix: 2-3 broad reach + 3-4 niche/industry + 1-2 branded
- Use natural keywords Instagram's search indexes
- Include: ${expert.keywords.slice(0, 4).join(', ')}

FORMAT:
- Use line breaks between sections for readability
- No emojis in the hook line
- Minimal emojis elsewhere (0-2 max, professional accounts)
- No hashtags inside the caption body — only at the end

═══════════════════════════════════════════════

Return ONLY valid JSON (no markdown, no backticks):
{
  "instagram_caption": "the full Instagram caption with line breaks as actual newlines",
  "facebook_caption": "shorter Facebook version — 2-3 sentences max, more conversational, include CTA",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`;

  const generateOnce = async (extraInstructions = '') => {
    const fullPrompt = extraInstructions ? `${prompt}\n\nCRITICAL FIXES REQUIRED:\n${extraInstructions}` : prompt;
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      messages: [{ role: 'user', content: fullPrompt }],
    });
    const text = response.content[0]?.text || '{}';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  };

  // ── Quality gate ──────────────────────────────────────────────
  const checkCaption = (caption) => {
    const ig = caption.instagram_caption || '';
    const lines = ig.split('\n').filter(l => l.trim());
    const hook = lines[0] || '';
    const hookWords = hook.split(/\s+/).length;
    const totalWords = ig.split(/\s+/).length;
    const website = business.website || '';
    const phone = business.design_system?.cta_bar?.phone || '';

    const issues = [];

    // Hook too long
    if (hookWords > 12) issues.push(`Hook is ${hookWords} words — must be under 10. Current hook: "${hook}". Rewrite it shorter and punchier.`);

    // Total length check
    const maxWords = captionLength === 'short' ? 40 : captionLength === 'long' ? 120 : 80;
    if (totalWords > maxWords) issues.push(`Caption is ${totalWords} words — max is ${maxWords} for ${captionLength} length. Cut the fluff. Every line must earn its place.`);

    // Fabrication check
    const fabricationPatterns = [
      /\bwe (saw|found|noticed|walked|discovered|visited|met)\b/i,
      /\btoday we\b/i,
      /\bour team (saw|found|went|visited)\b/i,
      /\bthis is what we\b/i,
      /\bjust (saw|found|got back from)\b/i,
      /\byesterday we\b/i,
      /\blast week we\b/i,
    ];
    for (const pattern of fabricationPatterns) {
      if (pattern.test(ig)) issues.push(`Contains fabricated narration matching "${pattern.source}". Remove ALL first-person stories. Write as authority, not narrator.`);
    }

    // First person plural
    if (/\bwe're\b|\bwe've\b|\bwe are\b|\bour team\b/i.test(ig) && !/\bwe (offer|provide|specialize|install|handle)\b/i.test(ig)) {
      issues.push('Uses first-person plural narration. Only use "we" for service descriptions ("we install", "we specialize"), never for stories.');
    }

    // Image narration
    if (/\bas you can see\b|\bin this (image|video|reel|photo)\b|\bthis shows\b|\blook at this\b/i.test(ig)) {
      issues.push('Narrates the image/video. The caption accompanies the visual — do NOT describe or reference it directly.');
    }

    // CTA check
    const hasCTA = ig.toLowerCase().includes(website.toLowerCase()) || 
                   (phone && ig.includes(phone)) ||
                   /\bcall\b|\bvisit\b|\bschedule\b|\bbook\b|\bdm\b|\blink in bio\b/i.test(ig);
    if (!hasCTA && captionLength !== 'short') issues.push(`No CTA found. Include ${website}${phone ? ' or ' + phone : ''}.`);

    // Banned words
    const banned = (business.banned_words || 'game-changer,revolutionize,leverage,cutting-edge,seamless,unlock,synergy').split(',').map(w => w.trim().toLowerCase());
    for (const word of banned) {
      if (word && ig.toLowerCase().includes(word)) issues.push(`Contains banned word "${word}". Remove it.`);
    }

    return issues;
  };

  // Generate and check
  let caption = await generateOnce();
  const issues = checkCaption(caption);

  if (issues.length > 0) {
    console.log(`[INTAKE] Quality gate failed (${issues.length} issues), regenerating...`);
    try {
      caption = await generateOnce(issues.join('\n'));
      const recheck = checkCaption(caption);
      if (recheck.length > 0) {
        console.log(`[INTAKE] Regenerated caption still has ${recheck.length} issues — using anyway`);
      }
    } catch (e) {
      console.log(`[INTAKE] Regeneration failed, using original: ${e.message}`);
    }
  }

  return caption;
}


// ═══════════════════════════════════════════════════════════════════
// PROCESS SINGLE UPLOAD
// ═══════════════════════════════════════════════════════════════════

export async function processUpload(uploadId) {
  const { data: upload, error } = await supabase
    .from('cf_content_uploads')
    .select('*, cf_businesses(*)')
    .eq('id', uploadId)
    .single();

  if (error || !upload) throw new Error(`Upload not found: ${uploadId}`);
  const business = upload.cf_businesses;

  await supabase.from('cf_content_uploads')
    .update({ status: 'analyzing', updated_at: new Date().toISOString() })
    .eq('id', uploadId);

  try {
    const analysis = await analyzeContent(upload, business);

    // For videos, get a thumbnail URL for calendar preview — save to Supabase Storage for persistence
    let thumbnailUrl = null;
    if (upload.media_type?.includes('video')) {
      try {
        const doUrl = (process.env.RENDER_SERVICE_URL || 'https://urchin-app-bqb4i.ondigitalocean.app').replace('/api/content-render', '');
        const thumbResp = await fetch(`${doUrl}/api/media/thumbnail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_path: upload.storage_path, timestamp: '3' }),
        });
        const thumbData = await thumbResp.json();
        if (thumbData.base64) {
          // Upload thumbnail to Supabase Storage (persistent)
          const thumbPath = `thumbnails/${upload.storage_path.replace(/\.[^.]+$/, '.jpg')}`;
          const thumbBuffer = Buffer.from(thumbData.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
          const { error: thumbUpErr } = await supabase.storage
            .from('content-media')
            .upload(thumbPath, thumbBuffer, { contentType: 'image/jpeg', upsert: true });
          if (!thumbUpErr) {
            const { data: urlData } = supabase.storage.from('content-media').getPublicUrl(thumbPath);
            thumbnailUrl = urlData?.publicUrl || null;
          }
        }
      } catch (e) { console.log('[INTAKE] Thumbnail for preview failed (non-fatal):', e.message); }
    }

    const { data: latestAnalysis } = await supabase
      .from('cf_content_analysis')
      .select('summary, best_pillar, worst_pillar, best_content_type, worst_content_type, best_mood, top_hooks, hook_patterns, share_drivers, save_drivers, recommendations, content_mix, avoid, double_down')
      .eq('business_id', business.id)
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const caption = await generateCaption(upload, business, analysis, latestAnalysis);

    await supabase.from('cf_content_uploads').update({
      status: 'captioned',
      ai_analysis: analysis,
      content_description: analysis.content_description,
      text_in_image: analysis.text_in_image,
      content_pillar: analysis.content_pillar,
      content_type: analysis.content_type,
      visual_mode: analysis.visual_mode,
      mood: analysis.mood,
      industry_target: analysis.industry_target,
      has_statistic: analysis.has_statistic,
      hook_strength: analysis.estimated_hook_strength,
      instagram_caption: caption.instagram_caption,
      facebook_caption: caption.facebook_caption,
      hashtags: caption.hashtags,
      thumbnail_url: thumbnailUrl,
      updated_at: new Date().toISOString(),
    }).eq('id', uploadId);

    return { success: true, analysis, caption };
  } catch (err) {
    await supabase.from('cf_content_uploads').update({
      status: 'failed',
      error_log: err.message,
      updated_at: new Date().toISOString(),
    }).eq('id', uploadId);
    throw err;
  }
}

export async function processBatch(batchId) {
  const { data: uploads, error } = await supabase
    .from('cf_content_uploads')
    .select('id')
    .eq('batch_id', batchId)
    .eq('status', 'uploaded')
    .order('created_at', { ascending: true });

  if (error || !uploads?.length) return { processed: 0, errors: 0 };

  let processed = 0, errors = 0;
  for (const upload of uploads) {
    try { await processUpload(upload.id); processed++; }
    catch (err) { console.error(`[INTAKE] Failed ${upload.id}: ${err.message}`); errors++; }
  }
  return { processed, errors, total: uploads.length };
}