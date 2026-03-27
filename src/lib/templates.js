/**
 * Canvas Template Renderers
 *
 * Each template renders a 1080x1350 (4:5) social media image
 * using HTML5 Canvas API. All text uses large sizing with generous
 * padding to avoid the cramped-center problem.
 */

export const W = 1080;
export const H = 1350;
const PAD = 100;

// ── Utilities ──────────────────────────────────────────────────────

export function wrapText(ctx, text, x, y, maxW, lineH) {
  if (!text) return 0;
  const words = text.split(' ');
  let line = '';
  const lines = [];
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + ' ';
    if (ctx.measureText(test).width > maxW && line.length > 0) {
      lines.push(line.trim());
      line = words[i] + ' ';
    } else {
      line = test;
    }
  }
  if (line.trim()) lines.push(line.trim());
  for (let j = 0; j < lines.length; j++) {
    ctx.fillText(lines[j], x, y + j * lineH);
  }
  return lines.length;
}

export function wrapCenter(ctx, text, cx, y, maxW, lineH) {
  if (!text) return 0;
  const words = text.split(' ');
  let line = '';
  const lines = [];
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + ' ';
    if (ctx.measureText(test).width > maxW && line.length > 0) {
      lines.push(line.trim());
      line = words[i] + ' ';
    } else {
      line = test;
    }
  }
  if (line.trim()) lines.push(line.trim());
  for (let j = 0; j < lines.length; j++) {
    const lw = ctx.measureText(lines[j]).width;
    ctx.fillText(lines[j], cx - lw / 2, y + j * lineH);
  }
  return lines.length;
}

function rRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hex2rgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function darken(hex, n) {
  const c = hex2rgb(hex);
  return `rgb(${Math.max(0, c.r - n)},${Math.max(0, c.g - n)},${Math.max(0, c.b - n)})`;
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

async function drawPhotoCover(ctx, photoSrc, x, y, w, h) {
  try {
    const img = await loadImg(photoSrc);
    const s = Math.max(w / img.width, h / img.height);
    const iw = img.width * s;
    const ih = img.height * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    ctx.restore();
    return true;
  } catch {
    return false;
  }
}

// ── Templates ──────────────────────────────────────────────────────

async function boldStatement(ctx, biz, content, photo) {
  // Full gradient background with subtle grid
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, biz.primary_color);
  g.addColorStop(1, darken(biz.primary_color, 50));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Subtle vertical lines
  ctx.globalAlpha = 0.035;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1;
  for (let i = 0; i < W; i += 60) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Accent bar on left
  ctx.fillStyle = biz.accent_color;
  ctx.fillRect(PAD, PAD, 8, 120);

  // Headline — large, uppercase, left-aligned with room
  ctx.fillStyle = biz.text_color || '#FFFFFF';
  ctx.font = 'bold 76px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const headlineLines = wrapText(
    ctx,
    (content.headline || '').toUpperCase(),
    PAD + 30,
    PAD + 10,
    W - PAD * 2 - 40,
    92
  );

  // Subtext below headline
  ctx.font = '400 38px sans-serif';
  ctx.globalAlpha = 0.85;
  wrapText(
    ctx,
    content.subtext || '',
    PAD + 30,
    PAD + 20 + headlineLines * 92 + 40,
    W - PAD * 2 - 40,
    52
  );
  ctx.globalAlpha = 1;

  // CTA badge at bottom left
  if (content.cta) {
    ctx.font = 'bold 28px sans-serif';
    const tw = ctx.measureText(content.cta).width;
    const cy = H - PAD - 70;
    ctx.fillStyle = biz.accent_color;
    rRect(ctx, PAD, cy, tw + 80, 60, 8);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'middle';
    ctx.fillText(content.cta, PAD + 40, cy + 30);
  }

  // Business name + website bottom right
  ctx.fillStyle = biz.text_color || '#FFFFFF';
  ctx.globalAlpha = 0.5;
  ctx.font = '500 26px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(biz.name, W - PAD, H - PAD);
  ctx.font = '400 22px sans-serif';
  ctx.fillText(biz.website || '', W - PAD, H - PAD + 32);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

