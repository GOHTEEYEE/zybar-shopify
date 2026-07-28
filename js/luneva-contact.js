(function () {
  'use strict';

  var form = document.getElementById('lunevaContactForm');
  if (!form) return;

  var statusEl = document.getElementById('lvContactStatus');
  var topicEl = document.getElementById('lvContactTopic');
  var orderWrap = document.getElementById('lvContactOrderWrap');
  var submitBtn = document.getElementById('lvContactSubmit');

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = 'lv-contact__status' + (message ? (isError ? ' is-error' : ' is-success') : '');
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function toggleOrderField() {
    if (!topicEl || !orderWrap) return;
    var show = topicEl.value === 'order_shipping';
    orderWrap.hidden = !show;
  }

  if (topicEl) {
    topicEl.addEventListener('change', toggleOrderField);
    toggleOrderField();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setStatus('', false);

    var payload = {
      name: (document.getElementById('lvContactName') || {}).value || '',
      email: (document.getElementById('lvContactEmail') || {}).value || '',
      phone: (document.getElementById('lvContactPhone') || {}).value || '',
      topic: (document.getElementById('lvContactTopic') || {}).value || '',
      kitInterest: (document.getElementById('lvContactKit') || {}).value || '',
      orderNumber: (document.getElementById('lvContactOrder') || {}).value || '',
      message: (document.getElementById('lvContactMessage') || {}).value || '',
      pageUrl: window.location.href
    };

    payload.name = payload.name.trim();
    payload.email = payload.email.trim();
    payload.phone = payload.phone.trim();
    payload.message = payload.message.trim();
    payload.orderNumber = payload.orderNumber.trim();

    if (!payload.name || !payload.email || !payload.message) {
      setStatus('Please fill in your name, email, and message.', true);
      return;
    }
    if (!isValidEmail(payload.email)) {
      setStatus('Please enter a valid email address.', true);
      return;
    }

    if (window.Analytics && typeof window.Analytics.getVisitorId === 'function') {
      payload.visitorId = window.Analytics.getVisitorId();
    }

    var originalLabel = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
    }
    setStatus('Sending your message…', false);

    fetch('/api/luneva/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.error) || 'Unable to send message.');
          return data;
        });
      })
      .then(function (data) {
        form.reset();
        toggleOrderField();
        setStatus((data && data.message) || 'Thanks — we received your message.', false);
        if (window.Analytics && typeof window.Analytics.track === 'function') {
          window.Analytics.track('luneva_contact_submit', { topic: payload.topic || 'none' });
        }
      })
      .catch(function (err) {
        setStatus((err && err.message) || 'Something went wrong. Please try again.', true);
      })
      .finally(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel || 'Send message';
        }
      });
  });
})();
