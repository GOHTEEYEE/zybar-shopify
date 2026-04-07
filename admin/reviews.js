/**
 * Admin Reviews - manage product reviews stored in Supabase.
 */
window.renderAdminreviews = function (container) {
  if (!container) return;

  container.innerHTML =
    '<h2 class="admin-page-title">Reviews</h2>' +
    '<div class="admin-card">' +
    '  <div class="admin-customers-header">' +
    '    <h3 style="margin:0;">Customer Reviews</h3>' +
    '    <div class="admin-reviews-toolbar">' +
    '      <input type="search" id="adminReviewsSearch" class="admin-search-input" placeholder="Search by customer, product, or review text" />' +
    '      <button id="adminReviewsRefresh" class="admin-btn-primary" style="width:auto;padding:0.55rem 0.9rem;margin:0;">Refresh</button>' +
    '    </div>' +
    '  </div>' +
    '  <p id="adminReviewsMeta" style="margin:0 0 10px;color:#6b7280;font-size:13px;">Loading reviews...</p>' +
    '  <div class="admin-table-wrap">' +
    '    <table class="admin-table admin-table-customers admin-table-reviews">' +
    '      <thead><tr>' +
    '        <th>Created</th>' +
    '        <th>Customer</th>' +
    '        <th>Product</th>' +
    '        <th>Rating</th>' +
    '        <th>Status</th>' +
    '        <th>Image</th>' +
    '        <th>Review</th>' +
    '        <th>Actions</th>' +
    '      </tr></thead>' +
    '      <tbody id="adminReviewsTableBody"><tr><td colspan="8" class="admin-cell-empty">No data loaded.</td></tr></tbody>' +
    '    </table>' +
    '  </div>' +
    '</div>' +
    '<div id="adminReviewEditor"></div>';

  var tbody = document.getElementById('adminReviewsTableBody');
  var meta = document.getElementById('adminReviewsMeta');
  var refreshBtn = document.getElementById('adminReviewsRefresh');
  var searchInput = document.getElementById('adminReviewsSearch');
  var editor = document.getElementById('adminReviewEditor');

  var allRows = [];
  var selectedId = null;

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(str) {
    if (!str) return '—';
    var d = new Date(str);
    if (isNaN(d.getTime())) return str;
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function formatDateInputValue(str) {
    if (!str) return '';
    var d = new Date(str);
    if (isNaN(d.getTime())) return '';
    var year = d.getFullYear();
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function reviewStars(rating) {
    var n = Math.max(1, Math.min(5, parseInt(rating, 10) || 0));
    return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
  }

  function setMeta(text, isError) {
    if (!meta) return;
    meta.textContent = text || '';
    meta.style.color = isError ? '#b91c1c' : '#6b7280';
  }

  function getSelectedRow() {
    if (!selectedId) return null;
    for (var i = 0; i < allRows.length; i += 1) {
      if (String(allRows[i].id) === String(selectedId)) return allRows[i];
    }
    return null;
  }

  function renderEditor(review) {
    if (!editor) return;
    if (!review) {
      editor.innerHTML = '';
      return;
    }

    var imagePreview = review.image_data_url
      ? '<div class="admin-review-image-preview"><img src="' + escapeHtml(review.image_data_url) + '" alt="" class="admin-img-thumb" style="width:64px;height:64px;" /><a href="' + escapeHtml(review.image_data_url) + '" target="_blank" rel="noopener">Open image</a></div>'
      : '<span class="admin-cell-empty">No review image uploaded.</span>';

    editor.innerHTML =
      '<div class="admin-card">' +
      '  <h3>Edit Review <span class="admin-edit-subtitle">— ID ' + escapeHtml(review.id) + '</span></h3>' +
      '  <p style="margin-top:0;color:#6b7280;font-size:13px;">Use this section to adjust review text, rating, customer name, product name, upload date, or moderation status.</p>' +
      '  <form id="adminReviewEditForm">' +
      '    <div class="admin-form-group"><label for="editReviewCustomer">Customer name</label><input id="editReviewCustomer" type="text" value="' + escapeHtml(review.customer_name || '') + '" required /></div>' +
      '    <div class="admin-form-group"><label for="editReviewProduct">Product name</label><input id="editReviewProduct" type="text" value="' + escapeHtml(review.product_name || '') + '" required /></div>' +
      '    <div class="admin-form-group"><label for="editReviewSlug">Product slug</label><input id="editReviewSlug" type="text" value="' + escapeHtml(review.product_slug || '') + '" required /></div>' +
      '    <div class="admin-form-group"><label for="editReviewRating">Rating</label><select id="editReviewRating"><option value="5">5</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1</option></select></div>' +
      '    <div class="admin-form-group"><label for="editReviewStatus">Status</label><select id="editReviewStatus"><option value="approved">approved</option><option value="pending">pending</option><option value="rejected">rejected</option></select></div>' +
      '    <div class="admin-form-group"><label for="editReviewCreatedAt">Date uploaded</label><input id="editReviewCreatedAt" type="date" value="' + escapeHtml(formatDateInputValue(review.created_at)) + '" /></div>' +
      '    <div class="admin-form-group"><label>Current image</label><div>' + imagePreview + '</div></div>' +
      '    <div class="admin-form-group"><label for="editReviewImageDataUrl">Image data URL</label><textarea id="editReviewImageDataUrl" rows="4" placeholder="Paste data:image/... string only if you need to replace the stored review image.">' + escapeHtml(review.image_data_url || '') + '</textarea></div>' +
      '    <div class="admin-form-group"><label for="editReviewText">Review text</label><textarea id="editReviewText" rows="8" required>' + escapeHtml(review.review_text || '') + '</textarea></div>' +
      '    <button type="submit" class="admin-btn-primary">Update Review</button>' +
      '    <button type="button" id="deleteReviewBtn" class="admin-btn-danger">Delete Review</button>' +
      '    <button type="button" id="cancelReviewEdit" class="admin-btn-secondary">Close</button>' +
      '    <p id="reviewEditMsg" style="margin-top:10px;font-size:13px;"></p>' +
      '  </form>' +
      '</div>';

    var ratingSelect = document.getElementById('editReviewRating');
    var statusSelect = document.getElementById('editReviewStatus');
    if (ratingSelect) ratingSelect.value = String(Math.max(1, Math.min(5, parseInt(review.rating, 10) || 5)));
    if (statusSelect) statusSelect.value = review.status || 'approved';

    var cancelBtn = document.getElementById('cancelReviewEdit');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        selectedId = null;
        renderEditor(null);
        renderRows();
      });
    }

    var form = document.getElementById('adminReviewEditForm');
    var msgEl = document.getElementById('reviewEditMsg');
    var deleteBtn = document.getElementById('deleteReviewBtn');

    function setMsg(text, isError) {
      if (!msgEl) return;
      msgEl.textContent = text || '';
      msgEl.style.color = isError ? '#dc3545' : '#16a34a';
    }

    if (!form) return;

    function deleteReview() {
      var ok = window.confirm('Delete this review permanently? This cannot be undone.');
      if (!ok) return;

      if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
      }

      fetch('/api/admin-reviews?id=' + encodeURIComponent(review.id), {
        method: 'DELETE'
      })
        .then(function (res) {
          return res.json().then(function (json) {
            if (!res.ok) throw new Error(json.error || 'Failed to delete review.');
            return json;
          });
        })
        .then(function () {
          selectedId = null;
          renderEditor(null);
          loadReviews(null);
        })
        .catch(function (err) {
          setMsg(err && err.message ? err.message : 'Failed to delete review.', true);
        })
        .finally(function () {
          if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Delete Review';
          }
        });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', deleteReview);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      setMsg('', false);

      var customerName = (document.getElementById('editReviewCustomer').value || '').trim();
      var productName = (document.getElementById('editReviewProduct').value || '').trim();
      var productSlug = (document.getElementById('editReviewSlug').value || '').trim();
      var rating = parseInt(document.getElementById('editReviewRating').value || '5', 10);
      var statusValue = (document.getElementById('editReviewStatus').value || 'approved').trim();
      var createdAtValue = (document.getElementById('editReviewCreatedAt').value || '').trim();
      var imageDataUrl = (document.getElementById('editReviewImageDataUrl').value || '').trim();
      var reviewText = (document.getElementById('editReviewText').value || '').trim();
      var createdAtIso = createdAtValue ? (createdAtValue + 'T00:00:00.000Z') : '';

      if (!customerName || !productName || !productSlug || !reviewText) {
        setMsg('Customer name, product name, product slug, and review text are required.', true);
        return;
      }
      if (rating < 1 || rating > 5) {
        setMsg('Rating must be between 1 and 5.', true);
        return;
      }
      if (createdAtValue && !createdAtIso) {
        setMsg('Please choose a valid upload date.', true);
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating...';
      }

      fetch('/api/admin-reviews', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: review.id,
          customer_name: customerName,
          product_name: productName,
          product_slug: productSlug,
          rating: rating,
          status: statusValue,
          created_at: createdAtIso || null,
          image_data_url: imageDataUrl || null,
          review_text: reviewText
        })
      })
        .then(function (res) {
          return res.json().then(function (json) {
            if (!res.ok) throw new Error(json.error || 'Failed to update review.');
            return json;
          });
        })
        .then(function () {
          setMsg('Review updated successfully.', false);
          loadReviews(String(review.id));
        })
        .catch(function (err) {
          setMsg(err && err.message ? err.message : 'Failed to update review.', true);
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Update Review';
          }
        });
    });
  }

  function renderRows() {
    var query = (searchInput && searchInput.value || '').trim().toLowerCase();
    var rows = query
      ? allRows.filter(function (row) {
          return String(row.customer_name || '').toLowerCase().indexOf(query) !== -1 ||
            String(row.product_name || '').toLowerCase().indexOf(query) !== -1 ||
            String(row.review_text || '').toLowerCase().indexOf(query) !== -1;
        })
      : allRows.slice();

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="admin-cell-empty">No reviews found.</td></tr>';
      if (!query) renderEditor(null);
      return;
    }

    tbody.innerHTML = rows.map(function (row) {
      var isSelected = String(selectedId) === String(row.id);
      var imageHtml = row.image_data_url
        ? '<img class="admin-img-thumb" src="' + escapeHtml(row.image_data_url) + '" alt="" />'
        : '<span class="admin-cell-empty">—</span>';
      return '<tr data-review-id="' + escapeHtml(row.id) + '"' + (isSelected ? ' class="is-selected"' : '') + '>' +
        '<td>' + escapeHtml(formatDate(row.created_at)) + '</td>' +
        '<td class="admin-cell-name">' + escapeHtml(row.customer_name || '-') + '</td>' +
        '<td>' + escapeHtml(row.product_name || row.product_slug || '-') + '</td>' +
        '<td title="' + escapeHtml(reviewStars(row.rating)) + '">' + escapeHtml(String(row.rating || '-')) + '</td>' +
        '<td><span class="admin-badge admin-badge-' + escapeHtml((row.status || 'approved').toLowerCase()) + '">' + escapeHtml(row.status || 'approved') + '</span></td>' +
        '<td class="admin-cell-image">' + imageHtml + '</td>' +
        '<td style="max-width:300px;white-space:normal;">' + escapeHtml(row.review_text || '-') + '</td>' +
        '<td>' +
        '<button type="button" class="admin-btn-view" data-edit-review="' + escapeHtml(row.id) + '">Edit</button> ' +
        '<button type="button" class="admin-btn-delete-row" data-delete-review="' + escapeHtml(row.id) + '">Delete</button>' +
        '</td>' +
        '</tr>';
    }).join('');

    Array.prototype.forEach.call(tbody.querySelectorAll('[data-edit-review]'), function (btn) {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        selectedId = btn.getAttribute('data-edit-review');
        renderRows();
        renderEditor(getSelectedRow());
      });
    });

    Array.prototype.forEach.call(tbody.querySelectorAll('[data-delete-review]'), function (btn) {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        var id = btn.getAttribute('data-delete-review');
        var ok = window.confirm('Delete this review permanently? This cannot be undone.');
        if (!ok) return;
        btn.disabled = true;
        btn.textContent = 'Deleting...';
        fetch('/api/admin-reviews?id=' + encodeURIComponent(id), {
          method: 'DELETE'
        })
          .then(function (res) {
            return res.json().then(function (json) {
              if (!res.ok) throw new Error(json.error || 'Failed to delete review.');
              return json;
            });
          })
          .then(function () {
            if (String(selectedId) === String(id)) {
              selectedId = null;
              renderEditor(null);
            }
            loadReviews(selectedId);
          })
          .catch(function (err) {
            setMeta(err && err.message ? err.message : 'Failed to delete review.', true);
          })
          .finally(function () {
            btn.disabled = false;
            btn.textContent = 'Delete';
          });
      });
    });

    Array.prototype.forEach.call(tbody.querySelectorAll('tr[data-review-id]'), function (tr) {
      tr.addEventListener('click', function () {
        selectedId = tr.getAttribute('data-review-id');
        renderRows();
        renderEditor(getSelectedRow());
      });
    });
  }

  function loadReviews(nextSelectedId) {
    if (refreshBtn) refreshBtn.disabled = true;
    setMeta('Loading reviews...', false);

    fetch('/api/admin-reviews', {
      method: 'GET'
    })
      .then(function (res) {
        return res.json().then(function (json) {
          if (!res.ok) throw new Error(json.error || 'Unable to load admin reviews.');
          return json;
        });
      })
      .then(function (json) {
        allRows = Array.isArray(json.data) ? json.data : [];
        selectedId = nextSelectedId || selectedId;
        if (selectedId && !getSelectedRow()) {
          selectedId = null;
        }
        renderRows();
        renderEditor(getSelectedRow());
        setMeta('Loaded ' + allRows.length + ' reviews.', false);
      })
      .catch(function (err) {
        tbody.innerHTML = '<tr><td colspan="8" class="admin-cell-empty">Unable to load reviews.</td></tr>';
        renderEditor(null);
        setMeta(err && err.message ? err.message : 'Unable to load reviews.', true);
      })
      .finally(function () {
        if (refreshBtn) refreshBtn.disabled = false;
      });
  }

  if (refreshBtn) refreshBtn.addEventListener('click', function () { loadReviews(selectedId); });
  if (searchInput) searchInput.addEventListener('input', renderRows);
  loadReviews(null);
};
