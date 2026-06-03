/**
 * ZYBAR Stripe Checkout handler.
 * Uses Stripe Price IDs from window.ZYBAR_STRIPE_CONFIG.
 */
(function () {
  "use strict";
  var CART_STORAGE_KEY = "zybar.cart.items";
  var CHECKOUT_PENDING_KEY = "zybar.checkout.pending";

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

  function getQuantity() {
    var qtyEl = document.querySelector(".product-quantity span");
    var qty = qtyEl ? parseInt(qtyEl.textContent, 10) : 1;
    return Number.isFinite(qty) && qty > 0 ? qty : 1;
  }

  function getConfig() {
    return window.ZYBAR_STRIPE_CONFIG || {};
  }

  function getProductName() {
    var heading = document.querySelector("h1");
    return heading ? String(heading.textContent || "").trim() : getProductSlug();
  }

  function getProductImageUrlBySlug(slug) {
    return slug ? "/Image/" + slug + "-1.webp" : "";
  }

  function getCurrentProductImageUrl() {
    var image = getPrimaryProductImage();
    if (image && image.getAttribute("src")) return image.getAttribute("src");
    return getProductImageUrlBySlug(getProductSlug());
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

  function createCartDialog(items) {
    removeCartDialog();

    var overlay = document.createElement("div");
    overlay.id = "zybar-cart-dialog";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Shopping cart");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "background:rgba(0,0,0,0.45)",
      "z-index:3000",
      "display:flex",
      "align-items:flex-start",
      "justify-content:flex-end",
      "padding:16px",
      "box-sizing:border-box"
    ].join(";");

    var panel = document.createElement("div");
    panel.style.cssText = [
      "width:min(100%,420px)",
      "max-height:calc(100vh - 32px)",
      "overflow:auto",
      "background:#fff",
      "border-radius:14px",
      "box-shadow:0 24px 48px rgba(0,0,0,0.25)",
      "padding:16px"
    ].join(";");

    var header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;";
    header.innerHTML = '<h2 style="margin:0;font-size:18px;">Your cart</h2><button type="button" aria-label="Close cart" style="border:1px solid #ddd;background:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;">Close</button>';

    var closeBtn = header.querySelector("button");
    if (closeBtn) {
      closeBtn.addEventListener("click", removeCartDialog);
    }

    var body = document.createElement("div");
    if (!items.length) {
      body.innerHTML = '<p style="margin:0 0 10px 0;color:#444;">Your cart is empty.</p>';
    } else {
      var listHtml = items.map(function (item) {
        var qty = Number(item && item.quantity);
        var safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
        var unit = Number(item && item.unitPriceUSD) || 0;
        var subtotal = safeQty * unit;
        var imageUrl = String(item && item.imageUrl ? item.imageUrl : getProductImageUrlBySlug(item && item.slug));
        return [
          '<li style="list-style:none;padding:10px 0;border-bottom:1px solid #eee;">',
          '<div style="display:flex;gap:12px;align-items:flex-start;">',
          '<img src="' + imageUrl + '" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:10px;background:#f4f4f4;flex-shrink:0;" />',
          '<div style="min-width:0;">',
          '<div style="font-weight:600;color:#111;">' + String(item && item.name ? item.name : "Product") + "</div>",
          '<div style="font-size:13px;color:#666;">Size: ' + String(item && item.sizeLabel ? item.sizeLabel : "Default") + "</div>",
          '<div style="display:flex;align-items:center;gap:8px;margin:6px 0 2px 0;">',
          '<button type="button" data-cart-action="decrease" data-item-key="' + String(item && item.key ? item.key : "") + '" aria-label="Decrease quantity" style="width:28px;height:28px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer;">-</button>',
          '<span style="font-size:14px;color:#222;min-width:62px;">Qty: ' + safeQty + "</span>",
          '<button type="button" data-cart-action="increase" data-item-key="' + String(item && item.key ? item.key : "") + '" aria-label="Increase quantity" style="width:28px;height:28px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer;">+</button>',
          '<button type="button" data-cart-action="remove" data-item-key="' + String(item && item.key ? item.key : "") + '" aria-label="Remove item" style="margin-left:6px;border:1px solid #f1c7c7;background:#fff5f5;color:#a40000;border-radius:8px;padding:5px 8px;cursor:pointer;font-size:12px;">Remove</button>',
          "</div>",
          '<div style="font-size:13px;color:#666;">Unit: ' + formatUsd(unit) + ' · Subtotal: ' + formatUsd(subtotal) + "</div>",
          "</div>",
          "</div>",
          "</li>"
        ].join("");
      }).join("");

      body.innerHTML = '<ul style="margin:0;padding:0;">' + listHtml + "</ul>";
      body.addEventListener("click", function (event) {
        var button = event.target && event.target.closest("button[data-cart-action]");
        if (!button) return;
        var action = button.getAttribute("data-cart-action");
        var itemKey = button.getAttribute("data-item-key");
        if (!itemKey) return;
        if (action === "increase") {
          createCartDialog(updateCartItemQuantity(itemKey, 1));
          return;
        }
        if (action === "decrease") {
          createCartDialog(updateCartItemQuantity(itemKey, -1));
          return;
        }
        if (action === "remove") {
          createCartDialog(removeCartItem(itemKey));
        }
      });
    }

    var footer = document.createElement("div");
    var totalQty = getCartTotalCount();
    var totalAmount = items.reduce(function (sum, item) {
      var qty = Number(item && item.quantity);
      var unit = Number(item && item.unitPriceUSD);
      var safeQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
      var safeUnit = Number.isFinite(unit) && unit > 0 ? unit : 0;
      return sum + safeQty * safeUnit;
    }, 0);

    footer.style.cssText = "margin-top:12px;padding-top:12px;border-top:1px solid #eee;display:flex;justify-content:space-between;gap:12px;font-size:14px;";
    footer.innerHTML = '<span>Total items: ' + totalQty + '</span><strong>Total: ' + formatUsd(totalAmount) + "</strong>";
    var checkoutBtn = document.createElement("button");
    checkoutBtn.type = "button";
    checkoutBtn.textContent = "Pay with card";
    checkoutBtn.style.cssText = "margin-top:12px;width:100%;border:0;border-radius:10px;padding:11px 14px;background:#111;color:#fff;font-weight:600;cursor:pointer;";
    checkoutBtn.addEventListener("click", function () {
      beginCartCheckout(items, checkoutBtn);
    });

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    if (items.length) panel.appendChild(checkoutBtn);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) removeCartDialog();
    });
  }

  function wireCartClick() {
    var cartLink = getCartLink();
    if (!cartLink) return;
    cartLink.addEventListener("click", function (event) {
      var items = readCartItems();
      if (!items.length) return;
      event.preventDefault();
      createCartDialog(items);
    });
  }

  function beginCartCheckout(items, button) {
    var config = getConfig();
    var successUrl = config.successUrl || (window.location.origin + "/purchase-confirmation.html?session_id={CHECKOUT_SESSION_ID}");
    var cancelUrl = config.cancelUrl || window.location.href;
    var validItems = (items || []).map(function (item) {
      return {
        priceId: String(item && item.priceId ? item.priceId : ""),
        quantity: Number(item && item.quantity),
        productSlug: String(item && item.slug ? item.slug : ""),
        size: String(item && item.size ? item.size : "")
      };
    }).filter(function (item) {
      return item.priceId && item.priceId.indexOf("REPLACE_ME") === -1 && Number.isFinite(item.quantity) && item.quantity > 0;
    });

    if (!validItems.length) {
      alert("Your cart has no valid Stripe products yet. Please re-add items and try again.");
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Redirecting...";
    }

    goToPremiumCheckout({
      lineItems: validItems,
      displayItems: buildDisplayItemsFromCart(
        (items || []).filter(function (item) {
          return item && validItems.some(function (v) {
            return v.productSlug === item.slug && v.size === item.size;
          });
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
  function headMediaExists(url) {
    var requestUrl = encodeMediaUrl(url);
    return fetch(requestUrl, { method: "HEAD", cache: "force-cache" })
      .then(function (res) {
        if (!res || !res.ok) return false;
        var contentType = (res.headers.get("content-type") || "").toLowerCase();
        return contentType.indexOf("image/") === 0 || contentType.indexOf("video/") === 0;
      })
      .catch(function () { return false; });
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
    var exts = ["webp", "jpg", "jpeg", "png"];
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
    var chain = Promise.resolve([]);
    var i;
    for (i = 1; i <= 8; i += 1) {
      (function (slot) {
        chain = chain.then(function (images) {
          return pickImageForSlot(slug, slot, "off", mainSrc).then(function (offSrc) {
            if (!offSrc) return images;
            images.push(offSrc);
            return pickImageForSlot(slug, slot, "on", mainSrc).then(function (onSrc) {
              if (onSrc) images.push(onSrc);
              return images;
            });
          });
        });
      })(i);
    }
    return chain;
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

  function normalizeGalleryItem(raw) {
    if (!raw || !raw.src) return null;
    var type = raw.type === "video" ? "video" : "image";
    return {
      type: type,
      src: encodeMediaUrl(raw.src),
      poster: raw.poster ? encodeMediaUrl(raw.poster) : "",
      label: "shared"
    };
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
      var items = images.map(function (src) {
        return { type: "image", src: src, label: "product" };
      });
      return resolveSharedGalleryMedia().then(function (sharedItems) {
        return items.concat(sharedItems);
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

  function getOrCreateGalleryVideo(inner) {
    var video = inner.querySelector(".pdp-gallery-video");
    if (video) return video;
    video = document.createElement("video");
    video.className = "pdp-gallery-video";
    video.controls = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.preload = "metadata";
    inner.appendChild(video);
    return video;
  }

  function showGalleryMedia(mainImage, inner, item) {
    if (!mainImage || !inner || !item) return;
    var video = getOrCreateGalleryVideo(inner);
    if (item.type === "video") {
      mainImage.style.display = "none";
      video.style.display = "block";
      if (video.getAttribute("src") !== item.src) {
        video.src = item.src;
        if (item.poster) video.setAttribute("poster", item.poster);
        else video.removeAttribute("poster");
      }
      video.play().catch(function () {});
      return;
    }
    video.pause();
    video.style.display = "none";
    mainImage.style.display = "block";
    crossfadeSwapImage(mainImage, item.src, 500);
    var stickyThumb = document.querySelector(".pdp-sticky-thumb img");
    if (stickyThumb) crossfadeSwapImage(stickyThumb, item.src, 500);
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
    overlay.style.transition = "opacity " + durationMs + "ms linear";

    imgEl.style.transition = "opacity " + durationMs + "ms linear";
    imgEl.style.opacity = "0";
    holder.appendChild(overlay);
    imgEl.src = nextSrc;

    requestAnimationFrame(function () {
      overlay.style.opacity = "0";
      imgEl.style.opacity = "1";
    });

    setTimeout(function () {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
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
      }
    };
  }

  function initProductThumbnailGallery() {
    var mainImage = getPrimaryProductImage();
    var showcase = document.querySelector(".product-showcase-image");
    var inner = showcase && showcase.querySelector(".product-showcase-image-inner");
    if (!mainImage || !showcase || !inner) return;
    if (showcase.querySelector(".pdp-gallery-thumbs")) return;

    var slug = getProductSlug();
    var mainSrc = mainImage.getAttribute("src") || getProductImageUrlBySlug(slug);
    if (!mainSrc) return;

    resolveGalleryMedia(mainSrc, slug).then(function (items) {
      if (!items || items.length < 1) return;

      var thumbs = document.createElement("div");
      thumbs.className = "pdp-gallery-thumbs";
      thumbs.setAttribute("aria-label", "Product gallery");

      var galleryNav = wireGalleryKeyboard(items, mainImage, inner, thumbs, showcase);

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
          thumbImg.height = 120;
          button.appendChild(thumbImg);
        }

        button.addEventListener("click", function () {
          if (galleryNav) galleryNav.setIndex(index);
          showGalleryMedia(mainImage, inner, item);
          setActiveGalleryThumb(thumbs, item);
        });
        thumbs.appendChild(button);
      });

      showcase.appendChild(thumbs);
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
    return "$" + Number(amount || 0).toFixed(2);
  }

  function buildDisplayItemsFromCart(items) {
    return (items || []).map(function (item) {
      return {
        name: item && item.name ? item.name : "Product",
        imageUrl: item && item.imageUrl ? item.imageUrl : getProductImageUrlBySlug(item && item.slug),
        sizeLabel: item && item.sizeLabel ? item.sizeLabel : sizeToLabel(item && item.size),
        size: item && item.size ? item.size : "",
        slug: item && item.slug ? item.slug : "",
        quantity: item && item.quantity ? item.quantity : 1,
        unitPriceUSD: item && item.unitPriceUSD ? item.unitPriceUSD : 0
      };
    });
  }

  function goToPremiumCheckout(payload) {
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
    var perProduct = (config && config.perProductSizePricesUSD) || {};
    if (slug && perProduct[slug] && typeof perProduct[slug][size] === "number") {
      return perProduct[slug][size];
    }
    var map = (config && config.sizePricesUSD) || {};
    if (typeof map[size] === "number") return map[size];
    if (size === "40x60") return 150;
    return 110;
  }

  function getPriceId(config, slug, size) {
    if (!config) return "";
    if (config.prices && config.prices[slug] && config.prices[slug][size]) {
      var id = config.prices[slug][size];
      return typeof id === "string" ? id.trim() : "";
    }
    if (config.sharedPriceIdsBySize && config.sharedPriceIdsBySize[size]) {
      var shared = config.sharedPriceIdsBySize[size];
      return typeof shared === "string" ? shared.trim() : "";
    }
    return "";
  }

  /** Fix cart rows saved before price IDs existed or after config changed. */
  function repairCartItemsFromConfig() {
    var config = getConfig();
    if (!config || !config.prices) return;
    var items = readCartItems();
    if (!items.length) return;
    var changed = false;
    items.forEach(function (item) {
      if (!item || !item.slug || !item.size) return;
      var pid = getPriceId(config, item.slug, item.size);
      if (pid && String(item.priceId || "") !== pid) {
        item.priceId = pid;
        changed = true;
      }
      var amt = getSizePriceUSD(config, item.slug, item.size);
      if (typeof item.unitPriceUSD !== "number" || Math.abs(item.unitPriceUSD - amt) > 0.01) {
        item.unitPriceUSD = amt;
        changed = true;
      }
    });
    if (changed) writeCartItems(items);
  }

  function sizeToLabel(size) {
    if (size === "40x60") return "40 x 60 cm";
    return "30 x 45 cm";
  }

  function applySizePriceToUi(config) {
    var size = getSelectedSize();
    var amount = getSizePriceUSD(config, getProductSlug(), size);
    var priceText = formatUsd(amount);

    var mainPrice = document.querySelector(".product-price");
    if (mainPrice) mainPrice.textContent = priceText;

    var stickyPrice = document.querySelector(".pdp-sticky-price");
    if (stickyPrice) stickyPrice.textContent = priceText;

    var stickyMeta = document.querySelector(".pdp-sticky-meta");
    if (stickyMeta) stickyMeta.textContent = sizeToLabel(size);
  }

  function makeCheckout(stripe) {
    return function (event) {
      event.preventDefault();

      var config = getConfig();
      var slug = getProductSlug();
      var size = getSelectedSize();
      var quantity = getQuantity();
      var priceId = getPriceId(config, slug, size);

      if (!priceId || priceId.indexOf("REPLACE_ME") !== -1) {
        console.warn("[ZYBAR] Missing Stripe price ID", {
          slug: slug,
          size: size,
          hasPricesMap: !!(config && config.prices),
          keysForSlug: config && config.prices && config.prices[slug] ? Object.keys(config.prices[slug]) : []
        });
        alert(
          "Stripe is not fully configured yet. Please add your real Stripe price IDs in /js/stripe-config.js"
        );
        return;
      }

      var successUrl = config.successUrl || (window.location.origin + "/purchase-confirmation.html?session_id={CHECKOUT_SESSION_ID}");
      var cancelUrl = config.cancelUrl || window.location.href;

      var btn = event.target && event.target.closest("[data-stripe-action='checkout']");
      if (btn) btn.disabled = true;

      goToPremiumCheckout({
        lineItems: [{
          priceId: priceId,
          quantity: quantity,
          productSlug: slug || "",
          size: size || ""
        }],
        displayItems: [{
          name: getProductName(),
          imageUrl: getCurrentProductImageUrl(),
          sizeLabel: sizeToLabel(size),
          size: size,
          slug: slug,
          quantity: quantity,
          unitPriceUSD: getSizePriceUSD(config, slug, size)
        }],
        priceId: priceId,
        quantity: quantity,
        productSlug: slug || undefined,
        size: size || undefined,
        successUrl: successUrl,
        cancelUrl: cancelUrl
      });
    };
  }

  function addCurrentSelectionToCart() {
    var config = getConfig();
    var slug = getProductSlug();
    var size = getSelectedSize();
    var quantity = getQuantity();
    var amount = getSizePriceUSD(config, slug, size);
    var priceId = getPriceId(config, slug, size);
    var itemKey = slug + "::" + size;
    var items = readCartItems();
    var existing = items.filter(function (item) {
      return item && item.key === itemKey;
    })[0];

    if (existing) {
      existing.quantity = (Number(existing.quantity) || 0) + quantity;
      if (!existing.imageUrl) existing.imageUrl = getCurrentProductImageUrl();
      if (priceId) existing.priceId = priceId;
    } else {
      items.push({
        key: itemKey,
        slug: slug,
        name: getProductName(),
        imageUrl: getCurrentProductImageUrl(),
        size: size,
        sizeLabel: sizeToLabel(size),
        quantity: quantity,
        unitPriceUSD: amount,
        priceId: priceId || ""
      });
    }

    writeCartItems(items);
    refreshCartBadge();
  }

  function makeAddToCart() {
    return function (event) {
      event.preventDefault();
      addCurrentSelectionToCart();
      animateFlyToCart();
      var button = event.currentTarget;
      if (!button) return;
      var original = button.getAttribute("data-cart-original-label") || button.textContent;
      if (!button.getAttribute("data-cart-original-label")) {
        button.setAttribute("data-cart-original-label", original);
      }
      button.textContent = "Added to cart";
      setTimeout(function () {
        button.textContent = button.getAttribute("data-cart-original-label") || original;
      }, 1200);
    };
  }

  function isAddToCartButton(button) {
    if (!button) return false;
    return button.classList.contains("product-add-cart") || button.classList.contains("pdp-sticky-cta");
  }

  function wireButtons(stripe) {
    var slug = getProductSlug();
    var buttons = document.querySelectorAll("[data-stripe-action='checkout']");
    var onCheckout = makeCheckout(stripe);
    var onAddToCart = makeAddToCart();

    buttons.forEach(function (button) {
      // Reuse analytics pipeline for checkout clicks.
      if (!button.hasAttribute("data-analytics-add-to-cart")) {
        button.setAttribute("data-analytics-add-to-cart", "");
      }
      if (!button.hasAttribute("data-product-id")) {
        button.setAttribute("data-product-id", slug);
      }
      if (isAddToCartButton(button)) {
        button.addEventListener("click", onAddToCart);
      } else {
        button.addEventListener("click", onCheckout);
      }
    });
  }

  function wireSizePriceUi(config) {
    // Keep displayed price synced with selected size (30x45 / 40x60).
    applySizePriceToUi(config);
    var sizeBtns = document.querySelectorAll(".product-size-options .size-option");
    sizeBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTimeout(function () {
          applySizePriceToUi(config);
        }, 0);
      });
    });
  }

  function init() {
    repairCartItemsFromConfig();
    var config = getConfig();
    wireSizePriceUi(config);
    initProductThumbnailGallery();
    refreshCartBadge();
    wireCartClick();

    // Wire checkout buttons: they call the backend API, so Stripe.js is optional for redirect flow
    var stripe = (window.Stripe && config.publishableKey && config.publishableKey.indexOf("REPLACE_ME") === -1)
      ? window.Stripe(config.publishableKey) : null;
    wireButtons(stripe);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
