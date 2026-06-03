/**
 * Product card light on/off hover.
 * Default: lights ON (-on file). Hover: lights OFF (base -1 file).
 *
 * Example:
 *   /Image/audi-r8-gt3-1.webp  +  /Image/audi-r8-gt3-1-on.jpg
 */
(function () {
  "use strict";

  var SELECTOR = "img.product-image";
  var IMAGE_EXTS = ["webp", "png", "jpg", "jpeg"];
  var pairCache = {};

  function normalizeSrc(url) {
    if (!url) return "";
    var q = url.indexOf("?");
    return (q === -1 ? url : url.slice(0, q)).trim();
  }

  function parseBaseSlot(src) {
    var clean = normalizeSrc(src);
    var onMatch = clean.match(/^(.*-1)-on\.(webp|png|jpg|jpeg)$/i);
    if (onMatch) return { base: onMatch[1], isOn: true };
    var offMatch = clean.match(/^(.*-1)\.(webp|png|jpg|jpeg)$/i);
    if (offMatch) return { base: offMatch[1], isOn: false };
    return null;
  }

  function loadImage(url) {
    return new Promise(function (resolve) {
      if (!url) {
        resolve(false);
        return;
      }
      var probe = new Image();
      probe.onload = function () {
        resolve(true);
      };
      probe.onerror = function () {
        resolve(false);
      };
      probe.src = url;
    });
  }

  function pickFirstExisting(basePath) {
    var chain = Promise.resolve("");
    IMAGE_EXTS.forEach(function (ext) {
      chain = chain.then(function (found) {
        if (found) return found;
        var url = basePath + "." + ext;
        return loadImage(url).then(function (ok) {
          return ok ? url : "";
        });
      });
    });
    return chain;
  }

  function resolvePair(src, dataOffSrc) {
    var key = normalizeSrc(src) + "|" + normalizeSrc(dataOffSrc || "");
    if (Object.prototype.hasOwnProperty.call(pairCache, key)) {
      return Promise.resolve(pairCache[key]);
    }

    var parsed = parseBaseSlot(src);
    if (!parsed) {
      return Promise.resolve(null);
    }

    var offBase = parsed.base;
    var onBase = parsed.base + "-on";

    var chain = Promise.resolve({ offSrc: "", onSrc: "" });

    if (dataOffSrc) {
      chain = chain.then(function () {
        return loadImage(dataOffSrc).then(function (ok) {
          return { offSrc: ok ? dataOffSrc : "", onSrc: "" };
        });
      });
    }

    chain = chain.then(function (pair) {
      if (pair.offSrc) {
        return pickFirstExisting(onBase).then(function (onSrc) {
          pair.onSrc = onSrc || (parsed.isOn ? normalizeSrc(src) : "");
          return pair;
        });
      }
      if (parsed.isOn) {
        return pickFirstExisting(offBase).then(function (offSrc) {
          return { offSrc: offSrc, onSrc: normalizeSrc(src) };
        });
      }
      return pickFirstExisting(offBase).then(function (offSrc) {
        return pickFirstExisting(onBase).then(function (onSrc) {
          return { offSrc: offSrc, onSrc: onSrc };
        });
      });
    });

    return chain.then(function (pair) {
      if (!pair || !pair.offSrc || !pair.onSrc || pair.offSrc === pair.onSrc) {
        pairCache[key] = null;
        return null;
      }
      pairCache[key] = pair;
      return pair;
    });
  }

  function bindImage(img) {
    if (!img || img.dataset.hoverSwapBound === "1") return;
    img.dataset.hoverSwapBound = "1";

    var initialSrc = normalizeSrc(img.getAttribute("src") || "");
    var dataOffSrc = normalizeSrc(img.getAttribute("data-off-src") || "");
    if (!initialSrc) return;

    resolvePair(initialSrc, dataOffSrc).then(function (pair) {
      if (!pair) return;

      var holder = img.parentElement;
      if (!holder) return;

      img.dataset.hoverSwapOff = pair.offSrc;
      img.dataset.hoverSwapOn = pair.onSrc;

      if (window.getComputedStyle(holder).position === "static") {
        holder.style.position = "relative";
      }
      holder.classList.add("has-light-swap");

      img.classList.add("product-image--base");
      img.src = pair.offSrc;
      img.style.position = "relative";
      img.style.zIndex = "1";

      var overlay = document.createElement("img");
      overlay.className = "product-image--on-layer";
      overlay.setAttribute("aria-hidden", "true");
      overlay.alt = "";
      overlay.src = pair.onSrc;
      overlay.style.opacity = "0";
      overlay.style.transition = "opacity 0.2s ease-in-out";
      holder.appendChild(overlay);

      function showOn() {
        overlay.style.opacity = "1";
      }

      function showOff() {
        overlay.style.opacity = "0";
      }

      overlay.addEventListener("load", showOn);
      if (overlay.complete) showOn();

      overlay.addEventListener("error", function () {
        img.src = pair.onSrc;
        overlay.remove();
      });

      var trigger = img.closest(".product-image-link") || img;
      trigger.addEventListener("mouseenter", showOff);
      trigger.addEventListener("mouseleave", showOn);
      trigger.addEventListener("focusin", showOff);
      trigger.addEventListener("focusout", showOn);
    });
  }

  function init() {
    document.querySelectorAll(SELECTOR).forEach(bindImage);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
