# Meta Conversions API (server-side Purchase)

Browser Pixel alone is often blocked (iOS, ad blockers). CAPI sends **Purchase** from your server so Meta still gets conversions.

## How it works

1. Checkout stores `_fbp` / `_fbc` (+ IP, user agent) with the payment.
2. On paid Stripe webhook **or** PayPal capture, the server calls Meta Graph API.
3. `event_id` is `purchase:{SESSION_OR_PAYPAL_ID}` — same as the browser Pixel — so Meta **deduplicates** and does not double-count.
   - Stripe: `purchase:cs_live_...`
   - PayPal: `purchase:paypal:{orderId}` (matches confirmation-page Pixel)

## Environment variables

Set these on **Vercel / production** (and local `.env` for testing):

| Variable | Required | Notes |
|----------|----------|--------|
| `META_CAPI_ACCESS_TOKEN` | Yes | Events Manager → your Pixel → Settings → **Generate access token** |
| `META_PIXEL_ID` | Optional | Defaults to `1576915907443589` (same as `js/meta-pixel-config.js`) |
| `META_TEST_EVENT_CODE` | Optional | From Events Manager → Test Events (only for testing) |
| `STORE_URL` | Optional | Defaults to `https://www.zybar.shop` |

## Setup steps (Meta)

1. Open [Events Manager](https://business.facebook.com/events_manager).
2. Select Pixel `1576915907443589` (or your Pixel).
3. Settings → Conversions API → **Generate access token** → copy into `META_CAPI_ACCESS_TOKEN`.
4. Redeploy / restart the Node server so env vars load.
5. Make a test purchase (or use Test Event Code) and confirm **Purchase** appears as **Server** (or Browser + Server deduped).

## Verify

- Events Manager → Overview / Test Events → look for `Purchase` with matching `event_id`.
- Server logs: `Meta CAPI Purchase sent: cs_...` or `paypal:...`
- If token missing: `Meta CAPI not configured` warning on startup (checkout still works).

## Files

- `lib/meta-capi.js` — hashing + Graph API call
- `server.js` — Stripe webhook + PayPal capture + checkout metadata
- `js/checkout-page.js` — sends `_fbp` / `_fbc` into Stripe session create and PayPal capture
