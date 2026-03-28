/**
 * Feedback Learning System
 *
 * Stores per-business feedback on generated content and formats it
 * for injection into future prompts. This is how the AI "learns"
 * what works for each business over time.
 *
 * Storage: localStorage (keyed by business ID)
 * Each feedback item:
 *   - id: unique string
 *   - headline: the generated headline
 *   - content_type: category that was used
 *   - template: template that was used
 *   - rating: 'good' | 'bad'
 *   - reason: free text explaining what was good/bad
 *   - created_at: ISO timestamp
 */

const STORAGE_PREFIX = 'cf_feedback_';
const MAX_FEEDBACK_PER_BUSINESS = 50; // Keep last 50, prune older
const PROMPT_INJECTION_LIMIT = 15;    // Inject last 15 into prompts

// ── Storage Operations ──────────────────────────────────────────────

export function getFeedback(businessId) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + businessId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveFeedback(businessId, item) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getFeedback(businessId);
    const updated = [item, ...existing].slice(0, MAX_FEEDBACK_PER_BUSINESS);
    localStorage.setItem(STORAGE_PREFIX + businessId, JSON.stringify(updated));
  } catch {
    // quota exceeded, silently fail
  }
}

export function clearFeedback(businessId) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_PREFIX + businessId);
}

export function getFeedbackStats(businessId) {
  const items = getFeedback(businessId);
  const good = items.filter((i) => i.rating === 'good').length;
  const bad = items.filter((i) => i.rating === 'bad').length;
  return { total: items.length, good, bad };
}

// ── Prompt Injection ────────────────────────────────────────────────

/**
 * Build a feedback context block for prompt injection.
 * Returns a string that gets appended to the AI prompt so it can
 * learn from past approvals and rejections.
 *
 * Returns empty string if no feedback exists yet.
 */
export function buildFeedbackContext(businessId) {
  const items = getFeedback(businessId).slice(0, PROMPT_INJECTION_LIMIT);
  if (items.length === 0) return '';

  const approved = items.filter((i) => i.rating === 'good');
  const rejected = items.filter((i) => i.rating === 'bad');

  let block = '\n\nLEARNING FROM PAST FEEDBACK (apply these learnings):';

  if (approved.length > 0) {
    block += '\n\nPOSTS THE USER APPROVED (do more like these):';
    approved.forEach((item) => {
      block += `\n- "${item.headline}" (${item.template}, ${item.content_type})`;
      if (item.reason) block += ` — User said: "${item.reason}"`;
    });
  }

  if (rejected.length > 0) {
    block += '\n\nPOSTS THE USER REJECTED (avoid these patterns):';
    rejected.forEach((item) => {
      block += `\n- "${item.headline}" (${item.template}, ${item.content_type})`;
      if (item.reason) block += ` — User said: "${item.reason}"`;
    });
  }

  // Synthesize patterns if enough data
  if (items.length >= 5) {
    block += '\n\nPATTERN SUMMARY:';

    // Which content types get approved most
    const goodTypes = {};
    approved.forEach((i) => { goodTypes[i.content_type] = (goodTypes[i.content_type] || 0) + 1; });
    const topGoodTypes = Object.entries(goodTypes).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topGoodTypes.length > 0) {
      block += `\n- Content types that perform well: ${topGoodTypes.map(([t]) => t).join(', ')}`;
    }

    // Which content types get rejected most
    const badTypes = {};
    rejected.forEach((i) => { badTypes[i.content_type] = (badTypes[i.content_type] || 0) + 1; });
    const topBadTypes = Object.entries(badTypes).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topBadTypes.length > 0) {
      block += `\n- Content types to be more careful with: ${topBadTypes.map(([t]) => t).join(', ')}`;
    }

    // Which templates get approved most
    const goodTpls = {};
    approved.forEach((i) => { goodTpls[i.template] = (goodTpls[i.template] || 0) + 1; });
    const topGoodTpls = Object.entries(goodTpls).sort((a, b) => b[1] - a[1]).slice(0, 2);
    if (topGoodTpls.length > 0) {
      block += `\n- Templates that work well: ${topGoodTpls.map(([t]) => t).join(', ')}`;
    }

    // Extract common themes from rejection reasons
    const rejectionReasons = rejected.filter((i) => i.reason).map((i) => i.reason);
    if (rejectionReasons.length >= 2) {
      block += `\n- Common rejection themes: ${rejectionReasons.slice(0, 5).join(' | ')}`;
    }
  }

  return block;
}

/**
 * Get feedback data formatted for sending to the API.
 * This is a lightweight version — just the items array
 * that the API can use to build the prompt context server-side.
 */
export function getFeedbackForAPI(businessId) {
  return getFeedback(businessId).slice(0, PROMPT_INJECTION_LIMIT);
}