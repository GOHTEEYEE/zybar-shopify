/**
 * Newsletter / premium popup contracts.
 * The storefront is vanilla JS; these types document the API shape.
 */

export type NewsletterLanguage = 'en' | 'fr' | 'de' | 'es' | 'it' | 'nl';

export interface NewsletterSubscribeRequest {
  email: string;
  language?: NewsletterLanguage | string;
  source?: string;
  userAgent?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  country?: string;
}

export interface NewsletterSubscribeResponse {
  ok: boolean;
  alreadyMember?: boolean;
  message?: string;
  discountCode?: string;
  subscriberId?: string;
  emailSent?: boolean;
  error?: string;
}

export interface NewsletterSubscriberRow {
  id: string;
  email: string;
  language: string;
  discount_code: string;
  source: string;
  browser: string | null;
  country: string | null;
  device: string | null;
  created_at: string;
  status: 'active' | 'unsubscribed' | 'bounced';
  used_discount: boolean;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}
