/**
 * Admin Pricing — shipping methods, power upgrades, discount codes.
 * Changes apply immediately (storefront cache refreshes within ~30s).
 */
window.renderAdminpricing = function (container) {
  if (!container) return;
  var sb = window.supabase;
  if (!sb) {
    container.innerHTML = '<p class="admin-error">Supabase not configured.</p>';
    return;
  }

  container.innerHTML =
    '<h2 class="admin-page-title">Pricing</h2>' +
    '<p style="margin:0 0 16px;color:#6b7280;font-size:13px;">' +
    'Edit shipping, power upgrades, and discount codes. Product size prices are managed under ' +
    '<a href="#products">Products</a>. Storefront and Stripe checkout read these values from Supabase.' +
    '</p>' +
    '<div class="admin-card" id="pricingShippingCard">' +
    '  <h3>Shipping methods</h3>' +
    '  <div id="shippingMethodsTable" class="admin-loading">Loading…</div>' +
    '</div>' +
    '<div class="admin-card" id="pricingPowerCard">' +
    '  <h3>Power upgrades</h3>' +
    '  <div id="powerUpgradesTable" class="admin-loading">Loading…</div>' +
    '</div>' +
    '<div class="admin-card" id="pricingDiscountCard">' +
    '  <h3>Discount codes</h3>' +
    '  <form id="discountCodeForm" style="margin-bottom:16px;">' +
    '    <div class="admin-form-group"><label for="discountCode">Code</label><input id="discountCode" type="text" required placeholder="SUMMER10" /></div>' +
    '    <div class="admin-form-group"><label for="discountLabel">Label (optional)</label><input id="discountLabel" type="text" placeholder="Summer sale" /></div>' +
    '    <div class="admin-form-group"><label for="discountType">Type</label><select id="discountType"><option value="fixed">Fixed amount (USD)</option><option value="percent">Percent off</option></select></div>' +
    '    <div class="admin-form-group"><label for="discountValue">Value</label><input id="discountValue" type="number" min="0" step="0.01" required placeholder="10" /></div>' +
    '    <div class="admin-form-group"><label for="discountMinOrder">Minimum order (USD)</label><input id="discountMinOrder" type="number" min="0" step="0.01" value="0" /></div>' +
    '    <button type="submit" class="admin-btn-primary">Add discount code</button>' +
    '    <p id="discountFormMsg" style="margin-top:10px;font-size:13px;"></p>' +
    '  </form>' +
    '  <div id="discountCodesTable" class="admin-loading">Loading…</div>' +
    '</div>';

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setMsg(el, text, isError) {
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#dc3545' : '#16a34a';
  }

  function bustPricingCache() {
    var origin = window.location.origin;
    fetch(origin + '/api/pricing?refresh=1', { cache: 'no-store' }).catch(function () {});
  }

  function loadShippingMethods() {
    var table = document.getElementById('shippingMethodsTable');
    return sb
      .from('shipping_methods')
      .select('*')
      .order('sort_order', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        var rows = res.data || [];
        if (!rows.length) {
          table.innerHTML = '<p style="color:#6b7280;">No shipping methods found. Run the store pricing migration.</p>';
          return;
        }
        table.innerHTML =
          '<table class="admin-table"><thead><tr>' +
          '<th>Code</th><th>Label</th><th>Description</th><th>Price (USD)</th><th>Default</th><th>Active</th><th></th>' +
          '</tr></thead><tbody>' +
          rows
            .map(function (row) {
              return (
                '<tr data-shipping-code="' +
                escapeHtml(row.code) +
                '">' +
                '<td><code>' +
                escapeHtml(row.code) +
                '</code></td>' +
                '<td><input class="admin-inline-input" data-field="label" value="' +
                escapeHtml(row.label || '') +
                '" /></td>' +
                '<td><input class="admin-inline-input" data-field="description" value="' +
                escapeHtml(row.description || '') +
                '" /></td>' +
                '<td><input class="admin-inline-input" data-field="price_usd" type="number" min="0" step="0.01" value="' +
                escapeHtml(row.price_usd != null ? row.price_usd : '') +
                '" style="width:90px;" /></td>' +
                '<td><input type="checkbox" data-field="is_default"' +
                (row.is_default ? ' checked' : '') +
                ' /></td>' +
                '<td><input type="checkbox" data-field="active"' +
                (row.active !== false ? ' checked' : '') +
                ' /></td>' +
                '<td><button type="button" class="admin-btn-secondary admin-save-shipping" data-code="' +
                escapeHtml(row.code) +
                '">Save</button></td>' +
                '</tr>'
              );
            })
            .join('') +
          '</tbody></table>';

        table.querySelectorAll('.admin-save-shipping').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var code = btn.getAttribute('data-code');
            var tr = table.querySelector('tr[data-shipping-code="' + code + '"]');
            if (!tr) return;
            btn.disabled = true;
            btn.textContent = 'Saving…';
            var payload = {
              label: tr.querySelector('[data-field="label"]').value.trim(),
              description: tr.querySelector('[data-field="description"]').value.trim() || null,
              price_usd: parseFloat(tr.querySelector('[data-field="price_usd"]').value),
              is_default: tr.querySelector('[data-field="is_default"]').checked,
              active: tr.querySelector('[data-field="active"]').checked,
              updated_at: new Date().toISOString()
            };
            if (!payload.label || !Number.isFinite(payload.price_usd) || payload.price_usd < 0) {
              btn.disabled = false;
              btn.textContent = 'Save';
              alert('Enter a valid label and price.');
              return;
            }
            var chain = sb.from('shipping_methods').update(payload).eq('code', code);
            chain
              .then(function (res) {
                if (res.error) throw res.error;
                if (payload.is_default) {
                  return sb
                    .from('shipping_methods')
                    .update({ is_default: false, updated_at: new Date().toISOString() })
                    .neq('code', code)
                    .then(function () {
                      return sb
                        .from('shipping_methods')
                        .update({ is_default: true, updated_at: new Date().toISOString() })
                        .eq('code', code);
                    });
                }
              })
              .then(function () {
                bustPricingCache();
                return loadShippingMethods();
              })
              .catch(function (err) {
                alert((err && err.message) || 'Could not save shipping method.');
              })
              .finally(function () {
                btn.disabled = false;
                btn.textContent = 'Save';
              });
          });
        });
      })
      .catch(function (err) {
        table.innerHTML =
          '<p class="admin-error">' +
          escapeHtml((err && err.message) || 'Failed to load shipping methods.') +
          '</p>';
      });
  }

  function loadPowerUpgrades() {
    var table = document.getElementById('powerUpgradesTable');
    return sb
      .from('power_upgrades')
      .select('*')
      .order('power_type', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        var rows = res.data || [];
        if (!rows.length) {
          table.innerHTML = '<p style="color:#6b7280;">No power upgrades found.</p>';
          return;
        }
        table.innerHTML =
          '<table class="admin-table"><thead><tr>' +
          '<th>Type</th><th>Label</th><th>Extra price (USD)</th><th>Active</th><th></th>' +
          '</tr></thead><tbody>' +
          rows
            .map(function (row) {
              return (
                '<tr data-power-type="' +
                escapeHtml(row.power_type) +
                '">' +
                '<td><code>' +
                escapeHtml(row.power_type) +
                '</code></td>' +
                '<td><input class="admin-inline-input" data-field="label" value="' +
                escapeHtml(row.label || '') +
                '" /></td>' +
                '<td><input class="admin-inline-input" data-field="price_usd" type="number" min="0" step="0.01" value="' +
                escapeHtml(row.price_usd != null ? row.price_usd : '0') +
                '" style="width:90px;" /></td>' +
                '<td><input type="checkbox" data-field="active"' +
                (row.active !== false ? ' checked' : '') +
                ' /></td>' +
                '<td><button type="button" class="admin-btn-secondary admin-save-power" data-type="' +
                escapeHtml(row.power_type) +
                '">Save</button></td>' +
                '</tr>'
              );
            })
            .join('') +
          '</tbody></table>';

        table.querySelectorAll('.admin-save-power').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var powerType = btn.getAttribute('data-type');
            var tr = table.querySelector('tr[data-power-type="' + powerType + '"]');
            if (!tr) return;
            btn.disabled = true;
            btn.textContent = 'Saving…';
            var payload = {
              label: tr.querySelector('[data-field="label"]').value.trim(),
              price_usd: parseFloat(tr.querySelector('[data-field="price_usd"]').value),
              active: tr.querySelector('[data-field="active"]').checked,
              updated_at: new Date().toISOString()
            };
            if (!payload.label || !Number.isFinite(payload.price_usd) || payload.price_usd < 0) {
              btn.disabled = false;
              btn.textContent = 'Save';
              alert('Enter a valid label and price.');
              return;
            }
            sb.from('power_upgrades')
              .update(payload)
              .eq('power_type', powerType)
              .then(function (res) {
                if (res.error) throw res.error;
                bustPricingCache();
                return loadPowerUpgrades();
              })
              .catch(function (err) {
                alert((err && err.message) || 'Could not save power upgrade.');
              })
              .finally(function () {
                btn.disabled = false;
                btn.textContent = 'Save';
              });
          });
        });
      })
      .catch(function (err) {
        table.innerHTML =
          '<p class="admin-error">' +
          escapeHtml((err && err.message) || 'Failed to load power upgrades.') +
          '</p>';
      });
  }

  function loadDiscountCodes() {
    var table = document.getElementById('discountCodesTable');
    return sb
      .from('discount_codes')
      .select('*')
      .order('code', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        var rows = res.data || [];
        if (!rows.length) {
          table.innerHTML = '<p style="color:#6b7280;">No discount codes yet.</p>';
          return;
        }
        table.innerHTML =
          '<table class="admin-table"><thead><tr>' +
          '<th>Code</th><th>Label</th><th>Type</th><th>Value</th><th>Min order</th><th>Active</th><th></th>' +
          '</tr></thead><tbody>' +
          rows
            .map(function (row) {
              return (
                '<tr data-discount-code="' +
                escapeHtml(row.code) +
                '">' +
                '<td><code>' +
                escapeHtml(row.code) +
                '</code></td>' +
                '<td><input class="admin-inline-input" data-field="label" value="' +
                escapeHtml(row.label || '') +
                '" /></td>' +
                '<td><select data-field="discount_type">' +
                '<option value="fixed"' +
                (row.discount_type === 'fixed' ? ' selected' : '') +
                '>Fixed</option>' +
                '<option value="percent"' +
                (row.discount_type === 'percent' ? ' selected' : '') +
                '>Percent</option>' +
                '</select></td>' +
                '<td><input class="admin-inline-input" data-field="value_usd" type="number" min="0" step="0.01" value="' +
                escapeHtml(row.value_usd != null ? row.value_usd : '0') +
                '" style="width:90px;" /></td>' +
                '<td><input class="admin-inline-input" data-field="min_order_usd" type="number" min="0" step="0.01" value="' +
                escapeHtml(row.min_order_usd != null ? row.min_order_usd : '0') +
                '" style="width:90px;" /></td>' +
                '<td><input type="checkbox" data-field="active"' +
                (row.active !== false ? ' checked' : '') +
                ' /></td>' +
                '<td><button type="button" class="admin-btn-secondary admin-save-discount" data-code="' +
                escapeHtml(row.code) +
                '">Save</button></td>' +
                '</tr>'
              );
            })
            .join('') +
          '</tbody></table>';

        table.querySelectorAll('.admin-save-discount').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var code = btn.getAttribute('data-code');
            var tr = table.querySelector('tr[data-discount-code="' + code + '"]');
            if (!tr) return;
            btn.disabled = true;
            btn.textContent = 'Saving…';
            var payload = {
              label: tr.querySelector('[data-field="label"]').value.trim() || null,
              discount_type: tr.querySelector('[data-field="discount_type"]').value,
              value_usd: parseFloat(tr.querySelector('[data-field="value_usd"]').value),
              min_order_usd: parseFloat(tr.querySelector('[data-field="min_order_usd"]').value) || 0,
              active: tr.querySelector('[data-field="active"]').checked,
              updated_at: new Date().toISOString()
            };
            if (!Number.isFinite(payload.value_usd) || payload.value_usd < 0) {
              btn.disabled = false;
              btn.textContent = 'Save';
              alert('Enter a valid discount value.');
              return;
            }
            sb.from('discount_codes')
              .update(payload)
              .eq('code', code)
              .then(function (res) {
                if (res.error) throw res.error;
                bustPricingCache();
                return loadDiscountCodes();
              })
              .catch(function (err) {
                alert((err && err.message) || 'Could not save discount code.');
              })
              .finally(function () {
                btn.disabled = false;
                btn.textContent = 'Save';
              });
          });
        });
      })
      .catch(function (err) {
        table.innerHTML =
          '<p class="admin-error">' +
          escapeHtml((err && err.message) || 'Failed to load discount codes.') +
          '</p>';
      });
  }

  var discountForm = document.getElementById('discountCodeForm');
  var discountMsg = document.getElementById('discountFormMsg');
  if (discountForm) {
    discountForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = (document.getElementById('discountCode').value || '').trim().toUpperCase();
      var label = (document.getElementById('discountLabel').value || '').trim();
      var discountType = document.getElementById('discountType').value;
      var valueUsd = parseFloat(document.getElementById('discountValue').value);
      var minOrder = parseFloat(document.getElementById('discountMinOrder').value) || 0;
      if (!code) {
        setMsg(discountMsg, 'Enter a code.', true);
        return;
      }
      if (!Number.isFinite(valueUsd) || valueUsd < 0) {
        setMsg(discountMsg, 'Enter a valid value.', true);
        return;
      }
      var btn = discountForm.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving…';
      }
      sb.from('discount_codes')
        .upsert({
          code: code,
          label: label || null,
          discount_type: discountType,
          value_usd: valueUsd,
          min_order_usd: minOrder,
          active: true,
          updated_at: new Date().toISOString()
        })
        .then(function (res) {
          if (res.error) throw res.error;
          discountForm.reset();
          document.getElementById('discountMinOrder').value = '0';
          setMsg(discountMsg, 'Discount code saved.', false);
          bustPricingCache();
          return loadDiscountCodes();
        })
        .catch(function (err) {
          setMsg(discountMsg, (err && err.message) || 'Could not save discount code.', true);
        })
        .finally(function () {
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Add discount code';
          }
        });
    });
  }

  loadShippingMethods();
  loadPowerUpgrades();
  loadDiscountCodes();
};
