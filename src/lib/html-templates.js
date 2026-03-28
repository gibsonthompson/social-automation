/**
 * HTML Template Rendering System
 *
 * Each template is a function that takes:
 *   - content: AI-generated JSON (headline, subtext, items, highlights, etc.)
 *   - biz: Business profile with design_system
 *   - photoDataUrl: optional base64 photo string
 *
 * Returns: complete HTML string at 1080x1350, ready for Puppeteer screenshot.
 *
 * AI FLEXIBILITY: The AI decides:
 *   - highlight_words: array of words to accent-color in headline
 *   - items: array of list/checklist/step items
 *   - badge_label: optional top badge ("SEASONAL ALERT", "LIMITED TIME OFFER")
 *   - stats: array of { value, label } for stat blocks
 *   - reviews: array of { text, author } for review posts
 *   - cta_line1 / cta_line2: CTA bar text (line1 is small, line2 is big)
 *
 * DESIGN SYSTEM: Locked per business:
 *   - Fonts, gradients, colors, CTA bar format, trust badges
 */

// ── Shared HTML scaffolding ─────────────────────────────────────────

function baseHTML(biz, bodyContent) {
  const ds = biz.design_system || {};
  const fonts = ds.fonts || {};
  const headlineFont = fonts.headline?.family || 'Bebas Neue';
  const bodyFont = fonts.body?.family || 'Montserrat';

  // Build Google Fonts URL
  const fontFamilies = [];
  if (headlineFont) fontFamilies.push(headlineFont.replace(/ /g, '+'));
  if (bodyFont && bodyFont !== headlineFont) fontFamilies.push(bodyFont.replace(/ /g, '+') + ':wght@400;600;700;800;900');
  const fontUrl = fontFamilies.length > 0
    ? `https://fonts.googleapis.com/css2?family=${fontFamilies.join('&family=')}&display=swap`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
${fontUrl ? `<link href="${fontUrl}" rel="stylesheet">` : ''}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px;
    height: 1350px;
    overflow: hidden;
    background: #00FF00;
    font-family: '${bodyFont}', 'Montserrat', sans-serif;
  }
  .post {
    width: 1080px;
    height: 1350px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }
  .headline-font {
    font-family: '${headlineFont}', 'Bebas Neue', sans-serif;
    text-transform: ${fonts.headline?.transform || 'uppercase'};
    letter-spacing: ${fonts.headline?.letter_spacing || '2px'};
  }
  .body-font {
    font-family: '${bodyFont}', 'Montserrat', sans-serif;
  }
  .highlight {
    color: ${ds.colors_extended?.accent_light || biz.accent_color || '#84d2f2'};
  }
  .urgency {
    color: ${ds.colors_extended?.urgency || '#C62828'};
  }
</style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

function highlightWords(text, words, colorClass = 'highlight') {
  if (!words || !words.length || !text) return escHtml(text || '');
  let result = escHtml(text);
  words.forEach(w => {
    const escaped = escHtml(w);
    const regex = new RegExp(`(${escaped})`, 'gi');
    result = result.replace(regex, `<span class="${colorClass}">$1</span>`);
  });
  return result;
}

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ctaBarHTML(biz, content) {
  const ds = biz.design_system || {};
  const ctaGradient = ds.gradients?.cta || ds.cta_bar?.bg_gradient || 'linear-gradient(135deg, #C62828, #B71C1C)';
  const phone = ds.cta_bar?.phone || '';
  const line1 = content.cta_line1 || '';
  const line2 = content.cta_line2 || content.cta || 'FREE ESTIMATE';

  if (!ds.cta_bar?.enabled) return '';

  return `
  <div style="
    background: ${ctaGradient};
    padding: 28px 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  ">
    <div>
      ${line1 ? `<div class="body-font" style="font-size: 20px; font-weight: 800; color: white; text-transform: uppercase; letter-spacing: 2px;">${escHtml(line1)}</div>` : ''}
      <div class="headline-font" style="font-size: 48px; color: white; line-height: 1;">${escHtml(line2)}</div>
    </div>
    ${phone ? `<div class="headline-font" style="font-size: 50px; color: white;">${escHtml(phone)}</div>` : ''}
  </div>`;
}

