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

## 4. Sync products and prices to Stripe (recommended)

Catalog and amounts live in `data/products.json` (slugs, names, `pricesBySize`).
For product-specific overrides (e.g. one product at $10 / $20), set `perProductPricesBySize`.
To create or update Stripe Products and Price IDs and write them into `js/stripe-config.js`:

1. Set `STRIPE_SECRET_KEY` in `.env` (same account as your publishable key).
2. Run:

   ```bash
   npm run sync-stripe
   ```

3. This also writes `data/stripe-price-ids.json` as a backup snapshot.

If prices change in `data/products.json`, run `npm run sync-stripe` again; the script reuses Stripe Products by `metadata.slug` and creates new Prices when amounts change.

### Automated safe production release

Run one command to avoid drift between website price, Stripe price IDs, and production deploy:

```bash
npm run release:prod
```

It performs:

1. `npm run sync-stripe` (regenerates IDs from `data/products.json`)
2. `npm run validate-stripe` (checks active IDs + amount matches + slug mapping)
3. `npx vercel --prod` (deploys verified config)

## 5. Frontend config

In `js/stripe-config.js`:

- Set `publishableKey` to your Stripe **publishable** key (Dashboard → API keys).
- Set `sharedPriceIdsBySize` (or per-product `prices`) to your Stripe **Price IDs** (Dashboard → Products → Prices, or create products/prices via API).
- Optionally set `successUrl` and `cancelUrl`; if omitted, success goes to `/collections/all/?checkout=success` and cancel returns to the current page.
- If your API is on a different origin, set `apiBaseUrl` (e.g. `https://api.example.com`).

## 6. API overview

- **POST /api/create-checkout-session**  
  Body (single item): `{ priceId, quantity, successUrl, cancelUrl, productSlug?, size? }`  
  Body (cart / multiple items): `{ lineItems: [{ priceId, quantity }], successUrl, cancelUrl }`  
  Returns: `{ url, sessionId }`. Frontend redirects the user to `url`.

- **POST /api/webhook**  
  Raw body; verified with `Stripe-Signature` and `STRIPE_WEBHOOK_SECRET`. Handles `checkout.session.completed` (e.g. fulfill order or persist to DB).

## 7. TypeScript types

See `types/stripe.d.ts` for:

- `CheckoutSessionMetadata`, `CreateCheckoutSessionRequest`, `CreateCheckoutSessionResponse`
- `StripeCheckoutSessionCompletedPayload`, `StripeWebhookEvent`

Use these in backend or frontend TypeScript for session metadata and webhook payloads.
