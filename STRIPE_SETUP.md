# Stripe payment integration

This project uses Stripe Checkout (hosted page) with a backend that creates sessions and handles webhooks.

## 1. Environment variables

Copy `.env.example` to `.env` and set:

| Variable | Where to get it |
|----------|------------------|
| `STRIPE_SECRET_KEY` | [Stripe Dashboard](https://dashboard.stripe.com/apikeys) → API keys → Secret key (use **Test** key for development). |
| `STRIPE_WEBHOOK_SECRET` | For **local** testing: from Stripe CLI (see below). For **production**: Dashboard → Developers → Webhooks → Add endpoint → select `checkout.session.completed` → copy “Signing secret”. |

## 2. Run the server

Use the Node server (not the static `serve` dev server) so the API and webhook are available:

```bash
npm run server
```

Then open the site at `http://localhost:3000` (or the port you set in `PORT`).

## 3. Local webhook testing

Stripe cannot send webhooks to `localhost` directly. Use the Stripe CLI to forward events to your app:

1. [Install the Stripe CLI](https://stripe.com/docs/stripe-cli).
2. Log in: `stripe login`.
3. Forward webhooks to your local server:

   ```bash
   stripe listen --forward-to localhost:3000/api/webhook
   ```

4. The CLI will print a **webhook signing secret** (e.g. `whsec_...`). Put that value in your `.env` as `STRIPE_WEBHOOK_SECRET`.
5. Restart your Node server after updating `.env`.

Keep `stripe listen` running while testing payments; completing a checkout will trigger `checkout.session.completed` and you’ll see it in the CLI and in your server logs.

## 4. Frontend config

In `js/stripe-config.js`:

- Set `publishableKey` to your Stripe **publishable** key (Dashboard → API keys).
- Set `sharedPriceIdsBySize` (or per-product `prices`) to your Stripe **Price IDs** (Dashboard → Products → Prices, or create products/prices via API).
- Optionally set `successUrl` and `cancelUrl`; if omitted, success goes to `/collections/all/?checkout=success` and cancel returns to the current page.
- If your API is on a different origin, set `apiBaseUrl` (e.g. `https://api.example.com`).

## 5. API overview

- **POST /api/create-checkout-session**  
  Body: `{ priceId, quantity, successUrl, cancelUrl, productSlug?, size? }`  
  Returns: `{ url, sessionId }`. Frontend redirects the user to `url`.

- **POST /api/webhook**  
  Raw body; verified with `Stripe-Signature` and `STRIPE_WEBHOOK_SECRET`. Handles `checkout.session.completed` (e.g. fulfill order or persist to DB).

## 6. TypeScript types

See `types/stripe.d.ts` for:

- `CheckoutSessionMetadata`, `CreateCheckoutSessionRequest`, `CreateCheckoutSessionResponse`
- `StripeCheckoutSessionCompletedPayload`, `StripeWebhookEvent`

Use these in backend or frontend TypeScript for session metadata and webhook payloads.
