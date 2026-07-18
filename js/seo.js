/**
 * Shared SEO helper for static ZYBAR pages.
 * Each page can define window.ZYBAR_SEO before loading this script.
 */
(function () {
  'use strict';

  function upsertMeta(attribute, name, content) {
    if (!content) return;
    var selector = 'meta[' + attribute + '="' + name + '"]';
    var tag = document.head.querySelector(selector);
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute(attribute, name);
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
  }

  function upsertLink(rel, href, attrs) {
    if (!href) return;
    var selector = 'link[rel="' + rel + '"]';
    if (attrs && attrs.sizes) selector += '[sizes="' + attrs.sizes + '"]';
    if (attrs && attrs.type) selector += '[type="' + attrs.type + '"]';
    var link = document.head.querySelector(selector);
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', rel);
      document.head.appendChild(link);
    }
    link.setAttribute('href', href);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        link.setAttribute(key, attrs[key]);
      });
    }
  }

  function ensureFavicons() {
    upsertLink('icon', '/favicon.ico?v=3', { sizes: 'any' });
    upsertLink('icon', '/favicon-32.png?v=3', { type: 'image/png', sizes: '32x32' });
    upsertLink('icon', '/favicon-48.png?v=3', { type: 'image/png', sizes: '48x48' });
    upsertLink('icon', '/favicon-192.png?v=3', { type: 'image/png', sizes: '192x192' });
    upsertLink('apple-touch-icon', '/apple-touch-icon.png?v=3', { sizes: '180x180' });
  }

  function normalizePath(pathname) {
    if (!pathname) return window.location.pathname || '/';
    return pathname.charAt(0) === '/' ? pathname : '/' + pathname;
  }

  function toAbsoluteUrl(value) {
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    return window.location.origin + normalizePath(value);
  }

  function applySeo(config) {
    if (!config) return;

    var title = config.title || document.title;
    var description = config.description || '';
    var keywords = config.keywords || '';
    var canonicalUrl = toAbsoluteUrl(config.path || window.location.pathname || '/');
    var imageUrl = toAbsoluteUrl(config.image || '');
    var ogType = config.type || 'website';

    if (title) document.title = title;
    if (description) upsertMeta('name', 'description', description);
    if (keywords) upsertMeta('name', 'keywords', keywords);

    upsertLink('canonical', canonicalUrl);
    upsertMeta('property', 'og:type', ogType);
    upsertMeta('property', 'og:site_name', 'ZYBAR');
    if (title) upsertMeta('property', 'og:title', title);
    if (description) upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', canonicalUrl);
    if (imageUrl) upsertMeta('property', 'og:image', imageUrl);

    upsertMeta('name', 'twitter:card', 'summary_large_image');
    if (title) upsertMeta('name', 'twitter:title', title);
    if (description) upsertMeta('name', 'twitter:description', description);
    if (imageUrl) upsertMeta('name', 'twitter:image', imageUrl);

    ensureFavicons();
  }

  window.applyZybarSeo = applySeo;
  ensureFavicons();
  applySeo(window.ZYBAR_SEO || {});
})();
