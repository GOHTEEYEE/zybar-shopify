# ZYBAR Welcome Journey

**Internal lifecycle handbook**  
*Lifecycle Marketing · Welcome System v2*

---

## Purpose

This is not a discount drip.

This is how a stranger becomes a collector.

After Day 7, the customer should feel:

> “I want my room to feel like this.”

Not:

> “I need another product.”

---

## Journey map

| Day | Template key | Subject | Goal | Delay |
|-----|--------------|---------|------|--------|
| 0 | `welcome_day0` | Welcome to ZYBAR | Brand, founder why, atmosphere, 15% welcome | 5 minutes |
| 1 | `welcome_day1` | The art of living with light | Lifestyle rooms — image-led | +1 day |
| 2 | `welcome_day2` | Behind every piece | Craft & selective illumination | +1 day |
| 3 | `welcome_day3` | Find your style | German / JDM / Muscle / Supercars / Custom | +1 day |
| 4 | `welcome_day4` | Collector stories | Real installs + testimonials | +1 day |
| 5 | `welcome_day5` | Turn your own car into light | Custom emotional value | +1 day |
| 6 | `welcome_day6` | Why ZYBAR? | Differentiation without attacking | +1 day |
| 7 | `welcome_day7` | Your invitation | Offer close + collector invite | +1 day |

`welcome_email` remains an alias of Day 0 for signup / newsletter compatibility.

---

## Folder structure

```
emails/welcome/          Production HTML previews (Day 0–7)
emails/components/       Reusable table-row snippets
components/              Same snippets at project root (as specified)
assets/email/            Manifest + asset map (images live in Image/, Poster/, lifestyle-gallery/)
lib/welcome-journey.js   Source of truth for copy + composition
lib/email-components.js  Shared Resend-safe components
lib/email-templates.js   Template registry + renderTemplate()
```

---

## Brand rules (non-negotiable)

- We sell identity, atmosphere, pride, automotive culture, cinematic living.
- Never sound like AliExpress / dropshipping / “BUY NOW HURRY”.
- Tone: premium, elegant, minimal, emotional, collector.
- One story per email. Short sentences. Images dominate (~60–70%).
- One primary CTA. Soft secondary link only when earned.

**Approved CTAs**

- Explore Collection  
- Find Your Style  
- See Real Setups  
- Customize Yours  
- Discover More  
- Become a Collector  

---

## Design language

Inspired by Apple / Porsche / Aesop / Bang & Olufsen.

- Dark chrome (`#0b0b0c` / `#121214`)
- Cream editorial Soft Panels (`#f4f2ed`) for contrast
- Georgia display + Helvetica Neue body
- Full-bleed lifestyle photography
- Outlook-safe VML buttons
- Mobile-first media queries
- Dark-mode friendly (`color-scheme: dark`)

---

## Image audit (reused from store)

| Use | Assets |
|-----|--------|
| Logo | `/Image/email/zybar-logo.png` |
| Day 0 hero | `/Image/email/welcome-hero.jpg`, `/Poster/night.jpg` |
| Lifestyle | `/lifestyle-gallery/styled/*`, `/Poster/popup-garage-hero.png` |
| Craft | `/Poster/description1.png`, `description2.png`, `description.png`, `description4.png` |
| On/Off | `/Image/comparison-overlay-top.png`, `comparison-overlay-bottom.png` |
| Collections | `/Image/email/product-*.jpg`, lit product webps |
| Custom | `/Image/custom-led-car-wall-art-*.jpg` |
| Brand impact | `/Poster/every-dream-starts-somewhere.jpg` |

All production emails use absolute URLs on `https://www.zybar.shop`.

---

## How to preview

Open any file in `emails/welcome/` in a browser.  
Images load from the live store domain.

Re-export after editing `lib/welcome-journey.js`:

```bash
npm run export:welcome-emails
```

---

## How to send (Resend)

```js
const EmailTemplates = require('./lib/email-templates.js');
const Email = require('./lib/email.js');

const { subject, html } = EmailTemplates.renderTemplate('welcome_day3', {
  customerName: 'Alex',
  storeUrl: 'https://www.zybar.shop'
});

await Email.sendEmail({ to: 'collector@example.com', subject, html, env: process.env });
```

Journey engine steps use `template_id` = `welcome_day0` … `welcome_day7`.  
Apply migration:

`supabase/migrations/20260723140000_welcome_journey_7day.sql`

---

## Offer philosophy

Day 0 and Day 7 present the **collector welcome — 15%**.  
Savings apply automatically when the customer opens the store from the email (member pricing credential).  
We never scream scarcity. We invite.

---

## Success criteria

The Welcome Journey succeeds when:

1. Open rates stay high because each day feels like a chapter, not a blast.
2. Customers reply with room photos and questions — not “what’s the discount code?”
3. Day 5 custom page visits rise.
4. Day 7 converts without needing louder urgency.
5. New buyers already speak our language: atmosphere, presence, collector.

---

*— Lifecycle Marketing, ZYBAR*
