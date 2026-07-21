(function () {
  "use strict";

  var CARD_GAP = 24;
  var DRAG_THRESHOLD = 6;
  var TRENDING_COUNT = 10;
  var BESTSELLER_COUNT = 8;

  function pickRandomProducts(products, count, excludeSlugs) {
    var excluded = excludeSlugs || [];
    var pool = products.filter(function (product) {
      return excluded.indexOf(product.slug) === -1;
    });

    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = pool[i];
      pool[i] = pool[j];
      pool[j] = temp;
    }

    return pool.slice(0, Math.min(count, pool.length));
  }

  function formatCardTitle(product, titleMap) {
    if (titleMap && titleMap[product.slug]) {
      return titleMap[product.slug];
    }
    var name = String(product.name || product.slug).replace(/\s*[–-]\s*/g, " ").replace(/\s+/g, " ").trim();
    return name + " Edition";
  }

  var ON_IMAGE_JPG_SLUGS = {
    "audi-r8-gt3": true,
    "c-lamborghini-oragne": true,
    "mercedes-benz-g63-double-tail-2": true
  };

  function productImageSrc(slug) {
    if (ON_IMAGE_JPG_SLUGS[slug]) {
      return "/Image/" + slug + "-1-on.jpg";
    }
    return "/Image/" + slug + "-1-on.webp";
  }

  function buildCard(product, titleMap, pricing) {
    var slug = product.slug;
    var href = "/products/" + slug + "/";
    var title = formatCardTitle(product, titleMap);
    var imgSrc = productImageSrc(slug);
    var prices = getCardPrices(pricing, slug);
    var safeTitle = title.replace(/"/g, "&quot;");

    var article = document.createElement("article");
    article.className = "trending-card";
    article.innerHTML =
      '<a class="trending-card-stage" href="' + href + '">' +
        '<img class="trending-card-img" src="' + imgSrc + '" alt="' + safeTitle + '" loading="lazy" width="990" height="990" onerror="if(/-on\\.webp$/i.test(this.src)){this.onerror=null;this.src=this.src.replace(/-on\\.webp$/i,\'-on.jpg\');}" />' +
        '<span class="trending-sale-badge">Sale</span>' +
      "</a>" +
      '<div class="trending-card-meta">' +
        '<a class="trending-card-link" href="' + href + '">' +
          '<h3 class="trending-card-title">' + title + "</h3>" +
        "</a>" +
        (prices.compare
          ? '<p class="trending-card-compare">' + prices.compare + "</p>"
          : "") +
        '<p class="trending-card-price"><span class="trending-card-from">From</span> ' +
        (prices.price || "—") +
        "</p>" +
      "</div>";

    return article;
  }

  function getCardPrices(pricing, slug) {
    if (!pricing || typeof pricing.getCatalog !== "function") {
      return { compare: "", price: "" };
    }
    var catalog = pricing.getCatalog();
    var product = catalog && catalog.products && catalog.products[slug];
    if (!product || !product.prices) {
      return { compare: "", price: "" };
    }
    var p30 = Number(product.prices["30x45"]) || 0;
    var p40 = Number(product.prices["40x60"]) || 0;
    var from = p30 || p40;
    var compare =
      typeof pricing.getProductCompareAtSizePriceUSD === "function"
        ? Number(pricing.getProductCompareAtSizePriceUSD(slug, "30x45")) || 0
        : 0;
    return {
      compare: compare > from ? pricing.formatUsd(compare) : "",
      price: from ? pricing.formatUsd(from) : ""
    };
  }

  function populateTrack(track, products, titleMap, pricing) {
    var fragment = document.createDocumentFragment();
    products.forEach(function (product) {
      fragment.appendChild(buildCard(product, titleMap, pricing));
    });
    track.appendChild(fragment);
  }

  function initCarousel(config) {
    var carousel = document.getElementById(config.carouselId);
    var track = document.getElementById(config.trackId);
    var prevBtn = document.getElementById(config.prevId);
    var nextBtn = document.getElementById(config.nextId);
    var currentEl = document.getElementById(config.currentId);
    var totalEl = document.getElementById(config.totalId);
    if (!carousel || !track || !prevBtn || !nextBtn || !currentEl || !totalEl) return;

    var isPointerDown = false;
    var didDrag = false;
    var startX = 0;
    var startScrollLeft = 0;
    var scrollTicking = false;

    function getCards() {
      return track.querySelectorAll(".trending-card");
    }

    function getTrackPadding() {
      return parseFloat(window.getComputedStyle(track).paddingLeft) || 0;
    }

    function getGroupSize() {
      var cards = getCards();
      if (!cards.length) return 1;
      var cardWidth = cards[0].offsetWidth;
      if (!cardWidth) return 1;
      return Math.max(1, Math.floor((carousel.clientWidth + CARD_GAP) / (cardWidth + CARD_GAP)));
    }

    function getFirstVisibleIndex() {
      var cards = getCards();
      if (!cards.length) return 0;
      var pad = getTrackPadding();
      var scrollLeft = carousel.scrollLeft;
      var index = 0;

      for (var i = 0; i < cards.length; i++) {
        var cardLeft = cards[i].offsetLeft - pad;
        if (cardLeft + cards[i].offsetWidth * 0.35 > scrollLeft + 2) {
          index = i;
          break;
        }
        index = i;
      }

      return index;
    }

    function scrollToIndex(index, behavior) {
      var cards = getCards();
      if (!cards.length) return;
      var target = Math.max(0, Math.min(index, cards.length - 1));
      var pad = getTrackPadding();
      carousel.scrollTo({
        left: cards[target].offsetLeft - pad,
        behavior: behavior || "smooth"
      });
    }

    function updateNav() {
      var cards = getCards();
      var total = cards.length;
      var current = getFirstVisibleIndex();

      totalEl.textContent = String(total);
      currentEl.textContent = String(current + 1);

      prevBtn.disabled = current <= 0;
      nextBtn.disabled = current >= total - 1;
    }

    function onScroll() {
      if (scrollTicking) return;
      scrollTicking = true;
      window.requestAnimationFrame(function () {
        updateNav();
        scrollTicking = false;
      });
    }

    carousel.addEventListener("mousedown", function (event) {
      if (event.button !== 0) return;
      isPointerDown = true;
      didDrag = false;
      startX = event.pageX;
      startScrollLeft = carousel.scrollLeft;
      carousel.classList.add("is-dragging");
    });

    carousel.addEventListener("mousemove", function (event) {
      if (!isPointerDown) return;
      var delta = event.pageX - startX;
      if (Math.abs(delta) > DRAG_THRESHOLD) {
        didDrag = true;
      }
      if (didDrag) {
        event.preventDefault();
        carousel.scrollLeft = startScrollLeft - delta;
      }
    });

    carousel.addEventListener("click", function (event) {
      if (!didDrag) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    carousel.addEventListener("dragstart", function (event) {
      event.preventDefault();
    });

    function endDrag() {
      if (!isPointerDown) return;
      isPointerDown = false;
      carousel.classList.remove("is-dragging");
      if (didDrag) {
        window.setTimeout(function () {
          didDrag = false;
          updateNav();
        }, 0);
      }
    }

    carousel.addEventListener("mouseleave", endDrag);
    window.addEventListener("mouseup", endDrag);
    carousel.addEventListener("scroll", onScroll, { passive: true });

    prevBtn.addEventListener("click", function () {
      scrollToIndex(getFirstVisibleIndex() - getGroupSize());
    });

    nextBtn.addEventListener("click", function () {
      scrollToIndex(getFirstVisibleIndex() + getGroupSize());
    });

    window.addEventListener("resize", function () {
      window.requestAnimationFrame(updateNav);
    });

    populateTrack(track, config.products, config.titleMap, config.pricing);
    updateNav();
  }

  function initProductCarousels() {
    var pricingPromise =
      window.ZYBAR && window.ZYBAR.Pricing && typeof window.ZYBAR.Pricing.load === "function"
        ? window.ZYBAR.Pricing.load()
        : Promise.resolve(window.ZYBAR && window.ZYBAR.Pricing ? window.ZYBAR.Pricing : null);

    Promise.all([
      fetch("/data/products.json").then(function (res) {
        return res.ok ? res.json() : null;
      }),
      fetch("/data/product-display-titles.json").then(function (res) {
        return res.ok ? res.json() : {};
      }),
      pricingPromise
    ])
      .then(function (results) {
        var data = results[0];
        var titleMap = results[1] || {};
        var pricing = results[2];
        var products = data && Array.isArray(data.products) ? data.products : [];
        if (!products.length) return;

        var trendingProducts = pickRandomProducts(products, TRENDING_COUNT);
        var trendingSlugs = trendingProducts.map(function (product) {
          return product.slug;
        });
        var bestsellerProducts = pickRandomProducts(products, BESTSELLER_COUNT, trendingSlugs);

        initCarousel({
          carouselId: "trending-carousel",
          trackId: "trending-carousel-track",
          prevId: "trending-nav-prev",
          nextId: "trending-nav-next",
          currentId: "trending-nav-current",
          totalId: "trending-nav-total",
          products: trendingProducts,
          titleMap: titleMap,
          pricing: pricing
        });

        initCarousel({
          carouselId: "bestseller-carousel",
          trackId: "bestseller-carousel-track",
          prevId: "bestseller-nav-prev",
          nextId: "bestseller-nav-next",
          currentId: "bestseller-nav-current",
          totalId: "bestseller-nav-total",
          products: bestsellerProducts,
          titleMap: titleMap,
          pricing: pricing
        });
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProductCarousels);
  } else {
    initProductCarousels();
  }
})();