function trustBadgesHTML(biz, style = 'dark') {
  const badges = biz.design_system?.trust_badges || biz.certifications?.split(',').map(s => s.trim()).filter(Boolean) || [];
  if (!badges.length) return '';
  const opacity = style === 'dark' ? '0.8' : '1';
  return `
  <div style="display: flex; gap: 16px; align-items: center; opacity: ${opacity};">
    ${badges.map(b => `
      <div style="
        background: ${style === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'};
        border: 1px solid ${style === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'};
        border-radius: 6px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 700;
        color: ${style === 'dark' ? 'white' : '#333'};
        text-transform: uppercase;
        letter-spacing: 1px;
      ">${escHtml(b)}</div>
    `).join('')}
  </div>`;
}

function brandStripHTML(biz) {
  return `
  <div style="
    background: ${biz.primary_color || '#273373'};
    padding: 20px 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  ">
    <div style="display: flex; align-items: center; gap: 14px;">
      <div class="headline-font" style="font-size: 24px; color: white; letter-spacing: 3px;">${escHtml(biz.name.toUpperCase())}</div>
    </div>
    ${biz.website ? `<div class="body-font" style="font-size: 14px; color: ${biz.accent_color || '#84d2f2'}; font-weight: 600;">@${escHtml(biz.website.replace('www.', '').replace('.com', ''))}</div>` : ''}
  </div>`;
}


// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: PHOTO HERO + CONTENT
// Post types: crew at work, meet the crew, service showcase
// ═══════════════════════════════════════════════════════════════════

function photoHero(content, biz, photoDataUrl) {
  const ds = biz.design_system || {};
  const overlay = ds.gradients?.photo_overlay || `linear-gradient(0deg, ${biz.primary_color || 'rgba(39,51,115,1)'} 0%, rgba(39,51,115,0) 100%)`;
  const stats = content.stats || [];
  const items = content.items || [];

  const photoSection = photoDataUrl
    ? `<div style="flex: 0 0 55%; position: relative; overflow: hidden;">
        <img src="${photoDataUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
        <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 60%; background: ${overlay};"></div>
        <div style="position: absolute; bottom: 36px; left: 48px; right: 48px;">
          <div class="headline-font" style="font-size: 72px; color: white; line-height: 0.95;">
            ${highlightWords(content.headline, content.highlight_words)}
          </div>
        </div>
        ${trustBadgesHTML(biz, 'dark') ? `<div style="position: absolute; top: 24px; right: 24px;">${trustBadgesHTML(biz, 'dark')}</div>` : ''}
      </div>`
    : `<div style="flex: 0 0 45%; background: ${ds.gradients?.header || biz.primary_color}; display: flex; align-items: flex-end; padding: 36px 48px;">
        <div class="headline-font" style="font-size: 80px; color: white; line-height: 0.95;">
          ${highlightWords(content.headline, content.highlight_words)}
        </div>
      </div>`;

  const contentSection = `
    <div style="flex: 1; background: ${biz.primary_color || '#273373'}; padding: 36px 48px; display: flex; flex-direction: column; justify-content: center;">
      ${content.subtext ? `
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="width: 50px; height: 3px; background: ${biz.accent_color}; margin: 0 auto 16px;"></div>
          <div class="body-font" style="font-size: 18px; color: rgba(255,255,255,0.8); line-height: 1.5; font-weight: 500;">${escHtml(content.subtext)}</div>
        </div>
      ` : ''}
      ${stats.length > 0 ? `
        <div style="display: flex; justify-content: space-around; margin-top: 12px;">
          ${stats.map(s => `
            <div style="text-align: center;">
              <div class="headline-font" style="font-size: 64px; color: ${biz.accent_color || '#84d2f2'}; line-height: 1;">${escHtml(s.value)}</div>
              <div class="body-font" style="font-size: 14px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 2px; margin-top: 6px; font-weight: 700;">${escHtml(s.label)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${items.length > 0 ? `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px 32px; margin-top: 8px;">
          ${items.map(item => `
            <div style="display: flex; align-items: center; gap: 14px;">
              <div style="width: 40px; height: 40px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <div style="font-size: 16px; color: white;">&#10003;</div>
              </div>
              <div>
                <div class="body-font" style="font-size: 17px; font-weight: 800; color: white; text-transform: uppercase;">${escHtml(item.title || item)}</div>
                ${item.subtitle ? `<div class="body-font" style="font-size: 13px; color: rgba(255,255,255,0.5); font-weight: 500;">${escHtml(item.subtitle)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>`;

  return baseHTML(biz, `
    <div class="post">
      ${photoSection}
      ${contentSection}
      ${ctaBarHTML(biz, content)}
    </div>
  `);
}


// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: FULL GRAPHIC (offer, coupon, announcement)
// ═══════════════════════════════════════════════════════════════════

function fullGraphic(content, biz) {
  const ds = biz.design_system || {};
  const urgencyColor = ds.colors_extended?.urgency || '#C62828';
  const items = content.items || [];
  const badgeLabel = content.badge_label || '';

  return baseHTML(biz, `
    <div class="post">
      ${badgeLabel ? `
        <div style="background: ${urgencyColor}; padding: 20px; text-align: center; flex-shrink: 0;">
          <div class="body-font" style="font-size: 20px; font-weight: 800; color: white; text-transform: uppercase; letter-spacing: 6px;">${escHtml(badgeLabel)}</div>
        </div>
      ` : ''}
      <div style="flex: 1; background: ${ds.gradients?.header || `linear-gradient(160deg, ${biz.bg_color || '#1a2a6c'}, ${biz.primary_color || '#273373'})`}; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 56px; text-align: center;">
        <div class="headline-font" style="font-size: 96px; color: white; line-height: 0.95; margin-bottom: 16px;">
          ${highlightWords(content.headline, content.highlight_words)}
        </div>
        ${content.subtext ? `
          <div class="body-font" style="font-size: 20px; color: rgba(255,255,255,0.7); margin-top: 12px; line-height: 1.5; max-width: 800px; font-weight: 500;">${escHtml(content.subtext)}</div>
        ` : ''}
        ${items.length > 0 ? `
          <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 32px;">
            ${items.map(item => `
              <div style="
                background: rgba(${parseInt(biz.accent_color?.slice(1,3)||'84',16)},${parseInt(biz.accent_color?.slice(3,5)||'d2',16)},${parseInt(biz.accent_color?.slice(5,7)||'f2',16)},0.15);
                border: 1px solid rgba(${parseInt(biz.accent_color?.slice(1,3)||'84',16)},${parseInt(biz.accent_color?.slice(3,5)||'d2',16)},${parseInt(biz.accent_color?.slice(5,7)||'f2',16)},0.3);
                border-radius: 24px;
                padding: 10px 24px;
                font-size: 16px;
                font-weight: 700;
                color: ${biz.accent_color || '#84d2f2'};
                text-transform: uppercase;
                letter-spacing: 1px;
              ">${escHtml(typeof item === 'string' ? item : item.title || item)}</div>
            `).join('')}
          </div>
        ` : ''}
        <div style="margin-top: 28px;">
          ${trustBadgesHTML(biz, 'dark')}
        </div>
      </div>
      ${ctaBarHTML(biz, content)}
    </div>
  `);
}


// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: CHECKLIST (seasonal alerts, warning signs, tips)
// ═══════════════════════════════════════════════════════════════════

function checklist(content, biz) {
  const ds = biz.design_system || {};
  const urgencyColor = ds.colors_extended?.urgency || '#C62828';
  const accentLight = ds.colors_extended?.accent_light || biz.accent_color || '#84d2f2';
  const items = content.items || [];
  const badgeLabel = content.badge_label || '';

  return baseHTML(biz, `
    <div class="post">
      ${brandStripHTML(biz)}
      ${badgeLabel ? `
        <div style="position: absolute; top: 20px; right: 32px; background: ${urgencyColor}; border-radius: 6px; padding: 8px 18px;">
          <div class="body-font" style="font-size: 13px; font-weight: 800; color: white; text-transform: uppercase; letter-spacing: 2px;">${escHtml(badgeLabel)}</div>
        </div>
      ` : ''}
      <div style="flex: 1; background: ${biz.bg_color || '#0d1b2a'}; padding: 48px 56px; display: flex; flex-direction: column;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div class="headline-font" style="font-size: 80px; color: white; line-height: 0.95;">
            ${highlightWords(content.headline, content.highlight_words, 'urgency')}
          </div>
          ${content.subtext ? `
            <div class="body-font" style="font-size: 18px; color: rgba(255,255,255,0.6); margin-top: 16px; line-height: 1.5; font-weight: 500;">${escHtml(content.subtext)}</div>
          ` : ''}
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-evenly;">
          ${items.map(item => `
            <div style="display: flex; align-items: center; gap: 20px; padding: 16px 24px; background: rgba(255,255,255,0.04); border-radius: 12px;">
              <div style="width: 36px; height: 36px; border-radius: 8px; background: ${accentLight}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <div style="color: ${biz.bg_color || '#0d1b2a'}; font-size: 18px; font-weight: 900;">&#10003;</div>
              </div>
              <div class="body-font" style="font-size: 22px; font-weight: 700; color: white;">${escHtml(typeof item === 'string' ? item : item.title || item)}</div>
            </div>
          `).join('')}
        </div>
        <div style="text-align: center; margin-top: 20px;">
          ${trustBadgesHTML(biz, 'dark')}
        </div>
      </div>
      ${ctaBarHTML(biz, content)}
    </div>
  `);
}


// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: REVIEW SHOWCASE (social proof, testimonials)
// ═══════════════════════════════════════════════════════════════════

function reviewShowcase(content, biz) {
  const reviews = content.reviews || [];

  return baseHTML(biz, `
    <div class="post">
      ${brandStripHTML(biz)}
      <div style="flex: 1; background: ${biz.bg_color || '#0d1b2a'}; padding: 48px 52px; display: flex; flex-direction: column;">
        <div style="text-align: center; margin-bottom: 28px;">
          <div class="body-font" style="font-size: 16px; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 4px;">Google Reviews</div>
          <div class="headline-font" style="font-size: 96px; color: white; line-height: 1;">${escHtml(content.headline || '5.0')}</div>
          <div class="body-font" style="font-size: 16px; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 4px; margin-top: 4px;">Perfect Rating</div>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; gap: 14px;">
          ${reviews.map(r => `
            <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 22px 28px;">
              <div style="color: #FBBC04; font-size: 16px; margin-bottom: 10px;">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
              <div class="body-font" style="font-size: 17px; font-weight: 500; color: rgba(255,255,255,0.85); line-height: 1.5; font-style: italic;">"${escHtml(r.text)}"</div>
              <div style="margin-top: 10px;">
                <span class="body-font" style="font-size: 14px; font-weight: 800; color: ${biz.accent_color || '#84d2f2'}; text-transform: uppercase;">— ${escHtml(r.author || 'Homeowner')}</span>
                <span class="body-font" style="font-size: 12px; color: rgba(255,255,255,0.3); margin-left: 8px;">Google Review</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ${ctaBarHTML(biz, content)}
    </div>
  `);
}


// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: PROCESS STEPS (how it works, numbered steps)
// ═══════════════════════════════════════════════════════════════════

function processSteps(content, biz, photoDataUrl) {
  const ds = biz.design_system || {};
  const items = content.items || [];

  const photoSection = photoDataUrl
    ? `<div style="flex: 0 0 35%; position: relative; overflow: hidden;">
        <img src="${photoDataUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
        <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 70%; background: linear-gradient(0deg, white 0%, rgba(255,255,255,0) 100%);"></div>
        <div style="position: absolute; bottom: 24px; left: 48px; right: 48px;">
          <div class="body-font" style="font-size: 16px; font-weight: 600; color: ${biz.accent_color}; text-transform: uppercase; letter-spacing: 4px; margin-bottom: 4px;">${escHtml(content.eyebrow || 'How We Work')}</div>
          <div class="headline-font" style="font-size: 64px; color: ${biz.primary_color || '#273373'}; line-height: 0.95;">
            ${highlightWords(content.headline, content.highlight_words)}
          </div>
        </div>
      </div>`
    : `<div style="flex: 0 0 20%; background: ${biz.primary_color}; display: flex; align-items: center; padding: 36px 48px;">
        <div class="headline-font" style="font-size: 72px; color: white; line-height: 0.95;">
          ${highlightWords(content.headline, content.highlight_words)}
        </div>
      </div>`;

  return baseHTML(biz, `
    <div class="post">
      ${photoSection}
      <div style="flex: 1; background: white; padding: 40px 56px; display: flex; flex-direction: column;">
        ${content.subtext ? `
          <div class="headline-font" style="font-size: 28px; color: ${biz.primary_color || '#273373'}; text-align: center; margin-bottom: 32px;">${escHtml(content.subtext)}</div>
        ` : ''}
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-evenly;">
          ${items.map((item, i) => `
            <div style="display: flex; align-items: flex-start; gap: 20px;">
              <div style="
                width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0;
                background: linear-gradient(135deg, ${biz.secondary_color || '#115997'}, ${biz.accent_color || '#2692cc'});
                display: flex; align-items: center; justify-content: center;
              ">
                <div class="headline-font" style="font-size: 28px; color: white;">${String(i + 1).padStart(2, '0')}</div>
              </div>
              <div>
                <div class="body-font" style="font-size: 22px; font-weight: 800; color: ${biz.primary_color || '#273373'}; text-transform: uppercase;">${escHtml(item.title || item)}</div>
                ${item.subtitle ? `<div class="body-font" style="font-size: 15px; color: #777; font-weight: 500; margin-top: 4px; line-height: 1.4;">${escHtml(item.subtitle)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ${ctaBarHTML(biz, content)}
    </div>
  `);
}


// ═══════════════════════════════════════════════════════════════════
// TEMPLATE: STAT CALLOUT (big number hero)
// ═══════════════════════════════════════════════════════════════════

function statCallout(content, biz) {
  const ds = biz.design_system || {};

  return baseHTML(biz, `
    <div class="post">
      <div style="flex: 1; background: ${ds.gradients?.header || `linear-gradient(160deg, ${biz.bg_color || '#0d1b2a'}, ${biz.primary_color || '#273373'})`}; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 56px; text-align: center; position: relative;">
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: radial-gradient(circle at 50% 40%, ${biz.primary_color}40 0%, transparent 60%);"></div>
        <div style="position: relative; z-index: 1;">
          ${content.eyebrow ? `
            <div class="body-font" style="font-size: 18px; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 5px; margin-bottom: 16px;">${escHtml(content.eyebrow)}</div>
          ` : ''}
          <div class="headline-font" style="font-size: 160px; color: ${biz.accent_color || '#84d2f2'}; line-height: 1;">${escHtml(content.headline)}</div>
          <div style="width: 100px; height: 4px; background: ${biz.primary_color}; margin: 24px auto;"></div>
          <div class="body-font" style="font-size: 28px; color: rgba(255,255,255,0.85); font-weight: 600; line-height: 1.4; max-width: 700px;">${escHtml(content.subtext)}</div>
          ${content.items && content.items.length > 0 ? `
            <div style="display: flex; justify-content: center; gap: 12px; margin-top: 32px; flex-wrap: wrap;">
              ${content.items.map(item => `
                <div style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 10px 22px;">
                  <span class="body-font" style="font-size: 15px; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">${escHtml(typeof item === 'string' ? item : item.title || item)}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div style="margin-top: 28px;">${trustBadgesHTML(biz, 'dark')}</div>
        </div>
      </div>
      ${ctaBarHTML(biz, content)}
    </div>
  `);
}


// ═══════════════════════════════════════════════════════════════════
// TEMPLATE REGISTRY
// ═══════════════════════════════════════════════════════════════════

export const HTML_TEMPLATES = {
  photo_hero: { label: 'Photo Hero + Content', render: photoHero, needsPhoto: true },
  full_graphic: { label: 'Full Graphic', render: fullGraphic, needsPhoto: false },
  checklist: { label: 'Checklist / Tips', render: checklist, needsPhoto: false },
  review_showcase: { label: 'Review Showcase', render: reviewShowcase, needsPhoto: false },
  process_steps: { label: 'Process Steps', render: processSteps, needsPhoto: true },
  stat_callout: { label: 'Stat Callout', render: statCallout, needsPhoto: false },
};

/**
 * Render a template to HTML string.
 * Falls back gracefully if template not found.
 */
export function renderTemplate(templateId, content, biz, photoDataUrl) {
  const tpl = HTML_TEMPLATES[templateId];
  if (!tpl) {
    // Fallback to full_graphic
    return fullGraphic(content, biz);
  }
  return tpl.render(content, biz, photoDataUrl);
}