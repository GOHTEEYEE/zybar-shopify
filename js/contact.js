(function () {
  'use strict';

  var form = document.getElementById('contactForm');
  var statusEl = document.getElementById('contactFormStatus');
  var toastEl = document.getElementById('contactToast');
  if (!form) return;

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = 'contact-status' + (isError ? ' is-error' : ' is-success');
  }

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    toastEl.setAttribute('aria-hidden', 'false');
    window.setTimeout(function () {
      toastEl.classList.remove('is-visible');
      toastEl.setAttribute('aria-hidden', 'true');
    }, 2800);
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    setStatus('', false);

    var payload = {
      name: (document.getElementById('contactName') || {}).value || '',
      email: (document.getElementById('contactEmail') || {}).value || '',
      phone: (document.getElementById('contactPhone') || {}).value || '',
      carModelInterest: (document.getElementById('contactCarModel') || {}).value || '',
      message: (document.getElementById('contactMessage') || {}).value || ''
    };

    payload.name = payload.name.trim();
    payload.email = payload.email.trim();
    payload.phone = payload.phone.trim();
    payload.carModelInterest = payload.carModelInterest.trim();
    payload.message = payload.message.trim();

    if (!payload.name || !payload.email || !payload.carModelInterest || !payload.message) {
      setStatus('Please fill in all required fields.', true);
      return;
    }

    if (!isValidEmail(payload.email)) {
      setStatus('Please enter a valid email address.', true);
      return;
    }

    var submitBtn = form.querySelector('button[type="submit"]');
    var originalLabel = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
    }
    setStatus('Sending your inquiry…', false);

    try {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = controller
        ? window.setTimeout(function () {
            controller.abort();
          }, 20000)
        : null;

      var res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      });
      if (timer) window.clearTimeout(timer);

      var json = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(json.error || 'Unable to submit inquiry.');

      if (window.ZYBAR && window.ZYBAR.Analytics && typeof window.ZYBAR.Analytics.trackContactSubmit === 'function') {
        window.ZYBAR.Analytics.trackContactSubmit({ car_model: payload.carModelInterest });
      }
      form.reset();
      setStatus('Thank you! Your inquiry has been submitted.', false);
      showToast('Thank you! We will contact you soon.');
    } catch (err) {
      var msg =
        err && err.name === 'AbortError'
          ? 'Request timed out. Please try again in a moment.'
          : err && err.message
            ? err.message
            : 'Submission failed. Please try again.';
      setStatus(msg, true);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel || 'Send Inquiry';
      }
    }
  });
})();
