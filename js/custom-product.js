(function () {
  'use strict';

  var SLUG = 'custom-led-car-wall-art';
  var SESSION_KEY = 'zybar.custom.upload.session';
  var MIN_PHOTOS = 1;
  var MAX_PHOTOS = 1;
  var MAX_BYTES = 10 * 1024 * 1024;

  var state = {
    photos: [],
    vehicleModel: '',
    lightingPreference: '',
    uploading: 0
  };

  var fieldsMounted = false;

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
    var pricing = getPricing();
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
    state.vehicleModel = readField('customVehicleModel');
    state.lightingPreference = readField('customLightingPreference');
    updateLightingCharCount();
  }

  function updateLightingCharCount() {
    var field = document.getElementById('customLightingPreference');
    var counter = document.getElementById('customLightingCount');
    if (!field || !counter) return;
    var len = String(field.value || '').length;
    counter.textContent = len + '/100';
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

  function getCompareAtPrice() {
    var pricing = getPricing();
    if (!pricing || typeof pricing.calculateProductCompareAtPrice !== 'function') return 0;
    return Number(
      pricing.calculateProductCompareAtPrice({
        slug: SLUG,
        productSlug: SLUG,
        size: getSelectedSize(),
        powerType: getSelectedPowerType()
      })
    ) || 0;
  }

  function renderPriceBreakdown() {
    var box = document.getElementById('customPriceBreakdown');
    if (!box) return;

    var base = getBasePrice();
    var fee = getCustomFee();
    var total = getTotalUnitPrice();
    var compareAt = getCompareAtPrice();
    var original = compareAt > total ? compareAt : base + fee;

    box.innerHTML =
      '<div class="pdp-custom-price-row">' +
      '<span>Original Price</span>' +
      '<span class="pdp-custom-price-original">' + esc(formatUsd(original)) + '</span>' +
      '</div>' +
      '<div class="pdp-custom-price-row pdp-custom-price-row--fee">' +
      '<span>Custom Design Fee</span>' +
      '<span>+' + esc(formatUsd(fee)) + '</span>' +
      '</div>' +
      '<div class="pdp-custom-price-divider" aria-hidden="true"></div>' +
      '<div class="pdp-custom-price-row pdp-custom-price-row--today">' +
      '<span>Today\'s Price</span>' +
      '<span>' + esc(formatUsd(total)) + '</span>' +
      '</div>' +
      '<p class="pdp-custom-price-shipping"><span class="pdp-shipping-underline">Shipping</span> calculated at checkout.</p>';

    var priceEl = document.querySelector('.product-price, [data-pdp-price], .pdp-price-sale');
    if (priceEl) priceEl.textContent = formatUsd(total) + ' USD';

    var stickyPrice = document.querySelector('.pdp-sticky-price');
    if (stickyPrice) stickyPrice.textContent = formatUsd(total);
  }

  function renderPhotoPreviews() {
    var grid = document.getElementById('customUploadPreview');
    var zone = document.getElementById('customUploadZone');
    if (!grid) return;

    if (!state.photos.length) {
      grid.innerHTML = '';
      grid.hidden = true;
      if (zone) {
        zone.classList.remove('has-photo', 'is-uploading');
        var empty = zone.querySelector('.pdp-custom-upload-empty');
        if (empty) empty.hidden = false;
      }
      return;
    }

    var photo = state.photos[0];
    grid.hidden = false;

    if (photo.uploading && !(photo.preview || photo.url || photo.path)) {
      grid.innerHTML = '<div class="pdp-custom-upload-loading" aria-live="polite">Uploading your photo…</div>';
    } else {
      grid.innerHTML =
        '<figure class="pdp-custom-upload-thumb">' +
        '<img src="' +
        esc(photo.preview || photo.url) +
        '" alt="Your vehicle" loading="lazy" />' +
        '<button type="button" class="pdp-custom-upload-remove" data-remove-photo="0" aria-label="Remove photo">×</button>' +
        (photo.uploading
          ? '<span class="pdp-custom-upload-progress">Uploading…</span>'
          : '<span class="pdp-custom-upload-change">Tap to change</span>') +
        '</figure>';
    }

    if (zone) {
      zone.classList.toggle('is-uploading', !!photo.uploading);
      zone.classList.toggle(
        'has-photo',
        !photo.uploading && !!(photo.url || photo.path || photo.preview)
      );
      var empty = zone.querySelector('.pdp-custom-upload-empty');
      if (empty) {
        empty.hidden =
          zone.classList.contains('has-photo') ||
          zone.classList.contains('is-uploading');
      }
    }
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('No file'));
      if (/image\/heic|image\/heif/i.test(file.type)) {
        return reject(new Error('HEIC photos are not supported in this browser. Please export as JPG or PNG.'));
      }
      if (!/^image\/(jpeg|jpg|png)$/i.test(file.type)) {
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
    el.hidden = !message;
    el.className = 'pdp-custom-upload-message' + (isError ? ' is-error' : message ? ' is-ok' : '');
  }

  function handleFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    if (state.uploading > 0) {
      setUploadMessage('Please wait for your photo to finish uploading.', true);
      return;
    }

    var file = files[0];
    setUploadMessage('');
    state.photos = [];

    var placeholder = { uploading: true, preview: '', name: file.name };
    state.photos.push(placeholder);
    state.uploading = 1;
    renderPhotoPreviews();

    uploadPhoto(file)
      .then(function (photo) {
        state.photos = [photo];
      })
      .catch(function (err) {
        state.photos = [];
        setUploadMessage((err && err.message) || 'Upload failed.', true);
      })
      .finally(function () {
        state.uploading = 0;
        renderPhotoPreviews();
      });
  }

  function getConfig() {
    syncFormState();
    return {
      vehicleBrand: '',
      vehicleModel: state.vehicleModel,
      vehicleYear: '',
      specialRequests: state.lightingPreference,
      lightingPreference: state.lightingPreference,
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
      return { ok: false, message: 'Please wait for your photo to finish uploading.' };
    }
    var readyPhotos = state.photos.filter(function (p) {
      return p && !p.uploading && (p.url || p.path);
    });
    if (readyPhotos.length < MIN_PHOTOS) {
      return { ok: false, message: 'Please upload a clear photo of your vehicle.' };
    }
    if (!state.vehicleModel) {
      return { ok: false, message: 'Please enter your car model.' };
    }
    return { ok: true };
  }

  function bindUploadZone() {
    var zone = document.getElementById('customUploadZone');
    var input = document.getElementById('customUploadInput');
    if (!zone || !input || zone.dataset.bound === '1') return;
    zone.dataset.bound = '1';

    zone.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest('[data-remove-photo]');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        state.photos = [];
        renderPhotoPreviews();
        setUploadMessage('');
        return;
      }
      input.click();
    });
    zone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
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
  }

  function bindForm() {
    var model = document.getElementById('customVehicleModel');
    if (model && model.dataset.bound !== '1') {
      model.dataset.bound = '1';
      model.addEventListener('input', syncFormState);
    }

    var lighting = document.getElementById('customLightingPreference');
    if (lighting && lighting.dataset.bound !== '1') {
      lighting.dataset.bound = '1';
      lighting.addEventListener('input', syncFormState);
      updateLightingCharCount();
    }

    if (!document.body.dataset.customVariantBound) {
      document.body.dataset.customVariantBound = '1';
      document.addEventListener('click', function (e) {
        if (!e.target || !e.target.closest('.size-option, .power-type-option, .power-option')) return;
        window.setTimeout(renderPriceBreakdown, 0);
      });
    }
  }

  function buildConfigHtml() {
    return (
      '<div class="pdp-custom-step pdp-custom-step--photos">' +
      '<div class="pdp-custom-panel">' +
      '<div class="pdp-custom-panel-head">' +
      '<span class="pdp-custom-step-badge">1</span>' +
      '<div class="pdp-custom-panel-copy">' +
      '<span class="product-option-label">Upload Your Car</span>' +
      '<p class="pdp-custom-upload-lede">One clear photo is all we need. Front or 45° angle works best.</p>' +
      '</div>' +
      '</div>' +
      '<div class="pdp-custom-field pdp-custom-field--upload">' +
      '<div class="pdp-custom-upload">' +
      '<div id="customUploadZone" class="pdp-custom-upload-trigger" tabindex="0" role="button" aria-label="Upload your car photo">' +
      '<div class="pdp-custom-upload-empty">' +
      '<span class="pdp-custom-upload-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 16V4m0 0 4 4m-4-4-4 4"/><path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/></svg>' +
      '</span>' +
      '<span class="pdp-custom-upload-trigger-label">Upload your photo</span>' +
      '<span class="pdp-custom-upload-trigger-meta">JPG or PNG · Max 10MB</span>' +
      '</div>' +
      '<div id="customUploadPreview" class="pdp-custom-upload-preview" hidden></div>' +
      '<input id="customUploadInput" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" hidden />' +
      '</div>' +
      '<p id="customUploadMessage" class="pdp-custom-upload-message" role="status" hidden></p>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="pdp-custom-step pdp-custom-step--vehicle">' +
      '<div class="pdp-custom-panel">' +
      '<div class="pdp-custom-panel-head">' +
      '<span class="pdp-custom-step-badge">2</span>' +
      '<div class="pdp-custom-panel-copy">' +
      '<span class="product-option-label">Tell Us About Your Car</span>' +
      '</div>' +
      '</div>' +
      '<div class="pdp-custom-field">' +
      '<label class="pdp-custom-sublabel" for="customVehicleModel">Car Model</label>' +
      '<input type="text" id="customVehicleModel" class="pdp-custom-input" placeholder="e.g. BMW E36 M3" autocomplete="off" />' +
      '</div>' +
      '<div class="pdp-custom-field">' +
      '<label class="pdp-custom-sublabel" for="customLightingPreference">Lighting Preference <span class="pdp-custom-optional">(Optional)</span></label>' +
      '<div class="pdp-custom-textarea-wrap">' +
      '<textarea id="customLightingPreference" class="pdp-custom-textarea" rows="3" maxlength="100" placeholder="Describe your preferred lighting style…"></textarea>' +
      '<span class="pdp-custom-char-count" id="customLightingCount" aria-live="polite">0/100</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function reorderPdpJourney(host) {
    var config = host.querySelector('#pdpCustomConfig');
    var sizeGroup = host.querySelector('.pdp-luxury-size-group');
    var powerGroup = host.querySelector('.pdp-luxury-power-group');
    if (!config) return;

    host.insertBefore(config, host.firstChild);

    if (sizeGroup) {
      if (!host.querySelector('.pdp-custom-options-divider')) {
        var divider = document.createElement('div');
        divider.className = 'pdp-custom-options-divider';
        divider.innerHTML = '<span>Product Options</span>';
        host.insertBefore(divider, sizeGroup);
      }
      if (powerGroup && sizeGroup.nextElementSibling !== powerGroup) {
        host.insertBefore(powerGroup, sizeGroup.nextSibling);
      }
    }
  }

  function mountCustomPricing() {
    var buy = document.querySelector('.pdp-luxury-buy');
    if (!buy || document.getElementById('customPriceBreakdown')) return;

    var priceRow = buy.querySelector('.pdp-price-row');
    if (priceRow) priceRow.classList.add('pdp-luxury-hidden');

    var shippingNote = buy.querySelector('.pdp-shipping-note');
    if (shippingNote) shippingNote.classList.add('pdp-luxury-hidden');

    var box = document.createElement('div');
    box.id = 'customPriceBreakdown';
    box.className = 'pdp-custom-pricing';
    box.setAttribute('aria-live', 'polite');

    var cta = buy.querySelector('.pdp-luxury-cta, .product-add-cart');
    if (cta) {
      buy.insertBefore(box, cta);
    } else {
      buy.appendChild(box);
    }
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

  function mountPdpFields() {
    if (!isCustomPage() || fieldsMounted) return false;
    var host = document.querySelector('.pdp-luxury-options');
    if (!host) return false;

    var block = document.createElement('div');
    block.id = 'pdpCustomConfig';
    block.className = 'pdp-custom-config';
    block.innerHTML = buildConfigHtml();

    host.appendChild(block);
    fieldsMounted = true;

    reorderPdpJourney(host);
    mountCustomPricing();

    var lowStock = document.querySelector('.pdp-low-stock');
    if (lowStock) lowStock.hidden = true;

    bindForm();
    bindUploadZone();
    renderPhotoPreviews();
    document.body.classList.add('custom-product-page');

    waitForPricing().then(function () {
      renderPriceBreakdown();
    });
    window.addEventListener('zybar:pricing-ready', renderPriceBreakdown);

    return true;
  }

  function init() {
    if (!isCustomPage()) return;
    if (!mountPdpFields()) {
      document.addEventListener('zybar:pdp-luxury-ready', function onReady() {
        document.removeEventListener('zybar:pdp-luxury-ready', onReady);
        mountPdpFields();
      });
    }
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
    renderPriceBreakdown: renderPriceBreakdown,
    mountPdpFields: mountPdpFields
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
