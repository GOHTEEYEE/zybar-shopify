/**
 * Admin Products - Create/list products with image upload.
 * Requires schema additions in supabase/products-management.sql
 */
window.renderAdminproducts = function (container) {
  if (!container) return;
  var sb = window.supabase;
  if (!sb) {
    container.innerHTML = '<p class="admin-error">Supabase not configured.</p>';
    return;
  }

  container.innerHTML =
    '<h2 class="admin-page-title">Products</h2>' +
    '<div class="admin-card">' +
    '  <h3>Add Product</h3>' +
    '  <p style="margin-top:0;color:#6b7280;font-size:13px;">Add product name, 2 size prices (USD), description, image and status.</p>' +
    '  <form id="adminProductForm">' +
    '    <div class="admin-form-group"><label for="productName">Product name</label><input id="productName" type="text" required placeholder="Audi R8 - White" /></div>' +
    '    <div class="admin-form-group"><label for="productSlug">Slug (optional)</label><input id="productSlug" type="text" placeholder="audi-r8-white (auto-generated if empty)" /></div>' +
    '    <div class="admin-form-group"><label for="productPrice30">Price 30x45 (USD)</label><input id="productPrice30" type="number" min="0" step="0.01" required placeholder="110.00" /></div>' +
    '    <div class="admin-form-group"><label for="productPrice40">Price 40x60 (USD)</label><input id="productPrice40" type="number" min="0" step="0.01" required placeholder="150.00" /></div>' +
    '    <div class="admin-form-group"><label for="productDescription">Description</label><textarea id="productDescription" rows="6" placeholder="One feature per line. Press Enter for new row.&#10;🎨 Handmade LED Car Art&#10;💡 Multiple Lighting Modes..."></textarea></div>' +
    '    <div class="admin-form-group"><label for="productStatus">Status</label><select id="productStatus"><option value="active">active</option><option value="deactive">deactive</option></select></div>' +
    '    <div class="admin-form-group"><label for="productImage">Image</label><input id="productImage" type="file" accept="image/*" /></div>' +
    '    <button type="submit" class="admin-btn-primary">Save Product</button>' +
    '    <p id="productFormMsg" style="margin-top:10px;font-size:13px;"></p>' +
    '  </form>' +
    '</div>' +
    '<div class="admin-card">' +
    '  <h3>Product list</h3>' +
    '  <p style="margin-top:0;color:#6b7280;font-size:13px;">Click a product row to view details and update price, image, or status.</p>' +
    '  <div id="productsTable" class="admin-loading">Loading...</div>' +
    '  <div id="productEditor"></div>' +
    '</div>';

  var form = document.getElementById('adminProductForm');
  var msgEl = document.getElementById('productFormMsg');
  var selectedProductId = null;
  var productsById = {};

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setMsg(text, isError) {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.style.color = isError ? '#dc3545' : '#16a34a';
  }

  function renderEditor(product) {
    var editor = document.getElementById('productEditor');
    if (!editor) return;
    if (!product) {
      editor.innerHTML = '';
      return;
    }

    var price30Val = (product.price_30x45_rm != null && product.price_30x45_rm !== '') ? String(parseFloat(product.price_30x45_rm)) : '';
    var price40Val = (product.price_40x60_rm != null && product.price_40x60_rm !== '') ? String(parseFloat(product.price_40x60_rm)) : '';
    var imagePreview = product.image_url
      ? '<a href="' + escapeHtml(product.image_url) + '" target="_blank" rel="noopener">View current image</a>' +
        ' <span class="admin-edit-img-preview">| </span>' +
        '<img class="admin-img-thumb admin-edit-thumb" src="' + escapeHtml(product.image_url) + '" alt="" />'
      : '<span style="color:#6b7280;">No image set</span>';

    editor.innerHTML =
      '<div class="admin-card" style="margin-top:16px;">' +
      '  <h3>Edit Product <span class="admin-edit-subtitle">— ' + escapeHtml(product.name || product.slug || product.id) + '</span></h3>' +
      '  <p style="margin-top:0;color:#6b7280;font-size:13px;">Values below are pre-filled. Change only what you want to update.</p>' +
      '  <form id="adminProductEditForm">' +
      '    <div class="admin-form-group"><label for="editProductName">Product name</label><input id="editProductName" type="text" value="' + escapeHtml(product.name || '') + '" required /></div>' +
      '    <div class="admin-form-group"><label for="editProductSlug">Slug</label><input id="editProductSlug" type="text" value="' + escapeHtml(product.slug || product.id || '') + '" disabled /></div>' +
      '    <div class="admin-form-group"><label for="editProductPrice30">Price 30x45 (USD)</label><input id="editProductPrice30" type="number" min="0" step="0.01" value="' + escapeHtml(price30Val) + '" required /></div>' +
      '    <div class="admin-form-group"><label for="editProductPrice40">Price 40x60 (USD)</label><input id="editProductPrice40" type="number" min="0" step="0.01" value="' + escapeHtml(price40Val) + '" required /></div>' +
      '    <div class="admin-form-group"><label for="editProductDescription">Description</label><textarea id="editProductDescription" rows="6" placeholder="One feature per line. Press Enter for new row.">' + escapeHtml(product.description || '') + '</textarea></div>' +
      '    <div class="admin-form-group"><label for="editProductStatus">Status</label><select id="editProductStatus"><option value="active">active</option><option value="deactive">deactive</option></select></div>' +
      '    <div class="admin-form-group"><label>Current image</label><div>' + imagePreview + '</div></div>' +
      '    <div class="admin-form-group"><label for="editProductImageUrl">Image path or URL (leave empty to keep current)</label><input id="editProductImageUrl" type="text" placeholder="/Image/product-1.jpg" value="' + escapeHtml(product.image_url || '') + '" /></div>' +
      '    <div class="admin-form-group"><label for="editProductImage">Upload new image (optional)</label><input id="editProductImage" type="file" accept="image/*" /></div>' +
      '    <button type="submit" class="admin-btn-primary">Update Product</button>' +
      '    <button type="button" id="cancelProductEdit" class="admin-btn-secondary">Close</button>' +
      '    <p id="productEditMsg" style="margin-top:10px;font-size:13px;"></p>' +
      '  </form>' +
      '</div>';

    var statusEl = document.getElementById('editProductStatus');
    if (statusEl) statusEl.value = (product.status === 'deactive' ? 'deactive' : 'active');

    var cancelBtn = document.getElementById('cancelProductEdit');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        selectedProductId = null;
        renderEditor(null);
        renderTable();
      });
    }

    var editForm = document.getElementById('adminProductEditForm');
    var editMsgEl = document.getElementById('productEditMsg');

    function setEditMsg(text, isError) {
      if (!editMsgEl) return;
      editMsgEl.textContent = text || '';
      editMsgEl.style.color = isError ? '#dc3545' : '#16a34a';
    }

    if (!editForm) return;
    editForm.addEventListener('submit', function (e) {
      e.preventDefault();
      setEditMsg('', false);

      var name = (document.getElementById('editProductName').value || '').trim();
      var price30 = parseFloat(document.getElementById('editProductPrice30').value || '0');
      var price40 = parseFloat(document.getElementById('editProductPrice40').value || '0');
      var description = (document.getElementById('editProductDescription').value || '').trim();
      var status = (document.getElementById('editProductStatus').value || 'active').trim().toLowerCase();
      var imageUrlOverride = (document.getElementById('editProductImageUrl').value || '').trim();
      var imageFile = document.getElementById('editProductImage').files && document.getElementById('editProductImage').files[0];

      if (!name) {
        setEditMsg('Product name is required.', true);
        return;
      }
      if (!isFinite(price30) || price30 < 0 || !isFinite(price40) || price40 < 0) {
        setEditMsg('Both size prices must be valid positive numbers.', true);
        return;
      }
      if (status !== 'active' && status !== 'deactive') {
        setEditMsg('Status must be active or deactive.', true);
        return;
      }

      var submitBtn = editForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating...';
      }

      function doneEdit() {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Update Product';
        }
      }

      function resolveImageUrl() {
        if (imageFile) {
          var ext = imageFile.name.split('.').pop() || 'jpg';
          var filePath = (product.slug || product.id) + '-' + Date.now() + '.' + ext;
          return sb.storage
            .from('product-images')
            .upload(filePath, imageFile, { upsert: true })
            .then(function (upRes) {
              if (upRes.error) throw upRes.error;
              var pub = sb.storage.from('product-images').getPublicUrl(filePath);
              return (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : product.image_url || null;
            });
        }
        if (imageUrlOverride) return Promise.resolve(imageUrlOverride);
        return Promise.resolve(product.image_url || null);
      }

      resolveImageUrl()
        .then(function (finalImageUrl) {
          return sb.from('products')
            .update({
              name: name,
              price_rm: price30,
              price_30x45_rm: price30,
              price_40x60_rm: price40,
              description: description || null,
              status: status,
              image_url: finalImageUrl,
              updated_at: new Date().toISOString()
            })
            .eq('id', product.id);
        })
        .then(function (dbRes) {
          if (dbRes.error) throw dbRes.error;
          setEditMsg('Product updated successfully.', false);
          renderTable();
        })
        .catch(function (err) {
          var msg = (err && err.message) ? err.message : 'Failed to update product.';
          if (msg.indexOf('column') !== -1 || msg.indexOf('product-images') !== -1) {
            setEditMsg('Setup required: run supabase/products-management.sql in Supabase SQL editor.', true);
          } else {
            setEditMsg(msg, true);
          }
        })
        .finally(doneEdit);
    });
  }

  function renderTable() {
    sb.from('products')
      .select('id, name, slug, price_30x45_rm, price_40x60_rm, description, image_url, status, created_at')
      .order('created_at', { ascending: false })
      .then(function (res) {
        var data = (res && res.data) || [];
        var err = res && res.error;
        if (err) {
          document.getElementById('productsTable').innerHTML =
            '<p class="admin-error">Could not read products. Run <code>supabase/products-management.sql</code> first.</p>';
          return;
        }
        if (!data.length) {
          document.getElementById('productsTable').innerHTML = '<p>No products yet.</p>';
          renderEditor(null);
          return;
        }
        productsById = {};
        var html = '<table class="admin-table"><thead><tr><th>#</th><th>Name</th><th>Slug</th><th>Price 30x45 (USD)</th><th>Price 40x60 (USD)</th><th>Status</th><th>Image</th><th>Created</th></tr></thead><tbody>';
        function formatPrice(val) {
          var n = parseFloat(val);
          return (val != null && val !== '' && !isNaN(n) && n >= 0)
            ? ('$' + n.toFixed(2))
            : '<span class="admin-cell-empty">Not set</span>';
        }
        function formatImage(p) {
          if (p.image_url) {
            return '<a href="' + escapeHtml(p.image_url) + '" target="_blank" rel="noopener" class="admin-img-link" title="View image">' +
              '<img class="admin-img-thumb" src="' + escapeHtml(p.image_url) + '" alt="" />' +
              '<span>View</span></a>';
          }
          return '<span class="admin-cell-empty">Add image</span>';
        }
        function formatStatus(s) {
          var v = (s || '').toLowerCase();
          var cls = v === 'active' ? 'admin-badge-active' : 'admin-badge-deactive';
          return '<span class="admin-badge ' + cls + '">' + escapeHtml(v || '—') + '</span>';
        }
        data.forEach(function (p, idx) {
          productsById[p.id] = p;
          var created = (p.created_at || '').slice(0, 10);
          var selectedClass = selectedProductId && selectedProductId === p.id ? ' class="is-selected"' : '';
          html += '<tr data-product-id="' + escapeHtml(p.id) + '"' + selectedClass + '>' +
            '<td class="admin-cell-num">' + (idx + 1) + '</td>' +
            '<td class="admin-cell-name">' + escapeHtml(p.name || '-') + '</td>' +
            '<td>' + escapeHtml(p.slug || '-') + '</td>' +
            '<td class="admin-cell-price">' + formatPrice(p.price_30x45_rm) + '</td>' +
            '<td class="admin-cell-price">' + formatPrice(p.price_40x60_rm) + '</td>' +
            '<td>' + formatStatus(p.status) + '</td>' +
            '<td class="admin-cell-image">' + formatImage(p) + '</td>' +
            '<td>' + escapeHtml(created) + '</td>' +
            '</tr>';
        });
        html += '</tbody></table>';
        var tableWrap = document.getElementById('productsTable');
        tableWrap.innerHTML = html;
        tableWrap.onclick = function (evt) {
          var row = evt.target && evt.target.closest ? evt.target.closest('tr[data-product-id]') : null;
          if (!row) return;
          selectedProductId = row.getAttribute('data-product-id');
          renderTable();
          renderEditor(productsById[selectedProductId] || null);
        };
        if (selectedProductId && productsById[selectedProductId]) {
          renderEditor(productsById[selectedProductId]);
        } else if (selectedProductId && !productsById[selectedProductId]) {
          selectedProductId = null;
          renderEditor(null);
        }
      })
      .catch(function () {
        document.getElementById('productsTable').innerHTML = '<p class="admin-error">Failed to load products.</p>';
        renderEditor(null);
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setMsg('', false);

    var name = (document.getElementById('productName').value || '').trim();
    var slugInput = (document.getElementById('productSlug').value || '').trim();
    var slug = slugify(slugInput || name);
    var price30 = parseFloat(document.getElementById('productPrice30').value || '0');
    var price40 = parseFloat(document.getElementById('productPrice40').value || '0');
    var description = (document.getElementById('productDescription').value || '').trim();
    var status = (document.getElementById('productStatus').value || 'active').trim().toLowerCase();
    var imageFile = document.getElementById('productImage').files && document.getElementById('productImage').files[0];

    if (!name || !slug) {
      setMsg('Product name is required.', true);
      return;
    }
    if (!isFinite(price30) || price30 < 0 || !isFinite(price40) || price40 < 0) {
      setMsg('Both size prices must be valid positive numbers.', true);
      return;
    }
    if (status !== 'active' && status !== 'deactive') {
      setMsg('Status must be active or deactive.', true);
      return;
    }

    var submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
    }

    function finalize(imageUrl) {
      return sb.from('products').upsert({
        id: slug,
        name: name,
        slug: slug,
        price_rm: price30,
        price_30x45_rm: price30,
        price_40x60_rm: price40,
        description: description || null,
        image_url: imageUrl || null,
        status: status,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    }

    function done() {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Product';
      }
    }

    function uploadImageIfAny() {
      if (!imageFile) return Promise.resolve({ imageUrl: null });
      var ext = imageFile.name.split('.').pop() || 'jpg';
      var filePath = slug + '-' + Date.now() + '.' + ext;
      return sb.storage
        .from('product-images')
        .upload(filePath, imageFile, { upsert: true })
        .then(function (upRes) {
          if (upRes.error) throw upRes.error;
          var pub = sb.storage.from('product-images').getPublicUrl(filePath);
          var imageUrl = pub && pub.data && pub.data.publicUrl ? pub.data.publicUrl : null;
          return { imageUrl: imageUrl };
        });
    }

    uploadImageIfAny()
      .then(function (r) { return finalize(r.imageUrl); })
      .then(function (dbRes) {
        if (dbRes.error) throw dbRes.error;
        setMsg('Product saved successfully.', false);
        form.reset();
        document.getElementById('productStatus').value = 'active';
        renderTable();
      })
      .catch(function (err) {
        var msg = (err && err.message) ? err.message : 'Failed to save product.';
        if (msg.indexOf('column') !== -1 || msg.indexOf('product-images') !== -1) {
          setMsg('Setup required: run supabase/products-management.sql in Supabase SQL editor.', true);
        } else {
          setMsg(msg, true);
        }
      })
      .finally(done);
  });

  renderTable();
};
