/**
 * TypeScript interfaces for Stripe Checkout Session metadata and webhook payloads.
 * Use these in backend and frontend for type-safe session metadata and event handling.
 */

/** Metadata you attach to the Checkout Session (e.g. product slug, size). */
export interface CheckoutSessionMetadata {
  productSlug?: string;
  size?: string;
  quantity?: string;
  cartItems?: string;
}

/** Request body for creating a Checkout Session (your API). */
export interface CheckoutLineItemRequest {
  priceId: string;
  quantity: number;
}

/** Request body for creating a Checkout Session (your API). */
export interface CreateCheckoutSessionRequest {
  priceId?: string;
  quantity?: number;
  lineItems?: CheckoutLineItemRequest[];
  successUrl?: string;
  cancelUrl?: string;
  returnUrl?: string;
  embedded?: boolean;
  productSlug?: string;
  size?: string;
}

/** Response from your create-checkout-session API. */
export interface CreateCheckoutSessionResponse {
  url?: string;
  clientSecret?: string;
  sessionId?: string;
}

/** Stripe checkout.session.completed event payload (event.data.object). */
export interface StripeCheckoutSessionCompletedPayload {
  id: string;
  object: 'checkout.session';
  amount_total: number | null;
  currency: string | null;
  customer_email: string | null;
  payment_status: string;
  status: 'complete' | 'expired' | 'open';
  metadata?: Record<string, string>;
  [key: string]: unknown;
}

/** Stripe webhook event envelope (event.data.object is the session for checkout.session.completed). */
export interface StripeWebhookEvent {
  id: string;
  object: 'event';
  type: string;
  data: {
    object: StripeCheckoutSessionCompletedPayload;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
