(function () {
  'use strict';

  var SLUG = 'custom-led-car-wall-art';
  var SESSION_KEY = 'zybar.custom.upload.session';
  var MIN_PHOTOS = 3;
  var MAX_PHOTOS = 5;
  var MAX_BYTES = 10 * 1024 * 1024;

  var state = {
    photos: [],
    vehicleModel: '',
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

  function getPricing() {
    return window.ZYBAR && window.ZYBAR.Pricing ? window.ZYBAR.Pricing : null;
  }

  function readField(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function syncFormState() {
    state.vehicleModel = readField('customVehicleModel');
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

  function renderPhotoPreviews() {
    var grid = document.getElementById('customUploadPreview');
    if (!grid) return;
    if (!state.photos.length) {
      grid.innerHTML = '';
      grid.hidden = true;
      return;
    }
    grid.hidden = false;
    grid.innerHTML = state.photos
      .map(function (photo, index) {
        return (
          '<figure class="pdp-custom-upload-thumb" data-photo-index="' +
          index +
          '">' +
          '<img src="' +
          esc(photo.preview || photo.url) +
          '" alt="" loading="lazy" />' +
          '<button type="button" class="pdp-custom-upload-remove" data-remove-photo="' +
          index +
          '" aria-label="Remove photo">×</button>' +
          (photo.uploading ? '<span class="pdp-custom-upload-progress">…</span>' : '') +
          '</figure>'
        );
      })
      .join('');
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
    el.hidden = !message;
    el.className = 'pdp-custom-upload-message' + (isError ? ' is-error' : message ? ' is-ok' : '');
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
      vehicleBrand: '',
      vehicleModel: state.vehicleModel,
      vehicleYear: '',
      specialRequests: '',
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
      if (e.target && e.target.closest('[data-remove-photo]')) return;
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

    var preview = document.getElementById('customUploadPreview');
    if (preview && preview.dataset.bound !== '1') {
      preview.dataset.bound = '1';
      preview.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest('[data-remove-photo]');
        if (!btn) return;
        e.stopPropagation();
        var index = Number(btn.getAttribute('data-remove-photo'));
        if (!Number.isFinite(index)) return;
        state.photos.splice(index, 1);
        renderPhotoPreviews();
        setUploadMessage('');
      });
    }
  }

  function bindForm() {
    var model = document.getElementById('customVehicleModel');
    if (model && model.dataset.bound !== '1') {
      model.dataset.bound = '1';
      model.addEventListener('input', syncFormState);
    }
  }

  function mountPdpFields() {
    if (!isCustomPage() || fieldsMounted) return false;
    var host = document.querySelector('.pdp-luxury-options');
    if (!host) return false;

    var block = document.createElement('div');
    block.id = 'pdpCustomConfig';
    block.className = 'pdp-custom-config';
    block.innerHTML =
      '<div class="pdp-custom-field">' +
      '<span class="product-option-label">Car Model</span>' +
      '<input type="text" id="customVehicleModel" class="pdp-custom-input" placeholder="e.g. BMW E36 M3" autocomplete="off" />' +
      '</div>' +
      '<div class="pdp-custom-field pdp-custom-field--upload">' +
      '<span class="product-option-label">Upload Photos</span>' +
      '<div class="pdp-custom-upload">' +
      '<div id="customUploadZone" class="pdp-custom-upload-trigger" tabindex="0" role="button" aria-label="Upload vehicle photos">' +
      '<span class="pdp-custom-upload-trigger-label">Add photos</span>' +
      '<span class="pdp-custom-upload-trigger-meta">JPG or PNG · 3–5 images</span>' +
      '<input id="customUploadInput" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png" multiple hidden />' +
      '</div>' +
      '<div id="customUploadPreview" class="pdp-custom-upload-thumbs" hidden></div>' +
      '<p id="customUploadMessage" class="pdp-custom-upload-message" role="status" hidden></p>' +
      '</div>' +
      '</div>';

    host.appendChild(block);
    fieldsMounted = true;

    var lowStock = document.querySelector('.pdp-low-stock');
    if (lowStock) lowStock.hidden = true;

    bindForm();
    bindUploadZone();
    renderPhotoPreviews();
    document.body.classList.add('custom-product-page');
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
    mountPdpFields: mountPdpFields
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
