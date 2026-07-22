(function () {
  'use strict';

  var SLUG = 'custom-led-car-wall-art';
  var SESSION_KEY = 'zybar.custom.upload.session';
  var MIN_PHOTOS = 3;
  var MAX_PHOTOS = 5;
  var MAX_BYTES = 10 * 1024 * 1024;

  var state = {
    photos: [],
    vehicleBrand: '',
    vehicleModel: '',
    vehicleYear: '',
    specialRequests: '',
    uploading: 0
  };

  function isCustomPage() {
    var path = window.location && window.location.pathname ? window.location.pathname : '';
    return path.indexOf('/products/custom-led-car-wall-art') !== -1;
  }

  function getUploadSessionId() {
    try {
      var existing = window.sessionStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      var id = 'cu_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      window.sessionStorage.setItem(SESSION_KEY, id);
      return id;
    } catch (_) {
      return 'cu_' + Date.now();
    }
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatUsd(amount) {
    var pricing = window.ZYBAR && window.ZYBAR.Pricing;
    if (pricing && pricing.formatUsd) return pricing.formatUsd(amount);
    return '$' + (Number(amount) || 0).toFixed(2);
  }

  function getPricing() {
    return window.ZYBAR && window.ZYBAR.Pricing ? window.ZYBAR.Pricing : null;
  }

  function readField(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function syncFormState() {
    state.vehicleBrand = readField('customVehicleBrand');
    state.vehicleModel = readField('customVehicleModel');
    state.vehicleYear = readField('customVehicleYear');
    state.specialRequests = readField('customSpecialRequests');
  }

  function getSelectedSize() {
    var selected = document.querySelector('.size-option.selected[data-size]');
    return selected ? selected.getAttribute('data-size') : '30x45';
  }

  function getSelectedPowerType() {
    var selected =
      document.querySelector('.product-power-options .power-type-option.selected') ||
      document.querySelector('.power-option.selected[data-power]');
    if (!selected) return 'usb';
    return selected.getAttribute('data-power-type') || selected.getAttribute('data-power') || 'usb';
  }

  function getCustomFee() {
    var pricing = getPricing();
    if (pricing && pricing.getCustomDesignFeeUSD) {
      return Number(pricing.getCustomDesignFeeUSD(SLUG)) || 10;
    }
    return 10;
  }

  function getBasePrice() {
    var pricing = getPricing();
    if (!pricing) return 0;
    if (pricing.getProductBaseUnitPriceUSD) {
      return pricing.getProductBaseUnitPriceUSD({
        slug: SLUG,
        productSlug: SLUG,
        size: getSelectedSize(),
        powerType: getSelectedPowerType()
      });
    }
    return Math.max(0, pricing.calculateProductUnitPrice({
      slug: SLUG,
      productSlug: SLUG,
      size: getSelectedSize(),
      powerType: getSelectedPowerType()
    }) - getCustomFee());
  }

  function getTotalUnitPrice() {
    var pricing = getPricing();
    if (!pricing) return 0;
    return pricing.calculateProductUnitPrice({
      slug: SLUG,
      productSlug: SLUG,
      size: getSelectedSize(),
      powerType: getSelectedPowerType()
    });
  }

  function renderPriceBreakdown() {
    var box = document.getElementById('customPriceBreakdown');
    if (!box) return;
    var base = getBasePrice();
    var fee = getCustomFee();
    var total = getTotalUnitPrice();
    box.innerHTML =
      '<div class="custom-price-row"><span>Base Product</span><span>' + esc(formatUsd(base)) + '</span></div>' +
      '<div class="custom-price-row custom-price-row--fee"><span>Custom Design Fee</span><span>+' + esc(formatUsd(fee)) + '</span></div>' +
      '<div class="custom-price-divider" aria-hidden="true"></div>' +
      '<div class="custom-price-row custom-price-row--total"><span>Total</span><span>' + esc(formatUsd(total)) + '</span></div>';
    var priceEl = document.querySelector('.product-price, [data-pdp-price]');
    if (priceEl) priceEl.textContent = formatUsd(total);
  }

  function renderPhotoPreviews() {
    var grid = document.getElementById('customUploadPreview');
    var countEl = document.getElementById('customUploadCount');
    if (!grid) return;
    if (!state.photos.length) {
      grid.innerHTML = '<p class="custom-upload-empty">No photos uploaded yet.</p>';
    } else {
      grid.innerHTML = state.photos
        .map(function (photo, index) {
          return (
            '<figure class="custom-upload-thumb" data-photo-index="' +
            index +
            '">' +
            '<img src="' +
            esc(photo.preview || photo.url) +
            '" alt="" loading="lazy" />' +
            '<button type="button" class="custom-upload-remove" data-remove-photo="' +
            index +
            '" aria-label="Remove photo">×</button>' +
            (photo.uploading ? '<span class="custom-upload-progress">Uploading…</span>' : '') +
            '</figure>'
          );
        })
        .join('');
    }
    if (countEl) {
      countEl.textContent = state.photos.length + ' / ' + MAX_PHOTOS + ' photos';
    }
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('No file'));
      if (/image\/heic|image\/heif/i.test(file.type)) {
        return reject(new Error('HEIC photos are not supported in this browser. Please export as JPG or PNG.'));
      }
      if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
        return reject(new Error('Please upload JPG or PNG images.'));
      }
      if (file.size > MAX_BYTES) {
        return reject(new Error('Each image must be under 10MB.'));
      }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var maxSide = 1800;
          var w = img.width;
          var h = img.height;
          var scale = Math.min(1, maxSide / Math.max(w, h));
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          var dataUrl = canvas.toDataURL('image/jpeg', 0.86);
          resolve({ dataUrl: dataUrl, preview: dataUrl, name: file.name });
        };
        img.onerror = function () {
          reject(new Error('Could not read this image.'));
        };
        img.src = reader.result;
      };
      reader.onerror = function () {
        reject(new Error('Could not read this file.'));
      };
      reader.readAsDataURL(file);
    });
  }

  function uploadPhoto(file) {
    return compressImage(file).then(function (compressed) {
      return fetch('/api/custom-orders/upload-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: getUploadSessionId(),
          fileName: compressed.name,
          dataUrl: compressed.dataUrl
        })
      })
        .then(function (r) {
          return r.json().then(function (data) {
            if (!r.ok) throw new Error((data && data.error) || 'Upload failed');
            return {
              id: data.id,
              path: data.path,
              url: data.url,
              name: data.name,
              preview: compressed.preview
            };
          });
        });
    });
  }

  function setUploadMessage(message, isError) {
    var el = document.getElementById('customUploadMessage');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'custom-upload-message' + (isError ? ' is-error' : message ? ' is-ok' : '');
  }

  function handleFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    if (state.photos.length + files.length > MAX_PHOTOS) {
      setUploadMessage('You can upload up to ' + MAX_PHOTOS + ' photos.', true);
      return;
    }
    setUploadMessage('');
    files.forEach(function (file) {
      var placeholder = { uploading: true, preview: '', name: file.name };
      state.photos.push(placeholder);
      state.uploading += 1;
      renderPhotoPreviews();
      uploadPhoto(file)
        .then(function (photo) {
          var idx = state.photos.indexOf(placeholder);
          if (idx !== -1) state.photos[idx] = photo;
        })
        .catch(function (err) {
          state.photos = state.photos.filter(function (p) {
            return p !== placeholder;
          });
          setUploadMessage((err && err.message) || 'Upload failed.', true);
        })
        .finally(function () {
          state.uploading = Math.max(0, state.uploading - 1);
          renderPhotoPreviews();
        });
    });
  }

  function getConfig() {
    syncFormState();
    return {
      vehicleBrand: state.vehicleBrand,
      vehicleModel: state.vehicleModel,
      vehicleYear: state.vehicleYear,
      specialRequests: state.specialRequests,
      photos: state.photos
        .filter(function (p) {
          return p && !p.uploading && (p.url || p.path);
        })
        .map(function (p) {
          return { id: p.id, path: p.path, url: p.url, name: p.name };
        })
    };
  }

  function validate() {
    syncFormState();
    if (state.uploading > 0) {
      return { ok: false, message: 'Please wait for your photos to finish uploading.' };
    }
    var readyPhotos = state.photos.filter(function (p) {
      return p && !p.uploading && (p.url || p.path);
    });
    if (readyPhotos.length < MIN_PHOTOS) {
      return { ok: false, message: 'Please upload at least ' + MIN_PHOTOS + ' clear photos of your vehicle.' };
    }
    if (!state.vehicleBrand) {
      return { ok: false, message: 'Please enter your car brand.' };
    }
    if (!state.vehicleModel) {
      return { ok: false, message: 'Please enter your car model.' };
    }
    return { ok: true };
  }

  function bindUploadZone() {
    var zone = document.getElementById('customUploadZone');
    var input = document.getElementById('customUploadInput');
    if (!zone || !input) return;

    zone.addEventListener('click', function () {
      input.click();
    });
    zone.addEventListener('dragover', function (e) {
      e.preventDefault();
      zone.classList.add('is-dragover');
    });
    zone.addEventListener('dragleave', function () {
      zone.classList.remove('is-dragover');
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('is-dragover');
      handleFiles(e.dataTransfer && e.dataTransfer.files);
    });
    input.addEventListener('change', function () {
      handleFiles(input.files);
      input.value = '';
    });

    var preview = document.getElementById('customUploadPreview');
    if (preview) {
      preview.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest('[data-remove-photo]');
        if (!btn) return;
        var index = Number(btn.getAttribute('data-remove-photo'));
        if (!Number.isFinite(index)) return;
        state.photos.splice(index, 1);
        renderPhotoPreviews();
      });
    }
  }

  function bindForm() {
    ['customVehicleBrand', 'customVehicleModel', 'customVehicleYear', 'customSpecialRequests'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', syncFormState);
    });
    document.addEventListener('click', function (e) {
      if (e.target && e.target.closest('.size-option, .power-type-option, .power-option')) {
        window.setTimeout(renderPriceBreakdown, 0);
      }
    });
  }

  function initGallery() {
    var main = document.querySelector('.product-showcase-image img');
    var thumbs = document.querySelectorAll('[data-custom-gallery-thumb]');
    if (!main || !thumbs.length) return;
    thumbs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var src = btn.getAttribute('data-src');
        if (!src) return;
        main.src = src;
        thumbs.forEach(function (t) {
          t.classList.toggle('is-active', t === btn);
        });
      });
    });
  }

  function initFaq() {
    document.querySelectorAll('[data-custom-faq]').forEach(function (item) {
      var btn = item.querySelector('[data-custom-faq-toggle]');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var open = item.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  }

  function waitForPricing() {
    return new Promise(function (resolve) {
      var pricing = getPricing();
      if (pricing && pricing.getCatalog && pricing.getCatalog().products) {
        resolve();
        return;
      }
      if (pricing && typeof pricing.load === 'function') {
        pricing.load().then(resolve).catch(resolve);
        return;
      }
      resolve();
    });
  }

  function init() {
    if (!isCustomPage()) return;
    document.body.classList.add('custom-product-page');
    bindUploadZone();
    bindForm();
    initGallery();
    initFaq();
    renderPhotoPreviews();
    waitForPricing().then(function () {
      renderPriceBreakdown();
    });
    window.addEventListener('zybar:pricing-ready', renderPriceBreakdown);
  }

  window.ZYBAR = window.ZYBAR || {};
  window.ZYBAR.CustomProduct = {
    SLUG: SLUG,
    isActive: isCustomPage,
    getConfig: getConfig,
    validate: validate,
    getCustomFee: getCustomFee,
    getBasePrice: getBasePrice,
    getTotalUnitPrice: getTotalUnitPrice,
    renderPriceBreakdown: renderPriceBreakdown
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
