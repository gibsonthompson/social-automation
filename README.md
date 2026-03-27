# Content Farm — Multi-Brand Social Media Engine

AI-powered social media content generation for multiple businesses. Generates branded 1080x1350 PNG images with captions, hashtags, and CTAs.

## Setup

```bash
# Install dependencies
npm install

# Copy env file and add your Anthropic API key
cp .env.local.example .env.local
# Edit .env.local and add your key

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Architecture

```
src/
  app/
    page.js           # Main UI (all 4 pages: Generate, Businesses, Photo Bank, Library)
    layout.js          # Root layout
    globals.css        # Global styles (CSS variables for theming)
    api/
      generate/
        route.js       # Server-side Claude API route
  lib/
    businesses.js      # Default business profiles
    prompts.js         # Per-industry prompt strategies (the important part)
    templates.js       # Canvas template renderers (5 templates)
  components/
    ui.jsx             # Shared UI components (Btn, Input, Select, Tag, Icon)
    ui.module.css      # Component styles
```

## How It Works

1. **Business Profiles** define brand colors, tone, ICP, services, and industry type
2. **Industry type** determines which prompt strategy is used (home_service, saas_tech, saas_smb, agency_dev, consulting)
3. **Each prompt strategy** has its own content categories, hooks, angles, and writing constraints
4. **Claude generates** structured JSON (headline, subtext, caption, hashtags, template recommendation)
5. **Canvas templates** render the content into a pixel-perfect 1080x1350 PNG
6. **Photo Bank** lets you upload photos per business that can be composited into templates

## Prompt System

Each industry type gets a fundamentally different prompt — not just tone swapping:

- **home_service**: seasonal warnings, problem awareness, before/after, myth busting
- **saas_tech**: revenue hooks, competitor gaps, ROI math, founder insights
- **saas_smb**: missed call pain, simplicity proof, industry scenarios, cost comparison
- **agency_dev**: build showcases, tech opinions, speed proof, client wins
- **consulting**: growth frameworks, bottleneck diagnosis, contrarian takes, action steps

See `src/lib/prompts.js` for the full prompt architecture.

## Templates

5 canvas templates, all 1080x1350 (4:5 ratio):

- **Bold Statement** — gradient bg, large uppercase headline, accent bar
- **Photo Feature** — full-bleed photo with dark gradient overlay for text
- **Tip Card** — white card on dark bg, educational format
- **Stat Callout** — big hero number with context text
- **Service Spotlight** — split layout, photo top / brand color bottom
