/**
 * ZYBAR Stripe Checkout handler.
 * Uses Stripe Price IDs from window.ZYBAR_STRIPE_CONFIG.
 */
(function () {
  "use strict";
  var CART_STORAGE_KEY = "zybar.cart.items";
  var CHECKOUT_PENDING_KEY = "zybar.checkout.pending";
  var cartDelegationBound = false;
  var checkoutStripe = null;

  function guardAddToCartLinks() {
    document.querySelectorAll(".product-add-cart, .pdp-sticky-cta").forEach(function (button) {
      if (button.tagName === "A") {
        button.setAttribute("href", "#");
        button.setAttribute("role", "button");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", guardAddToCartLinks);
  } else {
    guardAddToCartLinks();
  }

  function getProductSlug() {
    var path = (window.location && window.location.pathname) || "";
    // Accept both `/products/slug/` and `/products/slug` URLs.
    var match = path.match(/\/products\/([^/]+)(?:\/|$)/);
    return match ? match[1] : "";
  }

  function getSelectedSize() {
    var selected = document.querySelector(".product-size-options .size-option.selected");
    if (selected && selected.getAttribute("data-size")) return selected.getAttribute("data-size");
    return "30x45";
  }

  function getSelectedPowerType() {
    var selected =
      document.querySelector(".product-power-options .power-type-option.selected") ||
      document.querySelector(".product-power-options .power-option.selected");
    if (selected) {
      return (
        selected.getAttribute("data-power-type") ||
        selected.getAttribute("data-power") ||
        "usb"
      );
    }
    return "usb";
  }

  function isCustomProductSlug(slug) {
    slug = slug || getProductSlug();
    if (window.ZYBAR && window.ZYBAR.CustomProduct && window.ZYBAR.CustomProduct.isActive()) {
      return true;
    }
    if (window.ZYBAR && window.ZYBAR.ProductTypes && window.ZYBAR.ProductTypes.isCustomSlug) {
      return window.ZYBAR.ProductTypes.isCustomSlug(slug);
    }
    return String(slug || "") === "custom-led-car-wall-art";
  }

  function getConfig() {
    return window.ZYBAR_STRIPE_CONFIG || {};
  }

  function getPricing() {
    return window.ZYBAR && window.ZYBAR.Pricing ? window.ZYBAR.Pricing : null;
  }

  function powerTypeToLabel(powerType) {
    var pricing = getPricing();
    if (pricing) return pricing.powerTypeToLabel(powerType);
    if (powerType === "dual") return "USB + Battery";
    return "USB Only";
  }

  function buildVariantKey(slug, size, powerType) {
    return String(slug || "") + "::" + String(size || "") + "::" + String(powerType || "usb");
  }

  /** Member tier code to auto-apply for a server-recognized member. */
  function getAutoDiscountCode(subtotalUSD) {
    var member = window.ZYBAR && window.ZYBAR.MemberPricing;
    if (!member || !member.isActive()) return "";
    var summary = window.ZYBAR && window.ZYBAR.PricingSummary;
    return summary && summary.computeWelcomeDiscountUSD(subtotalUSD) > 0
      ? member.getDiscountCode()
      : "";
  }

  function getQuantity() {
    var qtyEl = document.querySelector(".product-quantity span");
    var qty = qtyEl ? parseInt(qtyEl.textContent, 10) : 1;
    return Number.isFinite(qty) && qty > 0 ? qty : 1;
  }

  function getProductName() {
    var heading = document.querySelector("h1");
    return heading ? String(heading.textContent || "").trim() : getProductSlug();
  }

  function getProductImageUrlBySlug(slug) {
    return slug ? "/Image/" + slug + "-1.webp" : "";
  }

  /** Hero image for cart/checkout — never a shared-gallery or other PDP thumb. */
  function getDefaultProductImageUrl(slug) {
    slug = slug || getProductSlug();
    if (!slug) return "";
    return encodeMediaUrl(getProductImageUrlBySlug(slug));
  }

  function resolveDefaultProductImageUrl(slug) {
    slug = slug || getProductSlug();
    if (!slug) return Promise.resolve("");
    return pickImageForSlot(slug, 1, "off", "").then(function (offSrc) {
      if (offSrc) return offSrc;
      return pickImageForSlot(slug, 1, "on", "");
    }).then(function (url) {
      return url || getDefaultProductImageUrl(slug);
    });
  }

  function isNonProductCartImage(url, slug) {
    var norm = normalizeImageUrl(url);
    if (!norm) return true;
    if (norm.indexOf("/shared-gallery/") !== -1) return true;
    if (!slug) return false;
    return norm.indexOf("/Image/" + slug + "-") !== 0;
  }

  function getCartItemImageUrl(item) {
    var slug = item && item.slug ? item.slug : "";
    var url = item && item.imageUrl ? item.imageUrl : "";
    if (!isNonProductCartImage(url, slug)) return encodeMediaUrl(url);
    return getDefaultProductImageUrl(slug);
  }

  /** Cart/checkout thumb: try .jpg then -on.webp if the primary src 404s. */
  function onProductThumbError(img) {
    if (!img) return;
    var step = Number(img.getAttribute("data-fallback-step") || "0");
    var src = String(img.getAttribute("src") || "");
    var next = "";
    if (step === 0 && /\.webp$/i.test(src)) {
      next = src.replace(/\.webp$/i, ".jpg");
    } else if (step <= 1) {
      next = src.replace(/-(\d+)(?:-on)?\.(webp|jpe?g|png)$/i, "-$1-on.webp");
      if (next === src) next = "";
    }
    img.setAttribute("data-fallback-step", String(step + 1));
    if (next && next !== src) {
      img.src = next;
      return;
    }
    img.onerror = null;
  }

  function readCartItems() {
    try {
      var raw = window.localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function writeCartItems(items) {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items || []));
    } catch (_) {}
  }

  function updateCartItemQuantity(itemKey, delta) {
    var key = String(itemKey || "");
    if (!key) return readCartItems();
    var nextItems = readCartItems().map(function (item) {
      if (!item || item.key !== key) return item;
      var nextQty = (Number(item.quantity) || 0) + Number(delta || 0);
      item.quantity = nextQty;
      return item;
    }).filter(function (item) {
      return item && Number(item.quantity) > 0;
    });
    writeCartItems(nextItems);
    refreshCartBadge();
    return nextItems;
  }

  function removeCartItem(itemKey) {
    var key = String(itemKey || "");
    if (!key) return readCartItems();
    var nextItems = readCartItems().filter(function (item) {
      return item && item.key !== key;
    });
    writeCartItems(nextItems);
    refreshCartBadge();
    return nextItems;
  }

  function getCartTotalCount() {
    return readCartItems().reduce(function (sum, item) {
      var qty = Number(item && item.quantity);
      return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
    }, 0);
  }

  function getOrCreateCartBadge(cartLink) {
    if (!cartLink) return null;
    var badge = cartLink.querySelector(".zybar-cart-badge");
    if (badge) return badge;
    badge = document.createElement("span");
    badge.className = "zybar-cart-badge";
    badge.style.cssText = [
      "position:absolute",
      "top:-6px",
      "right:-8px",
      "min-width:18px",
      "height:18px",
      "padding:0 5px",
      "border-radius:999px",
      "background:#111",
      "color:#fff",
      "font-size:11px",
      "line-height:18px",
      "text-align:center",
      "font-weight:700",
      "display:none",
      "box-sizing:border-box"
    ].join(";");
    var currentStyle = cartLink.getAttribute("style") || "";
    if (currentStyle.indexOf("position:relative") === -1) {
      cartLink.setAttribute("style", currentStyle + (currentStyle ? ";" : "") + "position:relative");
    }
    cartLink.appendChild(badge);
    return badge;
  }

  function refreshCartBadge() {
    var cartLink = document.querySelector(".header-actions a[aria-label='Cart']");
    if (!cartLink) return;
    var total = getCartTotalCount();
    var badge = getOrCreateCartBadge(cartLink);
    if (!badge) return;
    if (total > 0) {
      badge.textContent = String(total > 99 ? "99+" : total);
      badge.style.display = "inline-block";
    } else {
      badge.textContent = "";
      badge.style.display = "none";
    }
  }

  function getCartLink() {
    return document.querySelector(".header-actions a[aria-label='Cart']");
  }

  function getCartDialog() {
    return document.getElementById("zybar-cart-dialog");
  }

  function removeCartDialog() {
    var existing = getCartDialog();
    if (existing) existing.remove();
  }

  function createCartDialog() {
    window.location.href = "/cart/";
  }

  function wireCartClick() {
    var cartLink = getCartLink();
    if (!cartLink) return;
    cartLink.setAttribute("href", "/cart/");
  }

  function beginCartCheckout(items, button) {
    var pricing = getPricing();
    if (!pricing) {
      alert("Pricing is not available. Please refresh the page.");
      return;
    }
    var config = getConfig();
    var successUrl = config.successUrl || (window.location.origin + "/purchase-confirmation.html?session_id={CHECKOUT_SESSION_ID}");
    var cancelUrl = config.cancelUrl || window.location.href;
    var shippingMethod = pricing.readShippingMethod();
    var validItems = (items || [])
      .map(function (item) {
        if (!item) return null;
        var size = pricing.normalizeSize(item.size);
        var powerType = pricing.normalizePowerType(item.powerType);
        var qty = Number(item.quantity);
        if (!Number.isFinite(qty) || qty < 1) return null;
        return {
          quantity: qty,
          productSlug: String(item.slug ? item.slug : ""),
          slug: String(item.slug ? item.slug : ""),
          size: size,
          powerType: powerType,
          name: String(item.name ? item.name : "Product"),
          productType: item.productType || (isCustomProductSlug(item.slug) ? "custom" : "standard"),
          unitAmountUSD: pricing.calculateProductUnitPrice({
            slug: String(item.slug ? item.slug : ""),
            productSlug: String(item.slug ? item.slug : ""),
            size: size,
            powerType: powerType
          }),
          baseUnitPriceUSD: item.baseUnitPriceUSD,
          customDesignFeeUSD: item.customDesignFeeUSD,
          customConfig: item.customConfig || null
        };
      })
      .filter(Boolean);

    if (!validItems.length) {
      alert("Your cart is empty or has invalid items. Please re-add items and try again.");
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Redirecting...";
    }

    var cartValue = validItems.reduce(function (sum, item) {
      return sum + (Number(item.unitAmountUSD) || 0) * (Number(item.quantity) || 1);
    }, 0);
    if (window.ZYBAR && window.ZYBAR.Analytics) {
      window.ZYBAR.Analytics.trackBeginCheckout(items, cartValue);
    }

    goToPremiumCheckout({
      lineItems: validItems,
      shippingMethod: shippingMethod,
      discountCode: getAutoDiscountCode(cartValue),
      displayItems: buildDisplayItemsFromCart(
        (items || []).filter(function (item) {
          return (
            item &&
            validItems.some(function (v) {
              return (
                v.productSlug === item.slug &&
                v.size === pricing.normalizeSize(item.size) &&
                v.powerType === pricing.normalizePowerType(item.powerType)
              );
            })
          );
        })
      ),
      successUrl: successUrl,
      cancelUrl: cancelUrl
    });
  }

  function getPrimaryProductImage() {
    return document.querySelector(".product-showcase-image img") || document.querySelector(".product-showcase img");
  }

  function normalizeImageUrl(url) {
    if (!url) return "";
    var clean = String(url).split("?")[0];
    var a = document.createElement("a");
    a.href = clean;
    return (a.pathname || clean).replace(/\/{2,}/g, "/");
  }

  /** Encode each path segment once (safe if JSON already encoded). */
  function encodePathSegment(segment) {
    if (!segment) return segment;
    try {
      return encodeURIComponent(decodeURIComponent(segment));
    } catch (e) {
      return encodeURIComponent(segment);
    }
  }

  /** Encode path segments so spaces/unicode work in img src on production. */
  function encodeMediaUrl(url) {
    var path = normalizeImageUrl(url);
    if (!path) return "";
    return path.split("/").map(function (segment, index) {
      if (!segment) return index === 0 ? "" : segment;
      return encodePathSegment(segment);
    }).join("/");
  }

  /** True only when the URL returns real image/video bytes (not SPA index.html). */
  var imageExistenceCache = Object.create(null);

  function headMediaExists(url) {
    var key = normalizeImageUrl(url);
    if (!key) return Promise.resolve(false);
    if (imageExistenceCache[key] === true) return Promise.resolve(true);
    if (imageExistenceCache[key] === false) return Promise.resolve(false);

    var requestUrl = encodeMediaUrl(url);
    return fetch(requestUrl, { method: "HEAD", cache: "force-cache" })
      .then(function (res) {
        if (!res || !res.ok) {
          imageExistenceCache[key] = false;
          return false;
        }
        var contentType = (res.headers.get("content-type") || "").toLowerCase();
        var ok = contentType.indexOf("image/") === 0 || contentType.indexOf("video/") === 0;
        imageExistenceCache[key] = ok;
        return ok;
      })
      .catch(function () {
        imageExistenceCache[key] = false;
        return false;
      });
  }

  function headImageExists(url) {
    return headMediaExists(url);
  }

  function getImageLogicalKey(url) {
    var normalized = normalizeImageUrl(url);
    var match = normalized.match(/\/Image\/(.+)-(\d+)(-on)?\.(webp|jpg|jpeg|png)$/i);
    if (!match) return normalized;
    return match[1] + "-" + match[2] + (match[3] || "");
  }

  function pickImageForSlot(slug, index, variant, mainSrc) {
    var exts = ["webp", "jpg"];
    var suffix = variant === "on" ? "-on" : "";
    var logicalKey = slug + "-" + index + suffix;
    var mainNorm = normalizeImageUrl(mainSrc || "");
    if (mainNorm && getImageLogicalKey(mainNorm) === logicalKey) {
      return Promise.resolve(encodeMediaUrl(mainNorm));
    }
    var chain = Promise.resolve("");
    exts.forEach(function (ext) {
      chain = chain.then(function (found) {
        if (found) return found;
        var url = "/Image/" + slug + "-" + index + suffix + "." + ext;
        return headImageExists(url).then(function (ok) {
          return ok ? encodeMediaUrl(url) : "";
        });
      });
    });
    return chain;
  }

  function resolveGalleryImages(mainSrc, slug) {
    if (!slug) {
      var only = normalizeImageUrl(mainSrc);
      return Promise.resolve(only ? [encodeMediaUrl(only)] : []);
    }

    var images = [];

    function collectSlot(slot) {
      if (slot > 8) return Promise.resolve(images);
      return pickImageForSlot(slug, slot, "off", mainSrc).then(function (offSrc) {
        if (!offSrc) return images;
        images.push(offSrc);
        return pickImageForSlot(slug, slot, "on", mainSrc).then(function (onSrc) {
          if (onSrc && getImageLogicalKey(onSrc) !== getImageLogicalKey(offSrc)) {
            images.push(onSrc);
          }
          return collectSlot(slot + 1);
        });
      });
    }

    return collectSlot(1);
  }

  function pickFirstExisting(basePath, exts) {
    var chain = Promise.resolve("");
    exts.forEach(function (ext) {
      chain = chain.then(function (found) {
        if (found) return found;
        var url = basePath + "." + ext;
        return headImageExists(url).then(function (ok) {
          return ok ? url : "";
        });
      });
    });
    return chain;
  }

  var sharedGalleryCache = null;

  function isInformationalGallerySrc(src) {
    var path = String(src || "").toLowerCase();
    if (!path) return false;
    if (/\/shared-gallery\/info\//.test(path)) return true;
    if (/(^|\/|-)(info|faq|guide|manual)([-_.]|$)/.test(path)) return true;
    return /usb|adapter|remote|install|faq|guide|manual|packaging|packing|accessory|power.?adapter|wall.?plug|instructions?|infographic|comparison/.test(
      path
    );
  }

  function isGalleryShowcaseItem(item) {
    if (!item || !item.src) return false;
    if (item.gallery === false || item.role === "info" || item.kind === "info") return false;
    if (item.label === "product") return !isInformationalGallerySrc(item.src);
    if (item.type === "video") return true;
    return !isInformationalGallerySrc(item.src);
  }

  function normalizeGalleryItem(raw) {
    if (!raw || !raw.src) return null;
    var type = raw.type === "video" ? "video" : "image";
    return {
      type: type,
      src: encodeMediaUrl(raw.src),
      poster: raw.poster ? encodeMediaUrl(raw.poster) : "",
      label: raw.label || "shared",
      role: raw.role || raw.kind || "",
      gallery: raw.gallery
    };
  }

  function splitGalleryMedia(items) {
    var showcase = [];
    var included = [];
    (items || []).forEach(function (item) {
      if (isGalleryShowcaseItem(item)) showcase.push(item);
      else included.push(item);
    });
    return { showcase: showcase, included: included };
  }

  function renderIncludedMediaSection(items) {
    /* Included & Guides section removed from PDP */
    return;
  }

  function validateGalleryItems(items) {
    var tasks = (items || []).map(function (item) {
      if (!item || !item.src) return Promise.resolve(null);
      return headImageExists(item.src).then(function (ok) {
        if (!ok) return null;
        if (item.type !== "video") return item;
        if (!item.poster) return item;
        return headImageExists(item.poster).then(function (posterOk) {
          if (!posterOk) item.poster = "";
          return item;
        });
      });
    });
    return Promise.all(tasks).then(function (results) {
      return results.filter(Boolean);
    });
  }

  function loadSharedGalleryFromJson() {
    return fetch("/data/shared-gallery.json", { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) return [];
        return res.json();
      })
      .then(function (data) {
        var raw = data && Array.isArray(data.items) ? data.items : [];
        var normalized = raw.map(normalizeGalleryItem).filter(Boolean);
        return validateGalleryItems(normalized);
      })
      .catch(function () {
        return [];
      });
  }

  function resolveSharedGalleryMedia() {
    if (sharedGalleryCache) return Promise.resolve(sharedGalleryCache.slice());
    return loadSharedGalleryFromJson().then(function (jsonItems) {
      sharedGalleryCache = jsonItems;
      return jsonItems.slice();
    });
  }

  function resolveGalleryMedia(mainSrc, slug) {
    return resolveGalleryImages(mainSrc, slug).then(function (images) {
      var productItems = images.map(function (src) {
        return { type: "image", src: src, label: "product" };
      });
      return resolveSharedGalleryMedia().then(function (sharedItems) {
        return splitGalleryMedia(productItems.concat(sharedItems));
      });
    });
  }

  function getGalleryMediaKey(item) {
    if (!item) return "";
    return item.type + "|" + normalizeImageUrl(item.src);
  }

  function setActiveGalleryThumb(thumbWrap, item) {
    if (!thumbWrap) return;
    var currentKey = getGalleryMediaKey(item);
    var buttons = thumbWrap.querySelectorAll(".pdp-gallery-thumb");
    buttons.forEach(function (button) {
      var btnKey = (button.getAttribute("data-type") || "image") + "|" +
        normalizeImageUrl(button.getAttribute("data-src") || "");
      var isActive = btnKey === currentKey;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function configurePremiumVideo(video) {
    if (!video) return;
    video.controls = false;
    video.autoplay = true;
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.preload = "auto";
    video.setAttribute("controlsList", "nodownload noplaybackrate nofullscreen");
    video.setAttribute("disablePictureInPicture", "");
    video.setAttribute("disableRemotePlayback", "");
    video.setAttribute("tabindex", "-1");
    video.classList.add("zybar-premium-video");
  }

  function getOrCreateGalleryVideo(inner) {
    var video = inner.querySelector(".pdp-gallery-video");
    if (video) {
      configurePremiumVideo(video);
      return video;
    }
    video = document.createElement("video");
    video.className = "pdp-gallery-video";
    configurePremiumVideo(video);
    inner.appendChild(video);
    return video;
  }

  function showGalleryMedia(mainImage, inner, item) {
    if (!mainImage || !inner || !item) return;
    var video = getOrCreateGalleryVideo(inner);
    var stage = inner.closest(".pdp-gallery-stage");
    var zoomBtn = stage && stage.querySelector(".pdp-gallery-zoom");
    var callout = stage && stage.querySelector(".pdp-gallery-callout");
    if (item.type === "video") {
      mainImage.style.display = "none";
      video.style.display = "block";
      if (video.getAttribute("src") !== item.src) {
        video.src = item.src;
        if (item.poster) video.setAttribute("poster", item.poster);
        else video.removeAttribute("poster");
      }
      video.muted = true;
      video.play().catch(function () {});
      if (zoomBtn) zoomBtn.hidden = true;
      if (callout) callout.classList.add("is-hidden");
      return;
    }
    video.pause();
    video.style.display = "none";
    mainImage.style.display = "block";
    crossfadeSwapImage(mainImage, item.src, 220);
    var stickyThumb = document.querySelector(".pdp-sticky-thumb img");
    if (stickyThumb) crossfadeSwapImage(stickyThumb, item.src, 220);
    if (zoomBtn) zoomBtn.hidden = false;
    if (callout) callout.classList.remove("is-hidden");
  }

  function crossfadeSwapImage(imgEl, nextSrc, durationMs) {
    if (!imgEl || !nextSrc) return;
    var currentSrc = imgEl.getAttribute("src") || "";
    if (!currentSrc || currentSrc === nextSrc) {
      imgEl.src = nextSrc;
      return;
    }
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      imgEl.src = nextSrc;
      return;
    }

    var holder = imgEl.parentElement;
    if (!holder) {
      imgEl.src = nextSrc;
      return;
    }

    if (window.getComputedStyle(holder).position === "static") {
      holder.style.position = "relative";
    }

    var overlay = document.createElement("img");
    overlay.setAttribute("aria-hidden", "true");
    overlay.alt = "";
    overlay.src = currentSrc;
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.objectFit = window.getComputedStyle(imgEl).objectFit || "cover";
    overlay.style.objectPosition = window.getComputedStyle(imgEl).objectPosition || "center";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "2";
    overlay.style.opacity = "1";
    overlay.style.transform = "scale(1)";
    overlay.style.transition =
      "opacity " + durationMs + "ms ease, transform " + durationMs + "ms ease";

    imgEl.style.transition =
      "opacity " + durationMs + "ms ease, transform " + durationMs + "ms ease";
    imgEl.style.opacity = "0";
    imgEl.style.transform = "scale(1.02)";
    holder.appendChild(overlay);
    imgEl.src = nextSrc;

    requestAnimationFrame(function () {
      overlay.style.opacity = "0";
      overlay.style.transform = "scale(0.985)";
      imgEl.style.opacity = "1";
      imgEl.style.transform = "scale(1)";
    });

    setTimeout(function () {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      imgEl.style.transform = "";
    }, durationMs + 40);
  }

  function isGalleryKeyboardBlocked(target) {
    if (!target) return false;
    var tag = (target.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (target.isContentEditable) return true;
    return false;
  }

  function scrollGalleryThumbIntoView(thumbs, index) {
    if (!thumbs || index < 0) return;
    var button = thumbs.children[index];
    if (button && button.scrollIntoView) {
      button.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }

  function findGalleryIndex(items, item) {
    var key = getGalleryMediaKey(item);
    for (var i = 0; i < items.length; i += 1) {
      if (getGalleryMediaKey(items[i]) === key) return i;
    }
    return 0;
  }

  function wireGalleryKeyboard(items, mainImage, inner, thumbs, showcase) {
    if (!items || items.length < 2) return;

    var currentIndex = 0;

    function selectGalleryAt(index) {
      if (!items.length) return;
      currentIndex = (index + items.length) % items.length;
      var item = items[currentIndex];
      showGalleryMedia(mainImage, inner, item);
      setActiveGalleryThumb(thumbs, item);
      scrollGalleryThumbIntoView(thumbs, currentIndex);
    }

    function onGalleryKeydown(event) {
      if (isGalleryKeyboardBlocked(event.target)) return;
      var key = event.key;
      if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "ArrowUp" && key !== "ArrowDown") {
        return;
      }
      event.preventDefault();
      if (key === "ArrowRight" || key === "ArrowDown") selectGalleryAt(currentIndex + 1);
      else selectGalleryAt(currentIndex - 1);
    }

    showcase.setAttribute("tabindex", "0");
    showcase.setAttribute("aria-label", "Product gallery. Use arrow keys to change image.");
    document.addEventListener("keydown", onGalleryKeydown);

    return {
      selectAt: selectGalleryAt,
      setIndex: function (index) {
        currentIndex = index;
      },
      getIndex: function () {
        return currentIndex;
      }
    };
  }

  function getOrCreateGalleryLightbox() {
    var existing = document.getElementById("pdp-gallery-lightbox");
    if (existing) return existing;

    var lightbox = document.createElement("div");
    lightbox.id = "pdp-gallery-lightbox";
    lightbox.className = "pdp-gallery-lightbox";
    lightbox.setAttribute("aria-hidden", "true");

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "pdp-gallery-lightbox-close";
    closeBtn.setAttribute("aria-label", "Close zoomed image");
    closeBtn.innerHTML = "&times;";

    var image = document.createElement("img");
    image.alt = "";

    lightbox.appendChild(closeBtn);
    lightbox.appendChild(image);
    document.body.appendChild(lightbox);

    function closeLightbox() {
      lightbox.classList.remove("is-open");
      lightbox.setAttribute("aria-hidden", "true");
      document.body.classList.remove("pdp-gallery-lightbox-open");
      image.removeAttribute("src");
    }

    closeBtn.addEventListener("click", closeLightbox);
    lightbox.addEventListener("click", function (event) {
      if (event.target === lightbox) closeLightbox();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && lightbox.classList.contains("is-open")) {
        closeLightbox();
      }
    });

    lightbox.openWith = function (src) {
      if (!src) return;
      image.src = src;
      lightbox.classList.add("is-open");
      lightbox.setAttribute("aria-hidden", "false");
      document.body.classList.add("pdp-gallery-lightbox-open");
      closeBtn.focus();
    };

    return lightbox;
  }

  function setupGalleryStage(showcase, inner, mainImage) {
    if (!showcase || !inner || showcase.querySelector(".pdp-gallery-stage")) {
      return showcase && showcase.querySelector(".pdp-gallery-stage");
    }

    var stage = document.createElement("div");
    stage.className = "pdp-gallery-stage";
    showcase.insertBefore(stage, inner);
    stage.appendChild(inner);

    var zoomBtn = document.createElement("button");
    zoomBtn.type = "button";
    zoomBtn.className = "pdp-gallery-zoom";
    zoomBtn.setAttribute("aria-label", "Zoom image");
    zoomBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line>' +
      "</svg>";
    zoomBtn.addEventListener("click", function () {
      var src = mainImage && mainImage.getAttribute("src");
      if (!src || mainImage.style.display === "none") return;
      getOrCreateGalleryLightbox().openWith(src);
    });
    stage.appendChild(zoomBtn);

    var callout = document.createElement("div");
    callout.className = "pdp-gallery-callout";
    callout.innerHTML =
      '<span class="pdp-gallery-callout-icon" aria-hidden="true">✓</span>' +
      '<span class="pdp-gallery-callout-text">Remote Included</span>';
    stage.appendChild(callout);

    return stage;
  }

  function createGalleryNav(thumbs) {
    var nav = document.createElement("div");
    nav.className = "pdp-gallery-nav";

    var prev = document.createElement("button");
    prev.type = "button";
    prev.className = "pdp-gallery-arrow pdp-gallery-arrow--prev";
    prev.setAttribute("aria-label", "Previous image");
    prev.innerHTML = "&#8249;";

    var next = document.createElement("button");
    next.type = "button";
    next.className = "pdp-gallery-arrow pdp-gallery-arrow--next";
    next.setAttribute("aria-label", "Next image");
    next.innerHTML = "&#8250;";

    nav.appendChild(prev);
    nav.appendChild(thumbs);
    nav.appendChild(next);
    return nav;
  }

  function wireGalleryArrows(nav, galleryNav, items) {
    if (!nav || !galleryNav || !items || items.length < 2) return;

    var prev = nav.querySelector(".pdp-gallery-arrow--prev");
    var next = nav.querySelector(".pdp-gallery-arrow--next");
    if (!prev || !next) return;

    prev.addEventListener("click", function () {
      galleryNav.selectAt(galleryNav.getIndex() - 1);
    });
    next.addEventListener("click", function () {
      galleryNav.selectAt(galleryNav.getIndex() + 1);
    });
  }

  function initProductThumbnailGallery() {
    var mainImage = getPrimaryProductImage();
    var showcase = document.querySelector(".product-showcase-image");
    var inner = showcase && showcase.querySelector(".product-showcase-image-inner");
    if (!mainImage || !showcase || !inner) return;
    if (showcase.querySelector(".pdp-gallery-nav")) return;

    setupGalleryStage(showcase, inner, mainImage);

    var slug = getProductSlug();
    var mainSrc = mainImage.getAttribute("src") || getProductImageUrlBySlug(slug);
    if (!mainSrc) return;

    resolveGalleryMedia(mainSrc, slug).then(function (bundle) {
      var items = (bundle && bundle.showcase) || [];
      if (!items || items.length < 2) return;

      var thumbs = document.createElement("div");
      thumbs.className = "pdp-gallery-thumbs";
      thumbs.setAttribute("aria-label", "Product gallery");

      var galleryNav = wireGalleryKeyboard(items, mainImage, inner, thumbs, showcase);
      var nav = createGalleryNav(thumbs);
      wireGalleryArrows(nav, galleryNav, items);

      items.forEach(function (item, index) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "pdp-gallery-thumb";
        if (item.type === "video") button.classList.add("pdp-gallery-thumb--video");
        button.setAttribute("data-type", item.type);
        button.setAttribute("data-src", item.src);
        if (item.poster) button.setAttribute("data-poster", item.poster);
        button.setAttribute(
          "aria-label",
          (item.type === "video" ? "Play demo video " : "Show image ") + (index + 1)
        );

        if (item.type === "video") {
          if (item.poster) {
            var posterImg = document.createElement("img");
            posterImg.src = item.poster;
            posterImg.alt = "";
            posterImg.loading = "lazy";
            button.appendChild(posterImg);
          } else {
            /* Fallback when no poster file: show a loaded video frame */
            var thumbVideo = document.createElement("video");
            thumbVideo.src = item.src;
            thumbVideo.muted = true;
            thumbVideo.playsInline = true;
            thumbVideo.preload = "metadata";
            thumbVideo.setAttribute("playsinline", "");
            thumbVideo.setAttribute("muted", "");
            thumbVideo.style.width = "100%";
            thumbVideo.style.height = "100%";
            thumbVideo.style.objectFit = "cover";
            thumbVideo.addEventListener("loadeddata", function () {
              try {
                if (thumbVideo.currentTime < 0.05) thumbVideo.currentTime = 0.12;
              } catch (_) {}
            });
            button.appendChild(thumbVideo);
          }
          var playIcon = document.createElement("span");
          playIcon.className = "pdp-gallery-thumb-play";
          playIcon.setAttribute("aria-hidden", "true");
          playIcon.textContent = "▶";
          button.appendChild(playIcon);
        } else {
          var thumbImg = document.createElement("img");
          thumbImg.src = item.src;
          thumbImg.alt = "";
          thumbImg.loading = "lazy";
          thumbImg.width = 120;
          thumbImg.height = 150;
          button.appendChild(thumbImg);
        }

        button.addEventListener("click", function () {
          if (galleryNav) galleryNav.setIndex(index);
          showGalleryMedia(mainImage, inner, item);
          setActiveGalleryThumb(thumbs, item);
          scrollGalleryThumbIntoView(thumbs, index);
        });
        thumbs.appendChild(button);
      });

      showcase.appendChild(nav);
      var initial = items.filter(function (item) {
        return item.type === "image" && normalizeImageUrl(item.src) === normalizeImageUrl(mainSrc);
      })[0] || items[0];
      var initialIndex = findGalleryIndex(items, initial);
      var mainNorm = normalizeImageUrl(mainImage.getAttribute("src") || "");
      var initialNorm = normalizeImageUrl(initial && initial.src);
      if (galleryNav) {
        galleryNav.setIndex(initialIndex);
        setActiveGalleryThumb(thumbs, initial);
        if (initialNorm && initialNorm !== mainNorm) {
          galleryNav.selectAt(initialIndex);
        }
      } else if (initialNorm && initialNorm !== mainNorm) {
        showGalleryMedia(mainImage, inner, initial);
        setActiveGalleryThumb(thumbs, initial);
      } else {
        setActiveGalleryThumb(thumbs, initial);
      }
    });
  }

  function animateFlyToCart() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    var image = getPrimaryProductImage();
    var cartLink = getCartLink();
    if (!image || !cartLink) return;

    var imageRect = image.getBoundingClientRect();
    var cartRect = cartLink.getBoundingClientRect();
    if (!imageRect.width || !imageRect.height || !cartRect.width || !cartRect.height) return;

    var fly = document.createElement("div");
    fly.setAttribute("aria-hidden", "true");
    fly.style.position = "fixed";
    fly.style.left = imageRect.left + imageRect.width * 0.35 + "px";
    fly.style.top = imageRect.top + imageRect.height * 0.35 + "px";
    fly.style.width = Math.max(52, Math.min(84, imageRect.width * 0.22)) + "px";
    fly.style.height = Math.max(52, Math.min(84, imageRect.width * 0.22)) + "px";
    fly.style.borderRadius = "12px";
    fly.style.overflow = "hidden";
    fly.style.boxShadow = "0 14px 30px rgba(0,0,0,0.35)";
    fly.style.zIndex = "2000";
    fly.style.pointerEvents = "none";
    fly.style.willChange = "transform, opacity";
    fly.style.transition = "transform 700ms cubic-bezier(0.2, 0.75, 0.2, 1), opacity 700ms ease";
    fly.style.transform = "translate3d(0,0,0) scale(1)";
    fly.style.opacity = "0.95";
    fly.innerHTML = '<img src="' + image.src + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />';
    document.body.appendChild(fly);

    var fromX = imageRect.left + imageRect.width * 0.35;
    var fromY = imageRect.top + imageRect.height * 0.35;
    var toX = cartRect.left + cartRect.width * 0.5 - fly.getBoundingClientRect().width * 0.5;
    var toY = cartRect.top + cartRect.height * 0.5 - fly.getBoundingClientRect().height * 0.5;
    var dx = toX - fromX;
    var dy = toY - fromY;

    requestAnimationFrame(function () {
      fly.style.transform = "translate3d(" + dx + "px," + dy + "px,0) scale(0.22)";
      fly.style.opacity = "0.18";
    });

    setTimeout(function () {
      fly.remove();
      cartLink.style.transition = "transform 220ms ease";
      cartLink.style.transform = "scale(1.14)";
      setTimeout(function () {
        cartLink.style.transform = "scale(1)";
      }, 220);
    }, 760);
  }

  function formatUsd(amount) {
    var pricing = getPricing();
    if (pricing) return pricing.formatUsd(amount);
    return "$" + Number(amount || 0).toFixed(2);
  }

  function buildDisplayItemsFromCart(items) {
    var pricing = getPricing();
    return (items || []).map(function (item) {
      var size = pricing ? pricing.normalizeSize(item && item.size) : item && item.size;
      var powerType = pricing ? pricing.normalizePowerType(item && item.powerType) : item && item.powerType;
      return {
        name: item && item.name ? item.name : "Product",
        imageUrl: getCartItemImageUrl(item),
        sizeLabel: item && item.sizeLabel ? item.sizeLabel : sizeToLabel(size),
        size: size,
        powerType: powerType,
        powerTypeLabel:
          item && item.powerTypeLabel ? item.powerTypeLabel : powerTypeToLabel(powerType),
        slug: item && item.slug ? item.slug : "",
        quantity: item && item.quantity ? item.quantity : 1,
        productType: item && item.productType ? item.productType : (isCustomProductSlug(item && item.slug) ? "custom" : "standard"),
        customConfig: item && item.customConfig ? item.customConfig : null,
        customDesignFeeUSD: item && item.customDesignFeeUSD,
        baseUnitPriceUSD: item && item.baseUnitPriceUSD,
        unitPriceUSD: pricing
          ? pricing.calculateProductUnitPrice({
            slug: item.slug || item.productSlug || "",
            productSlug: item.slug || item.productSlug || "",
            size: size,
            powerType: powerType
          })
          : item && item.unitPriceUSD
            ? item.unitPriceUSD
            : 0
      };
    });
  }

  function goToPremiumCheckout(payload) {
    var member = window.ZYBAR && window.ZYBAR.MemberPricing;
    if (member && member.isActive()) {
      payload.memberCredential = member.getCredential();
      payload.discountCode = member.getDiscountCode();
    }
    if (window.ZYBAR && window.ZYBAR.Analytics) {
      var attr = window.ZYBAR.Analytics.getAttribution();
      payload.visitorId = attr.visitorId;
      payload.sessionId = attr.sessionId;
      payload.cartId = attr.cartId;
    }
    try {
      window.sessionStorage.setItem(CHECKOUT_PENDING_KEY, JSON.stringify(payload));
    } catch (err) {
      console.error(err);
      alert("Could not start checkout. Please try again.");
      return;
    }
    window.location.href = "/checkout/";
  }

  function getSizePriceUSD(config, slug, size) {
    var pricing = getPricing();
    if (pricing) {
      return pricing.calculateProductUnitPrice({
        slug: slug || getProductSlug(),
        productSlug: slug || getProductSlug(),
        size: size,
        powerType: getSelectedPowerType()
      });
    }
    return 0;
  }

  function getPriceId() {
    return "";
  }

  /** Fix cart rows saved before pricing existed or after selections changed. */
  function repairCartItemsFromConfig() {
    var pricing = getPricing();
    if (!pricing) return;
    var items = readCartItems();
    if (!items.length) return;
    var changed = false;
    items.forEach(function (item) {
      if (!item || !item.slug || !item.size) return;
      var before = JSON.stringify({
        key: item.key,
        unitPriceUSD: item.unitPriceUSD,
        powerType: item.powerType
      });
      pricing.repairCartItem(item);
      var powerType = item.powerType || "usb";
      var expectedKey = buildVariantKey(item.slug, item.size, powerType);
      if (!item.key || item.key === item.slug + "::" + item.size) {
        if (item.key !== expectedKey) {
          item.key = expectedKey;
        }
      }
      if (isNonProductCartImage(item.imageUrl, item.slug)) {
        item.imageUrl = getDefaultProductImageUrl(item.slug);
      }
      var after = JSON.stringify({
        key: item.key,
        unitPriceUSD: item.unitPriceUSD,
        powerType: item.powerType
      });
      if (before !== after) changed = true;
    });
    if (changed) writeCartItems(items);
  }

  function sizeToLabel(size) {
    var pricing = getPricing();
    if (pricing) return pricing.sizeToLabel(size);
    if (size === "40x60") return "40 x 60 cm";
    return "30 x 45 cm";
  }

  function isCompactStickyBar() {
    return !!(window.matchMedia && window.matchMedia("(max-width: 640px)").matches);
  }

  function applySizePriceToUi(config) {
    var pricing = getPricing();
    if (!pricing) return;
    var size = getSelectedSize();
    var powerType = getSelectedPowerType();
    var slug = getProductSlug();
    var amount = pricing.calculateProductUnitPrice({
      slug: slug,
      productSlug: slug,
      size: size,
      powerType: powerType
    });
    var compareAt = typeof pricing.calculateProductCompareAtPrice === "function"
      ? pricing.calculateProductCompareAtPrice({
          slug: slug,
          productSlug: slug,
          size: size,
          powerType: powerType
        })
      : 0;
    var priceText = pricing.formatUsd(amount);
    var priceTextUsd = priceText + " USD";
    var sizeLabel = sizeToLabel(size);
    var powerLabel = powerTypeToLabel(powerType);
    var variantLabel = sizeLabel + " · " + powerLabel;
    var hasCompare = Number(compareAt) > Number(amount) && Number(amount) > 0;

    var mainPrice = document.querySelector(".product-price, .pdp-price-sale");
    if (mainPrice) mainPrice.textContent = priceTextUsd;

    var compareEl = document.querySelector(".pdp-price-compare");
    if (compareEl) {
      compareEl.textContent = hasCompare ? pricing.formatUsd(compareAt) + " USD" : "";
      compareEl.hidden = !hasCompare;
    }

    var saleBadge = document.querySelector(".pdp-sale-badge");
    if (saleBadge) saleBadge.hidden = !hasCompare;

    var priceRow = document.querySelector(".pdp-price-row");
    if (priceRow) priceRow.classList.toggle("has-compare", hasCompare);

    var stickyPrice = document.querySelector(".pdp-sticky-price");
    if (stickyPrice) stickyPrice.textContent = priceText;

    var stickyMeta = document.querySelector(".pdp-sticky-meta");
    if (stickyMeta) {
      stickyMeta.textContent = isCompactStickyBar()
        ? variantLabel + " · " + priceText
        : variantLabel;
    }
  }

  function makeCheckout(stripe) {
    return function (event) {
      event.preventDefault();

      var pricing = getPricing();
      if (!pricing) {
        alert("Pricing is not available. Please refresh the page.");
        return;
      }

      var config = getConfig();
      var slug = getProductSlug();
      var size = getSelectedSize();
      var powerType = getSelectedPowerType();
      var quantity = getQuantity();
      var unitAmountUSD = pricing.calculateProductUnitPrice({
        slug: slug || "",
        productSlug: slug || "",
        size: size,
        powerType: powerType
      });
      var shippingMethod = pricing.readShippingMethod();

      var successUrl = config.successUrl || (window.location.origin + "/purchase-confirmation.html?session_id={CHECKOUT_SESSION_ID}");
      var cancelUrl = config.cancelUrl || window.location.href;

      var btn = event.target && event.target.closest("[data-stripe-action='checkout']");
      if (btn) btn.disabled = true;

      resolveDefaultProductImageUrl(slug).then(function (imageUrl) {
        goToPremiumCheckout({
          lineItems: [{
            quantity: quantity,
            productSlug: slug || "",
            size: size || "",
            powerType: powerType || "usb",
            name: getProductName(),
            unitAmountUSD: unitAmountUSD
          }],
          shippingMethod: shippingMethod,
          discountCode: getAutoDiscountCode(unitAmountUSD * quantity),
          displayItems: [{
            name: getProductName(),
            imageUrl: imageUrl,
            sizeLabel: sizeToLabel(size),
            size: size,
            powerType: powerType,
            powerTypeLabel: powerTypeToLabel(powerType),
            slug: slug,
            quantity: quantity,
            unitPriceUSD: unitAmountUSD
          }],
          quantity: quantity,
          productSlug: slug || undefined,
          size: size || undefined,
          powerType: powerType || undefined,
          successUrl: successUrl,
          cancelUrl: cancelUrl
        });
      });
    };
  }

  function addCurrentSelectionToCart() {
    var pricing = getPricing();
    var slug = getProductSlug();
    var size = getSelectedSize();
    var powerType = getSelectedPowerType();
    var quantity = getQuantity();
    var amount = pricing
      ? pricing.calculateProductUnitPrice({
          slug: slug,
          productSlug: slug,
          size: size,
          powerType: powerType
        })
      : 0;
    var itemKey = buildVariantKey(slug, size, powerType);
    if (isCustomProductSlug(slug)) {
      itemKey = itemKey + "::custom";
    }
    var items = readCartItems();
    var existing = items.filter(function (item) {
      return item && item.key === itemKey;
    })[0];
    var customConfig = null;
    var customDesignFeeUSD = 0;
    var baseUnitPriceUSD = amount;
    if (isCustomProductSlug(slug)) {
      var customApi = window.ZYBAR && window.ZYBAR.CustomProduct;
      customConfig = customApi && customApi.getConfig ? customApi.getConfig() : null;
      customDesignFeeUSD = customApi && customApi.getCustomFee ? customApi.getCustomFee() : 10;
      baseUnitPriceUSD = customApi && customApi.getBasePrice ? customApi.getBasePrice() : Math.max(0, amount - customDesignFeeUSD);
    }

    if (existing) {
      existing.quantity = (Number(existing.quantity) || 0) + quantity;
      if (isNonProductCartImage(existing.imageUrl, slug)) {
        existing.imageUrl = getDefaultProductImageUrl(slug);
      }
      existing.powerType = powerType;
      existing.powerTypeLabel = powerTypeToLabel(powerType);
      existing.unitPriceUSD = amount;
      existing.finishLabel = existing.finishLabel || "Premium Matte Acrylic";
      if (isCustomProductSlug(slug)) {
        existing.productType = "custom";
        existing.customConfig = customConfig;
        existing.customDesignFeeUSD = customDesignFeeUSD;
        existing.baseUnitPriceUSD = baseUnitPriceUSD;
        existing.name = getProductName();
      }
    } else {
      items.push({
        key: itemKey,
        slug: slug,
        name: getProductName(),
        imageUrl: getDefaultProductImageUrl(slug),
        size: size,
        sizeLabel: sizeToLabel(size),
        powerType: powerType,
        powerTypeLabel: powerTypeToLabel(powerType),
        finishLabel: "Premium Matte Acrylic",
        quantity: quantity,
        unitPriceUSD: amount,
        productType: isCustomProductSlug(slug) ? "custom" : "standard",
        customConfig: customConfig,
        customDesignFeeUSD: customDesignFeeUSD,
        baseUnitPriceUSD: baseUnitPriceUSD
      });
      existing = items[items.length - 1];
    }

    writeCartItems(items);
    refreshCartBadge();

    if (window.ZYBAR && window.ZYBAR.Analytics) {
      window.ZYBAR.Analytics.trackAddToCart(existing, items);
    }

    return existing;
  }

  function openMiniCartForItem(item) {
    if (!item || !window.ZYBAR || !window.ZYBAR.MiniCartDrawer) return;
    var drawer = window.ZYBAR.MiniCartDrawer;
    var payload = {
      item: item,
      items: readCartItems(),
      cartCount: getCartTotalCount(),
      onCheckout: function (button) {
        beginCartCheckout(readCartItems(), button);
      },
      onContinueShopping: function () {
        // Stay on the current product page with selections preserved.
      }
    };
    if (typeof drawer.isOpen === "function" && drawer.isOpen()) {
      drawer.update(payload);
    } else {
      drawer.open(payload);
    }
  }

  function normalizeAddToCartButton(button) {
    if (!button) return;
    if (button.tagName === "A") {
      button.setAttribute("href", "#");
      button.setAttribute("role", "button");
    }
  }

  function runAddToCart(button) {
    if (isCustomProductSlug()) {
      var custom = window.ZYBAR && window.ZYBAR.CustomProduct;
      if (custom && typeof custom.validate === "function") {
        var check = custom.validate();
        if (!check || !check.ok) {
          alert((check && check.message) || "Please complete your custom order details.");
          return;
        }
      }
    }
    var addedItem = addCurrentSelectionToCart();
    animateFlyToCart();
    openMiniCartForItem(addedItem);
    if (!button) return;
    var original = button.getAttribute("data-cart-original-label") || button.textContent;
    if (!button.getAttribute("data-cart-original-label")) {
      button.setAttribute("data-cart-original-label", original);
    }
    button.textContent = "Added to cart";
    window.setTimeout(function () {
      button.textContent = button.getAttribute("data-cart-original-label") || original;
    }, 1200);
  }

  function bindCartDelegation(stripe) {
    if (cartDelegationBound) {
      checkoutStripe = stripe || checkoutStripe;
      return;
    }
    cartDelegationBound = true;
    checkoutStripe = stripe || null;

    document.addEventListener("click", function (event) {
      var addBtn = event.target && event.target.closest(".product-add-cart, .pdp-sticky-cta");
      if (addBtn && isAddToCartButton(addBtn)) {
        event.preventDefault();
        event.stopPropagation();
        runAddToCart(addBtn);
        return;
      }

      var checkoutBtn = event.target && event.target.closest("[data-stripe-action='checkout']");
      if (!checkoutBtn || isAddToCartButton(checkoutBtn)) return;
      event.preventDefault();
      if (checkoutStripe) {
        makeCheckout(checkoutStripe)(event);
      }
    });
  }

  var variantUiBound = false;

  function wireVariantUi(config) {
    applySizePriceToUi(config);
    if (variantUiBound) return;
    variantUiBound = true;

    document.addEventListener("click", function (event) {
      var sizeBtn = event.target && event.target.closest(".product-size-options .size-option");
      if (sizeBtn) {
        document.querySelectorAll(".product-size-options .size-option").forEach(function (b) {
          b.classList.remove("selected");
        });
        sizeBtn.classList.add("selected");
        applySizePriceToUi(config);
        if (window.ZYBAR && window.ZYBAR.Analytics) {
          window.ZYBAR.Analytics.trackVariantSelection(getProductSlug(), {
            size: sizeBtn.getAttribute("data-size"),
            power_type: getSelectedPowerType()
          });
        }
        return;
      }

      var powerBtn = event.target && event.target.closest(".product-power-options .power-type-option");
      if (!powerBtn) return;
      document.querySelectorAll(".product-power-options .power-type-option").forEach(function (b) {
        b.classList.remove("selected");
      });
      powerBtn.classList.add("selected");
      applySizePriceToUi(config);
      if (window.ZYBAR && window.ZYBAR.Analytics) {
        window.ZYBAR.Analytics.trackVariantSelection(getProductSlug(), {
          size: getSelectedSize(),
          power_type: powerBtn.getAttribute("data-power-type")
        });
      }
    });

    if (window.matchMedia) {
      var stickyMq = window.matchMedia("(max-width: 640px)");
      var onStickyLayoutChange = function () {
        applySizePriceToUi(config);
      };
      if (typeof stickyMq.addEventListener === "function") {
        stickyMq.addEventListener("change", onStickyLayoutChange);
      } else if (typeof stickyMq.addListener === "function") {
        stickyMq.addListener(onStickyLayoutChange);
      }
    }
  }

  function refreshPricingUi(config) {
    injectPowerTypeOption();
    refreshPowerTypeLabels();
    wireVariantUi(config || getConfig());
  }

  function isAddToCartButton(button) {
    if (!button) return false;
    return button.classList.contains("product-add-cart") || button.classList.contains("pdp-sticky-cta");
  }

  function wireButtons(stripe) {
    var slug = getProductSlug();
    var buttons = document.querySelectorAll("[data-stripe-action='checkout']");

    buttons.forEach(function (button) {
      if (!button.hasAttribute("data-analytics-add-to-cart")) {
        button.setAttribute("data-analytics-add-to-cart", "");
      }
      if (!button.hasAttribute("data-product-id")) {
        button.setAttribute("data-product-id", slug);
      }
      if (isAddToCartButton(button)) {
        normalizeAddToCartButton(button);
      }
    });

    bindCartDelegation(stripe);
  }

  function injectPowerTypeOption() {
    if (!getProductSlug()) return;
    if (document.querySelector(".product-power-options")) return;

    var optionsHost = document.querySelector(".pdp-luxury-options");
    var sizeOptions = document.querySelector(".product-size-options");
    if (!optionsHost && (!sizeOptions || !sizeOptions.parentNode)) return;
    if (!optionsHost) optionsHost = sizeOptions.parentNode;

    var pricing = getPricing();
    var upgrades = [];
    if (pricing && typeof pricing.getCatalog === "function") {
      var catalog = pricing.getCatalog();
      var pu = catalog && catalog.powerUpgrades ? catalog.powerUpgrades : {};
      upgrades = Object.keys(pu).map(function (key) {
        var entry = pu[key] || {};
        return {
          powerType: key,
          label: entry.label || key,
          priceUsd: Number(entry.priceUsd) || 0
        };
      });
    }
    if (!upgrades.length) {
      upgrades = [
        { powerType: "usb", label: "USB Only", priceUsd: 0 },
        { powerType: "dual", label: "USB + Battery", priceUsd: 0 }
      ];
    }

    var powerGroup = document.createElement("div");
    powerGroup.className = "pdp-luxury-power-group";

    var label = document.createElement("span");
    label.className = "product-option-label";
    label.textContent = "Power Type";

    var options = document.createElement("div");
    options.className = "product-power-options";
    upgrades.forEach(function (upgrade, index) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "power-type-option" + (index === 0 ? " selected" : "");
      btn.setAttribute("data-power-type", upgrade.powerType);
      var text = upgrade.label;
      if (upgrade.priceUsd > 0 && pricing) {
        text += " (+" + pricing.formatUsd(upgrade.priceUsd) + ")";
      }
      btn.textContent = text;
      options.appendChild(btn);
    });

    powerGroup.appendChild(label);
    powerGroup.appendChild(options);
    optionsHost.appendChild(powerGroup);
  }

  function refreshPowerTypeLabels() {
    var pricing = getPricing();
    if (!pricing) return;
    document.querySelectorAll(".product-power-options .power-type-option").forEach(function (btn) {
      var powerType = btn.getAttribute("data-power-type") || "usb";
      var label = pricing.powerTypeToLabel(powerType);
      var extra = pricing.getPowerUpgradeUSD(powerType);
      btn.textContent = extra > 0 ? label + " (+" + pricing.formatUsd(extra) + ")" : label;
    });
  }

  function boot() {
    guardAddToCartLinks();
    if (window.ZYBAR && typeof window.ZYBAR.initPdpLuxuryUi === "function") {
      window.ZYBAR.initPdpLuxuryUi();
    }
    if (typeof document.dispatchEvent === "function") {
      document.dispatchEvent(new CustomEvent("zybar:pdp-luxury-ready"));
    }
    repairCartItemsFromConfig();
    var config = getConfig();
    refreshPricingUi(config);
    if (window.ZYBAR && window.ZYBAR.CustomProduct && typeof window.ZYBAR.CustomProduct.mountPdpFields === "function") {
      window.ZYBAR.CustomProduct.mountPdpFields();
    }
    initProductThumbnailGallery();
    refreshCartBadge();
    wireCartClick();

    var stripe = (window.Stripe && config.publishableKey && config.publishableKey.indexOf("REPLACE_ME") === -1)
      ? window.Stripe(config.publishableKey) : null;
    wireButtons(stripe);
  }

  window.ZYBAR = window.ZYBAR || {};
  window.ZYBAR.Cart = {
    readCartItems: readCartItems,
    writeCartItems: writeCartItems,
    updateCartItemQuantity: updateCartItemQuantity,
    removeCartItem: removeCartItem,
    beginCartCheckout: beginCartCheckout,
    refreshCartBadge: refreshCartBadge,
    getCartItemImageUrl: getCartItemImageUrl,
    onProductThumbError: onProductThumbError,
    formatUsd: formatUsd,
    getCartTotalCount: getCartTotalCount,
    buildDisplayItemsFromCart: buildDisplayItemsFromCart,
    readShippingMethod: function () {
      var pricing = getPricing();
      return pricing ? pricing.readShippingMethod() : "standard";
    },
    writeShippingMethod: function (method) {
      var pricing = getPricing();
      if (pricing) pricing.writeShippingMethod(method);
    }
  };

  function start() {
    boot();
    var pricing = getPricing();
    if (pricing && typeof pricing.load === "function") {
      pricing.load().then(function () {
        // Repair again with the real catalog (heals rows saved with $0).
        repairCartItemsFromConfig();
        refreshPricingUi(getConfig());
        refreshCartBadge();
      }).catch(function (err) {
        console.error(err);
        refreshPricingUi(getConfig());
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
