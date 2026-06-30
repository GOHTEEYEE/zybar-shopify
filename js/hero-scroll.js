(function () {
  "use strict";

  var DESKTOP_MQ = "(min-width: 1024px)";
  var MOBILE_MQ = "(max-width: 1023px)";

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function initMobileHero() {
    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return null;

    var section = document.querySelector(".poster-hero--adaptive");
    var pin = section && section.querySelector(".poster-hero-pin");
    var compare = section && section.querySelector("#heroCompare");
    var nightImg = section && section.querySelector("#heroCompareNight");
    var handle = section && section.querySelector("#heroCompareHandle");
    if (!section || !pin || !compare || !nightImg || !handle) return null;

    gsap.registerPlugin(ScrollTrigger);

    var state = {
      position: 0,
      scrollComplete: false,
      dragging: false
    };

    function setPosition(percent, fromUser) {
      var pct = clamp(Number(percent) || 0, 0, 100);
      state.position = pct;
      var rightInset = (100 - pct).toFixed(2) + "%";
      nightImg.style.clipPath = "inset(0 " + rightInset + " 0 0)";
      handle.style.left = pct + "%";
      handle.setAttribute("aria-valuenow", String(Math.round(pct)));
      if (fromUser) {
        state.scrollComplete = true;
        handle.classList.add("is-interactive");
      }
    }

    function positionFromClientX(clientX) {
      var rect = compare.getBoundingClientRect();
      if (!rect.width) return state.position;
      return clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    }

    function onPointerDown(event) {
      if (!state.scrollComplete) return;
      state.dragging = true;
      handle.setPointerCapture(event.pointerId);
      setPosition(positionFromClientX(event.clientX), true);
    }

    function onPointerMove(event) {
      if (!state.dragging) return;
      setPosition(positionFromClientX(event.clientX), true);
    }

    function onPointerUp() {
      state.dragging = false;
    }

    function onKeyDown(event) {
      if (!state.scrollComplete) return;
      var step = event.shiftKey ? 10 : 4;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPosition(state.position - step, true);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setPosition(state.position + step, true);
      }
    }

    handle.addEventListener("pointerdown", onPointerDown);
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);
    handle.addEventListener("keydown", onKeyDown);

    compare.addEventListener("pointerdown", function (event) {
      if (!state.scrollComplete || event.target === handle || handle.contains(event.target)) return;
      setPosition(positionFromClientX(event.clientX), true);
    });

    setPosition(0, false);

    var proxy = { value: 0 };
    var scrollTween = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: "+=130%",
        pin: pin,
        scrub: 1.15,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onLeave: function () {
          state.scrollComplete = true;
          handle.classList.add("is-interactive");
        },
        onEnterBack: function () {
          state.scrollComplete = false;
          handle.classList.remove("is-interactive");
        }
      }
    });

    scrollTween.to(proxy, {
      value: 100,
      ease: "none",
      onUpdate: function () {
        setPosition(proxy.value, false);
        if (proxy.value >= 99.5) {
          state.scrollComplete = true;
          handle.classList.add("is-interactive");
        }
      }
    });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      scrollTween.scrollTrigger.kill();
      scrollTween.kill();
      setPosition(50, true);
      handle.classList.add("is-interactive");
    }

    return function cleanup() {
      handle.removeEventListener("pointerdown", onPointerDown);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerUp);
      handle.removeEventListener("keydown", onKeyDown);
      if (scrollTween.scrollTrigger) scrollTween.scrollTrigger.kill();
      scrollTween.kill();
    };
  }

  function initHero() {
    var mobileCleanup = null;
    var desktopMq = window.matchMedia(DESKTOP_MQ);
    var mobileMq = window.matchMedia(MOBILE_MQ);

    function applyMode() {
      if (mobileCleanup) {
        mobileCleanup();
        mobileCleanup = null;
      }
      if (typeof ScrollTrigger !== "undefined") {
        ScrollTrigger.getAll().forEach(function (st) {
          var trigger = st.vars && st.vars.trigger;
          if (trigger && trigger.id === "hero-scroll") {
            st.kill();
          }
        });
      }
      if (mobileMq.matches) {
        mobileCleanup = initMobileHero();
      } else if (typeof ScrollTrigger !== "undefined") {
        ScrollTrigger.refresh();
      }
    }

    applyMode();

    if (typeof desktopMq.addEventListener === "function") {
      desktopMq.addEventListener("change", applyMode);
      mobileMq.addEventListener("change", applyMode);
    } else {
      desktopMq.addListener(applyMode);
      mobileMq.addListener(applyMode);
    }

    window.addEventListener("load", function () {
      if (typeof ScrollTrigger !== "undefined") ScrollTrigger.refresh();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHero);
  } else {
    initHero();
  }
})();
