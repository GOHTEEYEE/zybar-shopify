# ZYBAR – SEO requirements

**Every time you modify the site, add new features, or create new pages, ensure the website remains fully optimized for SEO.** This applies to all static HTML/CSS/JS pages.

---

## 1. Page SEO structure

Every page must include:

- **Unique `<title>`** – Include primary keyword and brand (e.g. `Product Name | ZYBAR`).
- **Meta description** – `<meta name="description" content="…">` (unique, 150–160 chars ideal).
- **Canonical URL** – `<link rel="canonical" href="https://zybar.com/…">` (use your live domain; replace `https://zybar.com` if different).
- **Viewport** – `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`.

---

## 2. Heading structure

- **Exactly ONE H1** per page (main topic).
- Use **H2** for major sections, **H3** for subsections.
- Example for product pages: **H1** = Product name; **H2** = Product details; **H2** = Specifications.

---

## 3. Image SEO

- **Descriptive file names** (e.g. `audi-r8-led-wall-art.png`).
- **Alt text** on every `<img>` describing the image (e.g. `Audi R8 LED wall art glowing in dark room`).

---

## 4. URL optimization

- Use **clean, SEO-friendly URLs**.
- Good: `/products/audi-r8-led-wall-art`, `/collections/all/`.
- Avoid: `/product?id=123`.

---

## 5. Structured data (product pages)

For product pages, include **JSON-LD** using schema.org **Product**:

- `name`, `image` (absolute URL), `description`, `brand` (Brand name), `offers` (price, priceCurrency, availability).

Example (in `<head>`):

```html
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"…","description":"…","image":"https://zybar.com/Image/…","brand":{"@type":"Brand","name":"ZYBAR"},"offers":{"@type":"Offer","price":"140","priceCurrency":"USD","availability":"https://schema.org/InStock"}}
</script>
```

---

## 6. Performance SEO

- **Images**: use `loading="lazy"` except for above-the-fold hero images (`loading="eager"` or omit).
- **Scripts**: use `async` or `defer` when possible (e.g. `<script defer src="…">` or `async`).

---

## 7. Sitemap

- When **new pages** are added, **update `sitemap.xml`** in the project root.
- Use absolute URLs with your live domain (e.g. `https://zybar.com/…`).
- Include: homepage, collections, all product URLs, policy pages. Exclude admin.

---

## 8. Robots file

- **robots.txt** in project root must:
  - Allow crawling of public pages (`Allow: /`).
  - Disallow admin: `Disallow: /admin/`.
  - Reference sitemap: `Sitemap: https://zybar.com/sitemap.xml`.

---

## 9. Internal linking

When adding new pages:

- Link from **homepage** and/or **navigation** if relevant.
- Link from **relevant product or collection pages** where it makes sense.

---

## 10. Mobile SEO

- All pages must remain **responsive** and **mobile-friendly** (viewport, flexible layout, touch-friendly).

---

## 11. Admin pages

- Any **admin** page (e.g. `/admin/`, `/admin/#dashboard`) must include:

```html
<meta name="robots" content="noindex, nofollow" />
```

so they are not indexed.

---

## 12. Do not break existing SEO

When modifying code:

- **Preserve** existing meta tags, canonical, headings, and structured data unless intentionally improving them.
- After edits, confirm: one H1, meta description, canonical, and (on product pages) JSON-LD and image alt text are still correct.

---

**Base URL:** Canonicals, sitemap, robots, and JSON-LD image URLs use `https://zybar.com`. Replace with your live domain when deploying if different.
