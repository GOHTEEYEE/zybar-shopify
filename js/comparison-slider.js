/**
 * Light On / Off comparison slider.
 * Builds a visible DOM handle so the divider cannot disappear behind cached CSS.
 */
(function () {
  'use strict';

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function ensureHandle(divider) {
    if (!divider) return null;
    var handle = divider.querySelector('.comparison-divider-handle');
    if (!handle) {
      handle = document.createElement('span');
      handle.className = 'comparison-divider-handle';
      handle.setAttribute('aria-hidden', 'true');
      divider.appendChild(handle);
    }
    return handle;
  }

  function styleDivider(divider) {
    if (!divider) return;
    divider.style.position = 'absolute';
    divider.style.left = '0';
    divider.style.top = '0';
    divider.style.bottom = '0';
    divider.style.width = '3px';
    divider.style.marginLeft = '-1.5px';
    divider.style.background = 'rgba(255,255,255,0.95)';
    divider.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.35), 0 0 20px rgba(0,0,0,0.45)';
    divider.style.zIndex = '5';
    divider.style.cursor = 'ew-resize';
    divider.style.pointerEvents = 'auto';
    divider.style.touchAction = 'none';
    divider.style.display = 'block';
    divider.style.opacity = '1';
    divider.style.visibility = 'visible';

    var handle = ensureHandle(divider);
    if (!handle) return;
    handle.style.position = 'absolute';
    handle.style.top = '50%';
    handle.style.left = '50%';
    handle.style.width = '42px';
    handle.style.height = '42px';
    handle.style.transform = 'translate(-50%, -50%)';
    handle.style.borderRadius = '999px';
    handle.style.border = '1px solid rgba(255,255,255,0.7)';
    handle.style.background = 'rgba(10,10,12,0.82)';
    handle.style.boxShadow = '0 10px 28px rgba(0,0,0,0.5)';
    handle.style.display = 'block';
    handle.style.pointerEvents = 'none';
    handle.innerHTML =
      '<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:5px;color:#fff;font-size:14px;line-height:1;user-select:none;">‹ ›</span>';
  }

  function bindSlider(root, divider) {
    if (!root || !divider || root.getAttribute('data-compare-ready') === '1') return;
    root.setAttribute('data-compare-ready', '1');
    root.classList.add('comparison-slider--perf');
    styleDivider(divider);

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
      root.style.setProperty('--position', percent + '%');
      divider.style.transform = 'translate3d(' + percent + '%, 0, 0)';
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
      event.preventDefault();
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      root.classList.remove('is-dragging');
      if (pendingX != null) flush();
    }

    root.style.touchAction = 'none';
    root.style.cursor = 'ew-resize';
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('lostpointercapture', onUp);
    divider.addEventListener('pointerdown', onDown);

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

    window.addEventListener(
      'resize',
      function () {
        if (dragging) measure();
      },
      { passive: true }
    );

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
