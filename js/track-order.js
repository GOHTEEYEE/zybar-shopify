(function () {
  'use strict';

  var form = document.getElementById('trackOrderForm');
  var statusEl = document.getElementById('trackOrderStatus');
  var resultEl = document.getElementById('trackOrderResult');
    if (!form) return;

  try {
    var params = new URLSearchParams(window.location.search);
    var emailInput = document.getElementById('trackEmail');
    var numberInput = document.getElementById('trackNumber');
    if (emailInput && params.get('email')) emailInput.value = params.get('email');
    if (numberInput && params.get('tracking')) numberInput.value = params.get('tracking');
  } catch (_) {}

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

  function stepState(status) {
    var key = String(status || '').toLowerCase();
    if (key === 'delivered') return 2;
    if (key === 'shipped') return 1;
    return 0;
  }

  function statusHeadline(status) {
    var key = String(status || 'unfulfilled').toLowerCase();
    if (key === 'delivered') return 'Delivered';
    if (key === 'shipped') return 'Shipped';
    if (key === 'processing') return 'Processing';
    if (key === 'cancelled') return 'Cancelled';
    return 'Order confirmed';
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

    var status = String(order.fulfillmentStatus || 'unfulfilled').toLowerCase();
    var cancelled = status === 'cancelled';
    var active = stepState(status);
    var steps = ['Confirmed', 'Shipped', 'Delivered']
      .map(function (label, index) {
        var cls = cancelled ? '' : index < active ? 'is-done' : index === active ? 'is-current' : '';
        return '<li class="' + cls + '"><span>' + label + '</span></li>';
      })
      .join('');

    var number = esc(order.trackingNumber || '—');
    var numberHtml = order.trackingUrl
      ? '<a href="' + esc(order.trackingUrl) + '" target="_blank" rel="noopener">' + number + '</a>'
      : number;
    var carrierName = order.carrier || 'the carrier';
    var carrierBtn = order.trackingUrl
      ? '<a class="btn track-carrier-btn" href="' +
        esc(order.trackingUrl) +
        '" target="_blank" rel="noopener">Track shipment</a>'
      : '';
    var address = Array.isArray(order.address) ? order.address.filter(Boolean) : [];
    var addressHtml = address.length
      ? '<section><h3>Ships to</h3><p class="track-order-address">' +
        address.map(esc).join('<br/>') +
        '</p></section>'
      : '';

    resultEl.hidden = false;
    resultEl.innerHTML =
      '<div class="track-order-result-card">' +
      (cancelled
        ? '<p class="track-order-cancelled">This order was cancelled.</p>'
        : '<ol class="track-status">' + steps + '</ol>') +
      '<p class="track-order-kicker">Your order</p>' +
      '<h2 class="track-order-result-title">' +
      esc(statusHeadline(order.fulfillmentStatus)) +
      '</h2>' +
      (order.carrier ? '<p class="track-order-carrier">' + esc(order.carrier) + '</p>' : '') +
      (order.trackingUrl
        ? '<p class="track-order-hint">' + esc(carrierName) + ' shows the latest location.</p>'
        : '') +
      (carrierBtn ? '<div class="track-order-actions">' + carrierBtn + '</div>' : '') +
      '<div class="track-order-grid">' +
      '<section><h3>Items</h3>' +
      itemsHtml +
      '</section>' +
      '<section><h3>Shipment</h3><dl class="track-order-dl">' +
      '<div><dt>Tracking number</dt><dd>' +
      numberHtml +
      '</dd></div>' +
      '<div><dt>Order date</dt><dd>' +
      esc(formatDate(order.createdAt)) +
      '</dd></div>' +
      '<div><dt>Payment</dt><dd>' +
      esc(formatStatus(order.paymentStatus)) +
      '</dd></div>' +
      '</dl></section>' +
      addressHtml +
      '</div></div>';
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

  var prefilledEmail = String((document.getElementById('trackEmail') || {}).value || '').trim();
  var prefilledTracking = String((document.getElementById('trackNumber') || {}).value || '').trim();
  if (prefilledEmail && prefilledTracking && typeof form.requestSubmit === 'function') {
    form.requestSubmit();
  }
})();
