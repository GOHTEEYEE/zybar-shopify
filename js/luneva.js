(function () {
  "use strict";

  var CART_KEY = "luneva.cart.items";
  var ZYBAR_CART_KEY = "zybar.cart.items";
  var LUNEVA_COMPARE_BY_SIZE = {
    "30x45": 109,
    "40x60": 119
  };

  var LUNEVA_REVIEWS = {
    "luneva-cyan-blue": {
      folder: "cyan-blue",
      name: "Cyan Blue",
      items: [
        {
          image: "01.png",
          quote:
            "The cyan butterfly against the glittery night base is stunning. Colors pop even more with the LEDs on.",
          author: "Mia T.",
          location: "Amsterdam, NL"
        },
        {
          quote:
            "Arrived faster than expected and the instructions were easy to follow. My first DIY kit and it turned out beautiful.",
          author: "Kate L.",
          location: "Brisbane, AU"
        },
        {
          image: "02.png",
          quote: "Blue roses, purple blooms, and that glowing box — feels premium on the shelf.",
          author: "James W.",
          location: "London, UK"
        },
        {
          quote:
            "The mechanical butterfly is the wow factor. Guests always ask where I got it.",
          author: "Nina R.",
          location: "Stockholm, SE"
        },
        {
          image: "03.png",
          quote: "The moving wings and cool blue glow make it the centerpiece of my desk setup.",
          author: "Sophie R.",
          location: "Toronto, CA"
        },
        {
          quote: "Bought two — one for me and one as a gift. Both recipients loved the packaging.",
          author: "David C.",
          location: "Hong Kong"
        },
        {
          quote: "Soft LED glow is perfect for evening. Not too bright, just dreamy.",
          author: "Aisha M.",
          location: "Dubai, AE"
        }
      ]
    },
    "luneva-dreamy-garden": {
      folder: "dreamy-garden",
      name: "Dreamy Garden",
      items: [
        {
          image: "01.png",
          quote:
            "The soft pink glow is unreal. Cotton clouds, tiny trees, and butterflies — it looks like a fairy tale on my shelf.",
          author: "Maya L.",
          location: "Los Angeles, US"
        },
        {
          quote: "Assembly took about two hours and was genuinely relaxing. Great weekend project.",
          author: "Tara S.",
          location: "Dublin, IE"
        },
        {
          image: "02.png",
          quote: "Obsessed with the glitter and pastel vibes. Lights on and the whole room feels calmer instantly.",
          author: "Grace H.",
          location: "Edinburgh, UK"
        },
        {
          image: "03.png",
          quote: "Built it in one evening — the mechanical butterfly is mesmerizing to watch.",
          author: "Chloe P.",
          location: "Sydney, AU"
        },
        {
          quote: "Gifted this to my mom for Mother's Day. She cried — in a good way.",
          author: "Jenny K.",
          location: "Vancouver, CA"
        },
        {
          image: "04.png",
          quote: "The packaging was beautiful and the finished display looks even softer in person.",
          author: "Hannah K.",
          location: "Seattle, US"
        },
        {
          quote: "Quality feels way above the price point. USB cable included, no extra fuss.",
          author: "Marco V.",
          location: "Rome, IT"
        },
        {
          image: "05.png",
          quote: "Perfect bedside glow. My daughter keeps turning the lights on before bed every night.",
          author: "Priya N.",
          location: "Singapore"
        }
      ]
    },
    "luneva-glowing-garden": {
      folder: "glowing-garden",
      name: "Glowing Garden",
      items: [
        {
          image: "01.png",
          quote:
            "Absolutely magical on my nightstand. The glow is so soothing — it looks even better in person.",
          author: "Ava M.",
          location: "Portland, US"
        },
        {
          quote: "The moss and florals look so real once you finish. Photos online do not do it justice.",
          author: "Helen W.",
          location: "Manchester, UK"
        },
        {
          image: "02.png",
          quote: "The blue butterfly looks so lifelike, and the moss feels like a tiny fairy forest.",
          author: "Lena K.",
          location: "Vienna, AT"
        },
        {
          image: "03.png",
          quote: "Gifted this to my sister — she keeps sending me photos of it lit up every night.",
          author: "Noah S.",
          location: "Dublin, IE"
        },
        {
          quote: "Shipping was tracked the whole way. Arrived safely and well packed.",
          author: "Carlos D.",
          location: "Madrid, ES"
        },
        {
          image: "04.png",
          quote: "The cyan tones and tiny florals look incredible once assembled — very premium.",
          author: "Olivia B.",
          location: "Vancouver, CA"
        },
        {
          quote: "My boyfriend assembled it for our anniversary. Such a romantic keepsake.",
          author: "Zoe F.",
          location: "Auckland, NZ"
        },
        {
          image: "05.png",
          quote: "Easy to follow and so satisfying to finish. The moving butterfly is the highlight.",
          author: "Lucas F.",
          location: "Berlin, DE"
        }
      ]
    },
    "luneva-starlit-garden": {
      folder: "starlit-garden",
      name: "Starlit Garden",
      items: [
        {
          image: "01.png",
          quote:
            "Finished the miniature landscape and I'm obsessed. Soft flowers look so charming on my desk.",
          author: "Ellie R.",
          location: "Austin, US"
        },
        {
          quote: "The infinity mirror effect is hard to describe — you have to see it in person.",
          author: "Ryan T.",
          location: "Phoenix, US"
        },
        {
          image: "02.png",
          quote: "The starry details and warm lighting make it feel magical from every angle.",
          author: "Rachel D.",
          location: "Denver, US"
        },
        {
          image: "03.png",
          quote: "Surprised my partner with this — the gift moment was perfect.",
          author: "Isabella C.",
          location: "Milan, IT"
        },
        {
          quote: "Clear step-by-step guide. Even with no craft experience I got a gorgeous result.",
          author: "Mei L.",
          location: "Taipei, TW"
        },
        {
          image: "04.png",
          quote: "The infinity mirror effect is mesmerizing at night. Endless stars, warm glow.",
          author: "Daniel M.",
          location: "Chicago, US"
        },
        {
          quote: "Stays on my bookshelf and everyone who visits comments on it.",
          author: "Tom H.",
          location: "Glasgow, UK"
        },
        {
          image: "05.png",
          quote: "Assembly was fun and the final piece looks like a tiny glowing garden.",
          author: "Sofia G.",
          location: "Barcelona, ES"
        },
        {
          quote: "Worth every penny for the ambiance alone. Cozy, warm, and unique.",
          author: "Julia N.",
          location: "Oslo, NO"
        }
      ]
    }
  };

  function isLunevaSlug(slug) {
    return String(slug || "").indexOf("luneva-") === 0;
  }

  function readRaw(key) {
    try {
      var raw = window.localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeRaw(key, items) {
    window.localStorage.setItem(key, JSON.stringify(items || []));
  }

  /** Keep the two carts strictly separated (also cleans older mixed carts). */
  function sanitizeCarts() {
    var zybarItems = readRaw(ZYBAR_CART_KEY);
    var lunevaItems = readRaw(CART_KEY);
    var zybarClean = zybarItems.filter(function (item) {
      return item && !isLunevaSlug(item.slug || item.productSlug);
    });
    var lunevaClean = lunevaItems.filter(function (item) {
      return item && isLunevaSlug(item.slug || item.productSlug);
    });
    // Move any LUNEVA rows that were wrongly saved into the Automotive cart.
    zybarItems.forEach(function (item) {
      if (!item || !isLunevaSlug(item.slug || item.productSlug)) return;
      lunevaClean.push(item);
    });
    writeRaw(ZYBAR_CART_KEY, zybarClean);
    writeRaw(CART_KEY, lunevaClean);
  }

  function readCart() {
    return readRaw(CART_KEY)
      .filter(function (item) {
        return item && isLunevaSlug(item.slug || item.productSlug);
      })
      .map(normalizeCartItem);
  }

  function writeCart(items) {
    writeRaw(
      CART_KEY,
      (items || []).filter(function (item) {
        return item && isLunevaSlug(item.slug || item.productSlug);
      })
    );
    window.dispatchEvent(new Event("luneva:cart-updated"));
  }

  function cartCount(items) {
    return (items || readCart()).reduce(function (sum, item) {
      return sum + (Number(item.quantity) || 0);
    }, 0);
  }

  function cartTotal(items) {
    return (items || readCart()).reduce(function (sum, item) {
      return sum + catalogUnitPrice(item) * (Number(item.quantity) || 0);
    }, 0);
  }

  function variantKey(item) {
    return [
      String(item.slug || ""),
      String(item.size || ""),
      String(item.powerType || "usb")
    ].join("::");
  }

  function lunevaImageUrl(item) {
    var url = String((item && item.imageUrl) || "").trim();
    if (url.indexOf("/luneva/assets/") === 0) return url;
    var slug = String((item && (item.slug || item.productSlug)) || "");
    if (slug.indexOf("luneva-") === 0) {
      return "/luneva/assets/" + slug.replace(/^luneva-/, "") + "/hero.png";
    }
    return url;
  }

  function normalizeCartItem(item) {
    if (!item || !isLunevaSlug(item.slug || item.productSlug)) return item;
    item.imageUrl = lunevaImageUrl(item);
    var cur = currencyApi();
    if (cur) {
      item.unitAmountUSD = cur.kitPrice(item.size);
      var compare = cur.comparePrice(item.size);
      item.compareAtUSD = compare > 0 ? compare : 0;
    } else if (!Number(item.compareAtUSD)) {
      item.compareAtUSD = lunevaCompareAtUSD(item);
    }
    return item;
  }

  function addItem(item) {
    var items = readCart();
    var key = variantKey(item);
    var found = false;
    items = items.map(function (row) {
      if (variantKey(row) === key) {
        found = true;
        row.quantity = (Number(row.quantity) || 0) + (Number(item.quantity) || 1);
        row.unitAmountUSD = item.unitAmountUSD;
        row.compareAtUSD = item.compareAtUSD || lunevaCompareAtUSD(item);
        row.name = item.name;
        row.imageUrl = lunevaImageUrl(item);
        row.sizeLabel = item.sizeLabel;
      }
      return row;
    });
    if (!found) {
      item.key = key;
      normalizeCartItem(item);
      items.push(item);
    }
    writeCart(items);
    return items;
  }

  function updateQuantity(key, quantity) {
    var qty = Number(quantity);
    var items = readCart()
      .map(function (row) {
        if (variantKey(row) !== key) return row;
        row.quantity = qty;
        return row;
      })
      .filter(function (row) {
        return Number(row.quantity) > 0;
      });
    writeCart(items);
    return items;
  }

  function removeItem(key) {
    writeCart(
      readCart().filter(function (row) {
        return variantKey(row) !== key;
      })
    );
  }

  function clearCart() {
    writeCart([]);
  }

  function updateHeaderCount() {
    var el = document.querySelector("[data-luneva-cart-count]");
    if (!el) return;
    var count = cartCount();
    el.textContent = count > 0 ? "Cart (" + count + ")" : "Cart";
  }

  function initHero() {
    var slides = document.querySelectorAll(".lv-hero__slide");
    var dots = document.querySelectorAll(".lv-hero__dots button");
    if (!slides.length) return;

    slides.forEach(function (slide) {
      var focus = slide.getAttribute("data-focus");
      if (focus) slide.style.setProperty("--lv-focus", focus);
    });

    var index = 0;
    function show(next) {
      index = (next + slides.length) % slides.length;
      slides.forEach(function (slide, i) {
        slide.classList.toggle("is-active", i === index);
      });
      dots.forEach(function (dot, i) {
        dot.classList.toggle("is-active", i === index);
      });
    }
    dots.forEach(function (dot, i) {
      dot.addEventListener("click", function () {
        show(i);
      });
    });
    window.setInterval(function () {
      show(index + 1);
    }, 5500);
  }

  function initGallery() {
    var main = document.querySelector(".lv-gallery__main img");
    var thumbs = document.querySelectorAll(".lv-thumbs button");
    if (!main || !thumbs.length) return;
    thumbs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var src = btn.getAttribute("data-src");
        if (!src) return;
        main.src = src;
        thumbs.forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
      });
    });
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderReviewCard(folder, productName, review) {
    var hasImage = !!(review && review.image);
    var mediaHtml = "";
    if (hasImage) {
      var base = "/luneva/assets/" + folder + "/reviews/";
      var alt = productName + " from " + review.author;
      mediaHtml =
        '<div class="lv-review-card__media"><img src="' +
        base +
        review.image +
        '" alt="' +
        escapeHtml(alt) +
        '" loading="lazy" /></div>';
    }
    return (
      '<article class="lv-review-card' +
      (hasImage ? "" : " lv-review-card--text") +
      '">' +
      mediaHtml +
      '<div class="lv-review-card__body"><div class="lv-review-card__stars" aria-hidden="true">★★★★★</div>' +
      "<p>\u201C" +
      escapeHtml(review.quote) +
      "\u201D</p>" +
      "<footer>" +
      escapeHtml(review.author) +
      " · " +
      escapeHtml(review.location) +
      "</footer></div></article>"
    );
  }

  function initProductReviews() {
    var section = document.querySelector("[data-luneva-reviews]");
    if (!section) return;
    var root = document.querySelector("[data-luneva-product]");
    var slug = root ? root.getAttribute("data-slug") : "";
    var data = LUNEVA_REVIEWS[slug];
    var grid = section.querySelector("[data-luneva-reviews-grid]");
    if (!data || !grid || !data.items.length) {
      section.hidden = true;
      return;
    }
    grid.innerHTML = data.items
      .map(function (review) {
        return renderReviewCard(data.folder, data.name, review);
      })
      .join("");
  }

  function currencyApi() {
    return window.LunevaCurrency || null;
  }

  function whenCurrencyReady(fn) {
    if (currencyApi()) {
      currencyApi().ready.then(fn);
      return;
    }
    var script = document.createElement("script");
    script.src = "/js/luneva-currency.js?v=1";
    script.onload = function () {
      if (currencyApi()) currencyApi().ready.then(fn);
      else fn();
    };
    script.onerror = function () {
      fn();
    };
    document.head.appendChild(script);
  }

  function money(n) {
    var cur = currencyApi();
    if (cur) return cur.formatMoney(n);
    return "$" + (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
  }

  function lunevaCompareAtUSD(item) {
    var cur = currencyApi();
    if (cur) {
      var compare = cur.comparePrice((item && item.size) || "30x45");
      if (compare > 0) return compare;
      return 0;
    }
    var stored = Number(item && item.compareAtUSD);
    if (Number.isFinite(stored) && stored > 0) return stored;
    var size = String((item && item.size) || "30x45");
    return LUNEVA_COMPARE_BY_SIZE[size] || LUNEVA_COMPARE_BY_SIZE["30x45"];
  }

  function formatSalePriceHtml(sale, compare) {
    var cur = currencyApi();
    if (cur) return cur.formatSaleHtml(sale, compare);
    var saleNum = Number(sale);
    var compareNum = Number(compare);
    if (!Number.isFinite(saleNum)) saleNum = 0;
    if (!Number.isFinite(compareNum) || compareNum <= saleNum) {
      return '<span class="lv-price__sale">$' + Math.round(saleNum) + "</span>";
    }
    return (
      '<span class="lv-price__compare">$' +
      Math.round(compareNum) +
      '</span><span class="lv-price__sale">$' +
      Math.round(saleNum) +
      "</span>"
    );
  }

  function cartCompareTotal(items) {
    return (items || readCart()).reduce(function (sum, item) {
      var qty = Number(item.quantity) || 0;
      if (qty < 1) return sum;
      return sum + lunevaCompareAtUSD(item) * qty;
    }, 0);
  }

  function cartSavings(items) {
    return Math.max(0, cartCompareTotal(items) - cartTotal(items));
  }

  function updateMainPriceFromKit(kit) {
    if (!kit) return;
    var price = kit.getAttribute("data-price");
    var compare = kit.getAttribute("data-compare-price");
    var wrap = document.querySelector("[data-luneva-price-wrap]");
    if (wrap) wrap.innerHTML = formatSalePriceHtml(price, compare);
    var buy = document.querySelector("[data-luneva-buy-label]");
    if (buy) buy.textContent = "Buy now — " + money(price);
  }

  function initKits() {
    var kits = document.querySelectorAll(".lv-kit");
    if (!kits.length) return;
    kits.forEach(function (kit) {
      var priceEl = kit.querySelector(".lv-kit__price");
      if (priceEl) {
        priceEl.innerHTML = formatSalePriceHtml(
          kit.getAttribute("data-price"),
          kit.getAttribute("data-compare-price")
        );
      }
      kit.addEventListener("click", function () {
        kits.forEach(function (k) {
          k.classList.toggle("is-active", k === kit);
        });
        updateMainPriceFromKit(kit);
      });
    });
    updateMainPriceFromKit(
      document.querySelector(".lv-kit.is-active") || kits[0]
    );
  }

  function getActiveKit() {
    return document.querySelector(".lv-kit.is-active") || document.querySelector(".lv-kit");
  }

  function buildCartItem() {
    var root = document.querySelector("[data-luneva-product]");
    var kit = getActiveKit();
    if (!root || !kit) return null;
    var slug = root.getAttribute("data-slug");
    var name = root.getAttribute("data-name");
    var image = root.getAttribute("data-image");
    var kitId = kit.getAttribute("data-kit");
    var kitTitle = kit.getAttribute("data-title");
    var price = Number(kit.getAttribute("data-price"));
    var compareAt = Number(kit.getAttribute("data-compare-price"));
    var size = kitId === "full" ? "40x60" : "30x45";
    return {
      slug: slug,
      productSlug: slug,
      name: name + " · " + kitTitle,
      size: size,
      sizeLabel: kitTitle,
      powerType: "usb",
      powerTypeLabel: "USB",
      quantity: 1,
      unitAmountUSD: price,
      compareAtUSD: Number.isFinite(compareAt) && compareAt > 0 ? compareAt : lunevaCompareAtUSD({ size: size }),
      imageUrl: image,
      productType: "standard",
      collection: "luneva"
    };
  }

  function initCartButtons() {
    var addBtn = document.querySelector("[data-luneva-add]");
    var buyBtn = document.querySelector("[data-luneva-buy]");
    var toast = document.querySelector("[data-luneva-toast]");

    if (addBtn) {
      addBtn.addEventListener("click", function () {
        var item = buildCartItem();
        if (!item || !isLunevaSlug(item.slug)) return;
        addItem(item);
        trackLunevaAdd(item, readCart());
        window.location.href = "/luneva/cart/";
      });
    }

    if (buyBtn) {
      buyBtn.addEventListener("click", function () {
        var item = buildCartItem();
        if (!item || !isLunevaSlug(item.slug)) return;
        addItem(item);
        trackLunevaAdd(item, readCart());
        goToLunevaCheckout();
      });
    }
  }

  function analyticsApi() {
    return window.ZYBAR && window.ZYBAR.Analytics ? window.ZYBAR.Analytics : null;
  }

  function trackLunevaAdd(item, items) {
    var a = analyticsApi();
    if (!a || !item) return;
    a.trackAddToCart(
      {
        slug: item.slug,
        name: item.name,
        size: item.size,
        powerType: item.powerType || "usb",
        quantity: item.quantity || 1,
        unitPriceUSD: item.unitAmountUSD,
        collection: "luneva"
      },
      items || readCart()
    );
  }

  function trackLunevaCheckout(items) {
    var a = analyticsApi();
    if (!a) return;
    a.trackBeginCheckout(items || readCart(), cartTotal(items || readCart()));
  }

  function renderCartPage() {
    var root = document.querySelector("[data-luneva-cart-root]");
    if (!root) return;
    var items = readCart();
    if (!items.length) {
      root.innerHTML =
        '<div class="lv-empty"><h2 class="lv-section-title">Your LUNEVA cart is empty</h2><p class="lv-section-text">Browse the collection and add a kit when you’re ready.</p><p style="margin-top:2rem"><a class="lv-btn lv-btn-primary" href="/luneva/shop/">Shop LUNEVA</a></p></div>';
      return;
    }

    var rows = items
      .map(function (item) {
        var key = variantKey(item);
        return (
          '<article class="lv-cart-item" data-key="' +
          key +
          '">' +
          '<a class="lv-cart-item__media" href="/products/' +
          item.slug +
          '/"><img src="' +
          lunevaImageUrl(item) +
          '" alt="' +
          (item.name || "") +
          '" loading="lazy" /></a>' +
          '<div class="lv-cart-item__info">' +
          "<h3>" +
          (item.name || "LUNEVA kit") +
          "</h3>" +
          "<p>" +
          (item.sizeLabel || "") +
          "</p>" +
          '<p class="lv-cart-item__price">' +
          formatSalePriceHtml(catalogUnitPrice(item), lunevaCompareAtUSD(item)) +
          "</p>" +
          '<div class="lv-cart-item__qty">' +
          '<button type="button" data-qty-delta="-1" aria-label="Decrease">−</button>' +
          "<span>" +
          item.quantity +
          "</span>" +
          '<button type="button" data-qty-delta="1" aria-label="Increase">+</button>' +
          "</div>" +
          '<button type="button" class="lv-cart-item__remove" data-remove>Remove</button>' +
          "</div></article>"
        );
      })
      .join("");

    var subtotal = cartTotal(items);
    var compareTotal = cartCompareTotal(items);
    var savings = cartSavings(items);
    var savingsRow =
      savings > 0
        ? '<div class="lv-cart-summary__row lv-cart-summary__row--compare"><span>Original price</span><span class="lv-price__compare">' +
          money(compareTotal) +
          "</span></div>" +
          '<div class="lv-cart-summary__row lv-cart-summary__row--savings"><span>You save</span><strong>' +
          money(savings) +
          "</strong></div>"
        : "";

    root.innerHTML =
      '<div class="lv-cart-layout"><div class="lv-cart-list">' +
      rows +
      '</div><aside class="lv-cart-summary"><h2>Order summary</h2>' +
      savingsRow +
      '<div class="lv-cart-summary__row"><span>Subtotal</span><strong>' +
      money(subtotal) +
      "</strong></div>" +
      '<button class="lv-btn lv-btn-primary lv-btn-block" type="button" data-luneva-go-checkout>Checkout</button>' +
      '<a class="lv-btn lv-btn-outline lv-btn-block" href="/luneva/shop/" style="margin-top:1rem">Continue shopping</a>' +
      "</aside></div>";

    var goCheckout = root.querySelector("[data-luneva-go-checkout]");
    if (goCheckout) {
      goCheckout.addEventListener("click", function () {
        goToLunevaCheckout();
      });
    }
    root.querySelectorAll(".lv-cart-item").forEach(function (row) {
      var key = row.getAttribute("data-key");
      var item = items.find(function (i) {
        return variantKey(i) === key;
      });
      row.querySelectorAll("[data-qty-delta]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var delta = Number(btn.getAttribute("data-qty-delta"));
          updateQuantity(key, (Number(item.quantity) || 0) + delta);
          renderCartPage();
          updateHeaderCount();
        });
      });
      var remove = row.querySelector("[data-remove]");
      if (remove) {
        remove.addEventListener("click", function () {
          removeItem(key);
          renderCartPage();
          updateHeaderCount();
        });
      }
    });
  }

  function catalogUnitPrice(item) {
    var slug = String((item && (item.slug || item.productSlug)) || "");
    var size = String((item && item.size) || "30x45");
    var cur = currencyApi();
    if (cur && isLunevaSlug(slug)) return cur.kitPrice(size);
    var pricing = window.ZYBAR && window.ZYBAR.Pricing;
    if (pricing && typeof pricing.calculateProductUnitPrice === "function") {
      var priced = pricing.calculateProductUnitPrice({
        slug: slug,
        productSlug: slug,
        size: size,
        powerType: (item && item.powerType) || "usb"
      });
      if (Number.isFinite(priced) && priced > 0) return priced;
    }
    var cfg = window.ZYBAR_STRIPE_CONFIG || {};
    var bySlug = cfg.perProductSizePricesUSD || {};
    var row = bySlug[slug] || {};
    if (Number.isFinite(row[size]) && row[size] > 0) return Number(row[size]);
    var stored = Number(item && item.unitAmountUSD);
    if (Number.isFinite(stored) && stored > 0 && stored < 200) return stored;
    return 0;
  }

  function buildCheckoutPayload() {
    var items = readCart();
    if (!items.length) return null;
    var origin = window.location.origin;
    var lineItems = items.map(function (item) {
      var unit = catalogUnitPrice(item);
      return {
        quantity: Number(item.quantity) || 1,
        productSlug: String(item.slug || ""),
        slug: String(item.slug || ""),
        size: String(item.size || "30x45"),
        powerType: "usb",
        name: String(item.name || "LUNEVA kit"),
        unitAmountUSD: unit,
        productType: "standard"
      };
    });
    var displayItems = items.map(function (item) {
      var unit = catalogUnitPrice(item);
      return {
        name: String(item.name || "LUNEVA kit"),
        imageUrl: lunevaImageUrl(item),
        sizeLabel: item.sizeLabel || "",
        size: String(item.size || "30x45"),
        powerType: "usb",
        powerTypeLabel: "USB",
        slug: String(item.slug || ""),
        quantity: Number(item.quantity) || 1,
        unitPriceUSD: unit,
        compareAtUnitUSD: lunevaCompareAtUSD(item)
      };
    });
    return {
      lineItems: lineItems,
      displayItems: displayItems,
      shippingMethod: "standard",
      _shippingChosen: true,
      collection: "luneva",
      country: currencyApi() ? currencyApi().getCountry() : null,
      successUrl:
        origin +
        "/luneva/purchase-confirmation/?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: origin + "/luneva/checkout/"
    };
  }

  function writeCheckoutPending(payload) {
    window.sessionStorage.setItem("luneva.checkout.pending", JSON.stringify(payload));
  }

  function goToLunevaCheckout() {
    var payload = buildCheckoutPayload();
    if (!payload) {
      window.location.href = "/luneva/shop/";
      return;
    }
    try {
      writeCheckoutPending(payload);
    } catch (err) {
      console.error(err);
      alert("Could not start checkout. Please try again.");
      return;
    }
    trackLunevaCheckout(payload.lineItems);
    window.location.href = "/luneva/checkout/";
  }

  function renderCheckoutPage() {
    // Custom Stripe checkout is owned by checkout-page.js on /luneva/checkout/.
    // Ensure a pending payload exists before that script initializes.
    if (!document.getElementById("checkout-form")) return;
    try {
      var raw = window.sessionStorage.getItem("luneva.checkout.pending");
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.lineItems) && parsed.lineItems.length) return;
      }
    } catch (_) {}
    var payload = buildCheckoutPayload();
    if (payload) {
      try {
        writeCheckoutPending(payload);
      } catch (_) {}
    }
  }

  function initLunevaPopup() {
    var path = String(window.location.pathname || "").toLowerCase();
    var onLuneva =
      path.indexOf("/luneva") === 0 || path.indexOf("/products/luneva-") === 0;
    if (!onLuneva) return;
    if (path.indexOf("/luneva/admin") === 0) return;
    if (path.indexOf("/luneva/checkout") === 0) return;
    if (path.indexOf("/luneva/cart") === 0) return;
    if (path.indexOf("/luneva/purchase-confirmation") === 0) return;

    function bootPopup() {
      if (window.LunevaPopup && typeof window.LunevaPopup.start === "function") {
        window.LunevaPopup.start();
      }
    }

    if (window.LunevaPopup) {
      bootPopup();
      return;
    }

    var script = document.createElement("script");
    script.src = "/js/luneva-popup.js?v=1";
    script.defer = true;
    script.onload = bootPopup;
    document.head.appendChild(script);
  }

  document.addEventListener("DOMContentLoaded", function () {
    whenCurrencyReady(function () {
      sanitizeCarts();
      initHero();
      initGallery();
      initKits();
      initProductReviews();
      initCartButtons();
      updateHeaderCount();
      renderCartPage();
      renderCheckoutPage();
      initLunevaPopup();
    });
  });

  window.addEventListener("luneva:cart-updated", updateHeaderCount);
  window.addEventListener("storage", updateHeaderCount);

  window.LUNEVA = {
    readCart: readCart,
    addItem: addItem,
    clearCart: clearCart,
    cartCount: cartCount
  };
})();