async function photoFeature(ctx, biz, content, photo) {
  // Photo or solid fallback
  if (photo) {
    await drawPhotoCover(ctx, photo, 0, 0, W, H);
  } else {
    ctx.fillStyle = biz.primary_color;
    ctx.fillRect(0, 0, W, H);
  }

  // Heavy bottom gradient for text legibility
  const g = ctx.createLinearGradient(0, H * 0.25, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.6)');
  g.addColorStop(1, 'rgba(0,0,0,0.93)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Top gradient for brand name area
  const tg = ctx.createLinearGradient(0, 0, 0, 280);
  tg.addColorStop(0, 'rgba(0,0,0,0.55)');
  tg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tg;
  ctx.fillRect(0, 0, W, 280);

  // Accent line above headline
  const startY = H - PAD - 320;
  ctx.fillStyle = biz.accent_color;
  ctx.fillRect(PAD, startY - 28, 80, 5);

  // Headline at bottom
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 68px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const hl = wrapText(ctx, content.headline || '', PAD, startY, W - PAD * 2, 82);

  // Subtext
  ctx.font = '400 36px sans-serif';
  ctx.globalAlpha = 0.9;
  wrapText(ctx, content.subtext || '', PAD, startY + hl * 82 + 24, W - PAD * 2, 48);
  ctx.globalAlpha = 1;

  // Brand name top left
  ctx.fillStyle = '#FFFFFF';
  ctx.globalAlpha = 0.85;
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(biz.name.toUpperCase(), PAD, PAD);
  ctx.globalAlpha = 1;
}

async function tipCard(ctx, biz, content, photo) {
  // Dark background
  ctx.fillStyle = biz.bg_color || '#0D1117';
  ctx.fillRect(0, 0, W, H);

  // Decorative blurred circles
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = biz.primary_color;
  ctx.beginPath();
  ctx.arc(W + 80, -80, 380, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-80, H + 80, 340, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // White card
  const cx = 70, cy = 200, cw = W - 140, ch = H - 400;
  ctx.fillStyle = '#FFFFFF';
  rRect(ctx, cx, cy, cw, ch, 24);
  ctx.fill();

  // Colored header strip
  ctx.fillStyle = biz.primary_color;
  rRect(ctx, cx, cy, cw, 80, 24);
  ctx.fill();
  ctx.fillRect(cx, cy + 50, cw, 30); // fill corner gap

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('PRO TIP', cx + 40, cy + 42);

  // Headline inside card
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 54px sans-serif';
  ctx.textBaseline = 'top';
  const hl = wrapText(ctx, content.headline || '', cx + 50, cy + 130, cw - 100, 66);

  // Body text inside card
  ctx.fillStyle = '#4B5563';
  ctx.font = '400 33px sans-serif';
  wrapText(ctx, content.subtext || '', cx + 50, cy + 140 + hl * 66 + 30, cw - 100, 46);

  // Business name below card
  ctx.fillStyle = biz.accent_color;
  ctx.font = 'bold 28px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(biz.name, cx + 10, cy + ch + 40);
  ctx.fillStyle = '#7C8190';
  ctx.font = '400 24px sans-serif';
  ctx.fillText(biz.website || '', cx + 10, cy + ch + 76);
}

async function statCallout(ctx, biz, content, photo) {
  // Dark bg with radial glow
  ctx.fillStyle = biz.bg_color || '#0A0A0F';
  ctx.fillRect(0, 0, W, H);

  const rg = ctx.createRadialGradient(W / 2, H * 0.36, 40, W / 2, H * 0.36, 480);
  rg.addColorStop(0, biz.primary_color + '30');
  rg.addColorStop(1, 'transparent');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);

  // Big stat number centered
  ctx.fillStyle = biz.accent_color;
  ctx.font = 'bold 160px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const statText = content.headline || '';
  const statW = ctx.measureText(statText).width;
  ctx.fillText(statText, (W - statW) / 2, H * 0.36);

  // Divider
  ctx.fillStyle = biz.primary_color;
  ctx.fillRect(W / 2 - 60, H * 0.36 + 100, 120, 4);

  // Context text centered
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '500 42px sans-serif';
  ctx.textBaseline = 'top';
  wrapCenter(ctx, content.subtext || '', W / 2, H * 0.36 + 140, W - PAD * 2, 56);

  // Brand line at bottom
  ctx.globalAlpha = 0.45;
  ctx.font = '500 26px sans-serif';
  ctx.textBaseline = 'bottom';
  const label = biz.name + (biz.website ? '  //  ' + biz.website : '');
  const labelW = ctx.measureText(label).width;
  ctx.fillText(label, (W - labelW) / 2, H - PAD);
  ctx.globalAlpha = 1;
}

async function serviceSpotlight(ctx, biz, content, photo) {
  const split = H * 0.48;

  // Top half: photo or gradient
  if (photo) {
    const ok = await drawPhotoCover(ctx, photo, 0, 0, W, split);
    if (!ok) {
      const sg = ctx.createLinearGradient(0, 0, W, split);
      sg.addColorStop(0, biz.primary_color);
      sg.addColorStop(1, biz.secondary_color || biz.primary_color);
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, split);
    }
  } else {
    const sg = ctx.createLinearGradient(0, 0, W, split);
    sg.addColorStop(0, biz.primary_color);
    sg.addColorStop(1, biz.secondary_color || biz.primary_color);
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, split);
  }

  // Bottom half: solid color
  ctx.fillStyle = biz.primary_color;
  ctx.fillRect(0, split, W, H - split);

  // Accent strip at split
  ctx.fillStyle = biz.accent_color;
  ctx.fillRect(0, split, W, 7);

  // Service headline
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 58px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const hl = wrapText(ctx, content.headline || '', PAD, split + 56, W - PAD * 2, 70);

  // Description
  ctx.font = '400 33px sans-serif';
  ctx.globalAlpha = 0.88;
  wrapText(ctx, content.subtext || '', PAD, split + 66 + hl * 70 + 20, W - PAD * 2, 46);
  ctx.globalAlpha = 1;

  // CTA bottom left
  const cta = content.cta || (biz.cta_phrases ? biz.cta_phrases.split(',')[0].trim() : '');
  ctx.fillStyle = biz.accent_color;
  ctx.font = 'bold 28px sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.fillText(cta, PAD, H - PAD);

  // Business name bottom right
  ctx.fillStyle = '#FFFFFF';
  ctx.globalAlpha = 0.5;
  ctx.font = '400 24px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(biz.name, W - PAD, H - PAD);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

// ── Export ──────────────────────────────────────────────────────────

export const TEMPLATES = {
  bold_statement: { label: 'Bold Statement', render: boldStatement },
  photo_feature: { label: 'Photo Feature', render: photoFeature },
  tip_card: { label: 'Tip Card', render: tipCard },
  stat_callout: { label: 'Stat Callout', render: statCallout },
  service_spotlight: { label: 'Service Spotlight', render: serviceSpotlight },
};
