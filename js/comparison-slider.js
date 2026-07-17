/**
 * Light On / Off comparison slider — rAF-throttled, single clip-path.
 */
(function () {
  'use strict';

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function bindSlider(root, divider) {
    if (!root || !divider || root.getAttribute('data-compare-ready') === '1') return;
    root.setAttribute('data-compare-ready', '1');
    root.classList.add('comparison-slider--perf');

    var dragging = false;
    var rect = null;
    var raf = 0;
    var pendingX = null;
    var lastPos = 50;

    function measure() {
      rect = root.getBoundingClientRect();
    }

    function applyPos(percent) {
      percent = clamp(percent, 0, 100);
      lastPos = percent;
      root.style.setProperty('--pos', String(percent));
      divider.setAttribute('aria-valuenow', String(Math.round(percent)));
    }

    function flush() {
      raf = 0;
      if (pendingX == null || !rect || !rect.width) return;
      var percent = ((pendingX - rect.left) / rect.width) * 100;
      pendingX = null;
      applyPos(percent);
    }

    function queuePos(clientX) {
      pendingX = clientX;
      if (!raf) raf = window.requestAnimationFrame(flush);
    }

    function onDown(event) {
      if (event.button != null && event.button !== 0) return;
      dragging = true;
      root.classList.add('is-dragging');
      measure();
      try {
        root.setPointerCapture(event.pointerId);
      } catch (_) {}
      queuePos(event.clientX);
      event.preventDefault();
    }

    function onMove(event) {
      if (!dragging) return;
      queuePos(event.clientX);
    }

    function onUp(event) {
      if (!dragging) return;
      dragging = false;
      root.classList.remove('is-dragging');
      if (pendingX != null) flush();
      try {
        root.releasePointerCapture(event.pointerId);
      } catch (_) {}
    }

    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('lostpointercapture', onUp);

    divider.addEventListener('keydown', function (event) {
      var step = event.shiftKey ? 10 : 2;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        applyPos(lastPos - step);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        applyPos(lastPos + step);
      }
    });

    window.addEventListener('resize', function () {
      if (dragging) measure();
    }, { passive: true });

    applyPos(50);
  }

  function init() {
    document.querySelectorAll('.comparison-overlay').forEach(function (root) {
      bindSlider(root, root.querySelector('.comparison-divider, #comparisonDivider'));
    });
    document.querySelectorAll('.pdp-comparison-wrap').forEach(function (root) {
      bindSlider(root, root.querySelector('.pdp-comparison-divider, .comparison-divider'));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
