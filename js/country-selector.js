/**
 * Searchable country/region selector — ISO 3166-1 with flag emojis.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "zybar.checkout.country";
  var ITEM_HEIGHT = 44;
  var VIEWPORT_ROWS = 8;
  var OVERSCAN = 4;

  var countriesCache = null;
  var countriesPromise = null;

  function flagEmoji(code) {
    var c = String(code || "").toUpperCase();
    if (c.length !== 2) return "";
    return String.fromCodePoint(c.charCodeAt(0) + 127397, c.charCodeAt(1) + 127397);
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadCountries() {
    if (countriesCache) return Promise.resolve(countriesCache);
    if (countriesPromise) return countriesPromise;
    countriesPromise = fetch("/data/countries.json", { headers: { accept: "application/json" } })
      .then(function (res) {
        return res.ok ? res.json() : { countries: [] };
      })
      .then(function (data) {
        var list = Array.isArray(data && data.countries) ? data.countries : [];
        countriesCache = list
          .map(function (entry) {
            return {
              code: String(entry.code || "").toUpperCase(),
              name: String(entry.name || ""),
              flag: flagEmoji(entry.code)
            };
          })
          .filter(function (entry) {
            return entry.code.length === 2 && entry.name;
          })
          .sort(function (a, b) {
            return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
          });
        return countriesCache;
      })
      .catch(function () {
        countriesCache = [];
        return countriesCache;
      });
    return countriesPromise;
  }

  function readSavedCountry() {
    try {
      return String(window.localStorage.getItem(STORAGE_KEY) || "").toUpperCase();
    } catch (_) {
      return "";
    }
  }

  function saveCountry(code) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(code || "").toUpperCase());
    } catch (_) {}
  }

  function findCountry(countries, code) {
    var target = String(code || "").toUpperCase();
    if (!target) return null;
    for (var i = 0; i < countries.length; i++) {
      if (countries[i].code === target) return countries[i];
    }
    return null;
  }

  function filterCountries(countries, query) {
    var q = String(query || "")
      .trim()
      .toLowerCase();
    if (!q) return countries.slice();
    return countries.filter(function (c) {
      return c.name.toLowerCase().indexOf(q) !== -1 || c.code.toLowerCase().indexOf(q) !== -1;
    });
  }

  function buildMarkup(options) {
    var inputId = options.inputId || "checkout-country";
    var labelId = options.labelId || "checkout-country-label";
    return (
      '<input type="hidden" name="country" id="' +
      escapeHtml(inputId) +
      '" required />' +
      '<button type="button" class="country-select-trigger checkout-input" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="' +
      escapeHtml(labelId) +
      ' country-select-value-' +
      escapeHtml(inputId) +
      '">' +
      '<span class="country-select-flag" aria-hidden="true"></span>' +
      '<span class="country-select-value" id="country-select-value-' +
      escapeHtml(inputId) +
      '">Select country</span>' +
      '<svg class="country-select-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">' +
      '<path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-opacity="0.65" />' +
      "</svg>" +
      "</button>" +
      '<div class="country-select-backdrop" hidden aria-hidden="true"></div>' +
      '<div class="country-select-dropdown" hidden>' +
      '<div class="country-select-search-wrap">' +
      '<input type="search" class="country-select-search checkout-input" placeholder="Search countries" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Search countries" />' +
      "</div>" +
      '<div class="country-select-list-wrap" role="presentation">' +
      '<ul class="country-select-list" role="listbox" tabindex="-1" aria-label="Countries"></ul>' +
      "</div>" +
      '<p class="country-select-empty" hidden>No countries found</p>' +
      "</div>"
    );
  }

  function initContainer(container, options) {
    if (!container || container.getAttribute("data-country-select-ready") === "true") return;

    options = options || {};
    var inputId = options.inputId || container.getAttribute("data-input-id") || "checkout-country";
    var labelId = options.labelId || container.getAttribute("data-label-id") || "checkout-country-label";
    var defaultCode = (
      options.defaultCode ||
      container.getAttribute("data-default") ||
      readSavedCountry() ||
      "MY"
    ).toUpperCase();

    container.classList.add("country-select");
    container.innerHTML = buildMarkup({ inputId: inputId, labelId: labelId });

    var hiddenInput = container.querySelector('input[type="hidden"]');
    var trigger = container.querySelector(".country-select-trigger");
    var dropdown = container.querySelector(".country-select-dropdown");
    var backdrop = container.querySelector(".country-select-backdrop");
    var searchInput = container.querySelector(".country-select-search");
    var listWrap = container.querySelector(".country-select-list-wrap");
    var list = container.querySelector(".country-select-list");
    var emptyMsg = container.querySelector(".country-select-empty");
    var flagEl = container.querySelector(".country-select-flag");
    var valueEl = container.querySelector(".country-select-value");

    var state = {
      countries: [],
      filtered: [],
      selectedCode: "",
      open: false,
      activeIndex: -1,
      scrollTop: 0
    };

    function setSelected(country, persist) {
      if (!country) return;
      state.selectedCode = country.code;
      if (hiddenInput) hiddenInput.value = country.code;
      if (flagEl) flagEl.textContent = country.flag;
      if (valueEl) valueEl.textContent = country.name;
      if (persist !== false) saveCountry(country.code);
      container.dispatchEvent(
        new CustomEvent("countrychange", {
          bubbles: true,
          detail: { code: country.code, name: country.name }
        })
      );
    }

    function closeDropdown() {
      if (!state.open) return;
      state.open = false;
      dropdown.hidden = true;
      if (backdrop) backdrop.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      container.classList.remove("is-open");
      searchInput.value = "";
      state.activeIndex = -1;
      applyFilter("");
    }

    function openDropdown() {
      if (state.open) return;
      state.open = true;
      dropdown.hidden = false;
      if (backdrop) backdrop.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      container.classList.add("is-open");
      applyFilter("");
      scrollSelectedIntoView();
      window.setTimeout(function () {
        searchInput.focus();
        searchInput.select();
      }, 0);
    }

    function scrollSelectedIntoView() {
      var idx = state.filtered.findIndex(function (c) {
        return c.code === state.selectedCode;
      });
      if (idx < 0) idx = 0;
      state.activeIndex = idx;
      var listHeight = listWrap.clientHeight || ITEM_HEIGHT * VIEWPORT_ROWS;
      var maxScroll = Math.max(0, state.filtered.length * ITEM_HEIGHT - listHeight);
      var targetScroll = idx * ITEM_HEIGHT - Math.floor(VIEWPORT_ROWS / 2) * ITEM_HEIGHT;
      state.scrollTop = Math.max(0, Math.min(maxScroll, targetScroll));
      listWrap.scrollTop = state.scrollTop;
      renderVisibleRows();
      highlightActive();
    }

    function highlightActive() {
      var options = list.querySelectorAll(".country-select-option");
      options.forEach(function (el) {
        var isActive = Number(el.getAttribute("data-index")) === state.activeIndex;
        el.classList.toggle("is-active", isActive);
        el.setAttribute("aria-selected", el.classList.contains("is-selected") ? "true" : "false");
        if (isActive) el.setAttribute("aria-selected", "true");
      });
    }

    function renderVisibleRows() {
      if (!list || !listWrap) return;
      var total = state.filtered.length;
      if (!total) {
        list.innerHTML = "";
        list.style.height = "0px";
        if (emptyMsg) emptyMsg.hidden = false;
        return;
      }
      if (emptyMsg) emptyMsg.hidden = true;

      var listHeight = listWrap.clientHeight || ITEM_HEIGHT * VIEWPORT_ROWS;
      var start = Math.max(0, Math.floor(state.scrollTop / ITEM_HEIGHT) - OVERSCAN);
      var visibleCount = Math.ceil(listHeight / ITEM_HEIGHT) + OVERSCAN * 2;
      var end = Math.min(total, start + visibleCount);

      list.style.height = total * ITEM_HEIGHT + "px";
      list.style.paddingTop = start * ITEM_HEIGHT + "px";

      var html = "";
      for (var i = start; i < end; i++) {
        var country = state.filtered[i];
        var selected = country.code === state.selectedCode;
        var active = i === state.activeIndex;
        html +=
          '<li class="country-select-option' +
          (selected ? " is-selected" : "") +
          (active ? " is-active" : "") +
          '" role="option" data-index="' +
          i +
          '" data-code="' +
          escapeHtml(country.code) +
          '" aria-selected="' +
          (selected || active ? "true" : "false") +
          '" style="height:' +
          ITEM_HEIGHT +
          'px">' +
          '<span class="country-select-option-flag" aria-hidden="true">' +
          country.flag +
          "</span>" +
          '<span class="country-select-option-name">' +
          escapeHtml(country.name) +
          "</span>" +
          (selected ? '<span class="country-select-option-check" aria-hidden="true">✓</span>' : "") +
          "</li>";
      }
      list.innerHTML = html;
    }

    function applyFilter(query) {
      state.filtered = filterCountries(state.countries, query);
      state.scrollTop = listWrap.scrollTop || 0;
      if (state.activeIndex >= state.filtered.length) {
        state.activeIndex = state.filtered.length ? 0 : -1;
      }
      renderVisibleRows();
      highlightActive();
    }

    function selectByIndex(index) {
      if (index < 0 || index >= state.filtered.length) return;
      var country = state.filtered[index];
      setSelected(country, true);
      closeDropdown();
      trigger.focus();
    }

    function moveActive(delta) {
      if (!state.filtered.length) return;
      if (state.activeIndex < 0) state.activeIndex = 0;
      else state.activeIndex = Math.max(0, Math.min(state.filtered.length - 1, state.activeIndex + delta));

      var listHeight = listWrap.clientHeight || ITEM_HEIGHT * VIEWPORT_ROWS;
      var rowTop = state.activeIndex * ITEM_HEIGHT;
      var rowBottom = rowTop + ITEM_HEIGHT;
      if (rowTop < listWrap.scrollTop) {
        listWrap.scrollTop = rowTop;
      } else if (rowBottom > listWrap.scrollTop + listHeight) {
        listWrap.scrollTop = rowBottom - listHeight;
      }
      state.scrollTop = listWrap.scrollTop;
      renderVisibleRows();
      highlightActive();
    }

    trigger.addEventListener("click", function () {
      if (state.open) closeDropdown();
      else openDropdown();
    });

    trigger.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDropdown();
      }
    });

    searchInput.addEventListener("input", function () {
      state.activeIndex = state.filtered.length ? 0 : -1;
      applyFilter(searchInput.value);
    });

    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveActive(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveActive(-1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (state.activeIndex >= 0) selectByIndex(state.activeIndex);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeDropdown();
        trigger.focus();
      }
    });

    listWrap.addEventListener("scroll", function () {
      state.scrollTop = listWrap.scrollTop;
      renderVisibleRows();
    });

    list.addEventListener("click", function (event) {
      var option = event.target && event.target.closest(".country-select-option");
      if (!option) return;
      var index = Number(option.getAttribute("data-index"));
      if (Number.isFinite(index)) selectByIndex(index);
    });

    list.addEventListener("mousemove", function (event) {
      var option = event.target && event.target.closest(".country-select-option");
      if (!option) return;
      var index = Number(option.getAttribute("data-index"));
      if (!Number.isFinite(index) || index === state.activeIndex) return;
      state.activeIndex = index;
      highlightActive();
    });

    document.addEventListener("click", function (event) {
      if (!state.open) return;
      if (container.contains(event.target)) return;
      closeDropdown();
    });

    if (backdrop) {
      backdrop.addEventListener("click", function () {
        closeDropdown();
        trigger.focus();
      });
    }

    document.addEventListener("keydown", function (event) {
      if (!state.open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeDropdown();
        trigger.focus();
      }
    });

    container.setAttribute("data-loading", "true");
    loadCountries().then(function (countries) {
      state.countries = countries;
      var initial = findCountry(countries, readSavedCountry()) || findCountry(countries, defaultCode);
      if (!initial && countries.length) initial = countries[0];
      if (initial) setSelected(initial, false);
      container.removeAttribute("data-loading");
      container.setAttribute("data-country-select-ready", "true");
    });

    container._countrySelect = {
      getValue: function () {
        return hiddenInput ? hiddenInput.value : "";
      },
      setValue: function (code) {
        var country = findCountry(state.countries, code);
        if (country) setSelected(country, true);
      },
      open: openDropdown,
      close: closeDropdown
    };
  }

  function initAll() {
    document.querySelectorAll("[data-country-select]").forEach(function (el) {
      initContainer(el);
    });
  }

  window.ZYBAR = window.ZYBAR || {};
  window.ZYBAR.CountrySelector = {
    init: initContainer,
    initAll: initAll,
    getValue: function (container) {
      if (container && container._countrySelect) return container._countrySelect.getValue();
      var input = document.getElementById("checkout-country");
      return input ? input.value : "";
    },
    setValue: function (container, code) {
      if (container && container._countrySelect) container._countrySelect.setValue(code);
    },
    loadCountries: loadCountries
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
