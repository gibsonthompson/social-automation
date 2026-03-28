import { renderTemplate } from '@/lib/html-templates';

/**
 * NODE 4: Image Composition
 *
 * POST /api/render
 * Body: { content, business, templateId, photoDataUrl? }
 * Returns: { image: "data:image/png;base64,..." }
 *
 * Uses Puppeteer to screenshot the HTML template at 1080x1350.
 * On Vercel: uses @sparticuz/chromium for serverless Chromium.
 * Locally: uses whatever Chrome is installed.
 */

async function getBrowser() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // Serverless (Vercel)
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteer = (await import('puppeteer-core')).default;
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1080, height: 1350 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  } else {
    // Local dev
    const puppeteer = (await import('puppeteer-core')).default;
    // Try common Chrome paths
    const paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    let execPath = null;
    for (const p of paths) {
      try {
        const fs = await import('fs');
        if (fs.existsSync(p)) { execPath = p; break; }
      } catch {}
    }
    if (!execPath) {
      throw new Error('Chrome not found. Install Chrome or set CHROME_PATH env variable.');
    }
    return puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1080, height: 1350 },
      executablePath: process.env.CHROME_PATH || execPath,
      headless: 'new',
    });
  }
}

export async function POST(request) {
  let browser = null;
  try {
    const { content, business, templateId, photoDataUrl } = await request.json();

    if (!content || !business) {
      return Response.json({ error: 'content and business are required' }, { status: 400 });
    }

    // Build HTML from template
    const html = renderTemplate(
      templateId || content.template || 'full_graphic',
      content,
      business,
      photoDataUrl || null
    );

    // Launch browser and screenshot
    browser = await getBrowser();
    const page = await browser.newPage();

    await page.setViewport({ width: 1080, height: 1350 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });

    // Wait a beat for fonts to load
    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 300));

    // Screenshot the .post element (or full page)
    const element = await page.$('.post');
    const screenshotBuffer = await (element || page).screenshot({
      type: 'png',
      encoding: 'base64',
    });

    await page.close();

    return Response.json({
      image: `data:image/png;base64,${screenshotBuffer}`,
    });
  } catch (error) {
    console.error('Render error:', error);
    return Response.json(
      { error: error.message || 'Render failed' },
      { status: 500 }
    );
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}