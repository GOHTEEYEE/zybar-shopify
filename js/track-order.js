(function () {
  'use strict';

  var form = document.getElementById('trackOrderForm');
  var statusEl = document.getElementById('trackOrderStatus');
  var resultEl = document.getElementById('trackOrderResult');
  if (!form) return;

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = 'contact-status' + (isError ? ' is-error' : ' is-success');
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (_) {
      return String(iso);
    }
  }

  function formatStatus(value) {
    var text = String(value || '—').replace(/_/g, ' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function renderResult(order) {
    if (!resultEl) return;
    var items = Array.isArray(order.items) ? order.items : [];
    var itemsHtml = items.length
      ? '<ul class="track-order-items">' +
        items
          .map(function (item) {
            return '<li>' + esc(item) + '</li>';
          })
          .join('') +
        '</ul>'
      : '<p class="track-order-items-empty">' + esc(order.productLabel || 'ZYBAR LED Wall Art') + '</p>';

    resultEl.hidden = false;
    resultEl.innerHTML =
      '<div class="track-order-result-card">' +
      '<h2 class="track-order-result-title">Order found</h2>' +
      '<dl class="track-order-dl">' +
      '<div><dt>Fulfillment</dt><dd>' +
      esc(formatStatus(order.fulfillmentStatus)) +
      '</dd></div>' +
      '<div><dt>Tracking number</dt><dd>' +
      esc(order.trackingNumber) +
      '</dd></div>' +
      '<div><dt>Shipping</dt><dd>' +
      esc(order.shippingMethod || '—') +
      '</dd></div>' +
      '<div><dt>Order date</dt><dd>' +
      esc(formatDate(order.createdAt)) +
      '</dd></div>' +
      '<div><dt>Payment</dt><dd>' +
      esc(formatStatus(order.paymentStatus)) +
      '</dd></div>' +
      '</dl>' +
      '<div class="track-order-products"><h3>Items</h3>' +
      itemsHtml +
      '</div>' +
      '</div>';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setStatus('', false);
    if (resultEl) {
      resultEl.hidden = true;
      resultEl.innerHTML = '';
    }

    var email = String((document.getElementById('trackEmail') || {}).value || '')
      .trim()
      .toLowerCase();
    var trackingNumber = String(
      (document.getElementById('trackNumber') || {}).value || ''
    ).trim();

    if (!email || !trackingNumber) {
      setStatus('Please enter your email and tracking number.', true);
      return;
    }
    if (!isValidEmail(email)) {
      setStatus('Please enter a valid email address.', true);
      return;
    }

    var submitBtn = form.querySelector('button[type="submit"]');
    var originalLabel = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Checking…';
    }
    setStatus('Looking up your order…', false);

    fetch('/api/track-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, trackingNumber: trackingNumber })
    })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        }).then(function (json) {
          return { ok: res.ok, status: res.status, json: json };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.json || !result.json.ok) {
          setStatus(
            (result.json && result.json.error) || 'Incorrect email or tracking number.',
            true
          );
          return;
        }
        setStatus('Order found.', false);
        renderResult(result.json.order || {});
      })
      .catch(function () {
        setStatus('Unable to check right now. Please try again.', true);
      })
      .finally(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel || 'Track Order';
        }
      });
  });
})();
