# ZYBAR Email Assets

Production Welcome Journey emails reference absolute URLs on `https://www.zybar.shop`.

## Canonical image locations (do not duplicate blindly)

| Role | Path |
|------|------|
| Email-optimized products + logo + welcome hero | `/Image/email/` |
| Product catalog (lit / unlit) | `/Image/` |
| Lifestyle / collector rooms | `/lifestyle-gallery/styled/`, `/lifestyle-gallery/wild/` |
| Brand posters, night/day heroes, craft frames | `/Poster/` |

See `manifest.json` for journey metadata.

When adding new email imagery:

1. Compress for email (prefer JPG/WebP under ~200KB when possible).
2. Place optimized files in `/Image/email/` when they are email-only crops.
3. Re-run `npm run export:welcome-emails` after updating `lib/welcome-journey.js`.
